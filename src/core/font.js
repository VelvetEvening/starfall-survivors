/* ============================================================
 * font.js — 高清系统字体与中文换行。
 * 系统字体由高分辨率 UI 层绘制，不随战斗分辨率降低。
 * ============================================================ */
(function () {
  'use strict';
  const SF = (window.SF = window.SF || {});
  function drawText(ctx, text, x, y, {
    size = 10, color = 'uiText', align = 'left', alpha = 1, weight = '500',
  } = {}) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.fillStyle = SF.palette.css(color);
    ctx.font = `${weight} ${size}px "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif`;
    ctx.textBaseline = 'top';
    if (align === 'center') ctx.textAlign = 'center';
    else if (align === 'right') ctx.textAlign = 'right';
    else ctx.textAlign = 'left';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function measureCn(ctx, text, size = 10, weight = '500') {
    ctx.save();
    ctx.font = `${weight} ${size}px "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif`;
    const width = ctx.measureText(text).width;
    ctx.restore();
    return width;
  }

  // 中文标点随前字、前括号随后字；英文单词与数字尽量完整保留。
  function wrapText(ctx, text, maxWidth, size = 8, weight = '500') {
    if (!text) return [];
    const tokens = [];
    const noStart = /^[，。、；：！？…）》】」』％,.!?;:%)\]]/u;
    const noEnd = /[（《【「『(\[]$/u;
    for (const token of String(text).match(/[A-Za-z0-9]+(?:\.\d+)?%?|[^\r\n]|\n/gu) || []) {
      if (tokens.length && token !== '\n' && tokens[tokens.length - 1] !== '\n' &&
          (noStart.test(token) || noEnd.test(tokens[tokens.length - 1]))) tokens[tokens.length - 1] += token;
      else tokens.push(token);
    }
    const lines = [];
    let line = '';
    ctx.save();
    ctx.font = weight + ' ' + size + 'px "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif';
    for (const token of tokens) {
      if (token === '\n') { lines.push(line.trimEnd()); line = ''; continue; }
      if (line && ctx.measureText(line + token).width > maxWidth) {
        lines.push(line.trimEnd());
        line = '';
      }
      // 极长英文词/URL 的兜底；普通中文与数字不会进入这一分支。
      if (ctx.measureText(token).width > maxWidth) {
        for (const ch of token) {
          if (line && ctx.measureText(line + ch).width > maxWidth) { lines.push(line); line = ''; }
          line += ch;
        }
      } else line += line ? token : token.trimStart();
    }
    if (line) lines.push(line.trimEnd());
    ctx.restore();
    return lines;
  }

  SF.font = { drawText, measureCn, wrapText };
})();
