# GPT-SoVITS TTS Service
# 少样本语音克隆 — FastAPI 服务
# 需要预训练的 GPT-SoVITS 模型
# 模型地址: https://github.com/RVC-Boss/GPT-SoVITS

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn
import io
import soundfile as sf
import numpy as np
import os

app = FastAPI(title="GPT-SoVITS Service", version="1.0.0")

_sovits = None

def get_sovits():
    global _sovits
    if _sovits is None:
        import sys
        # 假设 GPT-SoVITS 安装在 /opt/gptsovits
        gpt_path = os.environ.get("GPTSOVITS_HOME", "/opt/gptsovits")
        if gpt_path not in sys.path:
            sys.path.insert(0, gpt_path)
        # GPT-SoVITS 的具体调用取决于部署配置
        # 这里使用通用接口模式
        import importlib
        try:
            _sovits = importlib.import_module("gptsovits_api")
        except ImportError:
            # 降级为使用本地推理
            pass
    return _sovits

class SynthesizeRequest(BaseModel):
    text: str
    voice: str = "default"
    speed: float = 1.0

@app.get("/health")
def health():
    return {"status": "ok", "model": "GPT-SoVITS"}

@app.get("/voices")
def list_voices():
    voices_dir = os.environ.get("GPTSOVITS_VOICES_DIR", "/opt/gptsovits/voices")
    voices = []
    if os.path.isdir(voices_dir):
        for name in sorted(os.listdir(voices_dir)):
            if os.path.isdir(os.path.join(voices_dir, name)):
                voices.append({"id": name, "name": name, "lang": "zh-CN"})
    if not voices:
        voices.append({"id": "default", "name": "默认音色", "lang": "zh-CN"})
    return voices

@app.post("/tts")
def synthesize(req: SynthesizeRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="文本不能为空")

    # 此处需要对接具体的 GPT-SoVITS API
    # 这是一个适配器模式 — 实际推理调用取决于部署方式
    try:
        # 尝试调用本地 GPT-SoVITS 服务
        import requests
        api_url = os.environ.get("GPTSOVITS_INFERENCE_URL", "http://127.0.0.1:9872")
        resp = requests.post(
            f"{api_url}/tts",
            json={"text": req.text, "text_lang": "zh", "ref_audio_path": f"/opt/gptsovits/voices/{req.voice}/ref.wav"
                  if req.voice != "default" else None},
            timeout=120
        )
        if resp.status_code == 200:
            return resp.content
        else:
            raise HTTPException(status_code=500, detail=f"推理失败: {resp.text}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"合成失败: {str(e)}")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=9880)
