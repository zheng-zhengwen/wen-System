# ADR-0034 · 桥接写操作双端校验

- 日期：2026-09-06
- 状态：已采纳
- 依据：架构一致性审查；只读模式调用 `listing_create_project` 的失败回归测试

## 背景

原架构由 awenOps 管业务权限/领星凭据，awenAgent 管规划与执行。旧桥接 token 只有用户身份，
没有本轮审批档位；Agent 只在有远程审批回调时检查 destructive，导致无人可审批反而直接执行。
仅修改界面档位或提示词无法恢复执行边界。

## 决策

- Bridge v2 token 签入用户、服务端生成的轮次、模式和 15 分钟有效期。只读 token 不能签发写授权。
- 写工具先 `/prepare` 得到不透明 call_id，绑定工具名与规范化参数 SHA-256。服务端目录判断 destructive。
- 需审批模式：Agent 将 call_id 放入真实 `permission_request`。主系统在转发该帧之前绑定审批归属。
  用户批准后，先授予授权，再唤醒 Agent，避免快速执行与审批落账竞态。
- `/call` 在调用 handler 之前原子消费授权。改工具、改参数、跨轮次、过期、拒绝、重放均不执行。
  “本轮同一工具都批准”仅作用于当前轮次和同一工具，不扩大为所有桥接操作。
- 完全放行由当前请求明确选择，仍需带单次 call_id。断流/轮次结束/进程重启撤销待执行授权。
- 普通会话鉴权的 `/ops-tools/call` 只允许读工具；不能绕开桥接审批执行写操作。
- 内部回调默认固定为 `http://127.0.0.1:<AWENOPS_PORT>/api/awen-agent-bridge`，不使用 Host/Forwarded。
  分容器部署通过管理员配置的 `AWENOPS_BRIDGE_URL` 明确指定可信地址。

## 兼容与取舍

保持 HTTP/SSE 架构，不让 Agent import 主系统业务代码。安全状态独立在 `ops_bridge_security.py`，
现有业务 handler 暂不大规模搬迁。两仓库真实代码的消费方测试位于 `test_bridge_agent_contract.py`。

授权与原有 RemoteApproval 队列一样使用单进程内存。当前部署须保持单 backend worker；
多 worker 不共享授权，会安全拒绝，不能把它当成已支持的高可用方案。若要水平扩展，应把审批归属、
授权消费和活跃轮次共同迁入具备原子操作的共享存储，再补跨 worker 测试。

旧版本仍可查询；新版 Agent 对旧版主系统的写操作明确要求升级。发布必须成对验收，不允许静默降级。
