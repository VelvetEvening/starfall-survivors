# v2.0 正式发布记录

2026-11-08 14:59:43（Asia/Shanghai）完成静态游戏发布，15:00:37 完成公网浏览器验收。

## 发布对象

- 正式地址：https://starfalling.site/；兼容入口：https://starfalling.site/starfall.html。
- 玩法版本：v2.0；发布目录：`20261108-v2.0`；Git 发布标签：`v2.0.0`。
- 开发提交：`d5bd586`；正式合入 `main` 的构建提交：`e7ad9fd176995e35b6167273bf6f52312dc0a599`。
- 本次部署当前浏览器单文件游戏，继续使用同域名下的 localStorage 存档。独立 API 未接入该页面，仍运行 `online-v1`、schema 001–004；没有执行生产数据库迁移。
- `server/` 沿用仓库既有忽略规则，后端本地改动不包含在本次前端 Git 发布中。

两个入口均由同一个 `starfall.html` 产物生成，SHA-256：

```text
756abb3b3331828becf0614228c39e46e243b71387c38fd27296517064903a7f
```

## 验证

- 34 个修改过的 JavaScript 语法检查、171 项玩法回归、16 项 v2 集成、27 项角色机制及 18 个压力场景通过。
- 火系 18 项、存档 12 项、流程 6 项、450 秒模拟与双 BOSS 场景通过。
- 通用 / 角色 / 冰系 / v2 浏览器检查分别 20 / 33 / 8 / 54 项通过；4 项音频集成及 9 份合成样例通过。
- 构建、引用检查、平衡审计与 `git diff --check` 通过。
- 从服务器和本机公网分别读取两个 HTTPS 入口，均为 200，响应体 SHA-256 与构建一致。
- 公网浏览器验证 v2.0、三机体、极寒贯星配方和固定 0.2 秒窗口；实际键盘开局、移动、暂停、恢复通过，浏览器错误为 0。测试使用独立浏览器存储。
- 现有 API 健康接口返回 200、`ok: true`；容器状态为 healthy。

公网证据：[production.json](../gui-test-screenshots/v2.0/production.json)；玩法与验收细节：[V2_ACCEPTANCE.md](V2_ACCEPTANCE.md)。

## 服务器产物与回滚

SSH 别名：`jdcloud`；项目目录：`/home/lingling/work/my_game/starfall`。

- 新版本：`releases/20261108-v2.0/`，包含单文件产物、构建提交源码归档、清单、部署脚本、回滚脚本及验证记录。
- 正式页面：`site/index.html`、`site/starfall.html`；两个文件均经同目录临时文件原子替换。
- 旧版备份：`backups/20261108-v2.0/`；备份目录权限 700，页面备份权限 600。
- 当前静态版本标记：`current-static-release.json`；原 API 发布记录独立保留。

旧版页面 SHA-256：

```text
2ffe4be53aa009e94c36b16841c52994cc54081f6a3cd1150f006e30a3feef1e
```

需要回滚静态页面时执行：

```powershell
ssh jdcloud 'sh /home/lingling/work/my_game/starfall/releases/20261108-v2.0/rollback.sh'
```

回滚后重新核对两个入口的响应体哈希。静态文件切换不需要重启 Caddy 或 API；已打开页面的玩家刷新后加载新版本。
