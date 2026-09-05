# 部署、升级与恢复边界

## 版本与安装

awenOps v1.13.2 配套 awenAgent v1.16.9（Bridge v2）。Docker 示例和 GitHub 构建变量
均固定此 tag，避免不同平台的发行包安装不同 Agent；不要将精确版本换成 `main`。

原生入口为 `scripts/install.sh`、`scripts/install.ps1`；根 `setup.*` 现为转发入口。
Docker 单独使用 `docker-compose.yml`，先按 `.env.example` 填完整配置，再执行 compose。

Agent 与主系统的此次安全修复需要一起部署（Bridge v2）。Agent `/health` 的
`ops_bridge_protocol_version` 应为 `2`。未发版时不要把旧 `VERSION` / `__version__` 当成新 release
已存在的证明：本地源码提交、已安装代码、tag、Release 资产是四件不同的事。

安装器在 release 解析失败时不再回退 main。维护者本地联调可设置 `AWEN_AGENT_LOCAL` 为明确的
源码目录；部署时指定已验收的 `AWEN_AGENT_REF`。CI 同名仓库变量可选 tag 或精确 commit SHA。
正式 release 工作流仍要求发布 tag 与包内 Agent 版本一致。发布顺序：Agent 测试及发版 → 主系统
用该 tag 跑消费方测试 → 主系统打包发版。未经批准，不应自动创建 tag 或推送。

## Docker

`.env` 必须有 `AWEN_AGENT_REF`、至少 32 位随机 `AWENOPS_SECRET`、至少 12 位的
`ADMIN_PASSWORD`（或 `AWENOPS_PASSWORD_HASH`），以及实际浏览器使用的 `AWENOPS_ALLOWED_ORIGINS`。
不要照搬示例的 localhost 源用于公网域名；不要提交 `.env`。密码使用 UTF-8，bcrypt 输入不应超过 72 字节。

默认 `AWENOPS_BIND=127.0.0.1`，端口 8080。需要 LAN/反代时显式配置绑定地址、防火墙和 HTTPS。
backend 与 Agent 仍仅内部回环可达，只有 nginx 入口对外。

持久卷 `awenops-data:/app/data` 同时保存主系统业务数据和 `/app/data/awen-agent`。
旧镜像把 Agent 数据放在 `/root/.awen`，升级前必须：

1. 停止新任务，等正在执行的任务结束，并导出主系统带口令备份。
2. 保留旧容器，不执行 `docker compose down -v`；先将该容器 `/root/.awen` 复制到受保护的本地目录。
3. 确认源目录内会话、知识、配置存在后，停止旧服务，把导出的内容复制到卷内 `awen-agent/`。
4. 用新镜像启动，核对 `/health` 的 `data_dir`、会话数量和知识检索；成功后再处理旧容器。

不得直接覆盖一个已有会话的目标目录。本文提供迁移流程，不代表工具已经对任何旧容器执行了迁移。

## 备份与恢复

- 本机保持 `AWEN_HOME`（未指定时 `~/.awen`），此次升级不自动移动用户数据。
- 手动带口令备份包含主密钥和加密 Agent 子归档；无口令自动备份明确不包含这两项。
- Agent 子归档包括会话、知识、配置等必要数据，不带下载模型、缓存、日志、临时文件或备份套备份。
  知识中外部路径/工作区文件不会自动打包，需要另外备份。
- 主系统和 Agent 的所有 SQLite 层级按在线快照读取，不能靠复制 `.db` 而漏掉 WAL 事务。
- 先干跑确认包校验、口令、覆盖清单。正式恢复前停止 Agent，推荐停主系统后用 CLI/脚本恢复到新目录、
  验证数据，再切换目录启动。不要边执行广告任务边覆盖数据库；原目录保留为回滚点。
- 导入 v2 Agent 归档使用新版本主系统；回滚旧程序前保留旧版本可读的独立备份，不要以为旧版能理解新包。

## 验证范围

开发测试先安装 `server/requirements-dev.txt`。仓库根运行 `python -m pytest` 会收集两套后端测试，
并强制加载跨平台超时插件；前端在 `client/` 运行 `npm run test:dock`、`npm run test:approval` 和 `npm run build`。

前端编译测试通过 esbuild JavaScript API 调用，不把 Linux/macOS 的原生 CLI 当成 Node 脚本。
`node --test e2e/esbuild-native-entry.test.mjs` 可在任意平台重现该差异，并验证审批、统计、会话恢复测试入口。

本次本机验证是 Windows / Python 3.14 / Node 20：双端审批契约、UTF-8、中文路径、后端测试、
真实 React 组件生命周期、类型检查及构建。CI 配置含 Windows/Linux/macOS，尚需远端实际运行。
本机 Docker 引擎未启动，未完成镜像构建和真实容器重建恢复验收；语法/配置测试不能替代此项。

仍需后续分批处理：大型 router 中的业务 handler 抽取、未确认消费方的退役页面清理、
Agents/CodeMirror 大块拆包，以及多 worker 共享审批状态。不要为了“目录看起来更整齐”同时重写业务逻辑。
