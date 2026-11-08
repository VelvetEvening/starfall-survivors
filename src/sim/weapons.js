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
      this.laserSweepT = 0; this.laserRestT = 0; this.laserAim = 0;
      this.frostEmpowered = false;
      this.charges = 0;
      this.chargeT = 0;
      this.burstFlashT = 0;
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
      if (this.def.element === 'fire') d *= 1 + (s.fireDmg || 0);
      if (s.critChance > 0 && chance(s.critChance)) d *= s.critMult;
      return d;
    }

    // 元素共鸣修正后的 spec（ice 控制增强）；范围类属性统一吃专精矩阵 areaMul（爆炸/领域/光束/轨道）
    scaledSpec(player) {
      const spec = this.spec;
      const res = player.stats.resonance;
      const out = { ...spec };
      if (this.def.id === 'mirrorWheel' || this.def.id === 'frostLance') {
        out.speed *= 1 + (player.stats.frostProjectileSpeed || 0);
      }
      const area = (player.stats.areaMul || 1)
        * (this.def.element === 'ice' ? 1 + (player.stats.iceAreaMul || 0) :
          this.def.element === 'bolt' ? 1 + (player.stats.boltAreaMul || 0) :
            this.def.element === 'fire' ? 1 + (player.stats.fireAreaMul || 0) : 1);
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
          * (player.traits.layeredBurn ? SF.config.VEGA_BURN_DURATION_MUL : 1) * (1 + (player.stats.burnDuration || 0));
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
      // 天罚保持一束、每敌一次；电弧仅是表现，普通形态满仓仍只合成一发。
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
      SF.particles.discharge(player.x, player.y, { radius: burst ? 22 : 15, life: 0.22 });
      if (burst) SF.audio.sfx.railBurst();
      else SF.audio.sfx.shootBolt();
    }

    // 天罚光束：瞬时直线判定（长 520、宽 22→26），每敌单次结算。
    fireBeam(angle, game, spec) {
      const player = game.player;
      const dx = Math.cos(angle), dy = Math.sin(angle);
      const len = spec.length, halfW = (spec.width || 8) / 2;
      let hitAny = false, feedback = 0;
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
          if (feedback++ < 8) SF.particles.discharge(e.x, e.y, { radius: Math.min(16, e.radius + 6) });
          hitAny = true;
        }
      }
      // 发射瞬间已完成伤害结算；满仓只延长余辉，不注册持续碰撞或二次命中。
      game.lightning.push({
        points: [
          { x: player.x, y: player.y },
          { x: player.x + dx * len, y: player.y + dy * len },
        ],
        t: 0, life: spec.beamLife * (spec.empowered ? SF.config.THUNDER_CAPACITOR.burstBeamLifeMul : 1),
        color: spec.empowered ? 'white' : 'bolt2', color2: 'bolt0', width: spec.width || 8, electric: true,
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
        case 'mirrorWheel':
        case 'frostLance': {
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
      const player = game.player, spec = this.scaledSpec(player);
      if (this.laserSweepT <= 0) {
        this._laserRender = null;
        this.laserRestT = Math.max(0, this.laserRestT - dt);
        if (this.laserRestT > 0) return;
        const target = game.enemies.nearest(player.x, player.y, spec.length);
        if (!target) return;
        this.laserAim = angleTo(player.x, player.y, target.x, target.y);
        this.laserSweepT = spec.sweepDuration;
        this.laserTick = 0;
        SF.audio.sfx.laserStart(this.def.super);
      }
      const progress = 1 - this.laserSweepT / spec.sweepDuration;
      this.laserAngle = this.laserAim + (progress - 0.5) * spec.sweepArc;
      this.laserTick -= dt;
      if (this.laserTick <= 0) {
        this.laserTick += spec.tick;
        this.beamDamage(game, player, spec, Math.cos(this.laserAngle), Math.sin(this.laserAngle), spec.length);
      }
      this._laserRender = { len: spec.length };
      this.laserSweepT = Math.max(0, this.laserSweepT - dt);
      if (this.laserSweepT === 0) this.laserRestT = spec.sweepPause;
    }

    // 沿唯一射线结算，每个目标每 tick 一次；外围电弧不另行命中。
    beamDamage(game, player, spec, dx, dy, len) {
      let feedback = 0;
      for (const e of game.enemies.list) {
        if (e.dead) continue;
        const px = e.x - player.x, py = e.y - player.y;
        const tproj = Math.max(0, Math.min(len, px * dx + py * dy));
        const cx = player.x + dx * tproj, cy = player.y + dy * tproj;
        const rr = e.radius + 3;
        if (dist2(cx, cy, e.x, e.y) < rr * rr) {
          const value = this.rollDamage(spec.damage, player);
          e.takeDamage(value, game, 'bolt0');
          SF.particles.spark(cx, cy, Math.atan2(dy, dx) + Math.PI / 2, {
            color: 'bolt1', count: 1, speed: 40, life: 0.2,
          });
          if (feedback++ < 8) SF.particles.discharge(cx, cy, { radius: this.def.super ? 10 : 6, life: 0.12 });
        }
      }
    }

    // ---------- 渲染附加体（激光束 / 电磁炮蓄力指示） ----------
    drawExtras(ctx) {
      const owner = this.owner;
      if (!owner) return;
      const R = SF.renderer;
      const pal = SF.palette;
      // 就绪时短电弧环绕机体；满仓更明亮，存弹数量只在底部 HUD 显示。
      // 所有点由逻辑时间推导，不积累粒子、消费随机数或参与碰撞。
      if (this.railgunReady && owner.weaponLockT <= 0 && !owner.dead) {
        const full = this.railgunBurstReady, time = R.reducedMotion ? 0 : owner.visT;
        const s = R.toScreen(owner.x, owner.y), count = full ? 3 : 2;
        const radius = full ? 14 : 12.5, span = full ? 1.18 : 0.95;
        const phase = time * (full ? 0.8 : 0.55), frame = Math.floor(time * 10);
        const pulse = 0.85 + 0.15 * Math.sin(time * 2.8);
        R.glow(owner.x, owner.y, full ? 22 : 18, 'bolt0', (full ? 0.19 : 0.10) * pulse);
        ctx.save(); ctx.translate(s.x, s.y); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        for (let arc = 0; arc < count; arc++) {
          const start = phase + arc * TAU / count;
          ctx.beginPath();
          for (let i = 0; i <= 12; i++) {
            const k = i / 12, angle = start + k * span;
            const r = radius + Math.sin(i * 2.3 + frame * 1.7 + arc) * Math.sin(k * Math.PI) * 1.15;
            const x = Math.cos(angle) * r, y = Math.sin(angle) * r;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = pal.css('bolt0', 0.16 * pulse); ctx.lineWidth = full ? 4 : 3; ctx.stroke();
          ctx.strokeStyle = pal.css('bolt1', (full ? 0.85 : 0.62) * pulse); ctx.lineWidth = full ? 1.45 : 1.1; ctx.stroke();
          ctx.strokeStyle = pal.css('bolt2', (full ? 0.95 : 0.7) * pulse); ctx.lineWidth = 0.45; ctx.stroke();
        }
        ctx.restore();
      }
      if (this._laserRender && owner.weaponLockT <= 0) {
        const { len } = this._laserRender, p = R.toScreen(owner.x, owner.y);
        const evolved = this.def.id === 'spectrum', width = evolved ? 6 : 2;
        ctx.save();ctx.translate(p.x,p.y);ctx.rotate(this.laserAngle);
        // 一条固定宽度的高压通道；折线电弧始终束缚在同一束内。
        ctx.fillStyle=pal.css('bolt0',evolved?0.18:0.1);ctx.fillRect(0,-width/2,len,width);
        ctx.strokeStyle=pal.css('bolt2',evolved?0.7:0.35);ctx.lineWidth=evolved?1.5:0.5;
        ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(len,0);ctx.stroke();
        R.electricArc(ctx,0,0,len,0,{time:owner.visT,amplitude:evolved?2.4:2,width:evolved?1.1:0.8,seed:2});
        if(evolved)R.electricArc(ctx,0,0,len,0,{time:owner.visT,amplitude:2.1,width:0.65,seed:11});
        // 电极短路与终端电火花强化电元素识别，不生成副束。
        for(const side of [-1,1]) {
          ctx.strokeStyle=pal.css('bolt1',0.8);ctx.lineWidth=evolved?1.4:0.8;
          ctx.beginPath();ctx.moveTo(-2,side*5);ctx.lineTo(6,side*5);ctx.lineTo(9,side*2);ctx.stroke();
        }
        R.electricArc(ctx,5,-4,5,4,{time:owner.visT,amplitude:1.8,width:0.8,seed:6});
        ctx.restore();
      }
      if ((this.def.id === 'mirrorWheel' || this.def.id === 'frostLance') && this.frostEmpowered) {
        R.drawSprite(SF.sprites.glow(this.def.icon, pal.css('ice2'), 2),
          owner.x, owner.y - 22, { scale: 0.65 });
      }
    }
  }

  SF.WeaponInstance = WeaponInstance;
})();
