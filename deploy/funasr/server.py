"""
FunASR Paraformer ASR Server — 灵集本地语音识别
接收 base64 WAV → Paraformer-large → 返回识别文本
"""
import base64
import io
import os
import time
import logging
import tempfile

import soundfile as sf
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("funasr")

MODEL = None
MODEL_LOADED = False

app = FastAPI(title="FunASR Server")


class ASRRequest(BaseModel):
    audio: str
    format: str = "wav"
    sample_rate: int = 16000


class ASRResponse(BaseModel):
    success: bool
    text: str = ""
    error: str | None = None


@app.on_event("startup")
def load_model():
    global MODEL, MODEL_LOADED
    logger.info("Loading Paraformer model...")
    t0 = time.time()

    from funasr import AutoModel

    # 仅加载主 ASR 模型 (不用 VAD/PUNC 以减少内存，避免模型下载问题)
    MODEL = AutoModel(
        model="iic/speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-pytorch",
        device="cpu",
        ncpu=2,
        disable_update=True,
        disable_pbar=True,
    )
    MODEL_LOADED = True
    logger.info(f"Paraformer loaded in {time.time() - t0:.1f}s")


@app.get("/health")
async def health():
    return {"status": "ok" if MODEL_LOADED else "loading", "model": "paraformer-large-zh"}


@app.post("/asr", response_model=ASRResponse)
async def transcribe(req: ASRRequest):
    if not MODEL_LOADED:
        return ASRResponse(success=False, error="Model still loading")

    try:
        audio_bytes = base64.b64decode(req.audio)
        audio_io = io.BytesIO(audio_bytes)
        data, sr = sf.read(audio_io, dtype="int16")

        # Resample if needed
        if len(data.shape) > 1:
            data = data.mean(axis=1).astype(np.int16)
        if sr != 16000:
            dur = len(data) / sr
            new_len = int(dur * 16000)
            data = np.interp(
                np.linspace(0, len(data) - 1, new_len),
                np.arange(len(data)),
                data.astype(np.float64),
            ).astype(np.int16)
            sr = 16000

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            sf.write(f.name, data, sr, format="WAV", subtype="PCM_16")
            tmp_path = f.name

        try:
            result = MODEL.generate(input=tmp_path)
        finally:
            os.unlink(tmp_path)

        if result and len(result) > 0:
            text = result[0].get("text", "").strip()
            return ASRResponse(success=True, text=text)
        else:
            return ASRResponse(success=True, text="")

    except Exception as e:
        logger.error(f"ASR error: {e}")
        return ASRResponse(success=False, error=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=10096)
