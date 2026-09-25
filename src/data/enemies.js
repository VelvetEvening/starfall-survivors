/* ============================================================
 * enemies.js — 敌人数据表 + BOSS + 波次导演
 * ai: chase 追踪 / dash 冲刺 / shoot 远程 / drift 分裂漂浮
 * ============================================================ */
(function () {
  'use strict';
  const SF = (window.SF = window.SF || {});

  SF.enemies = {
    grub: {
      id: 'grub', name: '星虱', sprite: 'grub', ai: 'chase',
      hp: 10, speed: 34, damage: 8, xp: 1, radius: 4,
    },
    crab: {
      id: 'crab', name: '浮岩蟹', sprite: 'crab', ai: 'chase',
      hp: 32, speed: 20, damage: 12, xp: 2, radius: 6,
    },
    falcon: {
      id: 'falcon', name: '疾风隼', sprite: 'falcon', ai: 'dash',
      hp: 14, speed: 46, damage: 10, xp: 2, radius: 5,
      dash: { cd: 3.2, windup: 0.6, speed: 220 },
    },
    jelly: {
      id: 'jelly', name: '裂隙水母', sprite: 'jelly', ai: 'drift',
      hp: 24, speed: 26, damage: 10, xp: 3, radius: 7,
      split: { into: 'grub', count: 2 },
    },
    turret: {
      id: 'turret', name: '虚空炮台', sprite: 'turret', ai: 'shoot',
      hp: 28, speed: 14, damage: 8, xp: 3, radius: 7,
      shoot: { cd: 2.6, range: 150, speed: 90 },
    },

    // ---- 精英（宝箱掉落）----
    // 定位：流程中段的迷你 Boss——血量走小怪曲线 ×0.78，伤害高于小怪且金色警示弹明显更疼
    // 远程型：金色快弹三连发，高伤警示
    eliteGrub: {
      id: 'eliteGrub', name: '星虱王', sprite: 'eliteGrub', ai: 'chaseShoot', elite: true,
      hp: 240, speed: 30, damage: 20, xp: 20, radius: 10, chest: true,
      shoot: { cd: 2.4, range: 190, speed: 180, dmg: 26, volley: 3 },
    },
    // 近战型：冲刺撞击 + 冲撞收招扩散弹幕
    eliteCrab: {
      id: 'eliteCrab', name: '浮岩卫士', sprite: 'eliteCrab', ai: 'dash', elite: true,
      hp: 400, speed: 22, damage: 26, xp: 30, radius: 11, chest: true,
      dash: { cd: 2.6, windup: 0.5, speed: 260, barrage: { count: 10, speed: 150, dmg: 22 } },
    },
    // BOSS 召唤专用精英（无宝箱，防刷）
    eliteGrubSummon: {
      id: 'eliteGrubSummon', name: '虚空之影', sprite: 'eliteGrub', ai: 'chaseShoot', elite: true, summoned: true,
      hp: 240, speed: 30, damage: 20, xp: 20, radius: 10,
      shoot: { cd: 2.4, range: 190, speed: 180, dmg: 26, volley: 3 },
    },
    eliteCrabSummon: {
      id: 'eliteCrabSummon', name: '暗岩守卫', sprite: 'eliteCrab', ai: 'dash', elite: true, summoned: true,
      hp: 400, speed: 22, damage: 26, xp: 30, radius: 11,
      dash: { cd: 2.6, windup: 0.5, speed: 260, barrage: { count: 10, speed: 150, dmg: 22 } },
    },

    // ---- BOSS 1（4 分钟）：湮灭之眼 ----
    boss: {
      id: 'boss', name: '湮灭之眼', sprite: 'boss', ai: 'boss', boss: true,
      hp: 12000, speed: 26, damage: 26, xp: 200, radius: 18,
      attacks: {
        // 弹幕伤害梯度（终盘对齐，保证 金色 ≥ 小怪满成长、深暗红 = 全场最高危）：
        // 小怪红弹 31.5 → 精英/BOSS 金弹 26→32.5 → 强化金弹 52 → BOSS2 深暗红 56
        ring:  { cd: 5.0, count: 16, speed: 85, damage: 26 },  // 环形弹幕
        aimed: { cd: 3.2, count: 5, speed: 130, damage: 26, spread: 0.5 }, // 扇形狙击
        // 冲撞 → 1s 预警 → 8 方向超远距激光（长度 2400 横贯屏幕；站线上不动必被击中）
        dashLaser: { cd: 6.4, dashSpeed: 330, dashTime: 0.45, telegraph: 1.0, dirs: 8, length: 2400, width: 7, damage: 24 },
        // 召唤：只在 BOSS 身边生成近战(≈1/3 血) + 远程(≈1/5 血)精英各 1。
        summon: { cd: 9.0, eliteCount: 1, eliteTypes: ['eliteCrabSummon', 'eliteGrubSummon'] },
      },
    },

    // ---- BOSS 2（8 分钟）：深渊君王 · 厄兆 ----
    boss2: {
      id: 'boss2', name: '深渊君王·厄兆', sprite: 'boss', ai: 'boss', boss: true, twoPhase: true,
      hp: 24000, speed: 34, damage: 34, xp: 600, radius: 22,
      attacks: {
        ring:   { cd: 4.0, count: 26, speed: 100, damage: 56, color: 'darkRed' },          // 环形弹幕（最高伤：深暗红）
        spiral: { cd: 5.5, arms: 3, duration: 2.2, speed: 90, damage: 34, rate: 0.1 }, // 螺旋弹幕（密度型，rate 放宽换单发上梯度）
        aimed:  { cd: 2.4, count: 9, speed: 160, damage: 34, spread: 0.7 }, // 扇形狙击
        cross:  { cd: 6.5, dirs: 8, volley: 3, speed: 130, damage: 34 },   // 交叉封锁
        // 深渊强化：全场精英下一次攻击伤害 ×1.6、弹幕更多（深暗红弹）
        empower: { cd: 12.0, duration: 10 },
        // 召唤：只在 BOSS 身边生成近战 + 远程精英各 2（血量为 BOSS1 召唤版 ×1.5）。
        summon: { cd: 12.0, eliteCount: 2, eliteTypes: ['eliteCrabSummon', 'eliteGrubSummon'] },
        burst:  { cd: 8.0, count: 16, speed: 85, damage: 56, radius: 230, color: 'darkRed' }, // 向心收拢弹（最高伤：深暗红）
        // ↓↓ 二阶段专属（phase2Only：血量 ≤50% 才进入轮换） ↓↓
        // 高伤冲撞：高速撞向玩家当前位置，到达后立刻爆出一圈深暗红弹幕
        dashBurst: { cd: 8.0, dashSpeed: 380, dashTime: 0.5, count: 20, speed: 130, damage: 56, color: 'darkRed', phase2Only: true },
        // 深渊停滞：冻结玩家全部武器的冷却与蓄力（转阶段首次 10 秒，此后每次 3 秒，冷却固定 15 秒不受狂怒加速）
        stasis: { cd: 15.0, duration: 3, noPhaseScale: true, phase2Only: true },
      },
    },
  };

  // ---- 波次导演：不同时间段出什么怪 ----
  // weights 随时间插值；时间段之外视为延续
  SF.waveDirector = [
    { from: 0,   weights: { grub: 10 } },
    { from: 60,  weights: { grub: 8, falcon: 3 } },
    { from: 120, weights: { grub: 6, falcon: 4, crab: 3 } },
    { from: 210, weights: { grub: 5, falcon: 4, crab: 4, jelly: 2 } },
    { from: 300, weights: { grub: 4, falcon: 4, crab: 5, jelly: 3, turret: 2 } },
    { from: 420, weights: { grub: 3, falcon: 5, crab: 5, jelly: 4, turret: 3 } },
    { from: 540, weights: { falcon: 4, crab: 6, jelly: 5, turret: 4 } },
  ];

  // 每日星域 seed（调试可用 URL ?seed=xxx 覆盖）
  function todaySeed() {
    const url = new URLSearchParams(location.search);
    if (url.has('seed')) return SF.util.hashString(url.get('seed'));
    const d = new Date();
    return SF.util.hashString(`starfall-${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`);
  }

  SF.waveSeed = todaySeed;
})();
