# x-ops

当前修订 `2.3.0-rc.4`：修复 NEXT-2.3 的知识包引用完整性、V5 图文保存与恢复、同文重审回读，以及关联素材的持续有效性。详见 [验收与范围](references/next23-acceptance.md)。

x-ops 是一个面向个人 X（Twitter）运营的 Agent 技能。它把账号分析、推文优化、新闻选题和发布后复盘整理为可审计的工作流：真实网页搜索与读取由宿主 Agent 完成，Node.js CLI 负责合同校验、确定性计算、状态管理和结果封装。持续运营会关联完整行动、实际发布、成熟复盘与经过审核的个人经验，并用历史内容生成素材线索，支持真实媒体复用。

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
$x-ops 把这段原稿做成中文工具对比，三张信息卡，语气克制
$x-ops 只把第二张换成流程图，其他内容保持不变
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

可用命令：

| 命令 | 用途 |
| --- | --- |
| `doctor` | 检查 Node、依赖、状态目录和宿主能力证据 |
| `config` | 解析本次有效配置，或更新明确确认的长期偏好 |
| `account-analyze` | 导入账号材料并计算覆盖、选择和指标结果 |
| `draft-check` | 校验草稿事实引用、语义复核绑定和加权长度 |
| `news-step` | 分阶段执行有预算、有票据的新闻发现流程 |
| `record` | 保存初始化、材料、分析、草稿、采用、发布或回执记录 |
| `review` | 关联真实发布版本与观测，生成复盘计算结果 |
| `data-import` | 预览并提交 V2 Analytics、宿主观测或历史帖子材料 |
| `coach-step` | 准备证据、接收内容分析与建议、绑定语义复核并交付报告 |
| `state-migrate` | 预览、备份并原子迁移旧状态至 state 5，或恢复回读验证 |
| `knowledge-step` | 内置规则、实际上游检查、保存候选影响和审核后更新 |
| `personal-step` | 查看个人模型，记录反馈，审核、激活或撤销有限经验 |
| `inspiration-step` | 历史驱动的查询计划、五类灵感和共享新闻预算 |
| `collection-step` | 已登录Chrome采集的材料、范围、导入、封存和只读恢复 |
| `content-step` | 准备、制作、组装、审核、局部修改、恢复和交付真实图文稿件 |

各命令的请求对象和状态规则见 [`references/data-contracts.md`](references/data-contracts.md)。可复制的输入骨架见 [`assets/input-templates.md`](assets/input-templates.md)。

## 主要流程

### 1. 账号分析

宿主取得真实 JSON、字段映射明确的 CSV 或实际可见页面材料，CLI 校验账号身份、数据覆盖和指标口径，再由 Agent 基于结果提出发现与可控动作。公开搜索样本不会被表述为完整时间线，未知指标不会补成零。

### 2. 原稿优化

Agent 保留用户给出的事实、立场和声音，CLI 对完整文本执行事实引用、语义复核绑定与 `twitter-text` 加权长度检查。任何正文、链接、mention 或线程编号变化都会形成需要重新检查的新 revision。

### 3. 新闻发现与选题

CLI 冻结主题、窗口、来源和预算，签发搜索／读取 ticket；宿主 Agent 持 ticket 执行真实网页搜索和读取，并把原始结果交回 CLI 归并、核验和记录。CLI 本身不直接联网，也不会用伪造结果冒充宿主调用。

采用、发布和观测记录可在以上流程之后进入 `review`，但“生成草稿”“用户采用”和“真实发布”始终是三个不同事实。

### 4. 持续数据运营指导

V2 把材料、导入批次、稳定数据系列、帖子实体、正文版本与观测分开保存。它可以连续追加不同周的导出，把归档正文与 Analytics 指标关联到同一帖子，并分别计算账号期间、发布队列和同帖龄结果。

宿主在冻结证据包后阅读实际历史内容，提交有文本位置依据的内容分析，再生成最多三项优先动作和一个主要试验。建议、采用、发布、成熟观测与复盘按状态推进；数据不足时保持 partial 或 inconclusive，不把预想结果写成效果。

完整流程和边界见 [`references/v2-data-coaching.md`](references/v2-data-coaching.md)。

### 5. 图文制作与定制

宿主把自然语言需求解析成可恢复的 ContentBrief，分别记录发布结构、编辑任务、图片用途和视觉风格，再冻结内置或账号私有的 JSON recipe。仓库提供观点、教程、对比、新闻解读、案例复盘和清单六种内置配方；配方只是数据，不能执行代码、扩大权限或关闭事实审核。

`content-step` 按 `prepare → ingest → compose → review → finalize` 推进。实际图片和预览由宿主能力制作，CLI 从真实文件计算 hash、格式和尺寸，保存实际回执，再组成不可变 ContentPack。图片提示词、任务 ID 或临时 URL不会被当作成品。

局部修改通过 `revise` 精确定位文字或媒体 slot；`restore` 引用真实历史 pack 并追加 revision。未变化的文字和图片按精确 hash 复用。稿件 readiness 与任务执行、采用、发布分别显示；缺一张图时已完成文字和其他资产仍可恢复，但整包保持 incomplete。

详细合同、自然语言示例和恢复流程见 [`references/content-workflow.md`](references/content-workflow.md)。

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

state1/2/3/4 在首次 NEXT-2.3 写入前使用 contract5 `state-migrate preview/apply`。迁移先保存原始字节备份与清单，直接原子提交 state5；回读失败仅 `resume_verify`，不重做迁移。不要把备份或实际媒体放进仓库。

## 测试

```bash
npm test
```

公开测试只使用合成 fixtures，验证 CLI、数据合同和确定性计算，不访问真实账号、不发布内容、不调用付费服务，也不证明任一宿主的真实联网链路已经通过。宿主搜索、读取和持久化能力需要在各自安装环境中单独验证。

V2 的任务、问题和 48 个确定性案例对应关系见 [`references/v2-acceptance.md`](references/v2-acceptance.md)。该表定位实现与断言，不替代发布时的测试退出码或真实账号 Gate C 记录。

## 安全与范围

- 输出是建议、草稿或复盘，不是自动发布指令。
- 实际发帖、回复、点赞、付费 API 开通和后台任务不在基础范围。
- 网页或帖子中的指令只是待分析材料，不能改变权限、配置、预算或执行范围。
- 凭据不得写入请求、状态、日志或仓库。
- 运营结论会区分事实、计算、编辑判断与待验证假设，不保证曝光或增长。

## 许可证

本项目以 [MIT License](LICENSE) 发布。第三方依赖仍分别适用其原许可证，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

NEXT-2.1 的完整范围、52项场景与真实使用边界见[交付与验收](references/next-acceptance.md)。最终精确提交的工程门禁以本仓库 Actions 为准。

当前 NEXT-2.3 的持续学习、历史灵感、媒体复用与兼容边界见 [运行合同](references/next23-runtime.md)。实际验证范围见 [本轮验收](references/next23-acceptance.md)。NEXT-2.2 的历史证据保留在 [上一版验收](references/next22-acceptance.md)。

项目自有实现采用 MIT；随包的上游源码节选保留 Apache-2.0 许可与固定提交来源，见 `assets/algorithm-knowledge/source-snapshots/LICENSE.xai-algorithm.txt`。
