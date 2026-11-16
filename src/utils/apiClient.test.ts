import test from 'node:test';
import assert from 'node:assert/strict';
import {
  apiFetch,
  calculateChunkRanges,
  CookieCheckError,
  extractHtmlErrorTitle,
  isCookieCheckError,
  isCookieCheckHtml,
  isServerStartingError,
  isServerStartingHtml,
  parseApiResponse,
  ServerStartingError,
} from './apiClient';

test('calculateChunkRanges splits file bytes evenly up to totalSize', () => {
  const ranges = calculateChunkRanges(15, 6);
  assert.deepEqual(ranges, [
    { index: 0, start: 0, end: 6 },
    { index: 1, start: 6, end: 12 },
    { index: 2, start: 12, end: 15 },
  ]);
  assert.deepEqual(calculateChunkRanges(0, 6), []);
});

test('extractHtmlErrorTitle parses HTML error titles cleanly', () => {
  const html = ' <html><head><title>413 Request Entity Too Large</title></head><body></body></html>';
  assert.equal(extractHtmlErrorTitle(html), '413 Request Entity Too Large');
  assert.equal(extractHtmlErrorTitle('plain text'), null);
});

test('parseApiResponse parses valid JSON and throws structured error on API JSON error', async () => {
  const okRes = {
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => JSON.stringify({ durationSec: 90 }),
  };
  assert.deepEqual(await parseApiResponse<{ durationSec: number }>(okRes), {
    durationSec: 90,
  });

  const errRes = {
    ok: false,
    status: 400,
    statusText: 'Bad Request',
    text: async () => JSON.stringify({ error: 'A meeting video file is required.' }),
  };
  await assert.rejects(
    () => parseApiResponse(errRes),
    /A meeting video file is required\./
  );
});

test('parseApiResponse converts HTML 413/504 responses into clean error messages instead of SyntaxError', async () => {
  const html413 = {
    ok: false,
    status: 413,
    statusText: 'Payload Too Large',
    text: async () => ' <html><head><title>413 Request Entity Too Large</title></head></html>',
  };
  await assert.rejects(() => parseApiResponse(html413), /HTTP 413/);

  const html502 = {
    ok: false,
    status: 502,
    statusText: 'Bad Gateway',
    text: async () => '<html><head><title>502 Bad Gateway</title></head></html>',
  };
  await assert.rejects(() => parseApiResponse(html502), /HTTP 502/);
});

test('parseApiResponse throws CookieCheckError on HTTP 200 Cookie check HTML interstitial', async () => {
  const cookieHtml =
    ' <html><head><title>Cookie check</title></head><body>Almost there!</body></html>';
  assert.equal(isCookieCheckHtml(cookieHtml), true);

  const res = {
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => cookieHtml,
  };

  await assert.rejects(
    () => parseApiResponse(res),
    (err: unknown) => {
      assert.equal(err instanceof CookieCheckError, true);
      assert.equal(isCookieCheckError(err), true);
      return true;
    }
  );
});

test('parseApiResponse throws ServerStartingError on HTTP 200 Starting Server HTML interstitial', async () => {
  const startingHtml =
    '<html><head><meta http-equiv="refresh" content="3"><title>Starting Server...</title></head><body>Starting server...</body></html>';
  assert.equal(isServerStartingHtml(startingHtml), true);

  const res = {
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => startingHtml,
  };

  await assert.rejects(
    () => parseApiResponse(res),
    (err: unknown) => {
      assert.equal(err instanceof ServerStartingError, true);
      assert.equal(isServerStartingError(err), true);
      return true;
    }
  );
});

test('apiFetch retries automatically after proxy returns Starting Server HTML interstitial', async () => {
  const startingHtml =
    '<html><head><title>Starting Server...</title></head><body>Starting Server...</body></html>';
  const calls: string[] = [];
  let healthCalls = 0;

  const mockFetch: typeof fetch = async (input) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push(url);
    if (url === '/api/health') {
      healthCalls += 1;
      if (healthCalls === 1) {
        return new Response(startingHtml, {
          status: 200,
          headers: { 'content-type': 'text/html' },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (calls.filter((u) => u === '/api/meetings/transcribe').length === 1) {
      return new Response(startingHtml, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    }
    return new Response(JSON.stringify({ durationSec: 42, transcript: [], actionItems: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  let noticeAttempts = 0;
  const res = await apiFetch(
    '/api/meetings/transcribe',
    { method: 'POST' },
    {
      fetchFn: mockFetch,
      sleepFn: async () => {},
      maxStartupWaitMs: 5000,
      onServerStarting: (attempt) => {
        noticeAttempts = attempt;
      },
    }
  );

  const parsed = await parseApiResponse<{ durationSec: number }>(res);
  assert.equal(parsed.durationSec, 42);
  assert.equal(noticeAttempts >= 1, true);
  assert.deepEqual(calls, [
    '/api/meetings/transcribe',
    '/api/health',
    '/api/health',
    '/api/meetings/transcribe',
  ]);
});
