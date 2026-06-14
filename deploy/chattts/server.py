# ChatTTS TTS Service
# 开源对话式 TTS 模型 — FastAPI 服务
# 模型: ChatTTS (https://github.com/2noise/ChatTTS)

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn
import io
import soundfile as sf

app = FastAPI(title="ChatTTS Service", version="1.0.0")

# 懒加载 ChatTTS（首次调用时初始化，节省内存）
_chat = None

def get_chat():
    global _chat
    if _chat is None:
        import ChatTTS
        import torch
        _chat = ChatTTS.Chat()
        _chat.load(compile=False, source="local")
    return _chat

class SynthesizeRequest(BaseModel):
    text: str
    voice: str = "default"
    speed: float = 1.0

class SynthesizeResponse(BaseModel):
    audio_base64: str
    format: str = "wav"

@app.get("/health")
def health():
    return {"status": "ok", "model": "ChatTTS"}

@app.get("/voices")
def list_voices():
    return [
        {"id": "default", "name": "默认音色", "lang": "zh-CN"},
        {"id": "female1", "name": "女声1(温柔)", "lang": "zh-CN", "gender": "female"},
        {"id": "female2", "name": "女声2(活泼)", "lang": "zh-CN", "gender": "female"},
        {"id": "male1", "name": "男声1(沉稳)", "lang": "zh-CN", "gender": "male"},
        {"id": "male2", "name": "男声2(阳光)", "lang": "zh-CN", "gender": "male"},
    ]

@app.post("/synthesize")
def synthesize(req: SynthesizeRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="文本不能为空")

    chat = get_chat()

    try:
        # 设置音色 seed（简单映射）
        voice_map = {
            "default": 2,
            "female1": 1111,
            "female2": 3333,
            "male1": 5555,
            "male2": 8888,
        }
        seed = voice_map.get(req.voice, 2)

        import torch
        torch.manual_seed(seed)
        rand_spk = chat.sample_random_speaker()
        params_infer_code = {
            'spk_emb': rand_spk,
            'prompt': f'[speed_{req.speed}]',
        }

        wavs = chat.infer([req.text], params_infer_code=params_infer_code, use_decoder=True)

        # 转换为 WAV bytes
        buffer = io.BytesIO()
        sf.write(buffer, wavs[0], 24000, format='WAV')
        buffer.seek(0)
        return buffer.read()  # FastAPI 自动处理 bytes 返回

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"合成失败: {str(e)}")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080)
