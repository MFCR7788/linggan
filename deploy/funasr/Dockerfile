# FunASR Paraformer API Server — CPU 版
# 灵集项目 ASR 本地服务
FROM python:3.11-slim

WORKDIR /app

# 安装系统依赖 (ffmpeg 用于音频预处理, libsndfile 用于音频读写)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# 安装 Python 依赖
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制服务代码
COPY server.py .

# 预下载模型（构建时缓存，避免启动时下载）
RUN python -c "from funasr import AutoModel; AutoModel(model='iic/speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-pytorch', disable_update=True)"

EXPOSE 10096

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "10096"]
