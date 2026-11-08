#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build.py — 把 index.html + src/ 全部内联打包为单文件 starfall.html
用法: python tools/build.py
"""
import re
import base64
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "index.html"
OUT = ROOT / "starfall.html"


def inline_scripts(html: str) -> str:
    def repl(m):
        src = m.group(1)
        path = ROOT / src
        code = path.read_text(encoding="utf-8")
        # 防止代码中出现 </script> 提前闭合
        code = code.replace("</script>", "<\\/script>")
        return f"<script>\n/* ===== inlined: {src} ===== */\n{code}\n</script>"

    return re.sub(r'<script src="([^"]+)"></script>', repl, html)


def main():
    html = INDEX.read_text(encoding="utf-8")
    # 图片本地内嵌，双击成品即可离线游玩。原作署名随包保留。
    assets = {
        path.relative_to(ROOT).as_posix(): 'data:image/webp;base64,' + base64.b64encode(path.read_bytes()).decode('ascii')
        for path in sorted((ROOT / 'assets' / 'art').glob('*.webp')) if path.stem != 'dawn'
    }
    if len(assets) != 15:
        raise SystemExit('[build] ERROR: 美术素材不完整；需要 assets/art/ 下的 15 张在用图片')
    embedded = '<script>window.SF = window.SF || {}; SF.embeddedAssets = ' + json.dumps(assets) + ';</script>\n'
    credit = '<!-- Artwork: MillionthVector / CC BY 4.0. Adapted colors, crops, sizes and player hull details. https://millionthvector.blogspot.com/p/free-sprites.html | https://creativecommons.org/licenses/by/4.0/ -->\n'
    credit += '<!-- Frost particles: Kenney Particle Pack / CC0. https://kenney.nl/assets/particle-pack | https://creativecommons.org/publicdomain/zero/1.0/ -->\n'
    html = html.replace('<script src="src/core/utils.js">', credit + embedded + '<script src="src/core/utils.js">', 1)
    # 内联所有 src 脚本
    html = inline_scripts(html)
    # 保留异步素材预加载与错误提示，两个入口使用完全相同的启动路径。
    if "SF.boot(document.getElementById('screen'))" not in html:
        raise SystemExit('[build] ERROR: 缺少游戏启动入口')
    OUT.write_text(html, encoding="utf-8", newline="\n")
    size = OUT.stat().st_size
    print(f"[build] OK -> {OUT.name}  ({size / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
