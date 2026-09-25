# 工程验收与改动门槛

## 1. 文件与职责

- src/data/：平衡数值和数据表。
- src/sim/、src/growth/、src/engine/：机制实现。
- src/ui/、src/render/、src/core/audio.js：交互、表现和音频。
- src/core/save.js：唯一持久化出口；线上 ServerLayer 不能绕过该边界。
- tools/build.py：将 index.html、所有 src/ 脚本和 16 张 WebP 打包为 starfall.html。

## 2. 每次源码改动

1. node --check 所有改过的 JS。
2. 新增或使用 SF.util 时运行 node tools/check_destructure.js。
3. 涉及武器、敌人、奖励或数值时运行 node tools/verify_fixes.js。
4. 运行 node tools/smoke_test.js：450 秒步进、双 BOSS、异常数为 0；运行 node tools/game_flow_test.js，覆盖真实 60Hz 的 BOSS1 出场边界和进化宝箱同帧升级队列；运行 node tools/local_v1_test.js，覆盖难度纪录重载及存档事务。
5. 涉及四机体时运行 node tools/character_test.js；涉及护盾时运行 node tools/shield_guard_test.js；涉及火系时运行 node tools/fire_overdrive_test.js。
6. 涉及输入、UI、美术、音频或启动流程时，按条件运行 visual_smoke.js、character_visual_smoke.js、frost_visual_smoke.js、audio_smoke.js，并查看生成截图，不只看脚本退出码。
7. 改源码后运行 py tools/build.py，核对 starfall.html 包含改动、16 张素材和署名；必要时验证 file:// 断网启动。
8. 运行 git diff --check，检查文档、测试报告、源码和成品属于同一版本。

## 3. 线上化前的冻结门槛

- 当前单机版本先完成一次可回滚冻结：提交 ID、版本号、构建 SHA-256、测试结果和资产清单都要记录。
- starfall.html 保留为离线回归基线；线上化不要直接在单文件里实现账号和权威逻辑。
- 线上共享规则必须能在 Node.js 中运行，所有影响结果的随机数和时间来源由服务器控制。
- 新增服务器代码要有认证、权限、重放、幂等、断线重连和版本不匹配测试。
- 线上数据库迁移、备份、恢复、回滚必须至少完成一次演练后，才进入少量朋友试玩。

## 4. 证据文件的阅读顺序

1. 先看 src/ 当前实现与 docs/MECHANICS.md。
2. 数值问题看 src/data/ 与 docs/BALANCE_SPEC.md。
3. 测试结论看最新的 tools/ 输出和对应 gui-test-screenshots/ JSON/截图。
4. *_AUDIT.md、LOCAL_V1.md、CHARACTER_UPDATE.md 是审查快照；若与当前实现不一致，先标记为历史，不直接照抄。
