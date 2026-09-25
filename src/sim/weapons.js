/* ============================================================
 * weapons.js — 武器运行时逻辑
 * 持有玩家已装备武器，按冷却触发行为。
 * 伤害管线：base → 专精矩阵 damageMul → 暴击 → 元素共鸣
 * ============================================================ */
(function () {
  'use strict';
  const SF = (window.SF = window.SF || {});
  const { TAU, dist2, angleTo, rand, chance } = SF.util;

  class WeaponInstance {
    constructor(def, level = 1) {
      this.def = def;
      this.level = level;
      this.cdTimer = 0.3;           // 开局短蓄力
      this.laserAngle = rand(TAU);
      this.laserTick = 0;
      this.satAngle = 0;
      this.satHits = new Map();     // enemy uid → 可再次命中时刻
      this.frostEmpowered = false;
      this.charges = 0;
      this.chargeT = 0;
      this.burstFlashT = 0;
      this.shieldSwing = null;
      this.recalc();
    }

    // 汇总当前等级数值（base + levels 前缀和）
    recalc() {
      const s = Object.assign({}, this.def.base);
      for (let i = 0; i < this.level - 1 && i < this.def.levels.length; i++) {
        const lv = this.def.levels[i];
        for (const k in lv) s[k] = (s[k] || 0) + lv[k];
      }
      this.spec = s;
    }

    get maxLevel() { return 1 + this.def.levels.length; }
    get isMaxed() { return this.level >= this.maxLevel; }
    canEvolve(player) {
      const ev = this.def.evolveTo;
      if (!ev || !this.isMaxed) return false;
      if (player.hasWeapon(ev)) return false;
      return player.passives.has(this.def.evolveWith) && player.passives.get(this.def.evolveWith).level >= 3;
    }

    levelUp() {
      if (!this.isMaxed) { this.level++; this.recalc(); }
    }

    // ---------- 伤害结算：base → 专精矩阵 → 暴击 → 共鸣 ----------
    rollDamage(base, player) {
      const s = player.stats;
      let d = base * s.damageMul;
      if (this.def.element === 'bolt') {
        if (s.resonance.bolt) d *= 1.10;
        d *= 1 + (s.boltDmg || 0); // 磁轨矩阵「聚束导轨」：雷系武器伤害加成
      }
      if (this.def.element === 'ice') d *= 1 + (s.iceDmg || 0);
      if (s.critChance > 0 && chance(s.critChance)) d *= s.critMult;
      return d;
    }

    // 元素共鸣修正后的 spec（ice 控制增强）；范围类属性统一吃专精矩阵 areaMul（爆炸/领域/光束/轨道）
    scaledSpec(player) {
      const spec = this.spec;
      const res = player.stats.resonance;
      const out = { ...spec };
      const area = (player.stats.areaMul || 1)
        * (this.def.element === 'ice' ? 1 + (player.stats.iceAreaMul || 0) : 1);
      if (area !== 1) {
        if (out.blast) out.blast *= area;
        if (out.radius) out.radius *= area;
        if (out.length) out.length *= area;
      }
      if (this.def.element === 'ice' && res.ice) {
        out.slow = Math.max(0.12, out.slow * SF.config.ICE_RESONANCE_SLOW_MUL);
        out.freeze *= SF.config.ICE_RESONANCE_FREEZE_MUL;
      }
      if (this.def.element === 'fire') {
        const active = player.fireOverdriveT > 0;
        out.burnDuration = (spec.burnDuration || SF.config.FIRE_BASE_BURN_DURATION)
          * (active ? SF.config.VEGA_HEAT.burnDurationMul : SF.config.FIRE_BURN_DURATION_MUL)
          * (player.traits.layeredBurn ? SF.config.VEGA_BURN_DURATION_MUL : 1);
        out.burnStacking = !!player.traits.layeredBurn;
        out.burnIndicator = !!player.traits.layeredBurn;
      }
      return out;
    }

    cooldownDuration(player = this.owner) {
      const fireMul = this.def.element === 'fire'
        ? (player?.fireOverdriveT > 0 ? SF.config.VEGA_HEAT.cooldownMul : SF.config.FIRE_COOLDOWN_MUL) : 1;
      return (this.spec.cooldown || 0) * (this.def.cooldownMul || 1) * (player?.stats.cooldownMul || 1) * fireMul;
    }

    update(dt, game) {
      const player = game.player;
      this.owner = player; // 供 drawExtras 使用
      this.burstFlashT = Math.max(0, this.burstFlashT - dt);
      if (this.shieldSwing) {
        this.shieldSwing.t += dt;
        if (this.shieldSwing.t >= this.shieldSwing.life) this.shieldSwing = null;
      }

      // BOSS2「深渊停滞」：所有武器冷却与蓄力冻结（无法攻击或积累攻击）
      if (player.weaponLockT > 0) return;

      if (this.spec.cooldown > 0) {
        this.cdTimer -= dt;
        if (this.cdTimer <= 0) {
          const fired = this.fire(game);
          this.cdTimer = fired ? this.cooldownDuration(player) : 0.12;
        }
      }
      if (this.def.id === 'laser' || this.def.id === 'spectrum') this.updateLaser(dt, game);
      if (this.def.id === 'satellite' || this.def.id === 'galaxy') this.updateSatellite(dt, game);
      if (this.def.id === 'chain' || this.def.id === 'tempest') this.updateRailgun(dt, game);
    }

    // ---------- 超电磁炮（原闪电链重做） ----------
    // 蓄力 → 就绪（音效 + 周身粒子环 + 蓄力环变亮；顶部提示行保留给 BOSS/精英警告）→ 点击发射
    // 蓄满转为 1 发存弹（磁暴上限 3），磁暴满仓点击合并消耗全部存弹；
    // 蓄力时长受 stats.chargeMul 加成（磁暴 ×0.8）
    chargeDuration(player = this.owner) {
      const stats = player?.stats || {};
      return this.spec.charge * (stats.chargeMul || 1) * (stats.cooldownMul || 1)
        * (1 - Math.min(0.5, stats.chargeRed || 0));
    }

    updateRailgun(dt, game) {
      const pl = game.player;
      const spec = this.scaledSpec(pl);
      const chargeFull = this.chargeDuration(pl);
      const maxStore = pl.stats.railgunStorage || 1;
      if (this.charges < maxStore) {
        this.chargeT += dt;
        if (this.chargeT >= chargeFull) {
          this.chargeT = 0;
          this.charges++;
          if (this.charges >= maxStore) {
            // 满仓：音效 + 周身粒子环
            SF.particles.ring(pl.x, pl.y, { color: 'bolt2', maxR: 26, life: 0.35 });
            if (pl.traits.railgunBurst) SF.audio.sfx.capacitorReady();
            else SF.audio.sfx.select();
          } else {
            // 单发存入：轻提示
            SF.particles.spark(pl.x, pl.y - 10, -Math.PI / 2, { color: 'bolt1', count: 3, speed: 40, life: 0.25 });
            SF.audio.sfx.uiTick();
          }
        }
      }
      // 鼠标点击发射：以玩家为起点、指向鼠标世界坐标的方向
      const m = game.mouse;
      if (this.charges > 0 && m && m.clicked) {
        const R = SF.renderer;
        const wx = m.x - R.width / 2 + R.cam.x;
        const wy = m.y - R.height / 2 + R.cam.y;
        const burst = !!pl.traits.railgunBurst && this.charges >= maxStore;
        this.charges -= burst ? maxStore : 1;
        if (burst) { this.chargeT = 0; this.burstFlashT = 0.65; }
        this.fireRailgun(Math.atan2(wy - pl.y, wx - pl.x), game, spec, burst);
      }
    }

    fireRailgun(angle, game, spec, burst = false) {
      const player = game.player;
      const capacitor = SF.config.THUNDER_CAPACITOR;
      const damageMul = player.traits.railgunBurst
        ? (burst ? capacitor.burstDamageMul : capacitor.normalDamageMul) : 1;
      const shot = { ...spec, damage: spec.damage * damageMul, empowered: burst };
      if (burst) {
        if (shot.radius) shot.radius *= capacitor.burstSizeMul;
        if (shot.width) shot.width *= capacitor.burstSizeMul;
      }
      // 天罚保持一束、每敌一次；普通形态满仓合成一发，不产生额外电弧或副弹。
      if (shot.beam) this.fireBeam(angle, game, shot);
      else {
        const value = this.rollDamage(shot.damage, player);
        const n = burst ? 1 : (shot.count || 1);
        for (let i = 0; i < n; i++) {
          const a = n > 1 ? angle + (i - (n - 1) / 2) * (shot.spread || 0) : angle;
          SF.projectiles.spawnRailgun(player.x, player.y, a, { ...shot, damage: value });
        }
      }
      SF.renderer.addShake(burst ? 5 : 4, 0.25);
      if (burst) SF.audio.sfx.railBurst();
      else { SF.audio.sfx.shootBolt(); SF.audio.sfx.explosion(); }
    }

    // 天罚光束：瞬时直线判定（长 520 横贯屏幕、宽 9→13），每敌单次结算，范围随专精矩阵 areaMul 增长
    fireBeam(angle, game, spec) {
      const player = game.player;
      const dx = Math.cos(angle), dy = Math.sin(angle);
      const len = spec.length, halfW = (spec.width || 8) / 2;
      let hitAny = false;
      for (const e of game.enemies.list) {
        if (e.dead) continue;
        const px = e.x - player.x, py = e.y - player.y;
        const proj = px * dx + py * dy;
        if (proj < 0 || proj > len) continue;
        const perp = Math.abs(px * dy - py * dx);
        if (perp <= halfW + e.radius) {
          const value = this.rollDamage(spec.damage, player);
          e.takeDamage(value, game, 'bolt0');
          SF.particles.spark(e.x, e.y, angle + Math.PI / 2, { color: 'bolt2', count: 4, speed: 90 });
          SF.particles.floatText(e.x, e.y - 8, `${Math.round(value)}`, { color: SF.palette.css('bolt0'), size: 8 });
          hitAny = true;
        }
      }
      // 光束视觉：复用 lightning 渐隐线段（带 width 画粗芯）
      game.lightning.push({
        points: [
          { x: player.x, y: player.y },
          { x: player.x + dx * len, y: player.y + dy * len },
        ],
        t: 0, life: spec.empowered ? 0.4 : 0.3,
        color: spec.empowered ? 'white' : 'bolt2', color2: 'bolt0', width: spec.width || 8,
      });
      if (hitAny) SF.audio.sfx.railHit();
    }

    // ---------- 触发 ----------
    fire(game) {
      const player = game.player;
      const spec = this.scaledSpec(player);
      // 一次 fire 对应一轮齐射，所有弹体/爆炸共享计热凭据。
      if (player.traits.fireOverdrive && this.def.element === 'fire') {
        spec.fireAttack = { heatUsed: false, heatEligible: player.fireOverdriveT <= 0, burnTargets: new Set() };
      }
      switch (this.def.id) {
        case 'blade':
        case 'prism': {
          const target = game.enemies.nearest(player.x, player.y, 280);
          if (!target) return false;
          const base = angleTo(player.x, player.y, target.x, target.y);
          const n = spec.count || 1;
          for (let i = 0; i < n; i++) {
            const spread = n > 1 ? (i - (n - 1) / 2) * 0.24 : 0;
            const value = this.rollDamage(spec.damage, player);
            SF.projectiles.spawnBlade(player.x, player.y, base + spread, { ...spec, damage: value });
          }
          SF.audio.sfx.shootBlade();
          return true;
        }
        case 'orb':
        case 'absoluteZero': {
          const value = this.rollDamage(spec.damage, player);
          SF.projectiles.spawnOrbWave(player.x, player.y, { ...spec, damage: value });
          SF.particles.ring(player.x, player.y, { color: 'ice1', maxR: spec.radius, life: 0.4 });
          SF.audio.sfx.shootOrb();
          return true;
        }
        case 'mirrorWheel': {
          const target = game.enemies.nearest(player.x, player.y, spec.targetRange);
          if (!target) return false;
          const angle = angleTo(player.x, player.y, target.x, target.y);
          const value = this.rollDamage(spec.damage, player);
          SF.projectiles.spawnFrostShard(player.x, player.y, angle, {
            ...spec, damage: value, empowered: this.frostEmpowered,
          });
          this.frostEmpowered = false;
          SF.audio.sfx.shootOrb();
          return true;
        }
        case 'shieldDisc':
          return this.fireShieldDisc(game, spec);
        case 'missile':
        case 'nuke': {
          const n = spec.count || 1;
          for (let i = 0; i < n; i++) {
            const target = game.enemies.random(player.x, player.y, 300);
            const blind = SF.config.MISSILE_BLIND_SPREAD; // 无目标时的盲炸散布半径
            const tx = target ? target.x + rand(-14, 14) : player.x + rand(-blind, blind);
            const ty = target ? target.y + rand(-14, 14) : player.y + rand(-blind, blind);
            const value = this.rollDamage(spec.damage, player);
            SF.projectiles.spawnMissile(player.x, player.y, tx, ty, { ...spec, damage: value });
          }
          SF.audio.sfx.shootMissile();
          return true;
        }
      }
      return false;
    }

    // ---------- 蓄力渲染信息（HUD 图标冷却遮罩 & 就绪提示用） ----------
    get chargePct() {
      const spec = this.spec;
      if (spec.charge === undefined) return 1;
      if ((this.charges || 0) > 0) return 1; // 有存弹即视为就绪
      const full = this.chargeDuration();
      return Math.min(1, (this.chargeT || 0) / full);
    }
    get railgunReady() {
      return this.spec.charge !== undefined && (this.charges || 0) > 0;
    }
    get railgunBurstReady() {
      return this.railgunReady && !!this.owner?.traits.railgunBurst
        && this.charges >= this.owner.stats.railgunStorage;
    }
    get chargeProgress() {
      return Math.min(1, this.chargeT / this.chargeDuration());
    }

    updateLaser(dt, game) {
      const player = game.player;
      const spec = this.scaledSpec(player);
      this.laserAngle += spec.rotSpeed * dt;
      this.laserTick -= dt;
      const len = spec.length;
      const dx = Math.cos(this.laserAngle), dy = Math.sin(this.laserAngle);
      if (this.laserTick <= 0) {
        this.laserTick = spec.tick;
        this.beamDamage(game, player, spec, dx, dy, len, 1);
        // 光谱裁决副光束：反向短束、半伤害（drawExtras 画的裂变副束真实结算，不再纯视觉）
        if (spec.fork) this.beamDamage(game, player, spec, -dx, -dy, len * 0.7, 0.5);
      }
      this._laserRender = { len };
    }

    // 沿单位方向 (dx,dy) 的光束伤害结算；mul 为伤害系数（副光束 0.5）
    beamDamage(game, player, spec, dx, dy, len, mul) {
      for (const e of game.enemies.list) {
        if (e.dead) continue;
        const px = e.x - player.x, py = e.y - player.y;
        const tproj = Math.max(0, Math.min(len, px * dx + py * dy));
        const cx = player.x + dx * tproj, cy = player.y + dy * tproj;
        const rr = e.radius + 3;
        if (dist2(cx, cy, e.x, e.y) < rr * rr) {
          const value = this.rollDamage(spec.damage * mul, player);
          e.takeDamage(value, game, 'bolt0');
          SF.particles.spark(cx, cy, Math.atan2(dy, dx) + Math.PI / 2, {
            color: mul < 1 ? 'hero1' : 'bolt1', count: 1, speed: 40, life: 0.2,
          });
        }
      }
    }

    updateSatellite(dt, game) {
      const player = game.player;
      const spec = this.scaledSpec(player);
      this.satAngle += spec.rotSpeed * dt;
      const n = spec.count || 1;
      for (let i = 0; i < n; i++) {
        const a = this.satAngle + (TAU / n) * i;
        const sx = player.x + Math.cos(a) * spec.radius;
        const sy = player.y + Math.sin(a) * spec.radius;
        for (const e of game.enemies.list) {
          if (e.dead) continue;
          if ((this.satHits.get(e.uid) || 0) > game.time) continue;
          const rr = e.radius + 5;
          if (dist2(sx, sy, e.x, e.y) < rr * rr) {
            this.satHits.set(e.uid, game.time + spec.hitInterval);
            const value = this.rollDamage(spec.damage, player);
            e.takeDamage(value, game, 'hero0');
            if (spec.knockback) e.knockback(sx, sy, spec.knockback);
            SF.particles.spark(sx, sy, a, { color: 'hero1', count: 2, speed: 50 });
          }
        }
      }
      this._satRender = { n, radius: spec.radius };
    }

    fireShieldDisc(game, spec) {
      const player = game.player;
      const target = game.enemies.nearest(player.x, player.y, Infinity);
      if (!target) return false;
      const aim = angleTo(player.x, player.y, target.x, target.y);
      const halfArc = spec.arc * 0.5;
      const range2 = spec.range * spec.range;
      const empowered = !!player.shieldDiscEmpowered;
      this.shieldSwing = { x: player.x, y: player.y, aim, halfArc, range: spec.range,
        empowered, t: 0, life: empowered ? 0.38 : 0.3 };
      SF.audio.sfx.armorShock();
      for (const e of game.enemies.list) {
        if (e.dead || dist2(player.x, player.y, e.x, e.y) > range2) continue;
        let da = Math.atan2(e.y - player.y, e.x - player.x) - aim;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        if (Math.abs(da) > halfArc) continue;
        const value = this.rollDamage(spec.damage * (empowered ? spec.empoweredDamageMul : 1), player);
        e.takeDamage(value, game, 'hero1');
        if (spec.knockback) e.knockback(player.x, player.y, spec.knockback);
        SF.particles.spark(e.x, e.y, aim, { color: empowered ? 'white' : 'armor0', count: empowered ? 9 : 6, speed: 100 });
        SF.particles.ring(e.x, e.y, { color: 'armor0', maxR: 12, life: 0.2, width: 1.5 });
      }
      if (empowered) player.shieldDiscEmpowered = false;
      return true;
    }

    // ---------- 渲染附加体（激光束 / 卫星 / 电磁炮蓄力指示） ----------
    drawExtras(ctx) {
      const owner = this.owner;
      if (!owner) return;
      const R = SF.renderer;
      const pal = SF.palette;
      if (this.shieldSwing) {
        const f = this.shieldSwing, k = f.t / f.life;
        const p = R.toScreen(f.x, f.y), radius = f.range * (0.35 + 0.65 * Math.min(1, k / 0.45));
        ctx.save();ctx.translate(p.x,p.y);ctx.rotate(f.aim);
        ctx.globalAlpha = (1-k) * (f.empowered ? 0.9 : 0.75);
        ctx.fillStyle = pal.css('armor0',0.16);
        ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,f.range,-f.halfArc,f.halfArc);ctx.closePath();ctx.fill();
        for (const offset of [0, -6]) {
          ctx.strokeStyle = pal.css(offset === 0 ? 'white' : 'armor0');
          ctx.lineWidth = offset === 0 ? (f.empowered ? 3 : 2) : 1;
          ctx.beginPath();ctx.arc(0,0,Math.max(1,radius+offset),-f.halfArc,f.halfArc);ctx.stroke();
        }
        // 可见盾面沿攻击方向推出，范围扇形与真实判定保持一致。
        ctx.translate(radius*0.65,0);ctx.fillStyle=pal.css('metalDark');ctx.strokeStyle=pal.css('armor0');ctx.lineWidth=1.5;
        ctx.beginPath();ctx.moveTo(-5,-9);ctx.lineTo(5,-7);ctx.lineTo(8,0);ctx.lineTo(5,7);ctx.lineTo(-5,9);ctx.closePath();ctx.fill();ctx.stroke();
        ctx.strokeStyle=pal.css('white');ctx.beginPath();ctx.moveTo(0,-5);ctx.lineTo(3,0);ctx.lineTo(0,5);ctx.stroke();ctx.restore();
      }
      // 超电磁炮：蓄力环 + 就绪瞄准提示
      if (this.spec.charge !== undefined) {
        const o = owner;
        const full = this.charges >= o.stats.railgunStorage;
        const pct = full ? 1 : this.chargeProgress;
        const s = R.toScreen(o.x, o.y);
        ctx.strokeStyle = pal.css(this.railgunReady ? 'bolt2' : 'bolt0', 0.8);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 9, -Math.PI / 2, -Math.PI / 2 + TAU * pct);
        ctx.stroke();
        if (this.railgunReady) {
          const pulse = 0.5 + 0.5 * Math.sin(o.visT * 5);
          ctx.strokeStyle = pal.css('bolt1', 0.4 + 0.4 * pulse);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(s.x, s.y, 11 + pulse * 2, 0, TAU);
          ctx.stroke();
          // 存弹指示：每个已存弹在环外一枚小亮点
          const store = this.charges;
          for (let i = 0; i < o.stats.railgunStorage; i++) {
            const a = -Math.PI / 2 - 0.6 + i * 0.6;
            ctx.fillStyle = pal.css(i < store ? (this.railgunBurstReady ? 'white' : 'bolt2') : 'uiLine');
            ctx.fillRect(s.x + Math.cos(a) * 14 - 1, s.y + Math.sin(a) * 14 - 1, 2, 2);
          }
          if (this.railgunBurstReady) {
            for (const side of [-1, 1]) {
              ctx.strokeStyle = pal.css('bolt2', 0.65 + pulse * 0.3); ctx.lineWidth = 1.2;
              ctx.beginPath(); ctx.moveTo(s.x + side * 13, s.y - 5);
              ctx.lineTo(s.x + side * 16, s.y); ctx.lineTo(s.x + side * 13, s.y + 5); ctx.stroke();
            }
          }
        }
      }
      if (this._laserRender && owner.weaponLockT <= 0) {
        // 武器停滞时不渲染激光（冻结的光束不再结算伤害，视觉保持诚实）
        const { len } = this._laserRender;
        const p = R.toScreen(owner.x, owner.y);
        const fork = this.def.id === 'spectrum';
        const drawBeam = (angle, l) => {
          const x2 = p.x + Math.cos(angle) * l, y2 = p.y + Math.sin(angle) * l;
          ctx.strokeStyle = pal.css('bolt0', 0.12);
          ctx.lineWidth = 6;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(x2, y2); ctx.stroke();
          ctx.strokeStyle = pal.css('bolt2',0.9);
          ctx.lineWidth = 0.85;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(x2, y2); ctx.stroke();
        };
        drawBeam(this.laserAngle, len);
        if (fork) drawBeam(this.laserAngle + Math.PI, len * 0.7);
      }
      if (this._satRender) {
        const { n, radius } = this._satRender;
        R.strokeCircle(owner.x,owner.y,radius,pal.css('hero0'),0.4,0.12);
        for (let i = 0; i < n; i++) {
          const a = this.satAngle + (TAU / n) * i;
          R.drawSprite(SF.sprites.glow('satellite', pal.css('hero1'), 2),
            owner.x + Math.cos(a) * radius, owner.y + Math.sin(a) * radius, { rot: a });
        }
      }
      if (this.def.id === 'mirrorWheel' && this.frostEmpowered) {
        R.drawSprite(SF.sprites.glow('frostShard', pal.css('ice2'), 2),
          owner.x, owner.y - 22, { scale: 0.65 });
      }
    }
  }

  SF.WeaponInstance = WeaponInstance;
})();
