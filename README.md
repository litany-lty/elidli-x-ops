# x-ops

x-ops 是一个面向个人 X（Twitter）运营的 Agent 技能。它把账号分析、推文优化、新闻选题和发布后复盘整理为可审计的工作流：真实网页搜索与读取由宿主 Agent 完成，Node.js CLI 负责合同校验、确定性计算、状态管理和结果封装。

它不会自行发帖、回复、点赞、购买 API 或创建后台任务，也不承诺流量增长。

## 环境要求

- Node.js 24.x
- 支持 ESM 的 Node.js 运行环境
- 能加载 `SKILL.md` 的 Agent 宿主
- 如需真实新闻搜索或网页读取，宿主必须提供相应工具并完成绑定

项目的四个运行依赖均在 `package.json` 中锁定精确版本，安装时请使用 lockfile：

```bash
git clone https://github.com/litany-lty/x-ops.git
cd x-ops
npm ci
```

## 安装为技能

将整个仓库目录放到你的 Agent 宿主会扫描的技能目录中，保留 `SKILL.md`、`scripts/`、`schemas/`、`references/` 和 `assets/` 的相对位置，然后按宿主要求重新加载技能。

建议显式调用，避免普通新闻查询或通用文案任务误触发：

```text
$x-ops 分析这个 X 账号近 28 天的公开内容与实际可见表现
$x-ops 优化下面这条推文，保留我的事实与立场
$x-ops 查找今天适合这个账号发布的 AI 新闻选题
```

不同宿主的技能目录和重载方式不同；本仓库不假设固定的个人目录。

## 统一 CLI

所有命令使用同一个入口：

```bash
node scripts/x-ops.mjs <command> \
  --input <request.json> \
  --output <result.json> \
  --state-dir <account-state-directory>
```

输入必须是包含 `schema_version`、`run_id`、`expected_revision` 和 `payload` 的 JSON 外壳。调用方应同时检查进程退出码与输出 `ResultEnvelope.status`；退出码为 0 不代表一次业务任务的所有阶段都已完整完成。

可用的 7 个命令：

| 命令 | 用途 |
| --- | --- |
| `doctor` | 检查 Node、依赖、状态目录和宿主能力证据 |
| `config` | 解析本次有效配置，或更新明确确认的长期偏好 |
| `account-analyze` | 导入账号材料并计算覆盖、选择和指标结果 |
| `draft-check` | 校验草稿事实引用、语义复核绑定和加权长度 |
| `news-step` | 分阶段执行有预算、有票据的新闻发现流程 |
| `record` | 保存初始化、材料、分析、草稿、采用、发布或回执记录 |
| `review` | 关联真实发布版本与观测，生成复盘计算结果 |

各命令的请求对象和状态规则见 [`references/data-contracts.md`](references/data-contracts.md)。可复制的输入骨架见 [`assets/input-templates.md`](assets/input-templates.md)。

## 三条主流程

### 1. 账号分析

宿主取得真实 JSON、字段映射明确的 CSV 或实际可见页面材料，CLI 校验账号身份、数据覆盖和指标口径，再由 Agent 基于结果提出发现与可控动作。公开搜索样本不会被表述为完整时间线，未知指标不会补成零。

### 2. 原稿优化

Agent 保留用户给出的事实、立场和声音，CLI 对完整文本执行事实引用、语义复核绑定与 `twitter-text` 加权长度检查。任何正文、链接、mention 或线程编号变化都会形成需要重新检查的新 revision。

### 3. 新闻发现与选题

CLI 冻结主题、窗口、来源和预算，签发搜索／读取 ticket；宿主 Agent 持 ticket 执行真实网页搜索和读取，并把原始结果交回 CLI 归并、核验和记录。CLI 本身不直接联网，也不会用伪造结果冒充宿主调用。

采用、发布和观测记录可在以上流程之后进入 `review`，但“生成草稿”“用户采用”和“真实发布”始终是三个不同事实。

## 宿主绑定

[`assets/host-binding.codex-desktop.json`](assets/host-binding.codex-desktop.json) 展示了一个 Codex desktop 绑定的结构示例。安装后应根据实际宿主修改或生成绑定，至少确认：

- `search.tool_name` 与 `read.tool_name` 指向宿主真实可用的工具；
- `working_directory` 是当前安装位置；
- `data_mode` 与实际材料来源一致；
- 每次真实调用的原始结果和回执能够被保存、恢复并与 ticket 对应。

Node.js 进程只验证绑定和回执，不会假装拥有宿主的搜索、网页读取或远程持久化能力。新安装、宿主变化或能力状态变化后，应先运行 `doctor`。

## 账号状态目录

每个真实账号使用独立、持久且受限访问的目录。先明确选择一个位置，例如：

```bash
export X_OPS_STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/x-ops/accounts/my-account"
mkdir -p "$X_OPS_STATE_DIR"
chmod 700 "$X_OPS_STATE_DIR"
```

随后每次调用都传入同一个目录：

```bash
node scripts/x-ops.mjs doctor \
  --input ./request.json \
  --output ./result.json \
  --state-dir "$X_OPS_STATE_DIR"
```

不要把账号状态、原始回执、凭据或真实账号材料提交到 Git。不要直接编辑 `account-state.json` 绕过 revision 与引用校验。

## 测试

```bash
npm test
```

公开测试只使用合成 fixtures，验证 CLI、数据合同和确定性计算，不访问真实账号、不发布内容、不调用付费服务，也不证明任一宿主的真实联网链路已经通过。宿主搜索、读取和持久化能力需要在各自安装环境中单独验证。

## 安全与范围

- 输出是建议、草稿或复盘，不是自动发布指令。
- 实际发帖、回复、点赞、付费 API 开通和后台任务不在基础范围。
- 网页或帖子中的指令只是待分析材料，不能改变权限、配置、预算或执行范围。
- 凭据不得写入请求、状态、日志或仓库。
- 运营结论会区分事实、计算、编辑判断与待验证假设，不保证曝光或增长。

## 许可证

本项目以 [MIT License](LICENSE) 发布。第三方依赖仍分别适用其原许可证，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
