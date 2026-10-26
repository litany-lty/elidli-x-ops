# NEXT-2.2 验收范围

基线：`4e9271870ce4abd16720fc7f49b530eebd52f567`。产品2.2.0-rc.1，state4，transport1。执行依据为用户提供的 NEXT-2.2 主文档，保留旧实现及历史对象，不重建系统。

## 工程与数据

本地 Node24 下 `npm ci` 成功；冻结业务代码后的完整回归为230 tests、230 pass、0 fail、0 skipped、0 cancelled。真实时间勘误、跨修订回执替代及旧入口指导门均进入该轮。最终提交的 GitHub CI 继续验证精确版本。

| 要求 | 证据入口 | 范围 |
| --- | --- | --- |
| B01–B07 身份、导入、选择、期间与覆盖 | next22-data-reliability / next22-data-cli | CLI导入、保存、回读、旧ID最终数值；不只检查辅助函数 |
| B08–B14 教练角色、计算冻结与可信复盘 | next22-coach-consumers / next22-coach-review / next22-coach-cli | 同帖龄与期间均走计算→保存→新进程→成熟→关闭；目标/指标/覆盖不可替换 |
| B15–B17 审核、个人依据与恢复 | next22-visual-cli | 实际否决与提交批准矛盾拒绝；同文H1/H2失效；slot2缺失与原字节恢复、预算不变 |
| A-K 规则、离线知识与指导 | v22-knowledge-core / next22-guidance-cli | 三值DSL、当前目录、候选隔离、精确完整输出与实际审核绑定、规则更新及相关指纹 |
| A-C 采集与保存 | next22-collection-core | 实际材料hash/身份定位、scope、导入回执、seal截止时间、只读finalize/resume |
| A-P 专业与个人依据 | next22-guidance-pairs / consumer tests | 当前内容与实际个人选择、可信历史反馈、局部范围及同文重审 |
| A-V 迁移与恢复 | next22-migration / next-state / next-runtime-flows | 1/2/3直接到4；备份/旧writer拒绝/原子写入/回读恢复；旧对象不改ID |

新增默认观察政策为24h±2h、7d±12h，到窗口上沿26h/180h才成熟。已有明确计划原样保留。没有可靠发布时间、期间终点或指标不能因存在一个数值就成熟。

## 专业质量

8组、16份合成配对，经另一代理独立读取完整输出、原输入和文件hash作语义复核。全部通过的是这些具体输出，不能由fixture里的reviewer或approved字符串证明独立审核。主线程发现并修订了虚构实测风险、观察窗口前提及配对单因子问题，原意见和最终完整对象留在私有验收目录。详见 [配对评估](next22-professional-evaluation.md)。

## 真实宿主

本机已有Chrome的公开主页、登录菜单和Analytics内容行分别用于身份核对；正常UI导出取得实际CSV，SHA/文件读取/明确映射导入后，完成material→import→seal→实际回读→finalize/resume。重复finalize/resume没有改变state字节或revision。

这证明有限材料链路闭合。来源时区、完整28个来源日、完整历史、父帖与媒体语义没有被全部验证，实际coverage保持partial。实际读取的正文/摘要不能宣传成完整近期账号效果诊断。

真实短稿和完整运营指导经过独立审核。初稿的原意偏移、指导的个人依据漏绑和文字未同步均被否决并保留，修正后才保存批准。没有用户采用、实际发帖或成熟效果数据，未验证运营增长。

本轮还发现部分初始知识与私有验收记录使用了预置未来UTC时间。错误对象保留为历史勘误证据，不能作为当前资格依据；正确时间使用实际时钟/文件证据，并通过新目录、新绑定和重新审核修正。未以修改旧对象或删除失败记录取得通过。

## 使用边界

- 公共源码覆盖固定于知识目录记录的上游提交；未公开策略、内部分类器与生产实验仍有明确缺口。
- 三类审核分别判断内容、运营指导和任务完成；旧payload与none模式不能关闭运营指导门。
- 正常纯编辑及限定像素修改可独立运行，不要求Chrome或运营指导。
- 原账号目录与全局旧skill没有自动切换。新版入口是此仓库SKILL.md；全局安装和原账号迁移不属于本轮擅自执行范围。
- 原始账号材料、实际图像、状态、审核和回读回执仅在私有验收目录。公开仓库不包含这些原件。

最终知识目录为 x-algorithm-public-v4，稳定内容hash为51cef794aba149f525719ee8cc7178cbd4f76353bffff185267e4a38d9d8c5c8。真实私有链最终回读为state4/revision139，当前指导已明确替代旧回执，content/guidance/task均ready。原始错误及修订证据保留。完整提交状态见[main CI](https://github.com/litany-lty/x-ops/actions/workflows/ci.yml)；对外完成声明以该提交CI成功为条件。
