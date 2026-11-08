# 服务器发布与更新流程

当前游戏是纯静态网页：战斗、画面、音频和成长都在玩家浏览器运行。第一阶段把成品放到服务器，让朋友通过链接试玩即可；账号、数据库和云存档可在玩法稳定后接入。现有正式站点为 https://starfalling.site/，通过 SSH 别名 jdcloud 管理。Caddy 的静态挂载目录为 /home/lingling/work/my_game/starfall/site，线上同时保留 index.html 与 starfall.html 两个相同入口。每次更新先在 releases/ 保存新产物、在 backups/ 保存旧页面，核对 SHA-256 后用同目录临时文件原子替换；静态更新不需要重建 API 容器。以下首次建站配置仍作为参考，现有站点应沿用现有域名、证书与挂载。

## 1. 准备发布文件

在项目目录执行：

```powershell
node tools/check_destructure.js
node tools/verify_fixes.js
node tools/character_test.js
node tools/fire_overdrive_test.js
node tools/local_v1_test.js
node tools/v2_test.js
node tools/balance_audit.js
node tools/smoke_test.js
py tools/build.py
node tools/visual_smoke.js
node tools/character_visual_smoke.js
node tools/frost_visual_smoke.js
node tools/v2_visual_smoke.js
node tools/audio_smoke.js
Get-FileHash .\starfall.html -Algorithm SHA256
```

构建需要 Python 3.10+，统一写出 LF 以便校验。Windows 可用 `py`；Linux/macOS 通常用 `python3`。浏览器检查需要开发环境的 Playwright 和 Chromium，安装方法见 README。只有修改舰体素材时才需要先运行 `py tools/prepare_assets.py`。

发布物为 **starfall.html 一个文件**，包含全部脚本、15 张在用图片与作者署名。服务器不需要 Node.js、Python、npm 或游戏进程。不要把开发用 `index.html` 单独上传，它依赖源码和素材目录。

本次修改保留 `vega / firefly / thunder / dawn` 等内部存档键。角色改名和换外形不会清空旧工坊、星尘或纪录。

## 2. 选择访问地址

- 使用有公网 IP 的 Linux 服务器，并把域名（例如 `game.example.com`）的 A 记录指向服务器。
- 云安全组与服务器防火墙允许 TCP 80、443；SSH 继续沿用自己的访问设置。
- 首次公开就使用稳定域名和 HTTPS。协议、域名或端口改变会切换浏览器的 localStorage 存储空间。
- 若服务器已有 Nginx/Caddy，增加一个独立站点即可。新建环境可选 Caddy，自动申请和续期 HTTPS 证书。

玩家当前需要电脑键盘与鼠标。小窗口适配已经有了，触屏移动操作尚未实现，因此暂不把手机作为正式支持平台。

## 3. 上传并建立一个版本目录

下面的 `deploy`、`SERVER_IP`、域名和版本号均为示例，需要换成自己的值。

本机 PowerShell：

```powershell
scp .\starfall.html deploy@SERVER_IP:/tmp/starfall-20260907-1.html
```

登录服务器后：

```bash
sudo install -d -m 755 /srv/starfall/releases/20260907-1
sudo install -m 644 /tmp/starfall-20260907-1.html /srv/starfall/releases/20260907-1/index.html
sudo ln -s /srv/starfall/releases/20260907-1 /srv/starfall/current.next
sudo mv -Tf /srv/starfall/current.next /srv/starfall/current
```

这里把单文件成品放成网站首页 `index.html`，让玩家只需访问域名根地址。`current` 是指向版本目录的符号链接。上述步骤面向首次采用这个目录布局的站点；已有目录布局可沿用现有配置。

## 4. 配置静态站点与 HTTPS

如果采用 Caddy，把以下站点块加入它的配置（通常为 `/etc/caddy/Caddyfile`），保留已有站点：

```caddyfile
game.example.com {
    root * /srv/starfall/current
    encode zstd gzip
    header Cache-Control "no-cache"
    file_server
}
```

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
curl -I https://game.example.com/
```

Caddy 需要先按所用 Linux 发行版安装。DNS 生效且 80/443 可达后，它会处理证书。`no-cache` 允许浏览器缓存，但每次访问会验证版本，避免老玩家一直打开旧成品。

如果沿用 Nginx，在已有 HTTPS 站点中配置静态目录即可；证书继续用服务器现有的管理方式：

```nginx
root /srv/starfall/current;
index index.html;

location / {
    try_files $uri $uri/ =404;
    add_header Cache-Control "no-cache" always;
}
```

再执行 `sudo nginx -t` 并 reload。无需反向代理游戏服务，也无需开放 8080 开发端口给公网。

## 5. 发布后验收

用另一台电脑或手机热点网络打开正式地址：

1. 主菜单、三架机体都显示正常；点击后音乐能播放，M 静音有效。
2. 用霜翎触发一次防反，能听到首击冰裂；进入专精矩阵后战斗暂停，返回后继续。
3. 完成一局或购买一次工坊强化，刷新后星尘、升级和纪录保留。
4. HTTPS 正常，控制台没有脚本、素材或音频错误；页面请求不依赖第三方 CDN。
5. 试玩链接始终保持同一域名、协议和端口。

本地的 `file://` 存档不会自动搬到线上域名；不同电脑或浏览器之间目前也不同步。

## 6. 更新与回滚

每次发布新建一个版本目录，例如 `20260910-1`，上传并验收该目录中的成品后，切换 `current`：

```bash
sudo ln -s /srv/starfall/releases/20260910-1 /srv/starfall/current.next
sudo mv -Tf /srv/starfall/current.next /srv/starfall/current
```

切换发生在同一文件系统内，网页不会读到上传一半的文件；已有玩家的当前对局继续运行旧版本，刷新才载入新版本。静态文件切换无需重启游戏进程。

需要回滚时，把 `current.next` 指向上一版本，再执行同样的 `mv -Tf`。保留前两个版本、构建日期和 SHA-256；不要在每次发版时删除浏览器存档或改动存档键。

## 7. 玩法稳定后接入账号与云存档

`src/core/save.js` 已把本地持久化集中起来，是接入云存档的入口，但接入服务器并不只是换一个 URL：

- 新增账号登录与后端 API，用户身份由会话决定，不信任前端传来的任意 uid。
- 设计 `GET /api/profile`、`PUT /api/profile`，为存档增加版本号、冲突处理和本地到云端的一次性迁移。
- 初期仍保留离线游玩和本地存档，网络失败不应丢失一局收益。
- 排行榜要单独设计可信结算；浏览器上报的分数和货币本身不能充当服务端权威数据。
- 小规模可先使用轻量 API + SQLite；并发写入与运营需求增长后再评估其它数据库。

本地首版已纳入 Git 基线，并增加存档失败提示和结算重试；写入成功后才提交缓存，写入串行处理。结算快照只保留在当前页面，关闭或刷新后不保证恢复。后续优先补存档导入/导出，云账号另行设计幂等结算与冲突处理。见 [本地首版记录](LOCAL_V1.md)。

## 素材与许可

舰体、空间站和行星来自 **MillionthVector — Free Sprites**，使用 **CC BY 4.0**。四架机体额外做了配色、轮廓和装甲改装；具体来源与修改说明见 `assets/CREDITS.md` 和 `assets/source/manifest.json`。单文件中的署名、作者来源与授权信息应随发布保留。

霜棱弹的两张新增贴图适配自 **Kenney Particle Pack（CC0）**，来源记录在 `assets/source/frost-manifest.json` 与 `assets/CREDITS.md`。当前单文件嵌入 15 张 WebP，发布前同时运行通用浏览器检查和 `node tools/frost_visual_smoke.js`。
