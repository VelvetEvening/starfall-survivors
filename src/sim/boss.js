/* ============================================================
 * boss.js — BOSS 专属 AI（数据驱动的多段攻击轮换）
 * BOSS1 湮灭之眼：环形 / 扇形狙击 / 冲撞八向激光 / 召唤
 * BOSS2 深渊君王：环形 / 螺旋 / 扇形狙击 / 交叉封锁 / 召唤精英 / 向心收拢
 *                + 二阶段专属：冲撞弹幕 / 深渊停滞（phase2Only）
 * 血量阶段：BOSS1 66% / 33% 提升攻速；BOSS2 50% 狂怒（转阶立释停滞）
 * ============================================================ */
(function () {
  'use strict';
  const SF = (window.SF = window.SF || {});
  const { TAU, angleTo, rand } = SF.util;

  // 攻击段执行器表（key 与 def.attacks 字段一一对应）
  // BOSS 弹幕默认 'elite' 金色警示弹 + 内部提速系数（比小怪弹明显更快）；
  // 攻击可带 color 字段覆盖（BOSS2 高伤弹幕用 'darkRed' 深暗红 = 最高危）
  const BOSS_BULLET_BOOST = 1.25;
  const ATTACKS = {
    // 环形弹幕
    ring(boss, A, game) {
      const n = A.count + game._bossPhase * 4;
      const col = A.color || 'elite';
      for (let i = 0; i < n; i++) {
        const ang = (TAU / n) * i + rand(0.1);
        SF.projectiles.spawnEnemyBullet(boss.x, boss.y, ang, A.speed * BOSS_BULLET_BOOST, A.damage, col, boss);
      }
      SF.particles.ring(boss.x, boss.y, { color: col, maxR: 50, life: 0.4 });
      SF.audio.sfx.bossWarn();
      return A.cd;
    },

    // 螺旋弹幕：多臂旋转持续喷射（duration 秒内按 rate 间隔出弹）
    spiral(boss, A, game) {
      boss._spiral = {
        t: 0, duration: A.duration,
        angle: rand(TAU), arms: A.arms, rate: A.rate,
        speed: A.speed * BOSS_BULLET_BOOST, damage: A.damage, acc: 0,
        color: A.color || 'elite',
      };
      return A.cd + A.duration; // 喷射期间不切换攻击
    },

    // 扇形狙击
    aimed(boss, A, game) {
      const n = A.count + game._bossPhase;
      const base = angleTo(boss.x, boss.y, game.player.x, game.player.y);
      const col = A.color || 'elite';
      for (let i = 0; i < n; i++) {
        const ang = base + (i - (n - 1) / 2) * (A.spread / n) * 2;
        SF.projectiles.spawnEnemyBullet(boss.x, boss.y, ang, A.speed * BOSS_BULLET_BOOST, A.damage, col, boss);
      }
      return A.cd;
    },

    // 冲撞 → 短暂预警 → 8 方向超远距激光（BOSS1 专属）
    // 激光长度远超屏幕：只要 BOSS 在屏幕内，站上预警线的玩家不移动必被击中，
    // 只能拉开足够远或躲进相邻光束的夹角缝隙规避
    dashLaser(boss, A, game) {
      boss._dashLaser = {
        t: 0, stage: 'dash',
        dashAngle: angleTo(boss.x, boss.y, game.player.x, game.player.y),
        dashSpeed: A.dashSpeed, dashTime: A.dashTime,
        telegraph: A.telegraph, dirs: A.dirs,
        length: A.length, width: A.width, damage: A.damage,
        base: 0,
      };
      SF.audio.sfx.bossWarn();
      return A.cd + A.dashTime + A.telegraph; // 整段流程内不切换攻击
    },

    // 高伤冲撞 → 到达目的地后爆出一圈深暗红弹幕（BOSS2 二阶段专属）
    dashBurst(boss, A, game) {
      boss._dashBurst = {
        t: 0,
        dashAngle: angleTo(boss.x, boss.y, game.player.x, game.player.y),
        dashSpeed: A.dashSpeed, dashTime: A.dashTime,
        count: A.count, speed: A.speed, damage: A.damage, color: A.color || 'darkRed',
      };
      SF.particles.flash(boss.x, boss.y, { color: 'darkRed', size: 12, life: 0.3 });
      SF.audio.sfx.bossWarn();
      return A.cd + A.dashTime; // 冲撞期间不切换攻击
    },

    // 深渊停滞：冻结玩家全部武器的冷却与蓄力（BOSS2 二阶段专属；转阶段首次 10 秒）
    stasis(boss, A, game) {
      const pl = game.player;
      pl.weaponLockT = Math.max(pl.weaponLockT, A.duration); // 不缩短仍在进行的停滞
      SF.particles.ring(pl.x, pl.y, { color: 'uiWarn', maxR: 34, life: 0.6, width: 2 });
      SF.particles.floatText(pl.x, pl.y - 16, `⚠ 武器停滞 ${A.duration} 秒！`, { color: SF.palette.css('uiWarn'), size: 10, life: 1.2 });
      SF.audio.sfx.bossWarn();
      return A.cd;
    },

    // 交叉封锁：多个方向各发一连串直线弹
    cross(boss, A, game) {
      const col = A.color || 'elite';
      for (let d = 0; d < A.dirs; d++) {
        const base = (TAU / A.dirs) * d + rand(0.2);
        for (let v = 0; v < A.volley; v++) {
          // 用 delay 风格的连发：直接以不同速度错开发射间距
          const sp = A.speed * BOSS_BULLET_BOOST * (1 - v * 0.12);
          SF.projectiles.spawnEnemyBullet(boss.x, boss.y, base, sp, A.damage, col, boss);
        }
      }
      SF.particles.ring(boss.x, boss.y, { color: col, maxR: 60, life: 0.5 });
      return A.cd;
    },

    // 深渊强化：全场精英的下一次攻击伤害更高、弹幕更多（弹幕转深暗红）
    empower(boss, A, game) {
      for (const e of game.enemies.list) {
        if (e.dead || !e.def.elite || e.isBoss) continue;
        e.empowerT = A.duration;
        SF.particles.flash(e.x, e.y, { color: 'darkRed', size: 10, life: 0.35 });
      }
      SF.particles.ring(boss.x, boss.y, { color: 'darkRed', maxR: 170, life: 0.6, width: 2 });
      SF.audio.sfx.bossWarn();
      return A.cd;
    },

    // 技能召唤只生成贴身精英；BOSS 战普通小怪由 Spawner 的独立四周波次负责。
    summon(boss, A, game) {
      if (A.eliteTypes && A.eliteTypes.length) {
        const C = SF.config;
        // 召唤精英同屏上限：达到上限就跳过本轮精英召唤，防召唤流无限堆积
        const cap = C.BOSS_SUMMON_ELITE_CAP;
        let alive = 0;
        for (const e of game.enemies.list) {
          if (!e.dead && e.def.elite && e.def.summoned) alive++;
        }
        const isBoss2 = game.spawner && game.spawner.bossIdx >= 2;
        const difficultyHp = (game.difficulty || C.DIFFICULTIES.normal).hpMul;
        const scale = (isBoss2 ? C.SUMMON_ELITE_HP_MUL_B2 : C.SUMMON_ELITE_HP_MUL) * difficultyHp;
        const each = A.eliteCount || 1;
        const requested = A.eliteTypes.length * each;
        let spawned = 0;
        for (const eid of A.eliteTypes) {
          for (let i = 0; i < each && alive < cap; i++) {
            const eliteDef = SF.enemies[eid];
            const ang = (TAU / requested) * spawned + rand(-0.12, 0.12);
            const radius = boss.radius + eliteDef.radius + 4;
            const elite = game.enemies.spawnAt(eid, boss.x + Math.cos(ang) * radius,
              boss.y + Math.sin(ang) * radius, scale, 0);
            if (elite) { alive++; spawned++; }
          }
        }
        if (spawned > 0) SF.widgets.toast(`⚠ ${A.eliteTypes.map(id => SF.enemies[id].name).join('、')} 被召唤！`);
      }
      SF.particles.burst(boss.x, boss.y, { color: 'enemy0', count: 14, speed: 70, life: 0.5 });
      return A.cd;
    },

    // 向心收拢弹：以玩家为中心的圆周上朝圆心发射
    burst(boss, A, game) {
      const pl = game.player;
      const R = A.radius;
      const n = A.count;
      const col = A.color || 'elite';
      for (let i = 0; i < n; i++) {
        const a = (TAU / n) * i + rand(0.2);
        const bx = pl.x + Math.cos(a) * R;
        const by = pl.y + Math.sin(a) * R;
        SF.projectiles.spawnEnemyBullet(bx, by, a + Math.PI, A.speed * BOSS_BULLET_BOOST, A.damage, col, boss);
      }
      SF.particles.ring(pl.x, pl.y, { color: col, maxR: R, life: 0.6, width: 2 });
      SF.audio.sfx.bossWarn();
      return A.cd;
    },
  };

  function updateBoss(boss, dt, game) {
    const player = game.player;
    const A = boss.def.attacks;
    let phase, phaseMul;
    if (boss.def.twoPhase) {
      // BOSS2 双阶段：血量 ≤50% 进入狂怒阶段（攻击间隔大幅缩短 + 弹幕增量 + 解锁二阶段专属技能）
      phase = boss.hp / boss.maxHp > 0.5 ? 0 : 1;
      if (phase === 1 && !boss._phase2) {
        boss._phase2 = true;
        SF.widgets.toast('⚠⚠ 深渊君王 进入狂怒阶段！', 3);
        SF.particles.ring(boss.x, boss.y, { color: 'darkRed', maxR: 140, life: 0.8, width: 3 });
        SF.audio.sfx.bossWarn();
        // 转阶段立刻释放「深渊停滞」：首次 10 秒武器冻结（此后轮换中每次 3 秒）
        if (A.stasis) ATTACKS.stasis(boss, { cd: A.stasis.cd, duration: SF.config.BOSS_STASIS_FIRST_DURATION }, game);
      }
      phaseMul = phase === 1 ? 0.6 : 1;
    } else {
      // BOSS1 三段血线：66% / 33% 提升攻速
      phase = boss.hp / boss.maxHp > 0.66 ? 0 : boss.hp / boss.maxHp > 0.33 ? 1 : 2;
      phaseMul = 1 - phase * 0.22; // 攻击间隔缩短
    }
    if (game._bossPhase !== phase) SF.audio.setBossPhase?.(phase);
    game._bossPhase = phase;

    // ---- 螺旋弹幕持续喷射 ----
    if (boss._spiral) {
      const sp = boss._spiral;
      sp.t += dt;
      sp.acc += dt;
      sp.angle += dt * SF.config.BOSS_SPIRAL_ROT; // 旋转角速度
      if (sp.acc >= sp.rate) {
        sp.acc = 0;
        for (let arm = 0; arm < sp.arms; arm++) {
          const ang = sp.angle + (TAU / sp.arms) * arm;
          SF.projectiles.spawnEnemyBullet(boss.x, boss.y, ang, sp.speed, sp.damage, sp.color, boss);
        }
      }
      if (sp.t >= sp.duration) boss._spiral = null;
    }

    // ---- 冲撞弹幕 状态机（高速撞向玩家，到达后爆出深暗红弹幕） ----
    if (boss._dashBurst) {
      const D = boss._dashBurst;
      D.t += dt;
      boss.x += Math.cos(D.dashAngle) * D.dashSpeed * dt;
      boss.y += Math.sin(D.dashAngle) * D.dashSpeed * dt;
      if (Math.random() < 0.5) SF.particles.trail(boss.x, boss.y, { color: 'darkRed', life: 0.25, size: 2 });
      if (D.t >= D.dashTime) {
        for (let i = 0; i < D.count; i++) {
          const ang = (TAU / D.count) * i + rand(0.1);
          SF.projectiles.spawnEnemyBullet(boss.x, boss.y, ang, D.speed, D.damage, D.color, boss);
        }
        SF.particles.ring(boss.x, boss.y, { color: 'darkRed', maxR: 60, life: 0.5, width: 2 });
        SF.renderer.addShake(3, 0.2);
        SF.audio.sfx.explosion();
        boss._dashBurst = null;
      }
    } else if (boss._dashLaser) {
      const L = boss._dashLaser;
      L.t += dt;
      if (L.stage === 'dash') {
        boss.x += Math.cos(L.dashAngle) * L.dashSpeed * dt;
        boss.y += Math.sin(L.dashAngle) * L.dashSpeed * dt;
        if (Math.random() < 0.5) SF.particles.trail(boss.x, boss.y, { color: 'enemy2', life: 0.25, size: 2 });
        if (L.t >= L.dashTime) {
          L.stage = 'telegraph'; L.t = 0;
          // 锁定 8 向：一线直指玩家当前位置（站线上不动 = 被击中），其余均匀环绕
          L.base = angleTo(boss.x, boss.y, player.x, player.y);
          SF.audio.sfx.bossWarn();
        }
      } else if (L.stage === 'telegraph') {
        if (L.t >= L.telegraph) {
          // 发射：对锁定的每条射线做点到射线距离判定，命中一次即止
          const dmul = (game.difficulty || SF.config.DIFFICULTIES.normal).dmgMul;
          const dx = player.x - boss.x, dy = player.y - boss.y;
          for (let i = 0; i < L.dirs; i++) {
            const ang = L.base + (TAU / L.dirs) * i;
            const ca = Math.cos(ang), sa = Math.sin(ang);
            const proj = dx * ca + dy * sa;            // 沿射线投影（<0 在身后）
            if (proj < 0 || proj > L.length) continue;
            const perp = Math.abs(dx * sa - dy * ca);  // 到射线垂距
            if (perp <= L.width + player.radius) {
              player.takeDamage(L.damage * dmul, {
                type: 'bossLaser', owner: 'boss', attacker: boss, x: boss.x, y: boss.y, game,
              });
              break;
            }
          }
          // 光束视觉：复用 lightning 渐隐线段（金色核心 + 红色外晕）
          for (let i = 0; i < L.dirs; i++) {
            const ang = L.base + (TAU / L.dirs) * i;
            game.lightning.push({
              points: [
                { x: boss.x, y: boss.y },
                { x: boss.x + Math.cos(ang) * L.length, y: boss.y + Math.sin(ang) * L.length },
              ],
              t: 0, life: 0.35, color: 'elite', color2: 'enemy2',
            });
          }
          SF.particles.burst(boss.x, boss.y, { color: 'enemy2', count: 16, speed: 120, life: 0.4 });
          SF.renderer.addShake(3, 0.2);
          SF.audio.sfx.laserStart();
          boss._dashLaser = null;
        }
      }
    } else {
      // ---- 缓慢追击（BOSS 减速抗性：冰系只对其产生 30% 减速，永不完全冻结） ----
      const a = angleTo(boss.x, boss.y, player.x, player.y);
      const slowK = boss.slowT > 0 ? 1 - (1 - boss.slowFactor) * SF.config.BOSS_SLOW_EFFECT : 1;
      const spd = boss.speed * (1 + phase * 0.15) * slowK;
      boss.x += Math.cos(a) * spd * dt;
      boss.y += Math.sin(a) * spd * dt;
    }

    boss.attackCd -= dt;
    if (boss.attackCd <= 0 && !boss._spiral && !boss._dashLaser && !boss._dashBurst) {
      // 数据驱动的攻击轮换（phase2Only 技能只在狂怒阶段进入轮换）
      const keys = Object.keys(A).filter(k => !A[k].phase2Only || phase === 1);
      boss.attackIdx = ((boss.attackIdx || 0) + 1) % keys.length;
      const key = keys[boss.attackIdx];
      const fn = ATTACKS[key];
      if (fn) {
        const base = fn(boss, A[key], game);
        // noPhaseScale：狂怒阶段不缩短该技能冷却（如深渊停滞固定 15 秒）
        boss.attackCd = A[key].noPhaseScale ? base : base * phaseMul;
      } else boss.attackCd = 1.5;
    }
  }

  SF.bossAI = { updateBoss };
})();
