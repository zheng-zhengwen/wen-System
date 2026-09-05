# awenops · 自托管亚马逊运营工作台

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/zheng-zhengwen/wen-System?label=release)](https://github.com/zheng-zhengwen/wen-System/releases/latest)
[![Stars](https://img.shields.io/github/stars/zheng-zhengwen/wen-System?style=flat&logo=github)](https://github.com/zheng-zhengwen/wen-System/stargazers)
![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows-lightgrey)
![Backend](https://img.shields.io/badge/backend-FastAPI-009688?logo=fastapi&logoColor=white)
![Frontend](https://img.shields.io/badge/frontend-React%20%2B%20Vite-61DAFB?logo=react&logoColor=white)


## 目录

- [核心特性](#核心特性)
- [界面预览](#界面预览)
- [功能板块总览](#功能板块总览)
- [快速开始](#快速开始)
- [更新升级](#更新升级不影响你的数据)
- [配置模型（两层）](#配置模型两层)
- [AI 智能体](#ai-智能体)
- [领星 ERP 接入](#领星-erp-接入)
- [生产环境部署（Linux）](#生产环境部署linux)
- [项目结构](#项目结构)
- [安全须知](#安全须知)
- [致谢](#致谢)

---

## 核心特性

- **本地部署**：跑在自己的服务器，不依赖第三方 SaaS，业务数据不出私域。
- **数据安全**：工作台店铺数据和连接凭据存放在后端 `data/`（已 gitignore）；Agent 会话、知识和模型配置使用独立的 `AWEN_HOME`，不入代码库。领星凭据不复制给 Agent。
- **开箱即用**：Release 包已预构建前端；Windows 普通包预置后端 wheels，Windows x64 包内置后端 exe。
- **可二次开发**：AGPL-3.0 开源，前后端按模块拆分，路由 / 服务一一对应，新增板块成本低。
- **高自由度 · 可定制**：板块与功能都能按需增删改；对现成功能不满意，可直接让 awenAgent 或外部智能体读代码帮你修改调优 —— 审核制修复还会在 git worktree 隔离、人工确认后才落地。
- **一次登录，全部模块**：单点登录后侧边栏直达所有板块，统一使用「琉璃·浅」主题。
- **智能体驱动**：右下角内置 awenAgent 常驻会话与知识库；也可接入 Hermes / Claude / Codex 等外部 CLI。

---

## 界面预览

> 以下是历史版本的工作台截图；当前统一使用「琉璃·浅」主题。各板块完整用法见 [`docs/USAGE.md`](docs/USAGE.md)。

<table>
  <tr>
    <td align="center" width="50%">
      <img src="docs/assets/screenshot-market-research.png" alt="市场调研：智能体多步采集 + AI 综合报告" width="100%" />
      <br />
      <sub><strong>市场调研</strong>：智能体按步采集真实数据，产出可导出（md / csv / html）的综合报告</sub>
    </td>
    <td align="center" width="50%">
      <img src="docs/assets/screenshot-analysis-tools.png" alt="分析工具：ASIN 深度审计 + 广告搜索词诊断 + 深度分析" width="100%" />
      <br />
      <sub><strong>分析工具</strong>：ASIN 深度审计、广告搜索词诊断、竞品反查 / 关键词竞争 / 评论聚类 / 流量诊断</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <img src="docs/assets/screenshot-lingxing-erp.png" alt="领星 ERP：受控写操作 + 确定性护栏 + 三重复核" width="100%" />
      <br />
      <sub><strong>领星 ERP</strong>：受控写操作走「确定性护栏 + 三重复核 + 人工确认」，默认只读</sub>
    </td>
    <td align="center" width="50%">
      <img src="docs/assets/screenshot-skill-studio.png" alt="能力市场 · 技能：一句话生成 Skill" width="100%" />
      <br />
      <sub><strong>能力市场 · 技能</strong>：一句话描述想法，AI 多阶段生成并自检修复成可执行 Skill</sub>
    </td>
  </tr>
  <tr>
    <td align="center" colspan="2">
      <img src="docs/assets/screenshot-gbrain.png" alt="知识库工作台" width="50%" />
      <br />
      <sub><strong>知识库工作台</strong>：上传、编辑、搜索和对话；右下角 awenAgent 可迁移 ~/brain 到 ~/.awen/knowledge</sub>
    </td>
  </tr>
</table>

---

## 功能板块总览

> **每个板块怎么用、需要哪些配置，详见使用手册 [`docs/USAGE.md`](docs/USAGE.md)。**

侧边栏按四组组织，与下表一一对应。

> **通用问答、作图和改图不在下表里** —— 它们不是独立板块，直接在**任务台**说就行：
> 不需要工具的问题直接问，说「画一张主图」会自动调生图链路并把图显示在回答里，
> 贴一张图再说要怎么改就是在你这张图上改。

### 工具
| 板块 | 说明 |
|---|---|
| **首页** | 工作台概览与常用入口 |
| **市场调研** | 关键词 / 竞品 / 类目洞察，结合数据源 + AI 综合分析 |
| **打法推荐** | 按品类给出运营策略建议 |
| **Listing 工作台** | 采集 → 文案（标题 · 五点 · 描述）→ **套图分镜**：以白底图为产品真值，整套主图 / A+ 图文一次直出，逐张质检 + 整套一致性复核，人工确认后交付（见 [`docs/listing-visual-studio.md`](docs/listing-visual-studio.md)） |
| **一键图片翻译** | 多站点卖家：一套图 → 多语言 → 多站点；上传或从图片工作区选图，按目标站点语言批量翻译图上文字（产品/版式/配色不变） |
| **分析工具（深度分析）** | 竞品速查 · 关键词竞争 · Listing 重写 · 评论聚类 · 流量诊断 |
| **领星 ERP** | 经官方 OpenAPI 接入领星：数据浏览 / 大盘 / 广告优化引擎 / 自动化建议 / 受控写操作 / 审计（见下文专章） |
| **能力市场 · 技能** | 一句话生成 Skill（多阶段严谨生成 + 自检修复）、填参数直接运行、Tool Spec 可视化、执行历史、从 GitHub 导入（原「Skill 中心」已并入这里） |

### AI & 系统
| 板块 | 说明 |
|---|---|
| **知识库工作台** | 上传 / 编辑 / 检索 / 对话 + 治理中心（变更审核、覆盖看板、冲突检查、脱敏导入）；文件保存在 `~/.awen/knowledge` |
| **外部智能体** | 原生移植 claudecodeui 体验：Claude 走 stream-json 结构化输出、会话 resume、工具调用可视化、终端 |
| **服务器终端** | 浏览器内 PTY 多终端会话（Windows 使用 ConPTY/PowerShell；Linux 支持额外的 ttyd 主终端） |
| **服务器监控** | CPU / 进程 / 日志等资源一屏掌握，含告警 |

### 小工具
| 板块 | 说明 |
|---|---|
| **头程比价** | 头程运费比价 |

### 管理
| 板块 | 说明 |
|---|---|
| **用户管理** | 多用户与权限 |
| **系统配置** | 集中式运行时配置（密钥 / 集成路径 / 阈值），首启向导引导 |
| **资讯** | 24 路信源并行抓取 + AI 汇总的每日行业资讯摘要（按类别均衡、附推荐理由） |

> 还内置「审核制 AI 自动修复」（awenAgent + git worktree 隔离生成修复、人工审核后应用，默认关闭）等运维能力。

---

## 快速开始

### Linux / macOS

**推荐（尤其小内存服务器）：下载预构建包，免装 Node、免构建、免 swap。** 前端打包峰值要
1.5–2 GB 内存，小机器常被 OOM 杀死、报错或卡死；预构建包已自带 `client/dist`，安装脚本检测到后会
**整段跳过 Node 安装与前端构建**，只配置 Python 后端：

```bash
# 1. 下载预构建包（awenops.zip 永远指向最新发行版）并解压
curl -L https://github.com/zheng-zhengwen/wen-System/releases/latest/download/awenops.zip -o awenops.zip
unzip awenops.zip && cd awenops
# 2. 一键安装（检测到自带前端 → 跳过 Node 与构建，只配后端）
bash scripts/install.sh
# 3. 启动
bash scripts/start.sh
```

> **🇨🇳 国内网络加速**：上面第 1 步从 GitHub 下载 ~90MB 很慢，换成 GitHub 加速代理即可（其余步骤不变）：
> ```bash
> curl -L https://ghfast.top/https://github.com/zheng-zhengwen/wen-System/releases/latest/download/awenops.zip -o awenops.zip
> ```
> `install.sh` 会**自动检测国内网络**，把 pip / npm 切到清华 + 淘宝镜像，并在需要从 Git 安装 awenAgent 时使用同一套加速配置（可用 `AWEN_CN=0` 关闭镜像、`AWEN_GH_PROXY=none` 关闭 GitHub 代理、`AWEN_GH_PROXY=<你的代理/>` 自定义）。若 `ghfast.top` 偶发不可用,可换 `https://gh-proxy.com/` 前缀。

> awenAgent 会随安装脚本默认安装并启动；Hermes / Ollama 是旧兼容增强组件，只有设置 `AWENOPS_INSTALL_LEGACY_AI=1` 或在「系统配置 → 系统状态」里手动修复时才会安装。

<details><summary>开发者：从源码构建（需 Node 18+ 与 ≥2G 内存）</summary>

```bash
git clone https://github.com/zheng-zhengwen/wen-System.git
cd wen-System
bash scripts/install.sh   # 无 dist 时会自动装 Node、构建前端（内存不足会临时加 2G swap）
bash scripts/start.sh
```
</details>

浏览器打开 **http://127.0.0.1:8001**，首启向导会引导你完成智能体检测与 API 密钥设置。

> **远程服务器怎么访问？** 默认只监听 `127.0.0.1`（仅本机，安全）。无头 Linux 服务器上没有浏览器，三选一：
> - **最简单（临时试用）**：在你**本机**开 SSH 隧道 `ssh -L 8001:127.0.0.1:8001 用户@服务器`，然后本机浏览器开 `http://127.0.0.1:8001`。无需反代。
> - **正式 / 团队**：上 nginx 反代 + 域名 + HTTPS —— 见 [`docs/INSTALL.md`](docs/INSTALL.md)（内置 nginx / systemd / certbot 模板）。
> - **图省事（不推荐）**：`.env` 里设 `AWENOPS_HOST=0.0.0.0` 并放行防火墙端口，直接 `http://服务器IP:8001`——等于裸暴露公网，务必配合强密码/防火墙。

> **国内网络加速**
> - **克隆慢**：推荐 **gh 代理**（零登录、Windows 也不弹凭据框）：
> `git clone https://gh-proxy.com/https://github.com/zheng-zhengwen/wen-System.git`
> - **装依赖慢**：`install.sh` / `install.ps1` 会**自动检测**是否在大陆网络，自动把 pip、npm 切到清华 + 淘宝镜像（无需手动；可用 `AWEN_CN=1` 强制开、`AWEN_CN=0` 关）。
> - **旧兼容组件慢**：Hermes / Ollama 会访问境外安装器、npm/pip 或模型源，默认不再安装；需要兼容旧链路时可稍后单独重试。

> macOS 与 Linux 命令完全一致（同为 Unix）：原生脚本和 `docker compose up -d` 都可用，
> PTY 终端也正常工作。下载预构建包时只需 Python 3.9+；从源码构建前端才需要 Node 18+（可用 Homebrew 安装）。

### Windows（双击即装、双击即用）

> **推荐给普通用户：下载 `awenops-Windows-x64.zip`，无需安装 Python / Node。** 到
> [Releases](https://github.com/zheng-zhengwen/wen-System/releases) 下载最新的
> `awenops-Windows-x64.zip` → 解压 → 双击 **`awenopsServer.exe`**。
> EXE 会自动生成配置、把登录信息保存到桌面和 `data\awenops 登录信息.txt`、创建桌面快捷方式、打开控制窗口并启动浏览器；以后双击桌面 `awenops` 或 `awenopsServer.exe` 即可启动，关闭控制窗口即停止服务。

如果你想保留 Python venv 方式，也可以下载普通 `awenops.zip`：它已含编译好的前端和 Windows Python 3.12 后端依赖 wheels，安装时优先离线装依赖，失败再回退在线 pip。

解压后：

1. **免 Python 包**：双击 `awenopsServer.exe`。
2. **普通包 / 源码包**：双击「安装 awenops.bat」—— 自动检测 Python、装后端依赖、生成配置、创建桌面快捷方式。
3. 以后**双击桌面「awenops」**—— 浏览器自动打开 **http://127.0.0.1:8001**。
4. x64 包会自动检测新版本，侧边栏左下角版本号旁出现红点时可点击 **更新**；也可双击 **「更新 awenops Windows x64.bat」**。如需停止，直接关闭控制窗口；**「停止 awenops.bat」** 仍可作为备用入口。

> awenAgent 是默认内置组件；Hermes / Ollama 只作为旧兼容增强项，可在「系统配置 → 系统状态」里手动安装 / 修复。

> **团队共享（同一局域网，其他电脑/手机零安装）**：双击 **「启动 awenops (局域网共享).bat」**。
> 它会自动探测本机局域网 IP、把服务绑到 `0.0.0.0`、将该 IP 加入 CSRF 白名单（否则跨机登录会
> 403）、放行防火墙 8001 端口，并在窗口里打印让同事访问的网址——对方浏览器打开即可，**无需安装任何东西**。
> IP 变了重跑一次即可；只在你信任的内网用，务必配强密码。详见
> [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md) §11。

> 喜欢命令行也可以：`powershell -ExecutionPolicy Bypass -File scripts\install.ps1`。
>
> **注意**：Windows 的浏览器内终端使用 ConPTY/PowerShell；Linux 专属的 systemd/ttyd
> 「主终端」入口不会在 Windows 显示，普通多终端会话可以正常使用。
>
> 从零开始的 Windows 图文步骤（含环境安装与常见问题排查）见
> [`docs/windows-install.md`](docs/windows-install.md)，适合直接转发给非开发的同事。

### 环境要求

| | Linux / macOS | Windows 普通包 | Windows x64 免 Python 包 |
|---|---|---|---|
| Python | 3.9+ | 3.9+（推荐 3.12，可用预置 wheels） | 不需要 |
| Node.js / npm | 预构建包不需要；源码构建需要 18+ | 预构建包不需要；源码构建需要 18+ | 不需要 |
| 后端依赖 | pip 在线安装 | 优先离线 wheels，失败回退在线 pip | 已打进 `awenopsServer.exe` |

> **装不上 / 起不来 / 打开是 404 / AI 报错？** 先看 [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md) —— 国内克隆、依赖慢、内存不足、Windows 编码、端口占用、前端没构建、远程访问、AI 失败等高频问题都在里面，多数能自助解决。

> **实在装不动？交给 AI 智能体装。** 这本就是个给智能体用的工作台——把本仓库地址丢给 Claude Code / Codex / hermes 等编码智能体，让它读 `README` 与 `scripts/`、按你的系统自己完成克隆、装依赖、构建、配置。比对着报错一行行手动试省心得多。

---

## 备份与迁移

设置页可以一键生成备份包（也可以 `POST /api/admin/backup`）。429MB 的 `data/` 大约压成 30MB —— 数据库走 SQLite 在线快照（不停服，且不会丢 WAL 里还没落盘的事务），图片、日志这类可再生的内容默认不收。

> ⚠️ **换机器请务必用「带口令」的备份包。**
>
> 从 v1.2 起，配置里的 API 密钥在磁盘上是加密的，解密要用 `data/.master.key`。
> 这是个**隐藏文件**，手动拷 `data/` 目录时极容易漏掉 —— 漏了之后所有密钥都得重填。
>
> 备份时填一个口令，主密钥就会被加密后一并打进包里，换机器能完整还原。
> 不填口令也能备份，只是恢复后需要重新填写各处的 API 密钥。

恢复默认只做**干跑**，先告诉你会覆盖哪些文件、包完不完整、口令对不对；确认无误后再带 `confirm=true` 真正执行。

每天凌晨 3 点会自动备份一次（本地保留 7 份）。自动备份不带口令，不含主密钥与 awenAgent 数据；换机器完整还原需手动做一次带口令的备份。Docker 持久卷、旧容器迁移与恢复边界见 [部署与恢复说明](docs/deployment-recovery.md)。

## 更新升级（不影响你的数据）

代码与数据是分离的：你的配置和数据**全部被 `.gitignore` 保护、不在版本控制里**，更新时不会被动到——
- `server/.env`（密钥/密码/API Key）
- `data/`（所有 `*.sqlite3` 数据库、`hub_settings.json` 设置、上传文件）
- `data/skills/`、`data/skill-studio/`（Skill、快照；旧位置仅作为迁移来源）
- `AWEN_HOME`（本机默认 `~/.awen/`；Docker 为 `/app/data/awen-agent/`）

**Linux / macOS** —— 一条命令：
```bash
bash scripts/update.sh
```
> 等价于 `git pull` + 刷新依赖 + 重建前端；`.env`/`data/` 原样保留。完成后按提示重启服务
> （systemd：`sudo systemctl restart awenops`；脚本启动：Ctrl+C 后 `bash scripts/start.sh`）。

**Windows x64 免 Python 包** —— 优先在网页侧边栏更新：

打开 awenops 后，侧边栏左下角会显示当前版本。检测到新版本时，版本号旁会出现红点，点击旁边的 **更新** 即可自动下载最新版、保留数据并重启。

如果网页打不开，也可以直接双击：

```text
更新 awenops Windows x64.bat
```

它会自动停止后台服务、下载最新版 `awenops-Windows-x64.zip`、覆盖程序文件、保留
`data\` / `logs\` / `server\.env`，最后重新启动。用户不需要手动备份或搬目录。

**Windows 源码 / 普通包（git clone 安装）** —— 在仓库目录里：
```powershell
git pull
```
然后重新双击「安装 awenops.bat」（可选安装项一路回车/选 N 即可；`.env` 已存在会自动跳过、不覆盖），完成后重新双击「启动 awenops.bat」。

---

## 配置模型（两层）

awenops 采用两层配置：

**第一层 · 启动配置（`server/.env`）**：仅启动时读取一次。
必填：`AWENOPS_SECRET`、`AWENOPS_PASSWORD_HASH`、`AWENOPS_ALLOWED_ORIGINS`。
由 `install.sh` / `install.ps1` 自动生成。

**第二层 · 运行时配置（`data/hub_settings.json`）**：在网页「系统配置」里编辑。
存放各类 API 密钥、集成路径、告警阈值等。留空时自动回退到对应的 `AWENOPS_*` 环境变量，
再回退到内置默认值。该文件已 gitignore，不入代码库。

> 完整配置项参考 [`docs/CONFIG.md`](docs/CONFIG.md)。

---

## AI 智能体

awenops 默认内置 awenAgent：右下角常驻图标提供会话、知识库上传、搜索和本地检索。外部 CLI 是**可选增强项**，没装也可以用「全局兜底大模型」跑大部分 AI 功能。首启向导和「系统配置 → 系统状态」都提供安装 / 修复入口：

| 智能体 / 组件 | 说明 |
|---|---|
| **awenAgent** | 默认内置主链，提供 Agent、知识库、上传文档、本地检索和 awenops 桥接 API |
| **Hermes Agent** | 旧兼容 / 可选增强，支持 MCP / 工具调用 / Skill |
| **Ollama** | 可选本地模型运行环境；用于本地模型工作流 |
| **Claude Code** | 「外部智能体」原生移植 claudecodeui，走 stream-json 结构化输出，支持会话 resume、工具调用可视化 |
| **Codex** *(可选)* | OpenAI Codex CLI；如不使用可忽略 |

安装后 awenops 会从 `$PATH` 自动探测，多数情况下无需手动配置路径。

---

## 领星 ERP 接入

「领星 ERP」板块经领星**官方 OpenAPI**把店铺数据与广告操作接入工作台，覆盖四类需求，
并以**自建网关作唯一咽喉**做安全隔离：

- **浏览分析**：数据浏览 / 大盘 / 多店铺对比，只读拉取真实经营与广告数据。
- **优化引擎**：确定性**规则引擎**产出否词 / 出价 / 加词等建议（数据不足不动手），LLM 仅复核。
- **自动化建议**：定时分析产出优化建议（仅建议，不直接写入）。
- **受控写操作**：默认**双开关全关**；开启后写操作强制**三重复核 + 确定性护栏 + 人工确认**，
  执行前抓回滚快照、失败自动熔断、全程审计。

<p align="center">
  <img src="docs/assets/screenshot-lingxing-erp.png" alt="领星 ERP 受控写操作：确定性护栏 + 三重复核 + 人工确认" width="100%" />
  <br />
  <sub>「操作执行」tab：每一笔写操作都要过确定性护栏（白名单 / 幅度上限）+ 三重独立复核 + 人工点「确认执行」，默认只读。</sub>
</p>

> 详细使用说明见 [`docs/lingxing-erp-guide.md`](docs/lingxing-erp-guide.md)，或板块内「帮助」tab。

网络环境需要固定境外出口时，可在「运营驾驶舱 → ⚙ 领星工具 → 配置」填写可选的
SSH 跳板机（主机、端口、用户、密码）。配置完整后 OpenAPI 与 MCP 共用该出口；留空
保持直连，SSH 故障时不会静默降级为直连。
> 凭证（AppID / AppSecret 等）写入后端 `data/hub_settings.json`，不入代码库。

---

## 生产环境部署（Linux）

生产环境推荐 nginx 反向代理 + Let's Encrypt + systemd：

```bash
cp deploy/install.conf.example deploy/install.conf
$EDITOR deploy/install.conf   # 设置 SERVER_NAME、INSTALL_DIR 等
bash scripts/render-deploy.sh
# 按打印出的 sudo cp 指引落地 nginx / systemd 配置
```

服务以 systemd 单元 `awenops` 运行（监听 :8001，托管 `client/dist`）。
完整指南见 [`docs/INSTALL.md`](docs/INSTALL.md)，可选集成见 [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md)。

---

## 项目结构

```
awenops/
├── server/                FastAPI 后端（Python）
│   ├── app/
│   │   ├── core/          配置、设置、安全、集成
│   │   ├── routers/       每个功能一个路由（lingxing / brain / market / listing / agent_hub …）
│   │   ├── services/      各功能的业务逻辑
│   │   └── agents/        智能体（providers / projects 等）
│   ├── .env.example
│   └── requirements.txt
├── client/                React + Vite 前端（TypeScript）
│   └── src/
│       ├── pages/workbench/   各工作台板块
│       ├── agents/            「外部智能体」原生移植子应用
│       ├── components/        通用组件
│       ├── layouts/           侧边栏 / 主框架
│       └── api/               类型化 API 客户端
├── data/                  运行时数据（SQLite、hub_settings.json）— gitignore
├── deploy/                nginx / systemd / cron / docker 模板
├── scripts/
│   ├── install.sh         Linux / macOS 一键安装
│   ├── install.ps1        Windows 普通包一键安装
│   ├── install-components.ps1  Windows 安装 / 修复 awenAgent 与可选外部组件
│   ├── update-exe.ps1     Windows x64 免 Python 包一键更新
│   ├── windows-action-gui.ps1  Windows x64 更新 / 停止图形窗口
│   ├── start.sh           Linux / macOS 启动
│   └── render-deploy.sh   渲染生产部署配置
└── docs/
    ├── CONFIG.md          完整配置参考
    ├── INSTALL.md         生产部署指南
    ├── INTEGRATIONS.md    可选集成
    ├── TROUBLESHOOTING.md 常见问题排查
    └── lingxing-erp-guide.md  领星 ERP 使用文档
```

---

## 安全须知

- `server/.env`、`data/`（含 `hub_settings.json`、领星凭证、SQLite）、`saved-images/` 均已 gitignore，**切勿**提交。
- 迁移 / 改前缀时务必原样保留 `AWENOPS_SECRET` 与 `AWENOPS_PASSWORD_HASH`，否则会登录 401。
- `AWENOPS_SECRET` 是**会话签名密钥**：泄漏等于别人可以伪造管理员会话。它在启动时就会从进程环境里摘走，子进程读不到。
- 配置里的 API 密钥在磁盘上是加密的（AES-256-GCM），解密要用隐藏文件 `data/.master.key` —— 备份时别漏，或者直接用带口令的备份包。
- 领星等真实店铺写操作受双开关 + 三重复核 + 人工确认保护，请勿绕过。
- 管理员账号 ≈ 机器权限（内置终端本来就有全盘访问），请据此分配。

威胁模型、漏洞报告方式见 [SECURITY.md](SECURITY.md)。

---

## 参与贡献

见 [CONTRIBUTING.md](CONTRIBUTING.md)。报 bug 时**请附上诊断包**（系统配置页可一键导出，不含密钥和店铺数据）——它把我们要来回问你的东西一次给齐。

版本变更见 [CHANGELOG.md](CHANGELOG.md)。

---

## 致谢

awenops 站在不少优秀开源项目之上，特此致谢：

- **[claudecodeui](https://github.com/siteboon/claudecodeui)**（**AGPL-3.0**）—— 「外部智能体」板块的浏览器端交互体验移植自该项目。正因如此，整个 awenops 依 AGPL-3.0 的 copyleft 要求以 **AGPL-3.0** 发布。
- **[Hermes Agent](https://github.com/NousResearch/hermes-agent)**（NousResearch）—— 可选集成的本地智能体（作为独立程序由 awenops 经子进程调用，并未内置其源码，故不影响本项目的许可证）。
- 基础设施：**FastAPI** · **React** · **Vite** · **xterm.js** 等众多开源库。

上述各上游项目的版权与许可证均归其原作者所有；如有疏漏，欢迎提 Issue 指正。
