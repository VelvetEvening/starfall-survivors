/* ============================================================
 * weapons.js — 武器数据表（6 武器 + 6 超武进化配方）
 * 元素系：fire 火灼烧扩散 / bolt 雷电磁与激光 / ice 冰减速冻结
 * 火武表保留原基准；常态间隔另乘 config.FIRE_COOLDOWN_MUL，超载按 VEGA_HEAT 替换倍率。
 *
 * 字段约定：
 *   levels[i] 为第 i 级相对基础值的附加/覆盖参数
 *   fire() 由 sim/weapons.js 实现具体行为
 * ============================================================ */
(function () {
  'use strict';
  const SF = (window.SF = window.SF || {});

  SF.weapons = {
    // ---- 火系：脉冲飞刃（朝最近敌人投掷，命中爆炸灼烧） ----
    // 常态满级直伤 43 / (0.75 × 1.5) ≈ 38.2 DPS；焰锋灼烧独立叠层，其它机体单条刷新。
    blade: {
      id: 'blade', name: '脉冲飞刃', element: 'fire',
      icon: 'blade',
      desc: '向最近的敌人掷出爆裂飞刃，命中产生灼烧爆炸。',
      evolveTo: 'prism', evolveWith: 'engine',
      base: { damage: 14, cooldown: 1.1, speed: 210, pierce: 0, blast: 22, burn: 6 },
      levels: [
        { damage: +6, blast: +4 },
        { cooldown: -0.15 },
        { damage: +9, burn: +4 },
        { pierce: +1, blast: +8 },
        { damage: +14, cooldown: -0.2, burn: +6 },
      ],
      levelDesc: ['伤害 +6 爆炸半径 +4', '冷却 -0.15秒', '伤害 +9 灼烧伤害 +4', '穿透 +1 爆炸半径 +8', '伤害 +14 冷却 -0.2秒 灼烧伤害 +6'],
    },
    // ---- 超武：量子棱镜 ----
    prism: {
      id: 'prism', name: '量子棱镜', element: 'fire', super: true,
      icon: 'missile',
      desc: '进化的飞刃风暴：三向刃雨，爆炸更大并强化灼烧。',
      base: { damage: 34, cooldown: 0.75, speed: 260, pierce: 2, blast: 42, burn: 16, count: 3 },
      levels: [
        { damage: +12, blast: +6 },
        { cooldown: -0.1, count: +1 },
        { damage: +18, burn: +8 },
      ],
      levelDesc: ['伤害 +12', '冷却 -0.1秒 投射数量 +1', '伤害 +18 灼烧伤害 +8'],
    },

    // ---- 冰系：冰霜新星（周期性环形冲击，减速冻结） ----
    // 定位：控制为主、伤害为辅；冻结时长全线下调（曾永冻 92% 覆盖），
    // 补偿：伤害 +10% 档 + 冰冻易伤机制（被冻 5 秒受伤 ×1.2）
    orb: {
      id: 'orb', name: '冰霜新星', element: 'ice',
      icon: 'orb',
      desc: '周期性释放冰环，冻结周围敌人。',
      evolveTo: 'absoluteZero', evolveWith: 'cryo',
      base: { damage: 22, cooldown: 4.2, radius: 70, slow: 0.65, freeze: 0.6 },
      levels: [
        { damage: +11, radius: +10 },
        { cooldown: -0.3, freeze: +0.1 },
        { damage: +20, slow: -0.08, radius: +14 },
        { freeze: +0.1, radius: +10 },
        { damage: +33, cooldown: -0.4, radius: +16 },
      ],
      levelDesc: ['伤害 +11 冻结半径 +10', '冷却 -0.3秒 冻结时长 +0.1秒', '伤害 +20 减速加强 半径 +14', '冻结时长 +0.1秒 半径 +10', '伤害 +33 冷却 -0.4秒 半径 +16'],
    },
    // ---- 超武：绝对零度 ----
    // 进化起点对齐：单发伤害 ≥ 冰霜新星满级（86）；表值冻结 1.1s，实际折半 0.55s / 2.6s ≈21%（共鸣后约32%）。
    // 移除隐形持续领域伤害，保留可见冰环的高单发与控制定位。
    absoluteZero: {
      id: 'absoluteZero', name: '绝对零度', element: 'ice', super: true,
      icon: 'orb',
      desc: '绝对冰环：周期释放新星，冻结时间大增并强化冰系伤害。',
      base: { damage: 88, cooldown: 2.8, radius: 110, slow: 0.5, freeze: 1.0 },
      levels: [
        { radius: +20, damage: +14 },
        { cooldown: -0.2, radius: +14 },
        { radius: +24, freeze: +0.1 },
      ],
      levelDesc: ['冰环半径 +20 伤害 +14', '冷却 -0.2秒 冰环半径 +14', '冰环半径 +24 冻结时长 +0.1秒'],
    },

    // 霜棱弹：保留 mirrorWheel 内部 ID。Lv.6 单次 34 / 1.08s = 31.5 DPS，低于常态飞刃 38.2。
    mirrorWheel: {
      id: 'mirrorWheel', name: '霜棱弹', element: 'ice',
      icon: 'frostShard',
      desc: '冰弹首次碰撞后冰爆消失；霜翎防反后下一发逐敌穿透冰爆，每目标最多受伤 3 次。',
      evolveTo: 'frostLance', evolveWith: 'frostLens',
      base: { damage: 9, cooldown: 1.35, speed: 250, radius: 4, blast: 24, slow: 0.72, freeze: 0.15, life: 2.2, targetRange: 320 },
      levels: [
        { damage: +3, blast: +4 },
        { cooldown: -0.12, speed: +25 },
        { damage: +5, slow: -0.06, blast: +5 },
        { damage: +7, cooldown: -0.15, freeze: +0.1 },
        { damage: +10, blast: +7, speed: +35 },
      ],
      levelDesc: ['伤害 +3 冰爆范围 +4', '冷却 -0.12秒 弹速 +25', '伤害 +5 减速加强 冰爆范围 +5', '伤害 +7 冷却 -0.15秒 冻结 +0.1秒', '伤害 +10 冰爆范围 +7 弹速 +35'],
    },

    // ---- 超武：极寒贯星（定向贯穿冰枪，单发共享命中上限） ----
    frostLance: {
      id: 'frostLance', name: '极寒贯星', element: 'ice', super: true,
      icon: 'frostLance',
      desc: '冰枪贯穿敌群，逐敌碎冰；每目标每发伤害一次，防反强化后最多三次。',
      base: { damage: 42, cooldown: 1.02, speed: 360, radius: 5, blast: 42, slow: 0.66, freeze: 0.25,
        life: 2.2, targetRange: 360, frostPierce: true, frostMaxHits: 1 },
      levels: [
        { damage: +12, blast: +6 },
        { cooldown: -0.12, speed: +40 },
        { damage: +18, blast: +8, radius: +1 },
      ],
      levelDesc: ['伤害 +12 碎冰范围 +6', '冷却 -0.12秒 弹速 +40', '伤害 +18 碎冰范围 +8 弹体半径 +1'],
    },

    // ---- 雷系：超电磁炮（蓄力 → 点击鼠标定向发射巨型穿甲弹） ----
    // 平衡调整：蓄力时间 ×3（3→9 秒），伤害 ×2 补偿；升级不再缩短蓄力，全部转为伤害成长
    chain: {
      id: 'chain', name: '超电磁炮', element: 'bolt',
      icon: 'spark',
      desc: '蓄力完成后点击鼠标，向瞄准方向发射贯穿一切的电磁弹。',
      evolveTo: 'tempest', evolveWith: 'cooldown',
      base: { damage: 110, speed: 420, radius: 9, charge: 9.0 },
      levels: [
        { damage: +20 },
        { damage: +30 },
        { damage: +30, radius: +1 },
        { damage: +20, speed: +60 },
        { damage: +60, radius: +1 },
      ],
      levelDesc: ['伤害 +20', '伤害 +30', '伤害 +30 弹体半径 +1', '伤害 +20 弹速 +60', '伤害 +60 弹体半径 +1'],
    },
    // ---- 超武：天罚电磁炮 ----
    // 超进化后不再发射双球（曾对大体型目标双弹全中导致 BOSS 被秒），
    // 改为一道粗大贯穿光束：长 520 横贯屏幕、宽 22→26（Lv.1 对齐超电磁炮 Lv.6 的 22px 弹体直径），路径上每个敌人只结算一次伤害；
    // 长度随专精矩阵 areaMul 增长（范围间接扩大），蓄力 6 秒不变
    tempest: {
      id: 'tempest', name: '天罚电磁炮', element: 'bolt', super: true,
      icon: 'spark',
      desc: '电容瞬间放电，释放贯穿敌群的雷霆主炮。',
      base: { damage: 300, beam: true, beamLife: 0.3, length: 520, width: 22, charge: 6.0 },
      levels: [
        { damage: +60 },
        { damage: +90, width: +2 },
        { damage: +90, width: +2 },
      ],
      levelDesc: ['伤害 +60', '伤害 +90 光束宽度 +2', '伤害 +90 光束宽度 +2'],
    },

    // ---- 火系：爆裂导弹（随机落点 AOE） ----
    // 导弹固有间隔 ×1.5，再叠火系常态 ×1.5（超载替换为 ×0.8）；基础灼烧 8 秒，其它机体常态 6.4 秒；焰锋常态/超载 9.6/24 秒。
    missile: {
      id: 'missile', name: '爆裂导弹', element: 'fire',
      icon: 'missile',
      desc: '呼叫火力覆盖，随机轰炸敌群。',
      evolveTo: 'nuke', evolveWith: 'crit',
      cooldownMul: 1.5,
      base: { damage: 33, cooldown: 4.4, count: 1, blast: 34, burn: 4, burnDuration: 8, delay: 0.55 },
      levels: [
        { count: +1 },
        { damage: +13.5, blast: +6 },
        { cooldown: -0.6, count: +1 },
        { damage: +19.5, blast: +8 },
        { count: +1, cooldown: -0.4 },
      ],
      levelDesc: ['导弹数量 +1', '伤害 +13.5 爆炸半径 +6', '冷却 -0.6秒 导弹数量 +1', '伤害 +19.5 爆炸半径 +8', '导弹数量 +1 冷却 -0.4秒'],
    },
    // ---- 超武：轨道天火 ----
    // 进化起点对齐：齐射总量高于爆裂导弹满级；火烧地带持续 2 秒并淡出。
    nuke: {
      id: 'nuke', name: '轨道天火', element: 'fire', super: true,
      icon: 'missile',
      desc: '毁灭齐射：多枚重装导弹，爆炸留下火海。',
      cooldownMul: 1.5,
      base: { damage: 72, cooldown: 3.2, count: 5, blast: 52, burn: 8, burnDuration: 8, delay: 0.4, fireField: 8 },
      levels: [
        { count: +1, damage: +16.5 },
        { cooldown: -0.5, blast: +10 },
        { count: +2, fireField: +6 },
      ],
      levelDesc: ['导弹数量 +1 伤害 +16.5', '冷却 -0.5秒 爆炸半径 +10', '导弹数量 +2 火海伤害 +6'],
    },

    // ---- 雷系：激光扫射（锁定、短扫、间歇后重新锁定） ----
    // 满级接触速率 20/0.18；实际输出受扫射角度、间歇和命中率影响。
    laser: {
      id: 'laser', name: '激光扫射', element: 'bolt',
      icon: 'spark',
      desc: '锁定最近敌人，以跳动电弧包覆的激光短时扫射。',
      evolveTo: 'spectrum', evolveWith: 'armor',
      base: { damage: 7, cooldown: 0, length: 90, sweepDuration: 0.7, sweepPause: 0.6, sweepArc: 0.6, tick: 0.2 },
      levels: [
        { damage: +3, length: +14 },
        { sweepPause: -0.08 },
        { damage: +4, length: +18 },
        { sweepPause: -0.08, tick: -0.02 },
        { damage: +6, length: +22 },
      ],
      levelDesc: ['伤害 +3 光束长度 +14', '扫射间歇 -0.08秒', '伤害 +4 光束长度 +18', '扫射间歇 -0.08秒 攻击频率提升', '伤害 +6 光束长度 +22'],
    },
    // ---- 超武：光谱裁决 ----
    // 副束合并为单束，保留原主副束同时命中的理论总直伤；每目标每 tick 仅结算一次。
    spectrum: {
      id: 'spectrum', name: '光谱裁决', element: 'bolt', super: true,
      icon: 'star4',
      desc: '单束高压电流扫射，雷弧沿光束奔涌，持续灼击前方敌人。',
      base: { damage: 24, cooldown: 0, length: 150, sweepDuration: 0.85, sweepPause: 0.45, sweepArc: 0.85, tick: 0.12 },
      levels: [
        { damage: +4.5, length: +20 },
        { sweepPause: -0.08 },
        { damage: +9, length: +30 },
      ],
      levelDesc: ['伤害 +4.5 光束长度 +20', '扫射间歇 -0.08秒', '伤害 +9 光束长度 +30'],
    },
  };

  // 元素共鸣定义
  SF.resonance = {
    fire: { name: '灼烧共鸣', desc: '灼烧伤害翻倍且可蔓延', need: 2 },
    bolt: { name: '雷霆共鸣', desc: '雷系武器伤害 +10%', need: 2 },
    ice: { name: '凛冬共鸣', desc: '减速后移速再 ×0.75，冻结时长 ×1.5', need: 2 },
  };
})();
