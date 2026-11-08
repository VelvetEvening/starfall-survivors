/* ============================================================
 * levelup.js — 升级三选一面板
 * 键盘 1–4 或 J 确认选择，鼠标点击；进化宝箱最多四选一
 * ============================================================ */
(function () {
  'use strict';
  const SF = (window.SF = window.SF || {});

  const CARD_W = 120, CARD_H = 126, GAP = 14;

  class LevelUpPanel {
    constructor(game, kind = 'level', choices = null) {
      this.game = game;
      this.kind = kind;
      this.choices = choices || SF.progression.rollChoices(game.player);
      this.sel = 0;
      this.openT = 0;
      this.done = false;
      SF.audio.sfx.levelup();
      SF.particles.ring(game.player.x, game.player.y, { color: 'starDust', maxR: 40, life: 0.5, width: 2 });
    }

    get layout() {
      const n = this.choices.length, R = SF.renderer;
      const cardW = Math.min(CARD_W, (R.width - 32 - (n - 1) * GAP) / n);
      return {
        cardW, x0: (R.width - n * cardW - (n - 1) * GAP) / 2,
        y0: R.height / 2 - CARD_H / 2 - 6,
      };
    }

    update(dt) {
      this.openT += dt;
      const input = SF.input;
      // 鼠标：悬停切换选中，点击直接选卡（几何与 draw 保持一致）
      const m = this.game.mouse;
      if (m && (m.clicked || m.x !== this._mx || m.y !== this._my)) {
        this._mx = m.x; this._my = m.y;
        const n = this.choices.length;
        const { cardW, x0, y0 } = this.layout;
        for (let i = 0; i < n; i++) {
          const x = x0 + i * (cardW + GAP);
          if (m.x > x && m.x < x + cardW && m.y > y0 && m.y < y0 + CARD_H) {
            if (this.sel !== i) this.sel = i;
            if (m.clicked) { this.pick(i); return; }
          }
        }
      }
      if (input.isPressed('slot1')) this.pick(0);
      else if (input.isPressed('slot2')) this.pick(1);
      else if (input.isPressed('slot3')) this.pick(2);
      else if (input.isPressed('slot4')) this.pick(3);
      else if (input.isPressed('confirm')) this.pick(this.sel);
      else {
        if (input.isPressed('left')) { this.sel = (this.sel + this.choices.length - 1) % this.choices.length; SF.audio.sfx.uiTick(); }
        if (input.isPressed('right')) { this.sel = (this.sel + 1) % this.choices.length; SF.audio.sfx.uiTick(); }
      }
    }

    pick(i) {
      if (this.done || i < 0 || i >= this.choices.length) return;
      SF.progression.applyChoice(this.game.player, this.game, this.choices[i]);
      this.done = true;
    }

    draw(ctx) {
      const R = SF.renderer;
      const W = R.width, H = R.height;
      const pal = SF.palette;
      // 暗幕
      ctx.fillStyle = pal.css('bg0', 0.72);
      ctx.fillRect(0, 0, W, H);

      const n = this.choices.length;
      const { cardW, x0, y0 } = this.layout;

      const chest = this.kind === 'chest' || this.kind === 'chest-evolve';
      SF.font.drawText(ctx, this.kind === 'chest-evolve' ? '选择超武进化' : chest ? '宝箱强化' : '星能觉醒', W / 2, y0 - 34, { size: 19, color: 'white', align: 'center', weight: '600' });

      const k = SF.util.ease.outCubic(Math.min(1, this.openT / 0.22));
      for (let i = 0; i < n; i++) {
        const c = this.choices[i];
        const x = x0 + i * (cardW + GAP);
        const y = y0;
        const hovered = this.sel === i;
        const color = c.color === 'hero2' ? 'hero0' : c.color;
        const col = pal.css(color);
        // 卡底
        ctx.save(); ctx.globalAlpha = 0.35 + k * 0.65;
        SF.widgets.panel(ctx, x, y, cardW, CARD_H, { alpha: hovered ? 0.99 : 0.92, line: hovered ? color : 'uiLine' });
        ctx.fillStyle = pal.css(color, hovered ? 0.9 : 0.35); ctx.fillRect(x + 8, y, cardW - 16, 1.2);
        if (hovered) {
          ctx.fillStyle = pal.css('uiAccent', 0.08);
          ctx.fillRect(x + 1, y + 1, cardW - 2, CARD_H - 2);
          ctx.strokeStyle = col;
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, y + 0.5, cardW - 1, CARD_H - 1);
        }
        // 图标
        R.glowScreen(x + cardW/2, y + 34, 28, color, hovered ? 0.4 : 0.2);
        ctx.strokeStyle = pal.css(color, 0.2); ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.arc(x + cardW/2, y + 34, 16, 0, Math.PI*2); ctx.stroke();
        const iconKind = c.kind.startsWith('passive') ? 'passive' : 'weapon';
        const iconId = typeof c.ref === 'string' ? c.ref : c.kind === 'evolve' ? c.ref?.def.evolveTo : c.ref?.def.id;
        SF.sprites.draw(ctx, SF.sprites.icon(iconKind, iconId, c.icon), x + cardW/2, y + 34, 18);
        // 类型标签
        const affinity = SF.progression.affinityFor(c);
        const kindLabel = { weaponNew: '新武器', weaponUp: '武器升级', passiveNew: '进化材料', passiveUp: '材料升级', evolve: '超武进化', dust: '补给' }[c.kind];
        if (affinity.recipe) SF.sprites.draw(ctx, 'evolution_material', x + 11, y + 11, 11);
        SF.font.drawText(ctx, kindLabel, x + (affinity.recipe ? 21 : 8), y + 8, { size: 6.5, color: affinity.recipe ? 'starDust' : color });
        SF.sprites.draw(ctx, 'element_' + affinity.element, x + cardW - 28, y + 11, 12);
        // 标题
        SF.font.drawText(ctx, c.title, x + cardW / 2, y + 56, { size: 10, color: hovered ? 'white' : 'uiText', align: 'center', weight: '600' });
        // 完整描述按长度排版，不截掉进化条件或被动效果。
        const subW = cardW - 16;
        this.drawWrapped(ctx, c.sub, x + cardW / 2, y + 70, subW, 4);
        // 快捷键
        SF.font.drawText(ctx, `${i + 1}`, x + cardW - 8, y + 8, { size: 7, color: 'uiDim', align: 'right' });
        SF.font.drawText(ctx, hovered ? '确认选择  →' : '选择强化', x + cardW/2, y + CARD_H - 13, {size: 7, color: hovered ? color : 'uiDim', align: 'center'});
        ctx.restore();
      }
      const affinity = SF.progression.affinityFor(this.choices[this.sel]);
      const relation = affinity.recipe ? affinity.label + '增益 · ' + affinity.recipe.name + '进化素材' : affinity.label + (affinity.element === 'none' ? '强化' : '武器');
      SF.font.drawText(ctx, relation, W/2, y0 + CARD_H + 10, {size: 7.5, color:'silver', align:'center'});
      const keys = Array.from({ length: n }, (_, i) => i + 1).join(' / ');
      SF.font.drawText(ctx, keys + ' 快捷选择   ·   ←→ 切换 / Enter 确认   ·   鼠标点击', W/2, y0 + CARD_H + 25, {size: 7, color: 'uiDim', align: 'center'});
    }

    drawWrapped(ctx, text, cx, y, maxW, maxLines) {
      if (!text) return;
      this._wrapped = this._wrapped || new Map();
      const key = text + '|' + maxW + '|' + maxLines;
      if (!this._wrapped.has(key)) {
        let size = 8, lines = SF.font.wrapText(ctx, text, maxW, size);
        while (lines.length > maxLines && size > 6.5) {
          size -= 0.25;
          lines = SF.font.wrapText(ctx, text, maxW, size);
        }
        this._wrapped.set(key, { lines, size, leading: Math.min(11, 39 / lines.length) });
      }
      const { lines, size, leading } = this._wrapped.get(key);
      let ly = y;
      for (const ln of lines) {
        SF.font.drawText(ctx, ln, cx, ly, { size, color: 'uiDim', align: 'center' });
        ly += leading;
      }
    }
  }

  SF.LevelUpPanel = LevelUpPanel;
})();
