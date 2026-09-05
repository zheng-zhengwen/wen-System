# ADR-0035 · 可恢复、可复现的部署契约

- 日期：2026-09-06
- 状态：已采纳
- 依据：架构一致性审查与嵌套 WAL、中文路径、Docker 默认配置回归测试

## 决策

- 本机保留 `AWEN_HOME` / `~/.awen`，不擅自搬迁现存会话。Docker 使用持久卷内 `/app/data/awen-agent`。
- 备份格式 v2 继续兼容读取 v1。所有层级的 SQLite 使用在线 snapshot；Agent 配置可能含明文密钥，
  因此整个 Agent 子归档使用备份口令加密，无口令时明确标记未包含。模型下载、缓存、日志不属于必要备份。
- 恢复仍先干跑；先验证 Agent 口令和路径，再覆盖文件。应停 Agent，并在独立目录恢复/验证后切换。
- Docker 必须提供稳定密钥、强管理员密码或 bcrypt hash、允许的浏览器源和明确 Agent ref。
  默认仅本机公开 nginx 入口，backend 仅容器内回环可达；不自动生成每次都变的 secret。
- 安装器、CI 取不到正式 release 时明确停止，不自动安装 main；源码联调可显式选择本地来源/ref。
  根目录旧 setup 脚本仅转发原生安装入口，不再运行另一套 Hermes 优先的 Docker 安装流程。
- pytest 显式包含两套后端测试目录，排除被误收集的业务 `settings_test.py` 和技能样例。
  本机使用与 CI 同一 `pytest-timeout` 开发测试依赖，防止 WebSocket 失败后无限等待。

## 后果

Docker 旧容器里的 `/root/.awen` 需要在替换前单独导出，不能以“加了 volume”冒充已有数据已迁移。
无口令的自动备份不是完整迁移包；管理员须手动做带口令备份。新备份含加密 Agent 归档，恢复应使用新版。
详细步骤与尚未验收的平台边界见 [部署与恢复说明](../deployment-recovery.md)。
