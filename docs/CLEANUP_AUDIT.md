# 代码清理与当前交付验证

日期：2026-09-07。本文保留人物更新前的清理结果、行数与成品哈希，属于历史快照。之后四机体更新已完成，当前成品为 [starfall.html](../starfall.html)，最新行为和验证见 [CHARACTER_UPDATE.md](CHARACTER_UPDATE.md)，后续方向见 [ROADMAP.md](ROADMAP.md)。

## 清理结果

运行源码从 6598 行减少到 6383 行，净减少 **215 行**（含注释与空行）。按作用域检查的未使用局部声明从 19 处降到 0 处；此外逐项核对并清理了未使用的导出接口和状态。

| 范围 | 处理 |
|---|---|
| 字体 | 删除没有调用的 3×5 位图字库、测量与绘制分支；统一保留原有高清系统字体、中文换行与测量 |
| 通用工具 | 删除无调用的距离/角度辅助、随机选择与洗牌、旧随机源切换、颜色混合、深拷贝、事件总线及多余缓动函数 |
| 表现与状态 | 清理未使用的精灵、旧链电音效、绘制接口、敌人计数访问器、两项配置，以及 Game 上未消费的专精点副本 |
| 盾盘 | 删除独立冷却计时器、未消费的命中标记和渲染缓存，复用公共冷却；寻敌复用线性扫描，避免每次攻击复制并排序敌人列表 |
| 电磁炮 | 蓄力倍率统一由 `chargeDuration` 计算，实战和 HUD 共用；伤害函数直接返回数值，删除无人使用的暴击标记包装 |
| 投射物与成长 | 清理未使用参数、重复计算、导弹移除前多余的完成标记，以及没有对应节点的旧专精返还分支 |
| 维护工具 | 解构检查发现问题时返回非零退出码；补充盾击、强化消耗、铁壁震荡与蓄力时长的行为回归 |

角色、武器和专精节点的稳定 ID 保留，存档格式保持原样。霜棱弹内部 ID 仍为 `mirrorWheel`，只有不持久化的强化状态改名为 `frostEmpowered`。没有增加运行时包依赖。

## 数值与文字一致性

- 盾盘实际一直是 **Lv.4 解锁击退**。现在将这一门槛写入升级表：Lv.1–3 为 0，Lv.4 为 42，Lv.5–6 为 60，并把原先错放在 Lv.5 的“解锁”说明改正。
- 盾击强化倍率 1.5 移入武器表；铁壁已有的阈值 12、冷却 1.2 秒、半径 86、基础伤害 28、击退力度 72 移入 `config.ARMOR_SHOCK`。
- 对照清理前备份，全部 **72 个武器等级组合**的有效参数、普通伤害与暴击伤害一致；角色基础属性、被动、敌人、Boss、专精效果与费用一致。
- 铁壁特性说明与 README 补上现有的护盾承伤震荡。它只统计护盾实际吸收的伤害，生命承伤不计入。
- README 和路线图按“霜棱弹、盾盘已实现；焰锋积热、磁暴满仓强化炮待做”更新。旧环绕武器提案不再列为当前计划。
- 素材说明、构建与检查指引统一为 16 张图片，并补上 Kenney CC0 素材与冰弹专项检查。旧美术/机体报告保留历史数据并加上版本说明。

## 验证

| 检查 | 结果 |
|---|---|
| JavaScript 语法 | 39 个文件通过 `node --check` |
| 工具引用 | `node tools/check_destructure.js` 无缺失；作用域引用审查无未使用局部声明 |
| 机制回归 | `node tools/verify_fixes.js`：180 项通过、0 失败，原基线为 158 项 |
| 战斗模拟 | `node tools/smoke_test.js`：450 秒步进及两位 Boss 场景，0 更新异常 |
| 浏览器 | `node tools/visual_smoke.js`：18 项通过、0 错误；108 条武器/被动描述完整，覆盖键鼠、工坊、专精、Boss 狂怒与停滞、重开、存档及离线启动 |
| 冰弹专项 | `node tools/frost_visual_smoke.js`：桌面/小窗口的飞行、冰爆、强化穿透、待发强化共 8 个场景通过，0 错误 |
| 音频 | `node tools/audio_smoke.js`：4 项集成检查、3 段合成样例，0 非有限采样、0 削波、0 错误 |
| 成品一致性 | 33 个内联运行模块和 16 张内嵌图片与当前文件逐项一致，无外部脚本 |

已目视检查主菜单、长升级说明、霜翎特性浮层和小窗口强化冰弹。截图中的固定战斗场景用于验证显示，不代表自然通关；450 秒模拟使用高生命桩，长期平衡仍由真人试玩确认。

## 证据与交付文件

- [数值与成品一致性报告](../gui-test-screenshots/cleanup/scope-bundle-audit.json)
- [浏览器报告](../gui-test-screenshots/feedback-upgrade/audit.json)
- [冰弹报告](../gui-test-screenshots/frost-projectile/audit.json)
- [音频报告](../gui-test-screenshots/feedback-audio/audit.json)
- [主菜单](../gui-test-screenshots/feedback-upgrade/01-menu.png)、[长升级说明](../gui-test-screenshots/feedback-upgrade/07b-long-descriptions-fixture.png)、[角色特性](../gui-test-screenshots/feedback-upgrade/03c-frost-passive.png)、[小窗口强化冰弹](../gui-test-screenshots/frost-projectile/mobile-empowered.png)

当前 `starfall.html` 大小为 **1,305,722 字节**，SHA-256：

```text
5385389cb4d01c37aa32396165f2e02749266d11a91e24ce8d12e4c27867d0be
```

修改前源码、工具、文档与成品备份保存在项目相邻目录 `../.codex-backups/cleanup-20260907-113407/`。本轮没有部署到服务器。
