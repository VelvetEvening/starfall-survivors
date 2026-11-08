/* ============================================================
 * pickups.js — 掉落与拾取（星尘/磁力/治疗/宝箱）
 * 星尘在磁铁范围内加速飞向玩家
 * ============================================================ */
(function () {
  'use strict';
  const SF = (window.SF = window.SF || {});
  const { TAU, dist2, angleTo, rand, chance } = SF.util;

  const list = [];

  function clear() { list.length = 0; }

  function dropDust(x, y, n = 1, value = SF.config.DUST_XP) {
    for (let i = 0; i < n; i++) {
      list.push({
        kind: 'dust', x: x + rand(-5, 5), y: y + rand(-5, 5),
        vx: rand(-20, 20), vy: rand(-20, 20),
        life: 25, t: 0, attract: false, bob: rand(TAU),
        value, // 经验价值（DUST_XP 单位；BOSS/精英星尘单颗更高价值）
      });
    }
  }

  function dropSpecial(x, y, kind) {
    list.push({ kind, x, y, vx: rand(-14, 14), vy: rand(-14, 14), life: 30, t: 0, bob: rand(TAU) });
  }

  function onEnemyKilled(e, game) {
    const xp = e.def.xp || 1;
    // 经验拆成星尘：低经验多颗（视觉节奏），高经验单颗增值——
    // BOSS（200/600）与精英的经验不再被颗数上限截断成和小怪一个量级
    const count = Math.min(SF.config.DUST_CAP_PER_DROP, Math.max(1, Math.round(xp / SF.config.DUST_XP)));
    const value = Math.floor(xp / count), extra = xp % count;
    if (extra > 0) dropDust(e.x, e.y, extra, value + 1);
    if (count > extra) dropDust(e.x, e.y, count - extra, value);
    // 幸运 = 角色特质 + 专精矩阵加成；磁力掉率额外吃专精矩阵 magnetChance
    const luck = (game.player.traits.luck || 1) + (game.player.stats.luck || 0);
    if (chance(SF.config.MAGNET_DROP_CHANCE * luck + (game.player.stats.magnetChance || 0))) dropSpecial(e.x, e.y, 'magnet');
    if (chance(SF.config.HEAL_DROP_CHANCE * luck)) dropSpecial(e.x, e.y, 'heal');
    // 召唤系精英不掉宝箱（BOSS 战奖励集中在 BOSS 本体）
    if (e.def.chest && !e.def.summoned) dropSpecial(e.x, e.y, 'chest');
    if (e.isBoss) {
      // BOSS 奖励加厚：宝箱 ×3 + 大量星尘
      for (const [dx, dy] of [[-12, 0], [12, 0], [0, 12]]) dropSpecial(e.x + dx, e.y + dy, 'chest');
      dropDust(e.x, e.y, 12);
    }
  }

  function magnetAll(game) {
    for (const p of list) if (p.kind === 'dust') p.attract = true;
    SF.particles.ring(game.player.x, game.player.y, { color: 'bolt1', maxR: 200, life: 0.5, width: 2 });
  }

  function update(dt, game) {
    const pl = game.player;
    const R = pl.stats.pickupRadius;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      // 同帧的经验或前一个宝箱可能已打开选卡；把其余宝箱留在场上，避免吞掉选择。
      if (p.kind === 'chest' && game.state !== 'playing') continue;
      p.t += dt;
      p.bob += dt * 4;
      if (p.t >= p.life && p.kind !== 'chest') { list.splice(i, 1); continue; }

      const oldX = p.x, oldY = p.y;
      // 阻尼
      p.vx *= Math.pow(0.9, dt * 60);
      p.vy *= Math.pow(0.9, dt * 60);
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      const d2 = dist2(p.x, p.y, pl.x, pl.y);
      const isDust = p.kind === 'dust';
      if (isDust && (p.attract || d2 < R * R)) {
        // 吸附加速
        const a = angleTo(p.x, p.y, pl.x, pl.y);
        const sp = SF.config.XP_MAGNET_SPEED * (p.attract ? 1.2 : 0.6 + Math.sqrt(d2) / R * 0.8);
        p.x += Math.cos(a) * sp * dt;
        p.y += Math.sin(a) * sp * dt;
      }

      // 拾取判定
      const pr = SF.config.PICKUP_RADII[p.kind];
      const from = pl.pickupFrom || pl;
      const ax = oldX - from.x, ay = oldY - from.y;
      const bx = p.x - pl.x, by = p.y - pl.y;
      const dx = bx - ax, dy = by - ay, length2 = dx * dx + dy * dy;
      const t = length2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length2)) : 0;
      const distance2 = (ax + t * dx) ** 2 + (ay + t * dy) ** 2;
      if (distance2 <= pr * pr) {
        collect(p, game);
        list.splice(i, 1);
      }
    }
  }

  function collect(p, game) {
    const pl = game.player;
    switch (p.kind) {
      case 'dust':
        game.gainXp((p.value || SF.config.DUST_XP) * SF.config.DUST_XP_MUL);
        SF.particles.suck(p.x, p.y, pl.x, pl.y, { color: 'starDust' });
        if (Math.random() < 0.12) SF.audio.sfx.pickup();
        break;
      case 'magnet':
        magnetAll(game);
        SF.audio.sfx.chest();
        break;
      case 'heal':
        pl.heal(SF.config.HEAL_PICKUP_AMOUNT);
        SF.audio.sfx.pickup();
        break;
      case 'chest':
        game.openChest(p.x, p.y);
        break;
    }
  }

  function draw(ctx) {
    const R = SF.renderer;
    const pal = SF.palette;
    for (const p of list) {
      const bobY = p.y + Math.sin(p.bob) * 1.5;
      const fading = p.life - p.t < 3 && p.kind !== 'chest';
      if (fading && Math.floor(p.t * 8) % 2 === 0) continue; // 快消失时闪烁
      switch (p.kind) {
        case 'dust': {
          // 高价值星尘（BOSS/精英掉落）用金色大颗粒，视觉上区分经验量级
          const hi = (p.value || SF.config.DUST_XP) >= 5;
          if (hi) R.glow(p.x,bobY,9,'gold',0.35);
          R.drawSprite(SF.sprites.get('dust'), p.x, bobY, {scale: hi ? 0.95 : 0.6, rot: Math.sin(p.bob)*0.12});
          break;
        }
        case 'magnet':
          R.drawSprite(SF.sprites.glow('magnet', pal.css('bolt1'), 4), p.x, bobY, {});
          break;
        case 'heal':
          R.drawSprite(SF.sprites.glow('heal', pal.css('hero0'), 4), p.x, bobY, {});
          break;
        case 'chest':
          {
          const s=R.toScreen(p.x,bobY);
          const beam=ctx.createLinearGradient(s.x,s.y-25,s.x,s.y);
          beam.addColorStop(0,pal.css('gold',0));beam.addColorStop(1,pal.css('gold',0.2));
          ctx.fillStyle=beam;ctx.fillRect(s.x-2,s.y-25,4,25);
          R.glow(p.x,bobY,20,'gold',0.4);
          R.drawSprite(SF.sprites.glow('chest', pal.css('gold'), 6), p.x, bobY, {});
          R.fillCircle(p.x, bobY + 6 + Math.sin(p.bob * 2) * 1, 1, pal.css('gold'), 0.5);
          break;
          }
      }
    }
  }

  SF.pickups = { clear, dropDust, dropSpecial, onEnemyKilled, magnetAll, update, draw, get list() { return list; } };
})();
