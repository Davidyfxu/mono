FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

# Prisma 查询引擎依赖 openssl，slim 镜像需要显式安装。
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml README.md ./
COPY src ./src
COPY prisma ./prisma
RUN pip install --no-cache-dir . && prisma generate
EXPOSE 8000
# db push 保证表结构与 schema.prisma 一致；exec 让 uvicorn 正确接收停止信号。
CMD ["sh", "-c", "prisma db push && exec uvicorn main:app --app-dir src --host 0.0.0.0 --port 8000"]
