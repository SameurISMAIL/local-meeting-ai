export interface ByteChunkRange {
  index: number;
  start: number;
  end: number;
}

export class CookieCheckError extends Error {
  constructor(
    message = 'Your browser blocked or expired the preview session cookie required for API requests ("Cookie check"). Allow preview cookies, reload the preview, or open the app in a new tab.'
  ) {
    super(message);
    this.name = 'CookieCheckError';
  }
}

export class ServerStartingError extends Error {
  constructor(
    message = 'The preview server is still starting up or restarting. Please wait a few seconds and try again.'
  ) {
    super(message);
    this.name = 'ServerStartingError';
  }
}

export function isCookieCheckError(error: unknown): boolean {
  return (
    error instanceof CookieCheckError ||
    (error instanceof Error && error.name === 'CookieCheckError')
  );
}

export function isServerStartingError(error: unknown): boolean {
  return (
    error instanceof ServerStartingError ||
    (error instanceof Error && error.name === 'ServerStartingError')
  );
}

export function calculateChunkRanges(
  totalSize: number,
  chunkSizeBytes = 6 * 1024 * 1024
): ByteChunkRange[] {
  if (totalSize <= 0 || chunkSizeBytes <= 0) {
    return [];
  }
  const ranges: ByteChunkRange[] = [];
  let start = 0;
  let index = 0;
  while (start < totalSize) {
    const end = Math.min(totalSize, start + chunkSizeBytes);
    ranges.push({ index, start, end });
    start = end;
    index += 1;
  }
  return ranges;
}

export function extractHtmlErrorTitle(htmlText: string): string | null {
  const match = htmlText.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (!match) return null;
  return match[1].trim() || null;
}

export function isCookieCheckHtml(
  htmlText: string,
  htmlTitle: string | null = extractHtmlErrorTitle(htmlText)
): boolean {
  if (htmlTitle && htmlTitle.toLowerCase().includes('cookie check')) {
    return true;
  }
  return /requeststorageaccess|grant permission for the required security cookie/i.test(
    htmlText
  );
}

export function isServerStartingHtml(
  htmlText: string,
  htmlTitle: string | null = extractHtmlErrorTitle(htmlText)
): boolean {
  if (htmlTitle && /starting\s+server/i.test(htmlTitle)) {
    return true;
  }
  if (/<title[^>]*>[^<]*starting\s+server/i.test(htmlText)) {
    return true;
  }
  return (
    /starting\s+server/i.test(htmlText) &&
    /http-equiv=["']?refresh/i.test(htmlText)
  );
}

export interface ApiFetchOptions {
  maxStartupWaitMs?: number;
  onServerStarting?: (attempt: number) => void;
  fetchFn?: typeof fetch;
  sleepFn?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

async function isStartingResponse(response: Response): Promise<boolean> {
  const contentType =
    typeof response.headers?.get === 'function'
      ? (response.headers.get('content-type') ?? '').toLowerCase()
      : '';
  if (contentType.includes('application/json')) {
    return false;
  }
  if (typeof response.clone !== 'function') {
    return false;
  }
  try {
    const text = await response.clone().text();
    return isServerStartingHtml(text);
  } catch {
    return false;
  }
}

async function waitForHealthReady(
  fetchImpl: typeof fetch,
  sleepImpl: (ms: number) => Promise<void>,
  deadlineMs: number,
  onServerStarting?: (attempt: number) => void
): Promise<boolean> {
  let attempt = 1;
  while (Date.now() < deadlineMs) {
    onServerStarting?.(attempt);
    const delayMs = Math.min(3500, 1200 + attempt * 500);
    await sleepImpl(delayMs);

    try {
      const healthRes = await fetchImpl('/api/health', {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      const stillStarting = await isStartingResponse(healthRes);
      if (!stillStarting && healthRes.ok) {
        return true;
      }
    } catch {
      // Transient connection reset while server restarts; keep polling until deadline
    }
    attempt += 1;
  }
  return false;
}

export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: ApiFetchOptions = {}
): Promise<Response> {
  const fetchImpl = options.fetchFn ?? fetch;
  const sleepImpl = options.sleepFn ?? defaultSleep;
  const maxStartupWaitMs = options.maxStartupWaitMs ?? 40000;

  const headers = new Headers(init.headers);
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  const requestInit: RequestInit = {
    ...init,
    credentials: 'include',
    headers,
  };

  let response = await fetchImpl(input, requestInit);
  if (!(await isStartingResponse(response))) {
    return response;
  }

  const deadlineMs = Date.now() + maxStartupWaitMs;
  const inputStr = typeof input === 'string' ? input : input.toString();
  const isHealthEndpoint = inputStr.includes('/api/health');

  if (isHealthEndpoint) {
    let attempt = 1;
    while (Date.now() < deadlineMs) {
      options.onServerStarting?.(attempt);
      const delayMs = Math.min(3500, 1200 + attempt * 500);
      await sleepImpl(delayMs);
      try {
        response = await fetchImpl(input, requestInit);
        if (!(await isStartingResponse(response))) {
          return response;
        }
      } catch {
        // Retry until deadline
      }
      attempt += 1;
    }
    return response;
  }

  const ready = await waitForHealthReady(
    fetchImpl,
    sleepImpl,
    deadlineMs,
    options.onServerStarting
  );
  if (ready) {
    response = await fetchImpl(input, requestInit);
  }
  return response;
}

export async function parseApiResponse<T>(
  response: Pick<Response, 'ok' | 'status' | 'statusText' | 'text'>
): Promise<T> {
  const rawText = await response.text();
  const trimmed = rawText.trim();

  if (!trimmed) {
    if (!response.ok) {
      throw new Error(
        `Request failed with status ${response.status} (${response.statusText || 'Empty response'}).`
      );
    }
    return {} as T;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    const htmlTitle = extractHtmlErrorTitle(trimmed);
    if (isCookieCheckHtml(trimmed, htmlTitle)) {
      throw new CookieCheckError();
    }
    if (isServerStartingHtml(trimmed, htmlTitle)) {
      throw new ServerStartingError();
    }
    if (response.status === 413) {
      throw new Error(
        'The uploaded file exceeded the server request size limit (HTTP 413). Please try a smaller video or try again.'
      );
    }
    if (response.status === 502 || response.status === 504) {
      throw new Error(
        `The server timed out or received a gateway error while processing the video (HTTP ${response.status}).`
      );
    }
    throw new Error(
      htmlTitle
        ? `Server returned an unexpected HTML error (${response.status}): ${htmlTitle}`
        : `Server returned an unexpected non-JSON response (HTTP ${response.status}).`
    );
  }

  if (!response.ok) {
    const errorMessage =
      parsed &&
      typeof parsed === 'object' &&
      'error' in parsed &&
      typeof (parsed as { error?: unknown }).error === 'string'
        ? (parsed as { error: string }).error
        : `Request failed with status ${response.status}.`;
    throw new Error(errorMessage);
  }

  return parsed as T;
}
