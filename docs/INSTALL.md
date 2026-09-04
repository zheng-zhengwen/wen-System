# 生产环境部署

假设环境为 Linux + Python 3.9+ + Node 18+ + nginx + certbot。
全文把 `ops.example.com` 替换成你自己的域名。

> 提示：本地快速试用直接跑 `bash scripts/install.sh`（自动建虚拟环境、装依赖、构建前端、生成 `.env`）即可，下面是手动的生产部署流程。

## 0. 前置依赖

```bash
# 安装系统依赖（以 CentOS/RHEL/Fedora 为例，其他发行版自行调整）
sudo dnf install -y python3 python3-pip nodejs nginx certbot \
                    python3-certbot-nginx gettext

# 选一个目录克隆仓库
sudo mkdir -p /opt && cd /opt
git clone https://github.com/YOUR_USERNAME/awenops.git
cd awenops
```

## 1. 后端

依赖装进独立虚拟环境（避免污染系统 Python，也绕开 Debian/Ubuntu/Fedora 的
`externally-managed-environment` 限制）：

```bash
cd server
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

生成密钥：

```bash
cp .env.example .env

# 会话签名密钥
.venv/bin/python -c "import secrets; print('AWENOPS_SECRET=' + secrets.token_urlsafe(32))"
# 把这行粘进 .env

# 管理员密码
PYTHONPATH=. .venv/bin/python -m app.core.hashpw
# 把输出的 AWENOPS_PASSWORD_HASH=... 粘进 .env
```

编辑 `.env`：

- `AWENOPS_USER` —— 管理员登录名
- `AWENOPS_ALLOWED_ORIGINS=https://ops.example.com` —— 你的公网地址
- `AWENOPS_COOKIE_DOMAIN=` —— 留空即可，除非需要子域共享
- `AWENOPS_DEV=0` —— 生产模式

## 2. 前端

```bash
cd ../client
npm install
npm run build
```

产物在 `client/dist/`，由 FastAPI 直接托管。

## 3. 渲染部署模板

```bash
cd ..
cp deploy/install.conf.example deploy/install.conf
$EDITOR deploy/install.conf
# 至少设置 SERVER_NAME=ops.example.com、INSTALL_DIR=/opt/awenops
# 并把 PYTHON_BIN 指向 server/.venv/bin/python

bash scripts/render-deploy.sh
# → 把 nginx / systemd / cron.d 模板渲染到 deploy/dist/
```

## 4. DNS + certbot

在你的 DNS 服务商处，为 `ops.example.com` 添加一条指向服务器公网 IP 的 A 记录。
等 `dig ops.example.com` 能解析到该 IP 后：

```bash
sudo certbot certonly --nginx -d ops.example.com
# 若 nginx 还没起来：
# sudo certbot certonly --standalone -d ops.example.com
```

## 5. 安装渲染好的配置

```bash
# nginx
sudo cp deploy/dist/nginx/awenops.conf /etc/nginx/conf.d/
sudo nginx -t && sudo systemctl reload nginx

# systemd
sudo cp deploy/dist/systemd/awenops.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now awenops.service

# CPU 告警 cron（可选，建议开启）
sudo mkdir -p /var/log/awenops
sudo cp deploy/dist/cron.d/awenops-cpu-alert /etc/cron.d/
```

## 6. 冒烟测试

```bash
# 本地健康检查
curl -sS http://127.0.0.1:8001/api/health

# 公网地址
curl -sSI https://ops.example.com/ | head -5
```

浏览器打开 `https://ops.example.com`，登录后进入「系统配置」，查看
**系统状态** 面板——每一行都应为绿色，或给出明确的「未配置」原因。

## 升级更新

```bash
cd /opt/awenops
git pull
cd server && .venv/bin/pip install -r requirements.txt && cd ..
cd client && npm install && npm run build && cd ..
sudo systemctl restart awenops.service
```

若上游的 `deploy/*.template` 有变化：

```bash
bash scripts/render-deploy.sh
sudo cp deploy/dist/nginx/awenops.conf /etc/nginx/conf.d/
sudo nginx -t && sudo systemctl reload nginx
sudo cp deploy/dist/systemd/awenops.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl restart awenops
```

## 常见问题排查

- **登录 403 / “origin not allowed”** —— `.env` 里的 `AWENOPS_ALLOWED_ORIGINS`
  没包含浏览器实际访问的地址。加进去后 `systemctl restart awenops`。
- **nginx 返回 502** —— 看 `systemctl status awenops` 和
  `journalctl -u awenops -n 50`。多半是缺 Python 依赖或 PYTHONPATH 不对。
- **Cookie 不生效** —— 如果你用的子域和配置的不一致，把 `AWENOPS_COOKIE_DOMAIN`
  设成共同的上级域（如 `.example.com`）。
- **systemd `Restart=on-failure` 反复重启** —— 通常是 `.env` 语法错误（值里有未加
  引号的空格）。在 shell 里 `set -a; . .env; set +a` 可复现解析错误。
