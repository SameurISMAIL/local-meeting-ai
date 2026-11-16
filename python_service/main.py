from __future__ import annotations

import logging
import os
import tempfile
from pathlib import Path
from threading import Lock
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

from faster_whisper import WhisperModel

logging.basicConfig(level=logging.INFO)

MODEL_NAME = os.getenv("LOCAL_WHISPER_MODEL", "small")
_model: WhisperModel | None = None
_model_lock = Lock()

app = FastAPI(title="Local meeting transcription")


def get_model() -> WhisperModel:
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                logging.info("Loading local Whisper model %s on CPU", MODEL_NAME)
                _model = WhisperModel(
                    MODEL_NAME,
                    device="cpu",
                    compute_type="int8",
                )
    return _model


def transcribe_file(file_path: str) -> dict[str, Any]:
    model = get_model()
    segments, info = model.transcribe(
        file_path,
        beam_size=1,
        condition_on_previous_text=False,
        vad_filter=True,
    )

    transcript = []
    for index, segment in enumerate(segments, start=1):
        text = segment.text.strip()
        if not text:
            continue
        transcript.append(
            {
                "id": f"tr-{index}",
                "startSec": round(segment.start, 2),
                "endSec": round(segment.end, 2),
                "speakerId": "unknown",
                "speakerName": "Unidentified speaker",
                "text": text,
                "emotion": "Neutral",
                "emotionIntensity": 0,
                "emotionAnalyzed": False,
                "facialCue": "Not analyzed in the local transcription stage.",
            }
        )

    return {
        "durationSec": round(info.duration),
        "transcript": transcript,
        "actionItems": [],
    }


@app.get("/health")
def health() -> dict[str, object]:
    return {
        "ok": True,
        "model": MODEL_NAME,
        "modelLoaded": _model is not None,
    }


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)) -> dict[str, Any]:
    suffix = Path(file.filename or "").suffix
    temp_path = ""
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_path = temp_file.name
            while chunk := await file.read(1024 * 1024):
                temp_file.write(chunk)
        return await run_in_threadpool(transcribe_file, temp_path)
    except (OSError, RuntimeError, ValueError) as error:
        raise HTTPException(
            status_code=422,
            detail=f"Local transcription failed: {error}",
        ) from error
    finally:
        if temp_path:
            Path(temp_path).unlink(missing_ok=True)
        await file.close()
