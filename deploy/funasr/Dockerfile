# FunASR Paraformer API Server — CPU 版，国内镜像加速
# 灵集项目 ASR 本地服务
FROM python:3.11-slim

WORKDIR /app

# 换成阿里云 Debian 镜像源
RUN sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources && \
    apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# 安装 Python 依赖 (清华源)
COPY requirements.txt .
RUN pip install --no-cache-dir -i https://pypi.tuna.tsinghua.edu.cn/simple -r requirements.txt

# 复制服务代码
COPY server.py .

EXPOSE 10096

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "10096"]
