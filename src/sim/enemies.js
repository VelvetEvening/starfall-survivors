/* ============================================================
 * enemies.js — 敌人实体与集群管理
 * AI：chase 追踪 / dash 冲刺 / drift 漂浮(死亡分裂) / shoot 远程 / boss
 * ============================================================ */
(function () {
  'use strict';
  const SF = (window.SF = window.SF || {});
  const { TAU, dist2, angleTo, clamp, rand } = SF.util;

  let UID = 1;

  class Enemy {
    constructor(def, x, y, hpScale, speedScale, options = {}) {
      const diff = (SF.game && SF.game.difficulty) || SF.config.DIFFICULTIES.normal;
      this.uid = UID++;
      this.def = def;
      this.x = x; this.y = y;
      this.maxHp = def.hp * hpScale;
      this.hp = this.maxHp;
      this.speed = def.speed * (1 + speedScale) * diff.spdMul;
      this.radius = def.radius;
      this.dead = false;
      this.noRewards = !!options.noRewards;
      this.bossWave = !!options.bossWave;
      this.hitFlash = 0;
      this.burns = []; // 焰锋常态/超载均独立叠层；其它机体至多一条可刷新灼烧
      this.burnIndicatorLayers = 0;
      this.burnT = 0; this.burnDps = 0; this.burnTick = 0; this.burnDamagePool = 0;
      this.slowT = 0; this.slowFactor = 1; this.freezeT = 0;
      this.vulnT = 0;                          // 冰冻易伤：被冻后 5 秒受伤 ×1.2（BOSS 免疫）
      this.iceStacks = 0; this.iceStackT = 0;  // 霜翎冰蚀：每层 ×1.1 最多 3 层，5 秒无冰击清零（对 BOSS 有效）
      this.empowerT = 0;         // 深渊强化：下一次攻击增伤增弹（BOSS2 技能）
      // AI 状态
      this.aiT = rand(1);
      this.dashState = null;
      this.shootCd = rand(1.5);
      this.attackCd = 2;
      this.wob = rand(TAU);
    }

    takeDamage(dmg, game, colorKey, meta = {}) {
      if (this.dead) return 0;
      const isIce = meta.element === 'ice' || colorKey === 'ice0';
      // 敌方承伤乘区统一收口：冰冻易伤（BOSS 免疫）× 冰蚀层数（对 BOSS 有效）
      if (!meta.fixed) {
        if (this.vulnT > 0 && !this.def.boss) dmg *= SF.config.VULN_FREEZE_MUL;
        if (this.iceStacks > 0) dmg *= Math.pow(SF.config.ICE_STACK_MUL, this.iceStacks);
      }
      // 霜翎特质：冰系武器命中叠加冰蚀层
      if (isIce) this.addIceStack(game);
      this.hp -= dmg;
      this.hitFlash = 0.08;
      if (game) game.runStats.damage += dmg;
      if (this.hp <= 0) this.die(game);
      if (meta.fireAttack && dmg > 0) game.player.onFireHit(meta.fireAttack);
      return dmg;
    }

    addIceStack(game) {
      if (this.dead) return false;
      if (!game || !game.player?.traits?.iceStack) return false;
      this.iceStacks = Math.min(SF.config.ICE_STACK_MAX, this.iceStacks + 1);
      this.iceStackT = SF.config.ICE_STACK_DURATION;
      this.icePulseT = 0.18;
      return true;
    }

    applyBurn(dps, duration = SF.config.FIRE_BASE_BURN_DURATION, options = {}) {
      if (this.dead || dps <= 0 || duration <= 0) return;
      // 每轮齐射对同一敌人只追加一层，防多弹/穿透的重叠爆炸把施加频率放大。
      // 层数本身不封顶；不同齐射和不同武器仍能各自追加。
      if (options.stack && options.attack) {
        const targets = options.attack.burnTargets;
        if (targets.has(this.uid)) return;
        targets.add(this.uid);
      }
      const normal = !options.stack && this.burns.find(b => !b.stacked);
      if (normal) {
        normal.dps = Math.max(normal.dps, dps);
        normal.remaining = Math.max(normal.remaining, duration);
      } else {
        this.burns.push({ dps, remaining: duration, stacked: !!options.stack, indicator: !!options.indicator });
      }
      this.refreshBurnState();

    }

    refreshBurnState() {
      this.burnT = 0; this.burnDps = 0;
      this.burnIndicatorLayers = 0;
      for (const b of this.burns) {
        this.burnT = Math.max(this.burnT, b.remaining);
        this.burnDps += b.dps;
        if (b.indicator) this.burnIndicatorLayers++;
      }
    }

    applySlow(factor, freeze) {
      this.slowFactor = Math.min(this.slowFactor, factor);
      this.slowT = Math.max(this.slowT, 1.6);
      // Boss 的减速抗性由 boss.js 换算；实体本身不进入冻结状态。
      if (this.def.boss) { this.freezeT = 0; return; }
      // 新冻结和续冻都按表值折半；续冻取剩余时间的较大者，不叠加。
      const refresh = freeze ? freeze * SF.config.ICE_FREEZE_DURATION_MUL : 0;
      const wasFrozen = this.freezeT > 0;
      this.freezeT = wasFrozen ? Math.max(this.freezeT, refresh) : refresh;
      // 冰冻易伤：新冻结（非续冻刷新）触发 5 秒受伤 ×1.2（BOSS 免疫）
      if (!wasFrozen && refresh > 0 && !this.def.boss) this.vulnT = SF.config.VULN_FREEZE_DURATION;
    }

    knockback(fromX, fromY, power) {
      const a = angleTo(fromX, fromY, this.x, this.y);
      this.x += Math.cos(a) * power * 0.08;
      this.y += Math.sin(a) * power * 0.08;
    }

    die(game) {
      if (this.dead) return;
      this.dead = true;
      if (!game) return;
      game.onEnemyKilled(this);
      SF.particles.burst(this.x, this.y, {
        color: this.def.elite ? 'elite' : 'enemy1',
        count: this.def.elite ? 20 : 7,
        speed: this.def.elite ? 110 : 60,
        life: 0.5, size: this.def.elite ? 3 : 2,
      });
      SF.audio.sfx.enemyDie();
      // 分裂（子体继承当前血量曲线，防后期分裂怪变白给）
      if (this.def.split) {
        const { into, count } = this.def.split;
        for (let i = 0; i < count; i++) {
          const a = rand(TAU);
          game.enemies.spawnAt(into, this.x + Math.cos(a) * 10, this.y + Math.sin(a) * 10, game.mobHpMul, 0,
            { noRewards: this.noRewards, bossWave: this.bossWave });
        }
      }
    }

    update(dt, game) {
      const player = game.player;
      if (this.hitFlash > 0) this.hitFlash -= dt;

      // 状态效果
      if (this.burns.length > 0) {
        // 先按每层真实存活时间累计伤害，再合并显示 tick；不足一 tick 的尾段也足额结算。
        // 新层只 push，不改旧层 remaining；普通灼烧刷新也不能续超载层。
        for (let i = this.burns.length - 1; i >= 0; i--) {
          const b = this.burns[i];
          this.burnDamagePool += b.dps * Math.min(dt, b.remaining);
          b.remaining = Math.max(0, b.remaining - dt);
          if (b.remaining === 0) this.burns.splice(i, 1);
        }
        this.refreshBurnState();
        this.burnTick -= dt;
        if (this.burnTick <= 0 || this.burns.length === 0) {
          this.burnTick = SF.config.BURN_TICK_INTERVAL;
          this.takeDamage(this.burnDamagePool, game, 'fire1', { burn: true });
          this.burnDamagePool = 0;
          if (this.dead) return;
          SF.particles.trail(this.x + rand(-3, 3), this.y + rand(-3, 3), { color: 'fire1', life: 0.3, size: 1.5 });
          // 蔓延只复制一层的剩余寿命，不能把总叠层伤害复制出去，也不重置寿命。
          if (game.player.stats.resonance.fire && this.burns.length > 0) {
            const layer = this.burns.reduce((best, b) => b.dps > best.dps ? b : best);
            const R2 = SF.config.BURN_SPREAD_RADIUS * SF.config.BURN_SPREAD_RADIUS;
            for (const o of game.enemies.list) {
              if (o.dead || o.burnT > 0) continue;
              if (dist2(this.x, this.y, o.x, o.y) < R2) {
                o.applyBurn(layer.dps, layer.remaining, { stack: layer.stacked, indicator: layer.indicator });
              }
            }
          }
        }
      }
      if (this.slowT > 0) { this.slowT -= dt; if (this.slowT <= 0) this.slowFactor = 1; }
      if (this.freezeT > 0) this.freezeT -= dt;
      if (this.vulnT > 0) this.vulnT -= dt;
      if (this.iceStackT > 0) { this.iceStackT -= dt; if (this.iceStackT <= 0) this.iceStacks = 0; }
      if (this.icePulseT > 0) this.icePulseT -= dt;
      if (this.empowerT > 0) this.empowerT -= dt;

      if (this.freezeT > 0) return; // 冻结时不移动不攻击

      const spd = this.speed * this.slowFactor;
      const aTo = angleTo(this.x, this.y, player.x, player.y);
      this.wob += dt * 3;

      switch (this.def.ai) {
        case 'chase': {
          this.x += Math.cos(aTo) * spd * dt;
          this.y += Math.sin(aTo) * spd * dt;
          break;
        }
        case 'dash': {
          const D = this.def.dash;
          if (!this.dashState) {
            this.x += Math.cos(aTo) * spd * dt;
            this.y += Math.sin(aTo) * spd * dt;
            this.aiT -= dt;
            const engage = D.engageRange || SF.config.DASH_ENGAGE_RANGE;
            if (this.aiT <= 0 && dist2(this.x, this.y, player.x, player.y) < engage * engage) {
              this.dashState = 'windup'; this.aiT = D.windup;
              this.dashAngle = aTo;
              // 精英冲刺预警闪烁
              if (this.def.elite) SF.particles.flash(this.x, this.y, { color: 'elite', size: 10, life: 0.3 });
            }
          } else if (this.dashState === 'windup') {
            this.aiT -= dt;
            if (this.aiT <= 0) { this.dashState = 'dashing'; this.aiT = SF.config.DASH_TIME; }
          } else {
            this.x += Math.cos(this.dashAngle) * D.speed * dt;
            this.y += Math.sin(this.dashAngle) * D.speed * dt;
            this.aiT -= dt;
            if (Math.random() < 0.3) SF.particles.trail(this.x, this.y, { color: this.def.elite ? 'elite' : 'enemy2', life: 0.25, size: 1.5 });
            if (this.aiT <= 0) {
              this.dashState = null; this.aiT = D.cd;
              // 近战精英收招惩罚：冲撞结束立刻释放一圈扩散弹幕（被强化时更多更疼、转深暗红）
              if (D.barrage && this.def.elite) {
                const B = D.barrage;
                const emp = this.empowerT > 0;
                if (emp) this.empowerT = 0; // 强化消费：下一次攻击
                const dmg = (B.dmg !== undefined ? B.dmg : this.def.damage)
                  * (game.eliteDamageBoost || 1) * (emp ? SF.config.EMPOWER_DMG_MUL : 1);
                const count = B.count + (emp ? 6 : 0);
                for (let i = 0; i < count; i++) {
                  const ang = (TAU / count) * i + rand(0.15);
            SF.projectiles.spawnEnemyBullet(this.x, this.y, ang, B.speed, dmg, emp ? 'darkRed' : 'elite', this);
                }
                SF.particles.flash(this.x, this.y, { color: emp ? 'darkRed' : 'elite', size: emp ? 11 : 9, life: 0.2 });
                SF.particles.ring(this.x, this.y, { color: emp ? 'darkRed' : 'elite', maxR: emp ? 46 : 36, life: 0.3 });
              }
            }
          }
          break;
        }
        case 'drift': {
          const wa = aTo + Math.sin(this.wob) * 0.8;
          this.x += Math.cos(wa) * spd * dt;
          this.y += Math.sin(wa) * spd * dt;
          break;
        }
        case 'shoot': {
          const S = this.def.shoot;
          const d2 = dist2(this.x, this.y, player.x, player.y);
          if (d2 > S.range * S.range * 0.7) {
            this.x += Math.cos(aTo) * spd * dt;
            this.y += Math.sin(aTo) * spd * dt;
          }
          this.shootCd -= dt;
          if (this.shootCd <= 0 && d2 < S.range * S.range) {
            this.shootCd = S.cd;
            SF.projectiles.spawnEnemyBullet(this.x, this.y, aTo, S.speed, this.def.damage, 'red', this);
            SF.particles.flash(this.x, this.y, { color: 'fire0', size: 4, life: 0.1 });
          }
          break;
        }
        case 'chaseShoot': {
          // 精英混合 AI：远时全速追击，进入射程后边逼近边开火
          const S = this.def.shoot;
          const d2 = dist2(this.x, this.y, player.x, player.y);
          const inRange = d2 < S.range * S.range;
          const near = d2 < S.range * S.range * 0.2; // 射程 45% 内减速逼近
          if (!near) {
            const mul = inRange ? 0.45 : 1;
            this.x += Math.cos(aTo) * spd * mul * dt;
            this.y += Math.sin(aTo) * spd * mul * dt;
          }
          this.shootCd -= dt;
          if (this.shootCd <= 0 && inRange) {
            this.shootCd = S.cd;
            // 精英专属快弹：金色高伤警示弹（S.dmg 独立弹伤；BOSS1 击杀后精英弹幕增伤）
            // 被强化时：下一次攻击弹数翻倍、伤害 ×1.6、转深暗红
            const emp = this.empowerT > 0;
            if (emp) this.empowerT = 0; // 强化消费：下一次攻击
            const dmg = (S.dmg !== undefined ? S.dmg : this.def.damage)
              * (this.def.elite ? (game.eliteDamageBoost || 1) : 1)
              * (emp ? SF.config.EMPOWER_DMG_MUL : 1);
            // 精英三连发（扇形小散射），普通远程单位单发；强化时弹数翻倍、散射更宽
            const n = this.def.elite ? (S.volley || 3) * (emp ? 2 : 1) : 1;
            const spread = emp ? 0.22 : 0.14;
            for (let i = 0; i < n; i++) {
              const ang = aTo + (i - (n - 1) / 2) * spread;
              SF.projectiles.spawnEnemyBullet(this.x, this.y, ang, S.speed, dmg,
                this.def.elite ? (emp ? 'darkRed' : 'elite') : null, this);
            }
            SF.particles.flash(this.x, this.y, { color: emp ? 'darkRed' : (this.def.elite ? 'elite' : 'fire0'), size: emp ? 8 : 6, life: 0.15 });
          }
          break;
        }
      }
    }

    drawBurnIndicator(ctx) {
      if (!this.burnIndicatorLayers) return;
      // 外观只映射 1–5 层；最大 8×5.5 逻辑像素，不超过旧文字占位。
      const strength = (Math.min(5, this.burnIndicatorLayers) - 1) / 4;
      const s = SF.renderer.toScreen(this.x, this.y);
      const w = 4 + strength * 4, h = 3.5 + strength * 2;
      ctx.save();ctx.translate(s.x, s.y + this.radius + 4);ctx.scale(w / 8, h / 5.5);
      ctx.globalAlpha = 0.55 + strength * 0.45;
      ctx.fillStyle = SF.palette.css(strength < 0.5 ? 'fire1' : 'fire0');
      ctx.beginPath();ctx.moveTo(0, 0);
      ctx.bezierCurveTo(0.8, 2.2, 3.1, 1, 3.6, 3.1);
      ctx.bezierCurveTo(4, 4.7, 2, 5.5, 0, 5.5);
      ctx.bezierCurveTo(-3.8, 5.5, -4, 3.5, -2.4, 1.6);
      ctx.bezierCurveTo(-2.6, 3, -0.5, 2.8, 0, 0);ctx.fill();
      ctx.fillStyle = SF.palette.css('fire2');ctx.globalAlpha = 0.45 + strength * 0.55;
      ctx.beginPath();ctx.moveTo(0.3, 2.3);
      ctx.bezierCurveTo(0.5, 3.5, 2, 3.6, 1.4, 4.7);
      ctx.bezierCurveTo(0.8, 5.5, -1.8, 5.2, -1.4, 4.1);
      ctx.bezierCurveTo(-1, 3.5, -0.2, 3.5, 0.3, 2.3);ctx.fill();ctx.restore();
    }

    draw(ctx) {
      const R = SF.renderer;
      const pal = SF.palette;
      const spr = SF.sprites.get(this.def.sprite);
      if (!spr) return;
      const flash = this.hitFlash > 0;
      // BOSS 不会被冻结（updateBoss 不吃 freezeT），冻冰视觉只对普通/精英敌人生效，防止视觉欺骗
      const frozen = this.freezeT > 0 && !this.isBoss;
      if (this.isBoss && SF.bossVisuals) {
        SF.bossVisuals.drawBoss(ctx, this);
      } else {
        const img = flash ? SF.sprites.glow(this.def.sprite, pal.css('white'), 2) : spr;
        if (this.def.elite) R.glow(this.x, this.y, 24, this.empowerT > 0 ? 'darkRed' : 'gold', 0.23);
        R.drawSprite(img, this.x, this.y, { alpha: frozen ? 0.72 : 1 });
      }
      if (this.dashState === 'windup' && !frozen) {
        const s = R.toScreen(this.x, this.y);
        const color = this.def.elite ? 'elite' : 'enemy2';
        ctx.save(); ctx.translate(s.x,s.y); ctx.rotate(this.dashAngle);
        ctx.strokeStyle=pal.css(color,0.65); ctx.lineWidth=0.6;ctx.setLineDash([3,3]);
        ctx.beginPath();ctx.moveTo(this.radius+3,0);ctx.lineTo(this.radius+35,0);ctx.stroke();ctx.restore();
      }
      if (frozen) {
        R.strokeCircle(this.x, this.y, this.radius + 2, pal.css('ice2'), 1, 0.8);
      } else if (this.isBoss && this.slowT > 0 && this.slowFactor < 1) {
        // BOSS 减速抗性：只吃 30% 减速，用淡冰圈如实反馈「减速生效中」
        R.strokeCircle(this.x, this.y, this.radius + 3, pal.css('ice1'), 1, 0.45);
      }
      if (this.icePulseT > 0) {
        const pulse = Math.max(0, this.icePulseT / 0.18);
        R.strokeCircle(this.x, this.y, this.radius + 4 + (1 - pulse) * 3, pal.css('ice2'), 1.1, pulse * 0.75);
      }
      // 被强化状态：暗红脉冲环
      if (this.empowerT > 0) {
        const pulse = 0.5 + 0.5 * Math.sin(this.wob * 8);
        R.strokeCircle(this.x, this.y, this.radius + 5 + pulse * 2, pal.css('darkRed'), 1, 0.45 + 0.4 * pulse);
      }
      // 冰蚀层数指示：敌人头顶小冰晶（1-3 枚）
      if (this.iceStacks > 0) {
        const s = R.toScreen(this.x, this.y);
        ctx.fillStyle = pal.css('ice2');
        for (let i = 0; i < this.iceStacks; i++) {
          ctx.fillRect(s.x - 5 + i * 4, s.y - this.radius - (this.def.elite ? 14 : 7), 3, 3);
        }
      }
      this.drawBurnIndicator(ctx);
      // 精英血条
      if (this.def.elite) {
        const s = R.toScreen(this.x, this.y);
        const w = 22, h = 3;
        ctx.fillStyle = pal.css('ink');
        ctx.fillRect(s.x - w / 2 - 1, s.y - this.radius - 8, w + 2, h + 2);
        ctx.fillStyle = pal.css('elite');
        ctx.fillRect(s.x - w / 2, s.y - this.radius - 7, w * clamp(this.hp / this.maxHp, 0, 1), h);
      }
    }
  }

  class EnemyManager {
    constructor() { this.list = []; }

    spawnAt(id, x, y, hpScale = 1, speedScale = 0, options = {}) {
      const def = SF.enemies[id];
      if (!def) return null;
      if (this.list.length >= SF.config.ENEMY_CAP) return null;
      const e = new Enemy(def, x, y, hpScale, speedScale, options);
      this.list.push(e);
      return e;
    }

    spawnBoss(game, defId) {
      const def = SF.enemies[defId] || SF.enemies.boss;
      const a = rand(TAU);
      const R = 300;
      const e = new Enemy(def, game.player.x + Math.cos(a) * R, game.player.y + Math.sin(a) * R,
        (game.difficulty || SF.config.DIFFICULTIES.normal).hpMul, 0);
      e.isBoss = true;
      this.list.push(e);
      game.boss = e;
      return e;
    }

    nearest(x, y, maxDist) {
      let best = null, bestD = maxDist * maxDist;
      for (const e of this.list) {
        if (e.dead) continue;
        const d2 = dist2(x, y, e.x, e.y);
        if (d2 < bestD) { bestD = d2; best = e; }
      }
      return best;
    }

    random(x, y, maxDist) {
      // 以调用方给定的锚点（通常是玩家坐标）筛选候选，避免退化到世界原点
      const cands = [];
      for (const e of this.list) {
        if (e.dead) continue;
        if (dist2(x, y, e.x, e.y) < maxDist * maxDist) cands.push(e);
      }
      return cands.length ? cands[(Math.random() * cands.length) | 0] : null;
    }

    update(dt, game) {
      for (let i = this.list.length - 1; i >= 0; i--) {
        const e = this.list[i];
        if (e.dead) { this.list.splice(i, 1); continue; }
        e.update(dt, game);
        if (e.dead) continue;
        // 接触伤害（难度系数收口；BOSS1 击杀后小怪/精英伤害各自上调防后期免伤）
        const pl = game.player;
        const rr = e.radius + pl.radius;
        if (dist2(e.x, e.y, pl.x, pl.y) < rr * rr) {
          const contactStart = !e.touchingPlayer;
          e.touchingPlayer = true;
          const dmul = (game.difficulty || SF.config.DIFFICULTIES.normal).dmgMul;
          const mobBoost = e.def.boss ? 1
            : e.def.elite ? (game.eliteDamageBoost || 1)
            : (game.mobDamageBoost || 1);
          pl.takeDamage(e.def.damage * (e.def.boss ? SF.config.BOSS_CONTACT_DMG_MUL : 1) * dmul * mobBoost, {
            type: 'contact', owner: e.def.boss ? 'boss' : e.def.elite ? 'elite' : 'mob', attacker: e,
            x: e.x, y: e.y, game, contactStart,
          });
        } else e.touchingPlayer = false;
        // 清理过远敌人（传送回包围圈，模拟无限潮）
        const R = 520;
        if (dist2(e.x, e.y, pl.x, pl.y) > R * R && !e.isBoss) {
          const a = rand(TAU);
          e.x = pl.x + Math.cos(a) * R * 0.9;
          e.y = pl.y + Math.sin(a) * R * 0.9;
        }
      }
    }

    draw(ctx) {
      for (const e of this.list) e.draw(ctx);
    }

  }

  SF.Enemy = Enemy;
  SF.EnemyManager = EnemyManager;
})();
