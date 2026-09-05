#!/bin/bash
set -eu

: "${AWENOPS_SECRET:?Set a stable random AWENOPS_SECRET in .env}"
: "${AWENOPS_ALLOWED_ORIGINS:?Set AWENOPS_ALLOWED_ORIGINS to your browser origins}"
ADMIN_PASSWORD=${ADMIN_PASSWORD:-}
if [ "${#AWENOPS_SECRET}" -lt 32 ]; then
    echo "AWENOPS_SECRET must contain at least 32 random characters" >&2
    exit 1
fi
if [ -z "${AWENOPS_PASSWORD_HASH:-}" ] && [ "${#ADMIN_PASSWORD}" -lt 12 ]; then
    echo "Set ADMIN_PASSWORD (at least 12 characters) or AWENOPS_PASSWORD_HASH" >&2
    exit 1
fi

echo "====================================="
echo "  awenops - starting"
echo "====================================="

mkdir -p /app/data

export AWENOPS_DATA_DIR=/app/data
export AWENOPS_HOST=127.0.0.1
export AWENOPS_PORT=8001
export PYTHONPATH=/app/server
export PYTHONUNBUFFERED=1
export PYTHONUTF8=1
export PYTHONIOENCODING=utf-8
export AWEN_HOME="${AWEN_HOME:-/app/data/awen-agent}"
mkdir -p "$AWEN_HOME"

# Generate password hash from ADMIN_PASSWORD env var
if [ -n "${ADMIN_PASSWORD:-}" ] && [ -z "${AWENOPS_PASSWORD_HASH:-}" ]; then
    AWENOPS_PASSWORD_HASH=$(python3 -c "import bcrypt,os; print(bcrypt.hashpw(os.environ['ADMIN_PASSWORD'].encode(), bcrypt.gensalt()).decode())")
    export AWENOPS_PASSWORD_HASH
fi
unset ADMIN_PASSWORD

echo "  Starting backend..."
cd /app/server
python3 -m uvicorn app.main:app \
    --host 127.0.0.1 --port 8001 \
    --log-level info --no-access-log &
BACKEND_PID=$!

for i in $(seq 1 30); do
    if curl -sf http://127.0.0.1:8001/api/health > /dev/null 2>&1; then
        echo "  Backend ready"
        break
    fi
    sleep 1
done

echo "  Starting nginx..."
nginx -g 'daemon off;' &
NGINX_PID=$!

echo ""
echo "====================================="
echo "  Ready! http://localhost:8080"
echo "====================================="

cleanup() {
    kill $NGINX_PID $BACKEND_PID 2>/dev/null || true
    wait
    exit 0
}
trap cleanup SIGTERM SIGINT

wait -n $BACKEND_PID $NGINX_PID
exit $?
