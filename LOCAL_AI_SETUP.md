# Local AI setup

The app runs speech recognition with a local `faster-whisper` model. Video and
audio are sent only to the Python service bound to `127.0.0.1`; there is no
Gemini API integration.

On Windows, install the JavaScript packages and Python model dependencies once:

```powershell
npm install
npm run setup:local-ai
```

Then start the app as usual:

```powershell
npm run dev
```

Python dependencies are installed into the current user's Python 3.14
environment. Set `LOCAL_AI_PYTHON` if your Python executable is not available
as `python` on `PATH`. If Windows Application Control blocks CTranslate2, ask
the device administrator to approve it; changing its install location will not
resolve that policy.

The first transcription downloads the `small` Whisper model into the local
Hugging Face cache. Later transcriptions use the cached model. To choose another
Whisper model, set `LOCAL_WHISPER_MODEL` before starting the server.

This first stage transcribes speech only. Speaker identification, action-item
extraction, summaries, chat, and camera-based cues are not yet available; they
will not make cloud AI requests.
