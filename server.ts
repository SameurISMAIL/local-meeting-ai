import express from 'express';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import multer from 'multer';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
loadEnv({
  path: path.join(projectRoot, '.env'),
});

const PORT = Number(process.env.PORT) || 3000;
const LOCAL_AI_PORT = Number(process.env.LOCAL_AI_PORT) || 8765;
const localAiUrl = `http://127.0.0.1:${LOCAL_AI_PORT}`;
const app = express();
let localAiProcess: ChildProcess | null = null;

app.use(express.json({ limit: '10mb' }));

const uploadDir = path.join(os.tmpdir(), 'cadence-uploads');
const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 250 * 1024 * 1024, // 250 MB video limit
  },
});

function formatServerError(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message.trim() : '';
  if (!raw) return fallback;
  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw) as {
        error?: { message?: unknown } | string;
        message?: unknown;
      };
      if (
        parsed.error &&
        typeof parsed.error === 'object' &&
        typeof parsed.error.message === 'string' &&
        parsed.error.message.trim()
      ) {
        return parsed.error.message.trim();
      }
      if (typeof parsed.error === 'string' && parsed.error.trim()) {
        return parsed.error.trim();
      }
      if (typeof parsed.message === 'string' && parsed.message.trim()) {
        return parsed.message.trim();
      }
    } catch {
      // Keep raw string if not valid JSON
    }
  }
  return raw;
}

function getLocalPythonExecutable(): string {
  const configured = process.env.LOCAL_AI_PYTHON?.trim();
  return configured || 'python';
}

async function startLocalAiService(): Promise<void> {
  const python = getLocalPythonExecutable();
  localAiProcess = spawn(
    python,
    [
      '-m',
      'uvicorn',
      'python_service.main:app',
      '--host',
      '127.0.0.1',
      '--port',
      String(LOCAL_AI_PORT),
    ],
    {
      cwd: projectRoot,
      env: process.env,
      stdio: 'inherit',
      windowsHide: true,
    }
  );

  let spawnError: Error | null = null;
  localAiProcess.on('error', (error) => {
    spawnError = error;
  });
  localAiProcess.on('exit', (code, signal) => {
    if (code !== 0) {
      console.error(
        `Local AI service stopped (code ${code ?? 'unknown'}, signal ${signal ?? 'none'}).`
      );
    }
  });
  process.once('exit', () => localAiProcess?.kill());

  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (spawnError) {
      throw new Error(
        `Could not launch Python at "${python}". Run npm run setup:local-ai or set LOCAL_AI_PYTHON.`
      );
    }
    if (localAiProcess.exitCode !== null) {
      throw new Error(
        'The local AI service exited during startup. Check the Python service output and run npm run setup:local-ai.'
      );
    }
    try {
      const response = await fetch(`${localAiUrl}/health`);
      if (response.ok) return;
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(
    'The local AI service did not become ready within 30 seconds. Check the Python service output.'
  );
}

interface LocalTranscriptionPayload {
  durationSec: number;
  transcript: Array<{
    id: string;
    startSec: number;
    endSec: number;
    speakerId: string;
    speakerName: string;
    text: string;
    emotion: 'Neutral';
    emotionIntensity: 0;
    emotionAnalyzed: false;
    facialCue: string;
  }>;
  actionItems: [];
}

async function transcribeWithLocalAi(
  filePath: string,
  filename: string,
  mimeType: string
): Promise<LocalTranscriptionPayload> {
  const contents = await fs.readFile(filePath);
  const formData = new FormData();
  formData.append(
    'file',
    new Blob([Uint8Array.from(contents)], { type: mimeType }),
    filename
  );

  let response: Response;
  try {
    response = await fetch(`${localAiUrl}/transcribe`, {
      method: 'POST',
      body: formData,
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('Could not reach the local Python AI service.');
    }
    throw error;
  }

  const responseText = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(responseText);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('The local AI service returned an invalid response.');
    }
    throw error;
  }

  if (!response.ok) {
    const detail =
      typeof payload === 'object' &&
      payload !== null &&
      'detail' in payload &&
      typeof payload.detail === 'string'
        ? payload.detail
        : `Local transcription failed (${response.status}).`;
    throw new Error(detail);
  }

  if (typeof payload !== 'object' || payload === null) {
    throw new Error('The local AI service returned an invalid transcription.');
  }

  const transcription = payload as Partial<LocalTranscriptionPayload>;
  if (
    typeof transcription.durationSec !== 'number' ||
    !Array.isArray(transcription.transcript) ||
    !Array.isArray(transcription.actionItems)
  ) {
    throw new Error('The local AI service returned an invalid transcription.');
  }
  return transcription as LocalTranscriptionPayload;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, localAI: 'ready' });
});

app.post('/api/meetings/live-session/init', (_req, res) => {
  const liveSessionId = `live-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return res.json({ ok: true, liveSessionId });
});

app.post(
  '/api/meetings/transcribe-live-chunk',
  upload.single('chunk'),
  async (req, res) => {
    const chunkFile = req.file;

    try {
      if (!chunkFile) {
        return res.status(400).json({ error: 'A live video/audio clip is required.' });
      }

      const result = await transcribeWithLocalAi(
        chunkFile.path,
        chunkFile.originalname || 'live-chunk.webm',
        chunkFile.mimetype || 'video/webm'
      );
      return res.json(result);
    } catch (error) {
      return res
        .status(500)
        .json({ error: formatServerError(error, 'Local live transcription failed.') });
    } finally {
      if (chunkFile) {
        await fs.unlink(chunkFile.path).catch((error: unknown) => {
          console.warn('Could not remove temporary live audio chunk:', error);
        });
      }
    }
  }
);

app.post('/api/meetings/live-session/end', (_req, res) => {
  return res.json({ ok: true });
});

app.post(
  '/api/meetings/upload-chunk',
  upload.single('chunk'),
  async (req, res) => {
    const tempChunkPath = req.file?.path;
    try {
      const safeUploadId = String(req.body?.uploadId ?? '').replace(
        /[^a-zA-Z0-9_-]/g,
        ''
      );
      const chunkIndex = Number(req.body?.chunkIndex);
      const totalChunks = Number(req.body?.totalChunks);

      if (
        !safeUploadId ||
        !req.file ||
        !Number.isInteger(chunkIndex) ||
        !Number.isInteger(totalChunks) ||
        totalChunks < 1 ||
        chunkIndex < 0 ||
        chunkIndex >= totalChunks
      ) {
        return res.status(400).json({ error: 'Invalid video chunk payload.' });
      }

      const chunkDir = path.join(uploadDir, 'chunks', safeUploadId);
      await fs.mkdir(chunkDir, { recursive: true });
      const targetChunkPath = path.join(
        chunkDir,
        String(chunkIndex).padStart(6, '0')
      );
      await fs.copyFile(req.file.path, targetChunkPath);

      return res.json({ ok: true, chunkIndex });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to store video chunk.';
      return res.status(500).json({ error: message });
    } finally {
      if (tempChunkPath) {
        try {
          await fs.unlink(tempChunkPath);
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }
);

app.post('/api/meetings/transcribe', upload.single('video'), async (req, res) => {
  const videoFile = req.file;
  const tempPathsToClean: string[] = [];
  let chunkDirToClean: string | null = null;
  if (videoFile) tempPathsToClean.push(videoFile.path);

  try {
    await fs.mkdir(uploadDir, { recursive: true });
    let resolvedVideoPath = videoFile?.path ?? '';
    let resolvedVideoMime =
      videoFile?.mimetype || String(req.body?.videoMimeType || 'video/mp4');
    let resolvedVideoName = videoFile?.originalname || 'meeting.mp4';

    if (!videoFile) {
      const safeUploadId = String(req.body?.uploadId ?? '').replace(
        /[^a-zA-Z0-9_-]/g,
        ''
      );
      const totalChunks = Number(req.body?.totalChunks ?? 0);
      if (!safeUploadId || !Number.isInteger(totalChunks) || totalChunks < 1) {
        return res.status(400).json({ error: 'A meeting video file is required.' });
      }

      const chunkDir = path.join(uploadDir, 'chunks', safeUploadId);
      chunkDirToClean = chunkDir;
      resolvedVideoMime = String(req.body?.videoMimeType || 'video/mp4');
      const extension = resolvedVideoMime.includes('webm') ? '.webm' : '.mp4';
      resolvedVideoName = `meeting${extension}`;
      const assembledPath = path.join(
        uploadDir,
        `assembled-${safeUploadId}-${Date.now()}${extension}`
      );
      tempPathsToClean.push(assembledPath);

      const handle = await fs.open(assembledPath, 'w');
      try {
        for (let i = 0; i < totalChunks; i += 1) {
          const chunkPath = path.join(chunkDir, String(i).padStart(6, '0'));
          const chunkData = await fs.readFile(chunkPath);
          await handle.write(chunkData);
        }
      } finally {
        await handle.close();
      }
      resolvedVideoPath = assembledPath;
    }

    const result = await transcribeWithLocalAi(
      resolvedVideoPath,
      resolvedVideoName,
      resolvedVideoMime
    );
    return res.json(result);
  } catch (error) {
    return res
      .status(500)
      .json({ error: formatServerError(error, 'Local transcription failed.') });
  } finally {
    if (chunkDirToClean) {
      await fs.rm(chunkDirToClean, { recursive: true, force: true }).catch(
        (error: unknown) => {
          console.warn('Could not remove temporary upload chunks:', error);
        }
      );
    }
    await Promise.all(
      tempPathsToClean.map(async (filePath) => {
        await fs.unlink(filePath).catch((error: unknown) => {
          console.warn('Could not remove temporary transcription file:', error);
        });
      })
    );
  }
});

app.post('/api/meetings/summarize', (_req, res) => {
  return res.status(501).json({
    error: 'Local summaries are not available yet. No cloud AI service is used.',
  });
});

app.post('/api/meetings/chat', (_req, res) => {
  return res.status(501).json({
    error: 'Local meeting chat is not available yet. No cloud AI service is used.',
  });
});

app.use('/api', (_req, res) => {
  return res.status(404).json({ error: 'API endpoint not found.' });
});

app.use(
  (
    err: unknown,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    if (!req.path.startsWith('/api')) {
      return next(err);
    }
    if (err instanceof multer.MulterError) {
      const msg =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'File exceeds the 250 MB maximum upload limit.'
          : `Upload error: ${err.message}`;
      return res.status(400).json({ error: msg });
    }
    return res
      .status(500)
      .json({ error: formatServerError(err, 'Unexpected server error.') });
  }
);

async function startServer() {
  await fs.mkdir(uploadDir, { recursive: true });
  await startLocalAiService();

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vitePromise = createViteServer({
      server: { middlewareMode: true, allowedHosts: true },
      appType: 'spa',
    });

    app.use(async (req, res, next) => {
      try {
        const vite = await vitePromise;
        vite.middlewares(req, res, next);
      } catch (err) {
        next(err);
      }
    });

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Cadence server listening on http://localhost:${PORT}`);
    });

    await vitePromise;
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Cadence server listening on http://localhost:${PORT}`);
    });
  }
}

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection in Cadence server:', reason);
});

startServer().catch((err) => {
  console.error('Failed to start Cadence server:', err);
  process.exit(1);
});
