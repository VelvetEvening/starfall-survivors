# 文档地图

这里区分“当前规范”“验收证据”和“历史快照”。当前规范优先于旧审查报告；可执行数值最终以 src/data/ 为准。

## 当前规范

| 文档 | 内容 | 维护方式 |
|---|---|---|
| [MECHANICS.md](MECHANICS.md) | 当前单机版流程、输入、角色、武器、成长、BOSS、存档和表现机制 | 机制变化时同步更新 |
| [BALANCE_SPEC.md](BALANCE_SPEC.md) | 当前平衡设计、数值锚点、曲线和收益规则 | 数值变化时同步更新；代码表是最终执行源 |
| [QUALITY_GATES.md](QUALITY_GATES.md) | 工程约定、测试命令、构建和线上化前验收门槛 | 测试/构建流程变化时更新 |
| [DEPLOY.md](DEPLOY.md) | 静态成品发布、服务器静态站点与回滚基础操作 | 部署方式变化时更新 |
| [../ONLINE_ROADMAP.md](../ONLINE_ROADMAP.md) | 账号、服务器权威对局、云存档、排行榜和明早启动顺序 | 线上阶段变化时更新 |
| [../server/README.md](../server/README.md) | 本地后端、WebSocket、Docker 与 staging 操作说明 | 后端接口和部署流程变化时更新 |

## 审查证据与历史快照

- [V2_ACCEPTANCE.md](V2_ACCEPTANCE.md)：当前 v2.0 变更、验收入口、测试结果和待试玩评估项。
- [BUGFIX_AUDIT_20260911.md](BUGFIX_AUDIT_20260911.md)：本地与服务器 Bug 修复、死代码清理、测试和远端回滚材料。
- BALANCE_AUDIT.md：v1 历史平衡审查结果与测试证据。
- LOCAL_V1.md：本地 v1.0.0 基线记录。
- CHARACTER_UPDATE.md：四机体统一更新记录。
- CLEANUP_AUDIT.md、FEEDBACK_AUDIT.md、ART_AUDIT.md：对应轮次的清理、反馈和素材审查。
- ROADMAP.md：玩法后续方向；不替代线上部署路线图。

这些文件保留历史上下文，但若与当前规范冲突，应以 MECHANICS.md、BALANCE_SPEC.md、QUALITY_GATES.md 和 src/ 当前实现为准。
