# 2026-09-11 本地与服务器修复记录

本轮按“先本地游戏、再 jdcloud 后端”的顺序检查并修复可复现问题，同时清理确认没有调用的代码。修复已同步到服务器，2026-09-11 19:58（北京时间）完成切换验证。

## 本地游戏

| 问题与触发条件 | 修复 | 主要文件 |
|---|---|---|
| 固定 60Hz 累加到 BOSS1 出场时，时间为 `240.00000000008313`；旧逻辑误判 BOSS1 已死亡，提前提高小怪血量 | 仅根据真实击杀计数切换血量曲线。普通难度边界倍率由错误的约 21.345 恢复为约 12.539 | `src/engine/game.js` |
| 困难或简单难度取得高分后重新载入，把全难度最高分写进普通难度纪录 | 仅对没有 `bestScores` 的旧档迁移单值纪录，正常存档不跨难度覆盖 | `src/core/save.js` |
| 同帧获得进化宝箱和升级经验，进化面板完成后直接恢复战斗，排队升级要等下一次经验才能弹出 | 进化完成后继续处理已有升级队列，且不错误扣减经验升级次数 | `src/engine/game.js` |

历史普通难度纪录若已被旧逻辑覆盖，存档中没有原始数值，无法自动还原；本次阻止后续重复覆盖。

## 服务器

审查前从运行中的 `starfall-survivors-server:20260909` 提取源代码核对：其源代码、测试、迁移和依赖清单与本地 `server/` 基线一致（忽略换行差异）。

| 问题与影响 | 修复 |
|---|---|
| 同账号的第二条 WebSocket 可直接发输入或结算，绕过已有连接；被拒绝连接的关闭回调可能破坏原连接的持久化状态 | 所有加入、恢复、输入、结算统一检查具体 socket 的占用权。先验证后修改数据库和绑定；关闭及释放只有实际持有连接才能落库。重复加入保持幂等，失败加入不会污染绑定 |
| 同帧拾取多个宝箱会覆盖候选；宝箱期间积累的多级经验没有及时兑现 | 待选期间保留后续宝箱；每次选择后继续兑现经验队列，队列清空前不推进战斗 |
| 灼烧死亡绕过击杀奖励，还可能让已死敌人继续碰撞或攻击；灼烧最后不足一帧仍按整帧扣血 | 灼烧致死走统一死亡收口并立即停止该敌人更新；尾段按剩余持续时间结算。护盾震荡或反击击杀后也停止后续攻击 |
| 无收益环境怪仍增加击杀统计 | `noRewards` 在奖励和击杀统计前统一拦截 |
| BOSS 停滞效果连带锁死玩家移动和瞄准 | 停滞期间仍可移动、瞄准，攻击和蓄力继续暂停 |
| BOSS1 长时间存活会直接刷出 BOSS2；BOSS1 死亡后阶段没有恢复 | 新增 `runSeconds` 波次时钟，BOSS 在场时冻结，`elapsedSeconds` 继续记录战斗时长。BOSS1 死亡后恢复常规出怪，再经过四分钟波次才进入 BOSS2；兼容恢复旧 BOSS 快照 |

主要修改位于 `server/src/ws/connection.js`、`server/src/ws/connection-manager.js`、`server/src/game/simulation.js` 和 `server/src/game/run-service.js`。

## 死代码清理

删除前用 `rg` 检查全库引用，保留仍有运行时调用的实现：

- 删除客户端未被读取的 `Player.facing`、`Player.animT` 及其更新代码。
- 删除客户端未使用的 `randInt`，同步工具解构检查名单。
- 合并进化完成后的重复退出分支。
- 删除后端 `game/data.js` 中未使用的重复角色表 `CHARACTER_RULES`；实际角色表继续由 `game/weapons.js` 提供。
- 删除后端未被调用的 `canEvolve` 导出。

## 验证结果

| 检查 | 结果 |
|---|---|
| 客户端源码与工具语法检查 | 46 个 JS 文件通过 |
| `node tools/check_destructure.js` | 通过 |
| `node tools/verify_fixes.js` | 212 项通过 |
| `node tools/smoke_test.js` | 450 秒步进及双 BOSS 场景，0 异常 |
| `node tools/character_test.js` | 29 项通过，包含 24 个角色压力场景 |
| `node tools/fire_overdrive_test.js` | 18 项通过 |
| `node tools/shield_guard_test.js` | 10 项通过 |
| `node tools/game_flow_test.js`（新增） | 6 项通过，三难度浮点边界及三种升级队列 |
| `node tools/local_v1_test.js` | 11 项通过，新增跨难度纪录反复保存、重载 |
| `py tools/build.py` | 重新生成自包含 `starfall.html` |
| `node tools/visual_smoke.js` | Chromium 中 20 项通过，0 错误；检查升级与结算截图，覆盖断网启动、键鼠操作和保存失败重试 |
| 后端 `npm run check` | 通过 |
| 后端完整测试 | jdcloud 上 Node 24.20.0 隔离容器中 40/40 通过，使用临时数据库、禁用容器网络，不挂载生产数据库 |
| `npm audit --omit=dev --audit-level=high` | 本次查询 0 漏洞 |
| `git diff --check` | 通过 |

新增后端回归位于 `server/tests/ws-ownership.test.js`（3 项）和 `server/tests/simulation-regressions.test.js`（8 项）。已调整 BOSS 流程测试的错误旧预期，以及焰锋热量测试中无关刷怪干扰的测试夹具。

## 服务器同步与回滚材料

- 当前镜像：`starfall-survivors-server:20260911-bugfix1`。
- 镜像 ID：`sha256:a59ea9270b27e642d42e398e6b13bbdcdeae3306e145a2dbdc835fe06ee0baf1`。
- 上一镜像：`starfall-survivors-server:20260909`，保留用于回滚。
- 本次代码、测试与页面：`/home/lingling/work/my_game/starfall/releases/20260911-bugfix1/`。
- 回滚材料：`/home/lingling/work/my_game/starfall/backups/20260911-bugfix1/`，含原环境文件、原两份页面、旧运行代码和 SQLite 快照；数据库备份完整性检查返回 `ok`。环境文件、数据库备份权限均为 `600`，备份目录为 `700`。
- 运行版本标记：远端项目根目录的 `current-release.json`，以及本次 release 内的 `verification.json`；记录全部运行源码哈希和验证结果。

仅更新环境文件的镜像标签并重建 API 容器，原 Caddy 容器继续运行。两个静态入口 `site/index.html`、`site/starfall.html` 已原子替换为修复后的同一单文件。运行中的全部 33 个后端源码文件与 release 逐一核对哈希一致。

在服务器本机通过 HTTPS 和 `--resolve` 绕过公网 DNS 验证：API 健康响应正常，未登录读取 `/api/profile` 返回 401，两个静态入口的响应 SHA-256 均与本地产物一致。生产数据库未执行测试写入或结构迁移。

客户端 `starfall.html` SHA-256：

```text
2ffe4be53aa009e94c36b16841c52994cc54081f6a3cd1150f006e30a3feef1e
```

若需回滚代码与页面，使用上述备份恢复 `.env.production` 和两份静态文件，再执行原生产 Compose 的 `up -d --no-deps api`；正常代码回滚无需恢复数据库，以免丢失发布后的数据。

## 范围与版本说明

- 用户确认当前域名为 `starfalling.site`，正在等待京东云备案。本轮没有更改 DNS、Caddy 域名、证书或备案配置；旧域名 `starfalling.ccwu.cc` 的公网解析失败不列为待修复游戏 Bug，也不代表当前公网入口已验证可用。
- 当前浏览器页面仍使用本地存档；本次没有实现登录界面或把单机客户端改接权威对局。后端仍有与本地版不同的简化机制，本记录不宣称二者玩法完全一致。
- 审查开始时工作区已有未提交改动，`server/` 及部分规范文档尚未被 Git 跟踪。本轮保留原改动，客户端打包包含这些已有改动；未创建提交。基线 HEAD：`78ee0e71c43064274a9b0161385fd5ad86e910f9`，应通过产物与 release 哈希识别实际交付版本。
