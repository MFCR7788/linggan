"""
Kokoro TTS Server — 灵集本地语音合成
基于 sherpa-onnx + Kokoro-82M v1.0 多语言模型
"""
import io
import os
import time
import logging
from pathlib import Path

import numpy as np
import soundfile as sf
import sherpa_onnx
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("kokoro")

MODEL_DIR = Path(os.environ.get("MODEL_DIR", "/opt/kokoro/models"))
MODEL = None
MODEL_LOADED = False

ZH_VOICES = {
    "zf_xiaobei": 45,
    "zf_xiaoni": 46,
    "zf_xiaoxiao": 47,
    "zf_xiaoyi": 48,
    "zm_yunjian": 49,
    "zm_yunxi": 50,
    "zm_yunxia": 51,
    "zm_yunyang": 52,
}

app = FastAPI(title="Kokoro TTS Server")


def download_model():
    import tarfile
    from urllib.request import urlretrieve

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    model_file = MODEL_DIR / "kokoro-multi-lang-v1_0.tar.bz2"
    extracted = MODEL_DIR / "kokoro-multi-lang-v1_0" / "model.onnx"

    if extracted.exists():
        logger.info("Model already downloaded")
        return

    # Try GitHub first, fallback to HF mirror
    urls = [
        "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-multi-lang-v1_0.tar.bz2",
        "https://huggingface.co/csukuangfj/kokoro-multi-lang-v1_0/resolve/main/kokoro-multi-lang-v1_0.tar.bz2",
    ]
    for url in urls:
        try:
            logger.info(f"Downloading from {url}...")
            urlretrieve(url, model_file)
            break
        except Exception as e:
            logger.warning(f"Failed: {e}")
            continue
    else:
        raise RuntimeError("Failed to download model from all sources")

    logger.info("Extracting...")
    with tarfile.open(model_file, "r:bz2") as tar:
        tar.extractall(MODEL_DIR)
    model_file.unlink(missing_ok=True)
    logger.info("Model ready")


@app.on_event("startup")
def load_model():
    global MODEL, MODEL_LOADED
    download_model()

    model_path = MODEL_DIR / "kokoro-multi-lang-v1_0"
    logger.info(f"Loading Kokoro from {model_path}...")
    t0 = time.time()

    MODEL = sherpa_onnx.OfflineTts(
        sherpa_onnx.OfflineTtsConfig(
            model=sherpa_onnx.OfflineTtsModelConfig(
                kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(
                    model=str(model_path / "model.onnx"),
                    voices=str(model_path / "voices.bin"),
                    tokens=str(model_path / "tokens.txt"),
                    lexicon=",".join([
                        str(model_path / "lexicon-us-en.txt"),
                        str(model_path / "lexicon-zh.txt"),
                    ]),
                    data_dir=str(model_path / "espeak-ng-data"),
                ),
                num_threads=2,
                provider="cpu",
            ),
        )
    )
    MODEL_LOADED = True
    logger.info(f"Kokoro loaded in {time.time() - t0:.1f}s, voices: {len(ZH_VOICES)}")


@app.get("/health")
async def health():
    return {"status": "ok" if MODEL_LOADED else "loading", "model": "kokoro-82m-v1.0"}


@app.get("/v1/audio/voices")
async def list_voices():
    return {"voices": [{"id": k, "name": k, "sid": v} for k, v in ZH_VOICES.items()]}


@app.post("/v1/audio/speech")
async def tts(req: dict):
    if not MODEL_LOADED:
        raise HTTPException(status_code=503, detail="Model still loading")

    text = req.get("input", "")
    voice_id = req.get("voice", "zf_xiaobei")
    speed = float(req.get("speed", 1.0))

    if not text:
        raise HTTPException(status_code=400, detail="Text required")

    sid = ZH_VOICES.get(voice_id, 45)

    try:
        audio = MODEL.generate(text=text, sid=sid, speed=speed)
        samples = np.array(audio.samples)

        buf = io.BytesIO()
        sf.write(buf, samples, audio.sample_rate, format="WAV", subtype="PCM_16")
        buf.seek(0)

        return Response(content=buf.getvalue(), media_type="audio/wav")
    except Exception as e:
        logger.error(f"TTS error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8880)
