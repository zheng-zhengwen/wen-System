# ═══════════════════════════════════════════════════════════════════
# awenops Dockerfile — with awenAgent built-in
# ═══════════════════════════════════════════════════════════════════

# ── Stage 1: Frontend build ────────────────────────────────────────
FROM node:20-alpine AS frontend-build

WORKDIR /build
COPY client/package.json client/package-lock.json ./
RUN npm ci --ignore-scripts
COPY client/ ./
RUN npm run build

# ── Stage 2: Runtime ───────────────────────────────────────────────
FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx curl procps git && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python dependencies for awenops
COPY server/requirements.txt ./server/requirements.txt
RUN pip install --no-cache-dir -r server/requirements.txt

# Built-in awenAgent runtime (Agent + knowledge base + local retrieval).
ARG AWEN_AGENT_REPO=https://github.com/zheng-zhengwen/awen-agent.git
ARG AWEN_AGENT_REF
RUN test -n "$AWEN_AGENT_REF" && \
    pip install --no-cache-dir "git+${AWEN_AGENT_REPO}@${AWEN_AGENT_REF}"

# Copy backend source
COPY server/ ./server/

# Copy built frontend from stage 1
COPY --from=frontend-build /build/dist /app/client/dist

# Copy nginx config
COPY deploy/docker/nginx.conf /etc/nginx/nginx.conf

# Default environment
ENV AWENOPS_DATA_DIR=/app/data
ENV AWENOPS_HOST=127.0.0.1
ENV AWENOPS_PORT=8001
ENV PYTHONUNBUFFERED=1
ENV PYTHONUTF8=1
ENV PYTHONIOENCODING=utf-8
ENV PYTHONPATH=/app/server
ENV HOME=/root
ENV AWEN_HOME=/app/data/awen-agent

# Create data directory
RUN mkdir -p /app/data/awen-agent/knowledge /app/data/awen-agent/models

# Expose ports
EXPOSE 80

# Entrypoint script
COPY deploy/docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
