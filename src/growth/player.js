/* ============================================================
 * player.js — 玩家实体：状态聚合 / 属性重算 / 受击复活
 * ============================================================ */
(function () {
  'use strict';
  const SF = (window.SF = window.SF || {});
  const { dist2, lerp } = SF.util;

  class Player {
    // 与原有入场上限一致，工坊预览和购买校验也使用这一规则。
    static startingWeaponLevel(upgrades = 0) { return 1 + Math.min(5, upgrades || 0); }

    constructor(charId) {
      const char = SF.characters[charId] || SF.characters.vega;
      this.char = char;
      this.x = 0; this.y = 0;
      this.radius = 5;
      this.moving = false;

      // 武器与被动（工坊「初始武器强化」：最高携带 6 级入场）
      const upg0 = (SF.save.profile && SF.save.profile.charUpgrades && SF.save.profile.charUpgrades[charId]) || {};
      this.weapons = [];
      this.passives = new Map(); // id → {level}
      this.addWeapon(char.startWeapon, Player.startingWeaponLevel(upg0.weapon));

      // 专精矩阵
      this.starPoints = SF.config.STARPOINT_START;
      this.litStars = new Set();

      // 局内特质
      this.traits = Object.assign({ luck: 1 }, char.traits);

      // 属性（recalcStats 填充）
      this.stats = {};
      this.recalcStats();
      this.hp = this.stats.maxHp;
      this.shield = 0;
      this.shieldDiscEmpowered = false;
      this.armorShockCharge = 0;
      this.armorShockCd = 0;
      this.armorShockFlashT = 0;
      this.heat = 0;
      this.heatGateT = this.traits.fireOverdrive ? SF.config.VEGA_HEAT.interval : 0;
      this.fireOverdriveT = 0;
      this.counterFlashT = 0;
      this.iceRetaliationUsed = false;

      // 受击/复活
      this.invulnT = 0;
      this.phaseInvulnT = 0;   // 周期无敌帧（霜翎特性，与受击无敌独立）
      this.cycleInvulnCd = this.traits.cycleInvuln ? SF.config.FIREFLY_CYCLE_INTERVAL : 0;
      this.cycleInvulnRingCd = this.cycleInvulnCd;
      this.cycleInvulnRingMax = this.cycleInvulnCd || 1;
      this.weaponLockT = 0;    // BOSS2「深渊停滞」：武器冷却与蓄力冻结
      this.hurtFlash = 0;
      this.speedBoostT = 0; // 霜翎特性
      this.revived = false;
      this.shieldTimer = 0;
      this.regenPool = 0;
      this.visT = 0;
    }

    // ---------- 武器 / 被动 ----------
    addWeapon(id, level = 1) {
      const def = SF.weapons[id];
      if (!def || this.hasWeapon(id)) return;
      this.weapons.push(new SF.WeaponInstance(def, level));
    }
    hasWeapon(id) { return this.weapons.some(w => w.def.id === id); }
    addPassive(id) {
      const def = SF.passives[id];
      if (!def || this.passives.has(id)) return;
      this.passives.set(id, { level: 1 });
      this.recalcStats();
    }

    // ---------- 专精矩阵 ----------
    // 节点花费：本系专精系 ×1，其它专精系 ×2
    starCost(id) {
      const n = SF.constellations[id];
      return Math.ceil(n.cost * (this.char.homeTree === n.con ? 1 : 2));
    }
    canLight(id) { return SF.constellationSys.nodeAvailable(id, this.litStars, this.starPoints, this.starCost(id)); }
    lightStar(id) {
      if (!this.canLight(id)) return false;
      this.starPoints -= this.starCost(id);
      this.litStars.add(id);
      this.recalcStats();
      SF.audio.sfx.confirm();
      return true;
    }

    // ---------- 属性聚合 ----------
    recalcStats() {
      // 局外工坊加成（装甲初始数值强化，5 级封顶；生命为百分比制：每级 +10% 基础生命）
      const upg = (SF.save.profile && SF.save.profile.charUpgrades && SF.save.profile.charUpgrades[this.char.id]) || {};
      const upHp = (this.char.bonus.maxHp || 100) * (upg.hp || 0) * (this.char.upgradeStats.hp.per);
      const upSpd = (upg.speed || 0) * (this.char.upgradeStats.speed.per);
      const upDmg = (upg.dmg || 0) * (this.char.upgradeStats.dmg.per);
      // 入场生命 = 基础 + 工坊
      const entryHp = (this.char.bonus.maxHp || 100) + upHp;

      const S = {
        // 基础（角色 + 工坊）
        maxHp: entryHp,
        maxHpMul: 0,
        speed: (this.char.bonus.speed || 70) + upSpd,
        armor: this.char.bonus.armor || 0,
        pickupRadius: SF.config.PICKUP_RADIUS_BASE,
        critChance: 0.05,
        critMult: 1.5,
        cooldownMul: 1,
        damageMul: (this.char.dmgMul || 1) * (1 + upDmg),
        chargeMul: 1,        // 超电磁炮蓄力时长倍率（磁暴 0.8）
        railgunStorage: 1,   // 超电磁炮充能存储上限（磁暴 3）
        areaMul: 1,
        xpMul: 1,
        iceDmg: 0,
        iceAreaMul: 0,
        boltDmg: 0,          // 磁轨矩阵「聚束导轨」：雷系武器伤害加成
        chargeRed: 0,        // 磁轨矩阵「超导线圈」：电磁炮蓄力缩减（乘在 charge 上的减法）
        regen: 0,
        invulnTime: SF.config.INVULN_TIME,
        phaseInvulnDuration: SF.config.FIREFLY_CYCLE_INVULN_BASE,
        phaseInvulnBonus: 0,
        revive: 0,
        shieldEvery: 0,
        shieldAmt: 0,
        shieldArmor: 0,
        emergencyRegen: 0,
        magnetChance: 0,
        resonance: { fire: false, bolt: false, ice: false },
      };

      // 被动：基础档数值；持有对应超武后每层效果 ×1.5（追溯已获得层数）
      if (!SF.passiveSuperMap) {
        SF.passiveSuperMap = {};
        for (const wid in SF.weapons) {
          const w = SF.weapons[wid];
          if (w.evolveTo && w.evolveWith) SF.passiveSuperMap[w.evolveWith] = w.evolveTo;
        }
      }
      const ownedSupers = new Set(this.weapons.filter(w => w.def.super).map(w => w.def.id));
      for (const [id, inst] of this.passives) {
        const def = SF.passives[id];
        const boost = ownedSupers.has(SF.passiveSuperMap[id]) ? 1.5 : 1;
        for (let i = 0; i < inst.level; i++) {
          for (const k in def.per) S[k] = (S[k] || 0) + def.per[k] * boost;
        }
      }

      // 角色特质 → 属性
      if (this.traits.chargeMul) S.chargeMul = this.traits.chargeMul;
      if (this.traits.railgunStorage) S.railgunStorage = this.traits.railgunStorage;

      // 专精矩阵（共鸣旗标单独存底：updateResonance 每帧会重算武器计数，
      // 专精矩阵授予的共鸣必须与武器计数取「或」，否则会被覆盖成死效果）
      const starRes = { fire: false, bolt: false, ice: false };
      const fx = SF.constellationSys.aggregate(this.litStars);
      for (const k in fx) {
        if (k === 'fireRes') { S.resonance.fire = true; starRes.fire = true; }
        else if (k === 'iceRes') { S.resonance.ice = true; starRes.ice = true; }
        else if (k === 'boltRes') { S.resonance.bolt = true; starRes.bolt = true; }
        else S[k] = (S[k] || 0) + fx[k];
      }
      this._starResonance = starRes;

      // 所有矩阵加成聚合完成后，才结算派生属性，防止防反时长节点失效。
      S.phaseInvulnDuration = Math.min(SF.config.FIREFLY_CYCLE_INVULN_CAP,
        SF.config.FIREFLY_CYCLE_INVULN_BASE + S.phaseInvulnBonus);
      S.maxHp *= 1 + S.maxHpMul;

      this.stats = S;
      // 当前血量上限变化处理
      if (this.hp !== undefined) this.hp = Math.min(this.hp, S.maxHp);
    }

    // ---------- 元素共鸣计数 ----------
    // 武器计数触发的共鸣与专精矩阵授予的共鸣（_starResonance）取「或」
    updateResonance() {
      const count = { fire: 0, bolt: 0, ice: 0 };
      for (const w of this.weapons) {
        const el = w.def.element;
        if (count[el] !== undefined) count[el]++;
      }
      const star = this._starResonance || {};
      const res = this.stats.resonance;
      res.fire = star.fire === true || count.fire >= SF.resonance.fire.need;
      res.bolt = star.bolt === true || count.bolt >= SF.resonance.bolt.need;
      res.ice = star.ice === true || count.ice >= SF.resonance.ice.need;
    }

    // ---------- 更新 ----------
    update(dt, game) {
      this.armorShockCd = Math.max(0, this.armorShockCd - dt);
      this.armorShockFlashT = Math.max(0, this.armorShockFlashT - dt);
      if (this.weaponLockT <= 0) {
        if (this.fireOverdriveT > 0) {
          const remaining = Math.max(0, this.fireOverdriveT - dt);
          if (remaining === 0) this.setFireOverdrive(0);
          else this.fireOverdriveT = remaining;
        } else this.heatGateT = Math.max(0, this.heatGateT - dt);
      }
      this.counterFlashT = Math.max(0, this.counterFlashT - dt);
      const input = SF.input;
      const mv = input.moveVector();
      let speed = this.stats.speed;
      if (this.speedBoostT > 0) { this.speedBoostT -= dt; speed *= SF.config.FIREFLY_SPEED_BOOST; }
      this.x += mv.x * speed * dt;
      this.y += mv.y * speed * dt;
      this.moving = !!(mv.x || mv.y);

      // 相机跟随
      SF.renderer.cam.x = lerp(SF.renderer.cam.x, this.x, Math.min(1, dt * 5));
      SF.renderer.cam.y = lerp(SF.renderer.cam.y, this.y, Math.min(1, dt * 5));

      // 无敌帧
      if (this.invulnT > 0) this.invulnT -= dt;
      if (this.weaponLockT > 0) this.weaponLockT -= dt;
      if (this.hurtFlash > 0) this.hurtFlash -= dt;
      this.visT += dt;

      // 霜翎：周期计时保持 5 秒一轮；无敌期间进度圈保持满，结束后视觉进度从 0 重新积累。
      if (this.traits.cycleInvuln) {
        this.cycleInvulnCd -= dt;
        if (this.phaseInvulnT > 0) {
          this.phaseInvulnT -= dt;
          if (this.phaseInvulnT <= 0) {
            this.phaseInvulnT = 0;
            this.cycleInvulnRingMax = Math.max(0.001, this.cycleInvulnCd);
            this.cycleInvulnRingCd = this.cycleInvulnRingMax;
          }
        } else {
          this.cycleInvulnRingCd = Math.max(0, this.cycleInvulnRingCd - dt);
          if (this.cycleInvulnCd <= 0) {
            this.cycleInvulnCd = SF.config.FIREFLY_CYCLE_INTERVAL;
            this.cycleInvulnRingMax = SF.config.FIREFLY_CYCLE_INTERVAL;
            this.cycleInvulnRingCd = 0;
            this.phaseInvulnT = Math.min(SF.config.FIREFLY_CYCLE_INVULN_CAP, this.stats.phaseInvulnDuration);
            this.iceRetaliationUsed = false;
            SF.particles.ring(this.x, this.y, { color: 'ice2', maxR: 20, life: 0.45 });
            SF.audio.sfx.uiTick();
          }
        }
      }

      // 再生
      const repair = this.hp < this.stats.maxHp * SF.config.EMERGENCY_REPAIR_HP_RATIO ? this.stats.emergencyRegen : 0;
      const regen = this.stats.regen + repair;
      if (regen > 0 && this.hp < this.stats.maxHp) {
        this.regenPool += regen * dt;
        if (this.regenPool >= 1) {
          const n = Math.floor(this.regenPool);
          this.heal(n, true);
          this.regenPool -= n;
        }
      }

      // 壁垒矩阵提供额外回充，可与铁壁特质叠加；其它机体也可通过矩阵获得护盾。
      const shieldEvery = this.stats.shieldEvery > 0 ? this.stats.shieldEvery : (this.traits.regenShield ? SF.config.SHIELD_REGEN_INTERVAL : 0);
      if (shieldEvery > 0) {
        this.shieldTimer += dt;
        if (this.shieldTimer >= shieldEvery) {
          this.shieldTimer -= shieldEvery;
          const amt = (this.stats.shieldAmt || 0) + (this.traits.regenShield ? SF.config.SHIELD_REGEN_AMT : 0);
          this.shield = Math.min(this.shield + amt, SF.config.SHIELD_CAP);
          SF.particles.ring(this.x, this.y, { color: 'gold', maxR: 16, life: 0.4 });
        }
      }

      // 武器
      if (input.isPressed('skill')) this.activateFireOverdrive();
      this.updateResonance();
      for (const w of this.weapons) w.update(dt, game);

      // 拖尾
      if (this.moving && Math.random() < 0.35) {
        SF.particles.trail(this.x - mv.x * 4, this.y - mv.y * 4 + 3, { color: this.char.color, life: 0.3, size: 1.5, vx: -mv.x * 20, vy: -mv.y * 20 });
      }
    }

    get collisionGuard() { return this.weapons.some(w => w.def.collisionGuard); }

    takeDamage(dmg, source = {}) {
      if (this.dead) return 0;
      // 霜翎周期防反：命中窗口内免疫本次伤害，但保留一次反制冰域。
      // 普通受击无敌仍然只免伤，不触发防反。
      if (this.phaseInvulnT > 0) {
        if (dmg > 0) this.triggerIceRetaliation(source);
        return 0;
      }
      if (this.invulnT > 0) return 0;
      const s = this.stats;
      const guarded = this.collisionGuard;
      const shieldBefore = this.shield;
      if (guarded && source.type === 'contact') {
        dmg *= SF.config.COLLISION_GUARD.damageTakenMul;
        const enemy = source.attacker;
        if (shieldBefore > 0 && source.contactStart !== false && enemy && !enemy.dead && source.game) {
          const value = shieldBefore * SF.config.COLLISION_GUARD.damagePerShieldLevel * source.game.level;
          enemy.takeDamage(value, source.game, 'armor0', { fixed: true });
          if (!enemy.dead && !enemy.def.boss && !enemy.def.elite) {
            enemy.knockback(this.x, this.y, SF.config.COLLISION_GUARD.knockback);
          }
          SF.particles.ring(enemy.x, enemy.y, { color: 'armor0', maxR: 16, life: 0.25, width: 2 });
          SF.particles.spark(enemy.x, enemy.y, Math.atan2(enemy.y-this.y,enemy.x-this.x),
            { color: 'white', count: 6, speed: 85 });
        }
      }
      let d = Math.max(0, dmg - s.armor - (this.shield > 0 ? s.shieldArmor : 0));
      // 护盾优先
      if (this.shield > 0) {
        const abs = Math.min(this.shield, d);
        this.shield -= abs; d -= abs;
        if (abs > 0) {
          this.shieldDiscEmpowered = true;
          if (this.traits.regenShield) {
            const shock = SF.config.ARMOR_SHOCK;
            this.armorShockCharge = Math.min(shock.threshold, this.armorShockCharge + abs);
            if (this.armorShockCharge >= shock.threshold && this.armorShockCd <= 0 && source.game) {
              this.armorShockCharge = 0;
              this.armorShockCd = shock.cooldown;
              this.triggerArmorShock(source.game);
            }
          }
        }
      }
      if (guarded && shieldBefore > 0) {
        if (this.shield === 0) {
          this.invulnT = s.invulnTime + (s.invulnBonus || 0);
          SF.particles.ring(this.x, this.y, { color: 'white', maxR: 24, life: 0.35, width: 2 });
        }
        return 0; // 这一击只扣护盾；破盾溢出不得扣血。
      }
      if (d <= 0) return 0;
      this.hp -= d;
      this.invulnT = s.invulnTime + (s.invulnBonus || 0);
      this.hurtFlash = 0.25;
      SF.renderer.addShake(SF.config.SCREEN_SHAKE_HURT, 0.2);
      SF.particles.burst(this.x, this.y, { color: 'uiWarn', count: 8, speed: 70, life: 0.4 });
      SF.particles.floatText(this.x, this.y - 10, `-${Math.round(d)}`, { color: SF.palette.css('uiWarn'), size: 9 });
      SF.audio.sfx.playerHurt();
      // 霜翎：受击加速
      if (this.traits.hurtSpeedBoost) this.speedBoostT = 2;
      if (this.hp <= 0) this.die();
      return d;
    }

    triggerArmorShock(game) {
      const { radius, damage, knockback } = SF.config.ARMOR_SHOCK;
      const radius2 = radius * radius;
      for (const e of game.enemies.list) {
        if (e.dead || dist2(this.x, this.y, e.x, e.y) > radius2) continue;
        e.takeDamage(damage * this.stats.damageMul, game, 'hero1');
        e.knockback(this.x, this.y, knockback);
      }
      this.armorShockFlashT = 0.65;
      SF.particles.ring(this.x, this.y, { color: 'armor0', maxR: radius, life: 0.35, width: 2 });
      SF.particles.ring(this.x, this.y, { color: 'hero1', maxR: radius * 0.8, life: 0.28, width: 0.8 });
      SF.particles.burst(this.x, this.y, { color: 'armor0', count: 8, speed: 85, life: 0.22, size: 1.5 });
      SF.audio.sfx.armorShock();
    }

    // 同一轮火系齐射共享 attack。灼烧和火海不计热，超载发射的在途弹也不能回填。
    onFireHit(attack) {
      if (!this.traits.fireOverdrive || !attack || attack.heatUsed || this.dead) return;
      // 首次有效命中就消费齐射凭据；被间隔/停滞挡住的旧弹不能靠后续接触补计热。
      attack.heatUsed = true;
      const heat = SF.config.VEGA_HEAT;
      if (attack.heatEligible === false || this.weaponLockT > 0 || this.fireOverdriveT > 0
        || this.heatGateT > 0 || this.heat >= heat.threshold) return;
      this.heatGateT = heat.interval;
      this.heat++;
      if (this.heat === heat.threshold) {
        SF.particles.spark(this.x, this.y - 11, -Math.PI / 2, { color: 'fire2', count: 6, speed: 30, life: 0.35 });
        SF.audio.sfx.heatReady();
      }
    }

    setFireOverdrive(duration) {
      const C = SF.config, activeMul = C.VEGA_HEAT.cooldownMul;
      const before = this.fireOverdriveT > 0 ? activeMul : C.FIRE_COOLDOWN_MUL;
      const after = duration > 0 ? activeMul : C.FIRE_COOLDOWN_MUL;
      this.fireOverdriveT = duration;
      // 开启/结束都保留冷却进度，不能重置出免费齐射，也不等完整的旧冷却。
      for (const w of this.weapons) if (w.def.element === 'fire') w.cdTimer *= after / before;
    }

    activateFireOverdrive() {
      const heat = SF.config.VEGA_HEAT;
      if (!this.traits.fireOverdrive || this.dead || this.weaponLockT > 0
        || this.fireOverdriveT > 0 || this.heat < heat.threshold) return false;
      this.heat = 0;
      this.heatGateT = heat.interval;
      this.setFireOverdrive(heat.duration);
      SF.particles.ring(this.x, this.y, { color: 'fire2', maxR: 26, life: 0.5, width: 2 });
      SF.particles.burst(this.x, this.y, { color: 'fire1', count: 16, speed: 55, life: 0.45 });
      SF.audio.sfx.fireOverdrive();
      return true;
    }

    triggerIceRetaliation(source = {}) {
      if (!this.traits.iceStack || this.iceRetaliationUsed || !source.game) return;
      const weapon = this.weapons.find(w => w.def.element === 'ice');
      if (!weapon || !SF.projectiles?.spawnIceRetaliationField) return;
      this.iceRetaliationUsed = true;
      this.counterFlashT = 0.7;
      const frostWeapon = this.weapons.find(w => w.def.id === 'mirrorWheel');
      if (frostWeapon) frostWeapon.frostEmpowered = true;
      const spec = weapon.scaledSpec(this);
      const damage = weapon.rollDamage(spec.damage, this);
      const isSuper = !!weapon.def.super;
      const attacker = source.attacker && typeof source.attacker.x === 'number' ? source.attacker : null;
      const centerX = attacker ? attacker.x : (typeof source.x === 'number' ? source.x : this.x);
      const centerY = attacker ? attacker.y : (typeof source.y === 'number' ? source.y : this.y);
      const primaryUid = attacker?.uid;
      const iceAreaMul = (this.stats.areaMul || 1) * (1 + (this.stats.iceAreaMul || 0));
      const radius = isSuper
        ? Math.max(SF.config.FIREFLY_ICE_RETALIATE_SUPER_RADIUS * iceAreaMul, spec.radius || 0)
        : (SF.config.FIREFLY_ICE_RETALIATE_BASE_RADIUS
          + Math.max(0, weapon.level - 1) * SF.config.FIREFLY_ICE_RETALIATE_LEVEL_RADIUS) * iceAreaMul;
      const life = isSuper
        ? SF.config.FIREFLY_ICE_RETALIATE_SUPER_LIFE
        : SF.config.FIREFLY_ICE_RETALIATE_BASE_LIFE + Math.max(0, weapon.level - 1) * SF.config.FIREFLY_ICE_RETALIATE_LEVEL_LIFE;
      SF.projectiles.spawnIceRetaliationField(centerX, centerY, {
        radius, life, damage, slow: spec.slow, freeze: spec.freeze, primaryUid,
      }, source.game);
    }

    die() {
      if (this.stats.revive > 0 && !this.revived) {
        this.revived = true;
        this.hp = Math.floor(this.stats.maxHp * 0.5);
        this.invulnT = 2.5;
        SF.particles.ring(this.x, this.y, { color: 'hero0', maxR: 80, life: 0.8, width: 3 });
        SF.particles.floatText(this.x, this.y - 16, '极寒重启！', { color: SF.palette.css('ice1'), size: 12, life: 1.2 });
        SF.audio.sfx.evolve();
        return;
      }
      this.hp = 0;
      this.dead = true;
      this.heat = 0;
      this.heatGateT = 0;
      this.fireOverdriveT = 0;
      this.armorShockCharge = 0;
      this.shieldDiscEmpowered = false;
      for (const w of this.weapons) {
        w.charges = 0; w.chargeT = 0; w.frostEmpowered = false;
      }
      SF.particles.burst(this.x, this.y, { color: 'hero0', count: 24, speed: 120, life: 0.8, size: 3 });
      SF.audio.sfx.defeat();
    }

    heal(n, silent = false) {
      this.hp = Math.min(this.stats.maxHp, this.hp + n);
      if (!silent) SF.particles.floatText(this.x, this.y - 12, `+${n}`, { color: SF.palette.css('hero0'), size: 8 });
    }

    draw(ctx) {
      const R = SF.renderer;
      const pal = SF.palette;
      // 闪烁期间半透明
      const blink = this.invulnT > 0 && Math.floor(this.invulnT * 12) % 2 === 0;
      const color = this.char.color;
      const spriteName = 'player_' + this.char.id;
      const img = this.hurtFlash > 0 ? SF.sprites.glow(spriteName, pal.css('white'), 2) : SF.sprites.get(spriteName);
      const s = R.toScreen(this.x, this.y);
      // 超载的贴身火焰只做表现，无接触伤害；敌弹仍在所有友方特效之上绘制。
      if (this.fireOverdriveT > 0) {
        R.glow(this.x, this.y, 22, 'fire1', 0.3);
        ctx.save(); ctx.translate(s.x, s.y);
        for (let i = 0; i < 8; i++) {
          const angle = i * Math.PI / 4 + this.visT * 0.7;
          const flame = 3 + 2 * Math.sin(this.visT * 13 + i * 2);
          ctx.save(); ctx.rotate(angle);
          ctx.fillStyle = pal.css(i % 2 ? 'fire2' : 'fire1', 0.65);
          ctx.beginPath(); ctx.moveTo(9, -2); ctx.quadraticCurveTo(14 + flame, -4, 14 + flame, 1);
          ctx.quadraticCurveTo(11, 0, 9, 2); ctx.closePath(); ctx.fill(); ctx.restore();
        }
        ctx.restore();
      }
      const exhaust = this.moving ? 7 : 3.5;
      const flicker = 0.85 + Math.sin(this.visT * 29) * 0.15;
      R.glow(this.x, this.y + 4, 16, color, 0.3);
      ctx.save(); ctx.globalAlpha = blink ? 0.45 : 1;
      const jet = ctx.createLinearGradient(s.x, s.y + 5, s.x, s.y + 5 + exhaust);
      jet.addColorStop(0, pal.css(color, 0.9)); jet.addColorStop(1, pal.css(color, 0));
      ctx.fillStyle = jet;
      for (const offset of [-2, 2]) {
        ctx.beginPath(); ctx.moveTo(s.x + offset - 0.8, s.y + 5); ctx.lineTo(s.x + offset + 0.8, s.y + 5);
        ctx.lineTo(s.x + offset, s.y + 5 + exhaust * flicker); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      R.drawSprite(img, this.x, this.y, { alpha: blink ? 0.45 : 1 });
      // 小型航标让玩家在密集火力中仍易定位。
      ctx.fillStyle = pal.css(color, 0.8);
      ctx.fillRect(s.x - 0.75, s.y - 11, 1.5, 1.5);
      // 满热以两侧短鳍发亮提示；不覆盖舰体与敌弹轮廓。
      if (this.traits.fireOverdrive && this.heat >= SF.config.VEGA_HEAT.threshold) {
        ctx.save(); ctx.strokeStyle = pal.css('fire2', 0.65 + 0.25 * Math.sin(this.visT * 7)); ctx.lineWidth = 1;
        for (const side of [-1, 1]) {
          ctx.beginPath(); ctx.moveTo(s.x + side * 7, s.y - 5);
          ctx.lineTo(s.x + side * 10, s.y); ctx.lineTo(s.x + side * 7, s.y + 5); ctx.stroke();
        }
        ctx.restore();
      }
      // 霜翎周期无敌进度：只显示角色头顶的小圈，不显示文字。
      if (this.traits.cycleInvuln) {
        const interval = SF.config.FIREFLY_CYCLE_INTERVAL;
        const pct = this.phaseInvulnT > 0
          ? 1
          : 1 - Math.max(0, Math.min(1, this.cycleInvulnRingCd / Math.max(0.001, this.cycleInvulnRingMax || interval)));
        ctx.save();
        ctx.strokeStyle = pal.css('ice1', 0.22);
        ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.arc(s.x, s.y - 16, 2.1, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = pal.css(this.phaseInvulnT > 0 ? 'ice2' : 'ice1', this.phaseInvulnT > 0 ? 0.95 : 0.8);
        ctx.lineWidth = this.phaseInvulnT > 0 ? 0.8 : 0.6;
        ctx.beginPath(); ctx.arc(s.x, s.y - 16, 2.1, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct); ctx.stroke();
        ctx.restore();
      }
      // 护盾环
      if (this.shield > 0) {
        R.strokeCircle(this.x, this.y, 9, pal.css('gold'), 1, 0.6);
      }
      // 武器停滞（BOSS2 深渊停滞）：灰色断链环 = 当前无法攻击/蓄力
      if (this.weaponLockT > 0) {
        const pulse = 0.5 + 0.5 * Math.sin(this.visT * 10);
        ctx.save(); ctx.setLineDash([3, 3]);
        R.strokeCircle(this.x, this.y, 12 + pulse, pal.css('uiDim'), 1, 0.7);
        ctx.restore();
        SF.font.drawText(ctx, '停滞 ' + this.weaponLockT.toFixed(1) + 's', s.x, s.y + 17, {size: 6, color: 'silver', align: 'center'});
      }
    }
  }

  SF.Player = Player;
})();
