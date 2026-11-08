/* ============================================================
 * projectiles.js — 投射物池（玩家/敌方共用）
 * 玩家投射物：blade 飞刃 / frostShard 冰弹 / orb 冰环波 / missile 导弹 / railgun 电磁弹。
 * 敌方弹幕、预警与冰火领域分别管理；瞬时光束由武器与 BOSS 模块结算。
 * ============================================================ */
(function () {
  'use strict';
  const SF = (window.SF = window.SF || {});
  const { TAU, dist2, angleTo, rand } = SF.util;

  const list = [];       // 玩家投射物
  const enemyList = [];  // 敌方弹幕
  const telegraphs = []; // 落点预警（导弹）
  const iceFields = [];  // 霜翎受击反制冰域
  const frostBursts = []; // 瞬时冰爆的纯表现，不追加持续伤害

  function clear() {
    list.length = 0; enemyList.length = 0; telegraphs.length = 0; iceFields.length = 0;
    fireFields.length = 0; // 火烧地带同样入池清理，防跨局残留
    frostBursts.length = 0;
  }

  // ---------- 玩家投射物 ----------
  function spawnBlade(x, y, angle, spec) {
    list.push({
      kind: 'blade', x, y,
      vx: Math.cos(angle) * spec.speed, vy: Math.sin(angle) * spec.speed,
      dmg: spec.damage, pierce: spec.pierce || 0, blast: spec.blast || 0,
      burn: spec.burn || 0, burnDuration: spec.burnDuration || SF.config.FIRE_BASE_BURN_DURATION,
      burnStacking: !!spec.burnStacking, burnIndicator: !!spec.burnIndicator, hitSet: new Set(), life: 2.2, t: 0, rot: angle,
      fireAttack: spec.fireAttack,
    });
  }

  function spawnFrostShard(x, y, angle, spec) {
    list.push({
      kind: 'frostShard', x, y,
      vx: Math.cos(angle) * spec.speed, vy: Math.sin(angle) * spec.speed,
      angle, radius: spec.radius, dmg: spec.damage, blast: spec.blast, slow: spec.slow, freeze: spec.freeze,
      empowered: !!spec.empowered, hitSet: new Set(), blastHits: new Map(), life: spec.life, t: 0, trailT: 0,
      lance: !!spec.frostPierce, piercing: !!spec.frostPierce || !!spec.empowered,
      maxHits: spec.empowered ? SF.config.FIREFLY_FROST_MAX_HITS : (spec.frostMaxHits || 1),
    });
  }

  function spawnOrbWave(x, y, spec) {
    list.push({
      kind: 'orb', x, y,
      radius: 0, maxRadius: spec.radius, speed: spec.radius / 0.4,
      dmg: spec.damage, slow: spec.slow, freeze: spec.freeze,
      hitSet: new Set(), life: 0.45, t: 0,
    });
  }

  function spawnMissile(x, y, tx, ty, spec) {
    telegraphs.push({ x: tx, y: ty, r: spec.blast, t: 0, dur: spec.delay, kind: 'missile' });
    list.push({
      kind: 'missile', x, y, sx: x, sy: y, tx, ty,
      delay: spec.delay, blast: spec.blast, dmg: spec.damage,
      burn: spec.burn || 0, burnDuration: spec.burnDuration || SF.config.FIRE_BASE_BURN_DURATION,
      burnStacking: !!spec.burnStacking,
      burnIndicator: !!spec.burnIndicator,
      fireField: spec.fireField || 0, life: spec.delay + 0.1, t: 0, trailT: 0,
      fireAttack: spec.fireAttack,
    });
  }

  // ---------- 超电磁炮弹（蓝色巨型穿甲弹，直线穿透） ----------
  function spawnRailgun(x, y, angle, spec) {
    list.push({
      kind: 'railgun', x, y, angle,
      vx: Math.cos(angle) * spec.speed, vy: Math.sin(angle) * spec.speed,
      dmg: spec.damage, radius: spec.radius || 10,
      empowered: !!spec.empowered,
      hitSet: new Set(), life: 1.6, t: 0, trailT: 0,
    });
  }

  // ---------- 敌方弹幕 ----------
  // colorKey='elite' 金色警示弹（更快更疼，来源精英/BOSS）
  // colorKey='darkRed' 深暗红弹（最高危：BOSS2 高伤弹幕/被强化的精英弹）
  // 命中半径与视觉半径一致（普通 2.5 / 精英 3.5 / 深暗红 4.2），外加玩家碰撞的宽容系数
  function spawnEnemyBullet(x, y, angle, speed, dmg, colorKey, owner = null) {
    enemyList.push({
      x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      dmg, life: 6, t: 0,
      r: colorKey === 'darkRed' ? 4.2 : colorKey === 'elite' ? 3.5 : 2.5,
      elite: colorKey === 'elite' || colorKey === 'darkRed',
      dark: colorKey === 'darkRed',
      owner,
    });
  }

  // 弹幕命中结算：难度 + 小怪成长系数统一收口（与接触伤害同管线，防止后期弹幕变 1 伤）
  function bulletHitPlayer(b, game) {
    const dmul = (game.difficulty || SF.config.DIFFICULTIES.normal).dmgMul;
    const fromEliteOrBoss = b.elite;
    const mobBoost = fromEliteOrBoss ? 1 : (game.mobDamageBoost || 1);
    game.player.takeDamage(b.dmg * dmul * mobBoost, {
      type: 'bullet', owner: b.owner,
      attacker: b.owner && typeof b.owner.x === 'number' ? b.owner : null,
      x: b.x, y: b.y, game,
    });
  }

  // ---------- 更新 ----------
  function update(dt, game) {
    const enemies = game.enemies;
    for (let i = frostBursts.length - 1; i >= 0; i--) {
      frostBursts[i].t += dt;
      if (frostBursts[i].t >= frostBursts[i].life) frostBursts.splice(i, 1);
    }

    // 玩家投射物
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.t += dt;
      if (p.t >= p.life) { list.splice(i, 1); continue; }

      if (p.kind === 'blade') {
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.rot += dt * 18;
        const consumed = hitEnemies(enemies, p.x, p.y, 4, (e) => {
          const meta = { fireAttack: p.fireAttack };
          if (p.blast > 0) explode(p.x, p.y, p.blast, p.dmg, p.burn, game, 'fire0', p.burnDuration,
            { stack: p.burnStacking, indicator: p.burnIndicator, attack: p.fireAttack }, meta);
          else damageEnemy(e, p.dmg, game, 'fire0', meta);
          if (p.pierce > 0) { p.pierce--; return false; }
          return true;
        }, p.hitSet);
        if (consumed) list.splice(i, 1);
      } else if (p.kind === 'frostShard') {
        if (updateFrostShard(p, dt, game)) list.splice(i, 1);
      } else if (p.kind === 'orb') {
        p.radius += p.speed * dt;
        hitEnemies(enemies, p.x, p.y, p.radius, (e) => {
          damageEnemy(e, p.dmg, game, 'ice0');
          applySlow(e, p.slow, p.freeze);
          return false;
        }, p.hitSet, true);
      } else if (p.kind === 'missile') {
        // 导弹在预警时间内从玩家位置飞向固定落点，爆炸位置必须与预警圈一致。
        const flight = Math.max(0.001, p.delay);
        const k = Math.min(1, p.t / flight);
        p.x = p.sx + (p.tx - p.sx) * k;
        p.y = p.sy + (p.ty - p.sy) * k;
        // 飞行拖尾
        p.trailT -= dt;
        if (p.trailT <= 0) {
          p.trailT = 0.03;
          SF.particles.trail(p.x, p.y, { color: 'fire1', life: 0.3, size: 2 });
        }
        if (p.t >= p.delay) {
          explode(p.x, p.y, p.blast, p.dmg, p.burn, game, 'fire1', p.burnDuration,
            { stack: p.burnStacking, indicator: p.burnIndicator, attack: p.fireAttack }, { fireAttack: p.fireAttack });
          if (p.fireField) addFireField(p.x, p.y, p.blast * 0.8, p.fireField);
          list.splice(i, 1);
        }
      } else if (p.kind === 'railgun') {
        // 超电磁炮：直线穿透（不消失，命中过的敌人不重复结算）
        const contacts = sweptContacts(p, dt, enemies.list);
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.trailT -= dt;
        if (p.trailT <= 0) {
          p.trailT = 0.02;
          const pa = p.angle + Math.PI;
          SF.particles.trail(p.x + Math.cos(pa) * p.radius, p.y + Math.sin(pa) * p.radius,
            { color: p.empowered ? 'bolt2' : 'bolt0', life: p.empowered ? 0.38 : 0.3, size: p.empowered ? 4 : 3 });
        }
        let hitAny = false, feedback = 0;
        for (const { e } of contacts) {
          if (e.dead) continue;
          const dealt = damageEnemy(e, p.dmg, game, 'bolt0');
          p.hitSet.add(e.uid);
          hitAny = true;
          SF.particles.spark(e.x, e.y, rand(TAU), { color: 'bolt2', count: 4, speed: 90 });
          if (feedback++ < 8) SF.particles.discharge(e.x, e.y, { radius: Math.min(16, e.radius + 6) });
        }
        // 命中反馈音：一帧多命中只播一次，避免穿透敌群时爆音
        if (hitAny) SF.audio.sfx.railHit();
      }
    }

    // 敌方弹幕
    for (let i = enemyList.length - 1; i >= 0; i--) {
      const b = enemyList[i];
      b.t += dt;
      if (b.t >= b.life) { enemyList.splice(i, 1); continue; }
      b.x += b.vx * dt; b.y += b.vy * dt;
      const pl = game.player;
      // 命中判定 = 弹体视觉半径 + 玩家半径的宽容折算（不再用固定 6px 的「隐形大弹」）
      const rr = b.r + pl.radius * 0.6;
      if (dist2(b.x, b.y, pl.x, pl.y) < rr * rr) {
        bulletHitPlayer(b, game);
        SF.particles.spark(b.x, b.y, angleTo(b.x, b.y, pl.x, pl.y), { color: b.elite ? 'elite' : 'fire0' });
        enemyList.splice(i, 1);
      }
    }

    // 霜翎受击反制冰域：普通域通常只覆盖受击瞬间，超武域在 3 秒节点再次叠冰蚀。
    for (let i = iceFields.length - 1; i >= 0; i--) {
      const f = iceFields[i];
      f.t += dt;
      f.tick -= dt;
      if (f.t >= f.life) { iceFields.splice(i, 1); continue; }
      if (f.tick <= 0 && f.t > 0.1) {
        f.tick += SF.config.FIREFLY_ICE_RETALIATE_TICK;
        for (const e of game.enemies.list) {
          if (e.dead) continue;
          const rr = f.radius + e.radius;
          if (dist2(f.x, f.y, e.x, e.y) < rr * rr) {
            if (e.addIceStack(game)) {
              SF.particles.spark(e.x, e.y, rand(TAU), { color: 'ice2', count: 3, speed: 35, life: 0.25, size: 1.3 });
            }
          }
        }
      }
    }

    // 预警圈
    for (let i = telegraphs.length - 1; i >= 0; i--) {
      const tg = telegraphs[i];
      tg.t += dt;
      if (tg.t >= tg.dur) telegraphs.splice(i, 1);
    }
  }

  function hitEnemies(enemies, x, y, radius, onHit, hitSet, ringMode = false) {
    for (const e of enemies.list) {
      if (e.dead) continue;
      const key = e.uid;
      if (hitSet && hitSet.has(key)) continue;
      const d2 = dist2(x, y, e.x, e.y);
      const er = e.radius;
      if (ringMode ? Math.abs(Math.sqrt(d2) - radius) < er + 5 : d2 < (radius + er) * (radius + er)) {
        const consumed = onHit(e);
        if (hitSet) hitSet.add(key);
        if (consumed) return true;
      }
    }
  }

  // ---------- 爆炸 / 领域 ----------
  function explode(x, y, radius, dmg, burn, game, colorKey, burnDuration = SF.config.FIRE_BASE_BURN_DURATION, burnOptions = {}, meta = {}) {
    SF.particles.burst(x, y, { color: colorKey, count: 12, speed: 90, life: 0.4, size: 2.5 });
    SF.particles.ring(x, y, { color: colorKey, maxR: radius, life: 0.3 });
    SF.particles.flash(x, y, { color: colorKey, size: 6, life: 0.12 });
    SF.renderer.addShake(SF.config.SCREEN_SHAKE_BOOM * 0.5, 0.15);
    for (const e of game.enemies.list) {
      if (e.dead) continue;
      const d2 = dist2(x, y, e.x, e.y);
      const rr = radius + e.radius;
      if (d2 < rr * rr) {
        damageEnemy(e, dmg, game, colorKey, meta);
        if (burn) e.applyBurn(
          burn * (game.player.stats.resonance.fire ? SF.config.BURN_RESONANCE_MUL : 1),
          burnDuration,
          burnOptions,
        );
      }
    }
    SF.audio.sfx.explosion();
  }

  // 按圆形碰撞体扫过的线段排序接触点，避免高速弹跳过近敌或命中顺序受数组影响。
  function sweptContacts(p, dt, enemies) {
    const sx = p.x, sy = p.y, dx = p.vx * dt, dy = p.vy * dt;
    const len2 = dx * dx + dy * dy;
    const contacts = [];
    for (const e of enemies) {
      if (e.dead || p.hitSet.has(e.uid)) continue;
      const ox = sx - e.x, oy = sy - e.y;
      const c = ox * ox + oy * oy - (e.radius + p.radius) ** 2;
      let entry = 0;
      if (c > 0) {
        if (len2 === 0) continue;
        const b = ox * dx + oy * dy;
        const discriminant = b * b - len2 * c;
        if (discriminant < 0) continue;
        entry = (-b - Math.sqrt(discriminant)) / len2;
        if (entry < 0 || entry > 1) continue;
      }
      contacts.push({ e, entry });
    }
    contacts.sort((a, b) => a.entry - b.entry || a.e.uid - b.e.uid);
    return contacts;
  }

  function updateFrostShard(p, dt, game) {
    const sx = p.x, sy = p.y, dx = p.vx * dt, dy = p.vy * dt;
    const contacts = sweptContacts(p, dt, game.enemies.list);
    for (const { e, entry } of contacts) {
      if (e.dead) continue;
      p.hitSet.add(e.uid);
      explodeIce(sx + dx * entry, sy + dy * entry, p, game);
      if (!p.piercing) return true;
    }
    p.x = sx + dx; p.y = sy + dy;
    p.trailT -= dt;
    if (p.trailT <= 0) {
      p.trailT = 0.045;
      SF.particles.trail(p.x, p.y, { color: p.empowered ? 'ice2' : 'ice0', life: 0.18, size: p.empowered ? 2 : 1 });
    }
    return false;
  }

  function explodeIce(x, y, p, game) {
    const radius = p.blast;
    for (const e of game.enemies.list) {
      if (e.dead || dist2(x, y, e.x, e.y) > (radius + e.radius) ** 2) continue;
      // 接触仍逐敌冰爆，但每个目标共享整发弹体的伤害预算，不能借密集小怪无限叠伤。
      const hits = p.blastHits.get(e.uid) || 0;
      if (hits >= p.maxHits) continue;
      p.blastHits.set(e.uid, hits + 1);
      damageEnemy(e, p.dmg, game, 'ice0', { element: 'ice' });
      applySlow(e, p.slow, p.freeze);
    }
    if (frostBursts.length >= 80) frostBursts.shift();
    frostBursts.push({ x, y, radius, t: 0, life: 0.28, angle: rand(TAU), empowered: p.empowered, lance: p.lance });
    SF.particles.ring(x, y, { color: 'ice1', maxR: radius, life: 0.24, width: 1 });
    SF.particles.burst(x, y, { color: 'ice2', count: 5, speed: 65, life: 0.24, size: 1.2 });
  }

  // 火烧地带：2 秒短窗口，视觉同时按剩余时间二次淡出，降低长时间屏幕噪声。
  const fireFields = [];
  function addFireField(x, y, radius, dps) {
    fireFields.push({ x, y, radius, dps, life: 2, t: 0, tick: 0 });
  }

  function spawnIceRetaliationField(x, y, spec, game) {
    const f = {
      x, y, radius: spec.radius, damage: spec.damage, slow: spec.slow, freeze: spec.freeze,
      life: spec.life, primaryUid: spec.primaryUid, t: 0,
      tick: SF.config.FIREFLY_ICE_RETALIATE_TICK,
    };
    iceFields.push(f);
    SF.particles.flash(x, y, { color: 'ice0', size: 12, life: 0.12 });
    SF.particles.burst(x, y, { color: 'ice1', count: 14, speed: 90, life: 0.45, size: 2.2 });
    SF.particles.ring(x, y, { color: 'ice2', maxR: f.radius, life: 0.55, width: 2.6 });
    SF.particles.ring(x, y, { color: 'ice1', maxR: f.radius * 0.72, life: 0.38, width: 1.2 });
    let hit = false;
    for (const e of game.enemies.list) {
      if (e.dead) continue;
      const rr = f.radius + e.radius;
      if (dist2(f.x, f.y, e.x, e.y) < rr * rr) {
        const mul = e.uid === f.primaryUid ? SF.config.FIREFLY_ICE_RETALIATE_CENTER_MUL : 1;
        const dealt = damageEnemy(e, f.damage * mul, game, 'ice0', { element: 'ice', retaliation: true });
        applySlow(e, f.slow, f.freeze);
        SF.particles.spark(e.x, e.y, rand(TAU), { color: 'ice2', count: 5, speed: 65, life: 0.3, size: 1.7 });
        if (dealt > 0) {
          hit = true;
        }
      }
    }
    if (hit) SF.audio.sfx.iceRetaliate();
  }
  function updateFields(dt, game) {
    for (let i = fireFields.length - 1; i >= 0; i--) {
      const f = fireFields[i];
      f.t += dt; f.tick -= dt;
      if (f.t >= f.life) { fireFields.splice(i, 1); continue; }
      if (f.tick <= 0) {
        f.tick = 0.25;
        for (const e of game.enemies.list) {
          if (e.dead) continue;
          const rr = f.radius + e.radius;
          if (dist2(f.x, f.y, e.x, e.y) < rr * rr) damageEnemy(e, f.dps * 0.25, game, 'fire1');
        }
      }
      // 视觉火星
      if (Math.random() < 0.12) {
        const a = Math.random() * TAU, r = Math.random() * f.radius;
        SF.particles.trail(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r, { color: 'fire1', life: 0.35, size: 1.6 });
      }
    }
  }

  // ---------- 伤害与状态 ----------
  function damageEnemy(e, dmg, game, colorKey, meta = {}) {
    return e.takeDamage(dmg, game, colorKey, meta);
  }

  function applySlow(e, slowFactor, freeze) {
    e.applySlow(slowFactor, freeze);
  }

  // ---------- 绘制 ----------
  function draw(ctx) {
    const R = SF.renderer;
    const pal = SF.palette;

    // 预警圈
    for (const tg of telegraphs) {
      const k = tg.t / tg.dur;
      // 友方导弹落区用琥珀色；敌方激光预警保留红色。
      R.fillCircle(tg.x, tg.y, tg.r, pal.css('amber'), 0.025);
      R.strokeCircle(tg.x, tg.y, tg.r, pal.css('amber'), 0.6, 0.32);
      R.strokeCircle(tg.x, tg.y, tg.r * k, pal.css('fire2'), 0.7, 0.55);
    }

    for (const p of list) {
      if (p.kind === 'blade') {
        R.drawSprite(SF.sprites.glow('blade', pal.css('fire1'), 4), p.x, p.y, { rot: p.rot });
      } else if (p.kind === 'frostShard') {
        R.drawSprite(SF.sprites.glow(p.lance ? 'frostLance' : 'frostShard', pal.css(p.empowered ? 'ice2' : 'ice0'), p.empowered ? 3 : 1),
          p.x, p.y, { rot: p.angle + Math.PI / 2 });
        if (p.lance) {
          const s = R.toScreen(p.x, p.y);
          ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(p.angle);
          // 笔直的碎晶尾迹区别于电系跳动电弧；只作飞行方向提示。
          for (let i=0;i<3;i++) {
            ctx.strokeStyle=pal.css('ice1',0.5-i*0.12); ctx.lineWidth=1-i*0.2;
            ctx.beginPath();ctx.moveTo(-13-i*10,-2+i*2);ctx.lineTo(-21-i*10,-2+i*2);ctx.stroke();
          }
          ctx.restore();
        }
        if (p.empowered) {
          const s = R.toScreen(p.x, p.y);
          ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(p.angle);
          ctx.strokeStyle = pal.css('ice2', 0.85); ctx.lineWidth = 0.7;
          ctx.beginPath(); ctx.moveTo(-14, -3); ctx.lineTo(-5, -3);
          ctx.moveTo(-14, 3); ctx.lineTo(-5, 3); ctx.stroke(); ctx.restore();
        }
      } else if (p.kind === 'orb') {
        const fade = Math.max(0, 1 - p.t / p.life);
        R.fillCircle(p.x, p.y, p.radius, pal.css('ice0'), 0.035 * fade);
        R.strokeCircle(p.x, p.y, p.radius, pal.css('ice0'), 4, 0.1 * fade);
        R.strokeCircle(p.x, p.y, p.radius, pal.css('ice2'), 0.7, 0.7 * fade);
        R.strokeCircle(p.x, p.y, Math.max(1, p.radius - 4), pal.css('ice1'), 0.45, 0.45 * fade);
        const s = R.toScreen(p.x, p.y);
        ctx.save(); ctx.strokeStyle = pal.css('ice2', fade * 0.65); ctx.lineWidth = 0.7;
        for (let i=0;i<12;i++) {
          const a=i*TAU/12, ca=Math.cos(a), sa=Math.sin(a);
          ctx.beginPath();ctx.moveTo(s.x+ca*(p.radius-2),s.y+sa*(p.radius-2));
          ctx.lineTo(s.x+ca*(p.radius+2),s.y+sa*(p.radius+2));ctx.stroke();
        }
        ctx.restore();
      } else if (p.kind === 'missile') {
        R.drawSprite(SF.sprites.glow('missile', pal.css('fire1'), 3), p.x, p.y, {rot: Math.atan2(p.ty-p.y,p.tx-p.x)+Math.PI/2});
      } else if (p.kind === 'railgun') {
        const s = R.toScreen(p.x, p.y), r = p.radius;
        R.glow(p.x,p.y,r*2.6,'bolt0',0.42);
        ctx.save();ctx.translate(s.x,s.y);ctx.rotate(p.angle);
        // 电浆弹芯保持在碰撞圆内；后方断续电弧仅是消散尾迹。
        ctx.fillStyle=pal.css('bolt0',0.3);ctx.beginPath();ctx.ellipse(0,0,r,r*0.82,0,0,TAU);ctx.fill();
        ctx.fillStyle=pal.css('bolt2',0.9);
        ctx.beginPath();ctx.moveTo(r,0);ctx.lineTo(-r*0.55,-r*0.3);
        ctx.lineTo(-r*0.25,0);ctx.lineTo(-r*0.55,r*0.3);ctx.closePath();ctx.fill();
        for(const side of [-1,1]) {
          R.electricArc(ctx,-r*0.65,side*r*0.65,r,0,
            {time:p.t,amplitude:r*0.2,width:p.empowered?1.2:0.9,seed:side+5});
          R.electricArc(ctx,-r*3,side*r*0.3,-r*0.35,side*r*0.2,
            {time:p.t,amplitude:r*0.25,width:0.7,alpha:0.6,seed:side+13});
        }
        ctx.restore();
      }
    }

    for (const f of frostBursts) {
      const k = f.t / f.life;
      const diameter = f.radius * 2 * (0.4 + 0.6 * Math.min(1, k * 3));
      R.drawSprite(SF.sprites.get('frostBurst'), f.x, f.y, {
        scale: diameter / 32, rot: f.angle, alpha: (1 - k) * (f.empowered ? 0.8 : 0.6),
      });
      if (f.lance) {
        const s=R.toScreen(f.x,f.y), reach=f.radius*(R.reducedMotion?0.6:0.3+0.55*k);
        ctx.save();ctx.translate(s.x,s.y);ctx.rotate(f.angle);
        ctx.fillStyle=pal.css('ice2',(1-k)*0.65);
        for(let i=0;i<3;i++) {
          ctx.rotate(TAU/3);ctx.beginPath();ctx.moveTo(reach-7,-2);
          ctx.lineTo(reach+3,0);ctx.lineTo(reach-7,2);ctx.lineTo(reach-4,0);ctx.closePath();ctx.fill();
        }
        ctx.restore();
      }
    }
    // 火烧地带
    for (const f of fireFields) {
      const k = 1 - f.t / f.life;
      R.fillCircle(f.x, f.y, f.radius, pal.css('fire0'), 0.055 * k * k);
      R.strokeCircle(f.x, f.y, f.radius, pal.css('fire1'), 0.8, 0.2 * k * k);
    }
    // 霜翎反制冰域：边界淡出，避免与常规冰环争夺画面。
    for (const f of iceFields) {
      const k = 1 - f.t / f.life;
      R.fillCircle(f.x, f.y, f.radius, pal.css('ice0'), 0.06 * k);
      R.strokeCircle(f.x, f.y, f.radius, pal.css('ice2'), 1.5, 0.62 * k);
      R.strokeCircle(f.x, f.y, Math.max(1, f.radius - 4), pal.css('ice1'), 0.7, 0.38 * k);
      // 冰域建立时的一次性裂纹和碎晶；纯表现，不追加命中或控制。
      if (f.t < 0.55) {
        const s = R.toScreen(f.x, f.y), t = f.t / 0.55;
        const reach = f.radius * (R.reducedMotion ? 0.8 : 0.35 + 0.65 * (1 - (1 - t) ** 3));
        ctx.save(); ctx.translate(s.x, s.y);
        ctx.strokeStyle = pal.css('ice2', (1 - t) * 0.85); ctx.lineWidth = 1.1;
        for (let i = 0; i < 6; i++) {
          ctx.save(); ctx.rotate(i * TAU / 6);
          ctx.beginPath(); ctx.moveTo(3, 0); ctx.lineTo(reach * 0.4, -2);
          ctx.lineTo(reach * 0.68, 2); ctx.lineTo(reach, 0);
          ctx.moveTo(reach * 0.4, -2); ctx.lineTo(reach * 0.56, -reach * 0.14); ctx.stroke();
          ctx.fillStyle = pal.css('white', (1 - t) * 0.8);
          ctx.beginPath(); ctx.moveTo(reach * 0.8, 0); ctx.lineTo(reach * 0.88, -2);
          ctx.lineTo(reach, 0); ctx.lineTo(reach * 0.88, 2); ctx.closePath(); ctx.fill(); ctx.restore();
        }
        ctx.restore();
      }
    }
  }

  // 危险弹幕最后绘制，始终在爆炸、冰环与卫星上方；实心边界 = 原碰撞半径。
  function drawEnemyBullets(ctx) {
    const R=SF.renderer,pal=SF.palette;
    ctx.save();
    // 光晕集中混合一次，随后画全部实心弹体，密集交叠时轮廓仍清楚。
    ctx.globalCompositeOperation='lighter';ctx.globalAlpha=0.48;
    for(const b of enemyList) {
      const s=R.toScreen(b.x,b.y),radius=b.r*2.6;
      if(s.x < -12 || s.x > R.width+12 || s.y < -12 || s.y > R.height+12) continue;
      ctx.drawImage(R.glowTexture(b.dark?'fire0':b.elite?'elite':'fire0'),s.x-radius,s.y-radius,radius*2,radius*2);
    }
    ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
    for(const b of enemyList) {
      const s=R.toScreen(b.x,b.y),r=b.r;
      if(s.x < -12 || s.x > R.width+12 || s.y < -12 || s.y > R.height+12) continue;
      const color=b.dark?'darkRed':b.elite?'elite':'fire0';
      ctx.fillStyle=pal.css(color);ctx.strokeStyle=pal.css(b.dark?'fire0':'bg0');ctx.lineWidth=b.dark?0.65:0.6;
      ctx.beginPath();ctx.arc(s.x,s.y,r,0,TAU);ctx.fill();ctx.stroke();
      ctx.fillStyle=pal.css(b.dark?'fire0':b.elite?'starDust':'fire2');
      ctx.beginPath();ctx.arc(s.x-r*0.12,s.y-r*0.12,r*0.46,0,TAU);ctx.fill();
      ctx.fillStyle=pal.css('white',0.9);ctx.beginPath();ctx.arc(s.x-r*0.24,s.y-r*0.25,r*0.18,0,TAU);ctx.fill();
    }
    ctx.restore();
  }

  SF.projectiles = {
    clear, update, draw, drawEnemyBullets, explode, addFireField, updateFields,
    spawnBlade, spawnFrostShard, spawnOrbWave, spawnMissile, spawnRailgun, spawnEnemyBullet, spawnIceRetaliationField,
    get list() { return list; },
    get enemyList() { return enemyList; },
    get iceFields() { return iceFields; },
    get frostBursts() { return frostBursts; },
  };
})();
