# Cadence

Cadence is a local-first meeting transcription prototype. It combines a
React/TypeScript interface with an Express server and a Python service that
runs speech recognition using `faster-whisper`.

The current AI stage focuses on producing timestamped transcripts from meeting
audio. The interface also includes meeting, participant, transcript, summary,
and chat views; some of those views use demonstration data or are not connected
to a local AI implementation yet.

## Current capabilities

- Upload a meeting video for transcription, or use the live recording flow.
- Transcribe locally with a Whisper model; the default is `small` on CPU with
  `int8` compute.
- View timestamped transcript entries in the meeting interface.
- Keep inference on the local Python service; this project does not make
  Gemini or other cloud AI inference requests.

## Not implemented yet

The current transcription service does not identify speakers, match voices to
participant photos, generate action items or summaries, answer meeting
questions, or analyze facial expressions, emotion, or attention. Transcript
entries use an unidentified speaker and mark emotion and facial analysis as
unavailable. Preloaded meetings and their analysis are sample/demo content,
not output from the local model.

## Architecture and data flow

1. The browser UI sends uploaded media or live audio chunks to the Express
   server.
2. Express forwards transcription requests to the Python service on
   `127.0.0.1` (port `8765` by default).
3. FastAPI uses `faster-whisper` to produce the transcript and returns it to
   the UI through Express.

The first transcription downloads the selected Whisper model from Hugging Face
to the local model cache. This model download and installing dependencies
require an internet connection; transcription inference is local after the
model is available.

The Express server listens on port `3000` by default and binds to all network
interfaces. It has no authentication configured, so run it only on a trusted
machine/network and do not expose it to the public internet.

## Requirements

- Node.js and npm compatible with Vite 8.
- Python 3.14 available as `python`, or set `LOCAL_AI_PYTHON` to the Python
  executable that has the service dependencies installed.
- Windows users may need administrator approval if Windows Application
  Control blocks CTranslate2's native extension. Do not disable or work around
  the device's security policy.

## Setup on Windows

From the project directory, install the JavaScript and Python dependencies:

```powershell
npm install
npm run setup:local-ai
```

Start the application:

```powershell
npm run dev
```

Open `http://localhost:3000`. On first use, the default `small` Whisper model
is downloaded. If your Python executable is not on `PATH` as `python`, set
`LOCAL_AI_PYTHON` before starting the server.

For example, to select a different model in PowerShell:

```powershell
$env:LOCAL_WHISPER_MODEL = "base"
npm run dev
```

The Python service uses port `8765` by default. `LOCAL_AI_PORT` can change it;
`PORT` changes the Express/Vite application port.

## Development commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the app and its local transcription service |
| `npm run setup:local-ai` | Install Python service dependencies for the current user |
| `npm run lint` | Run the TypeScript type check |
| `npm run build` | Create the production frontend build |

The `LOCAL_AI_SETUP.md` file contains additional notes about the local
transcription setup and Windows Application Control.

## Privacy and consent

Meeting audio and video can contain sensitive personal information. Get
participants' consent before recording or processing a meeting. Although AI
inference is local, the application server accepts requests on the host's
network interfaces; use it only in a trusted environment.
