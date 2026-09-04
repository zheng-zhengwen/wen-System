#!/bin/bash
set -e

echo "====================================="
echo "  awenops - starting"
echo "====================================="

mkdir -p /app/data

export AWENOPS_DATA_DIR=/app/data
export AWENOPS_HOST=0.0.0.0
export AWENOPS_PORT=8001
export PYTHONPATH=/app/server
export PYTHONUNBUFFERED=1

# Generate password hash from ADMIN_PASSWORD env var
if [ -n "$ADMIN_PASSWORD" ] && [ -z "$AWENOPS_PASSWORD_HASH" ]; then
    export AWENOPS_PASSWORD_HASH=$(python3 -c "import bcrypt,sys; print(bcrypt.hashpw(sys.argv[1].encode(), bcrypt.gensalt()).decode())" "$ADMIN_PASSWORD")
fi

# Generate secret if not set
if [ -z "$AWENOPS_SECRET" ]; then
    export AWENOPS_SECRET=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")
fi

echo "  Starting backend..."
cd /app/server
python3 -m uvicorn app.main:app \
    --host 0.0.0.0 --port 8001 \
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
