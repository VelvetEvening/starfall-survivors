/* ============================================================
 * config.js — 全局平衡常量与运行配置（改表即改平衡）
 * ============================================================ */
(function () {
  'use strict';
  const SF = (window.SF = window.SF || {});

  SF.config = {
    VERSION: 'v2.0',
    PICKUP_RADII: { dust: 7, chest: 15, magnet: 13, heal: 13 },
    // ---------- 一局结构 ----------
    RUN_DURATION: 480,        // 8 分钟总时长：4 分钟 BOSS1 + 4 分钟 BOSS2
    BOSS_SPAWN_AT: [240, 480], // BOSS 出现时刻（倒计时时钟）
    BOSS_INTRO_LEAD: 2,       // 提前预警秒数
    LEVEL_XP_BASE: 15,        // 升级所需经验基数（1→2 级）
    LEVEL_XP_GROWTH: 1.22,    // 每级经验倍率（平滑曲线）
    MAX_LEVEL: 40,
    STARPOINT_PER_LEVEL: 1,   // 每级获得专精点
    MAX_WEAPONS: 4,
    MAX_PASSIVES: 4,
    LEVELUP_CHOICES: 3,

    // ---------- 难度模式 ----------
    // mobHpEndMul 是小怪实际终盘质量；三档均从 ×3 起步。
    // hpMul 只用于 BOSS 与固定倍率召唤精英；scoreMul/dustMul 只影响局后结算。
    DIFFICULTIES: {
      easy:   { id: 'easy',   name: '简单', hpMul: 0.75, mobHpEndMul: 29.58,  dmgMul: 0.75, spdMul: 0.9, scoreMul: 0.6, dustMul: 0.6 },
      normal: { id: 'normal', name: '正常', hpMul: 1,    mobHpEndMul: 36.975, dmgMul: 1,    spdMul: 1,   scoreMul: 1,   dustMul: 1 },
      hard:   { id: 'hard',   name: '困难', hpMul: 1.25, mobHpEndMul: 49.3,   dmgMul: 1.25, spdMul: 1.1, scoreMul: 1.5, dustMul: 1.5 },
    },

    // ---------- 专精矩阵 ----------
    STARPOINT_START: 1,       // 开局自带 1 点

    // ---------- 掉落 ----------
    DUST_XP: 1,
    MAGNET_DROP_CHANCE: 0.02, // 磁力吸取道具
    HEAL_DROP_CHANCE: 0.012,  // 回血道具

    // ---------- 敌人波次 ----------
    SPAWN_RATE_START: 2,       // 常规出怪：初始为旧版 1 只/秒的两倍
    SPAWN_RATE_END: 1.3 / 0.28, // 保留旧终盘期望频率，含原 30% 双怪概率
    WAVE_BURST_EVERY: 90,        // 每 90 秒一波环形爆发
    ENEMY_SPEED_SCALE: 0.004,
    ENEMY_CAP: 160,              // 同屏上限
    ELITE_AT: [80, 165, 270, 350, 415], // 精英出现时刻（秒）——8 分钟流程压缩为 5 个节点

    // ---------- 小怪质量曲线（实际基础血量倍率，见 game.mobHpMul） ----------
    // 三档均从 ×3 开始；困难沿用旧正常曲线的三个参考锚点。
    // 其它难度按各自终点等比缩放“高于 ×3 的成长量”，两段使用 smoothstep；BOSS1 击杀仍离散跳跃。
    MOB_HP_START_MUL: 3,
    MOB_HP_REFERENCE_BOSS1_MUL: 16,
    MOB_HP_REFERENCE_BOSS1_JUMP: 12,
    MOB_HP_REFERENCE_END_MUL: 49.3,
    // 野生宝箱精英 = 小怪曲线 × 0.78（校准为 BOSS1 时点 ≈ 召唤版 ×1.5）
    ELITE_HP_FACTOR: 0.78,
    // BOSS 召唤精英血量倍率（固定值，不随曲线走）：校准为 BOSS1 血量 1/3（近战）/ 1/5（远程）
    // （BOSS 血量 ×1.2 后从 8.33 重校准为 10，保持用户设定的 1/3、1/5 比例）
    SUMMON_ELITE_HP_MUL: 10,
    SUMMON_ELITE_HP_MUL_B2: 15,    // BOSS2 召唤 = BOSS1 召唤 ×1.5
    EMPOWER_DMG_MUL: 1.6,          // 深渊强化：精英下一次攻击伤害倍率

    // ---------- 敌人 AI / BOSS ----------
    DASH_TIME: 0.45,           // 冲刺位移时长（敌人 dash AI 通用，收尾弹幕在此刻触发）
    DASH_ENGAGE_RANGE: 140,    // 冲撞触发距离（def.dash.engageRange 可覆盖）
    BOSS_CONTACT_DMG_MUL: 1.2, // BOSS 接触伤害倍率（体型碾压）
    BOSS_SLOW_EFFECT: 0.3,     // BOSS 减速抗性：实际只吃 30% 减速，永不完全冻结
    BOSS_SPIRAL_ROT: 2.4,      // BOSS 螺旋弹幕旋转角速度（弧度/秒）
    BOSS_SUMMON_ELITE_CAP: 8,  // BOSS 召唤精英同屏上限（防召唤流无限堆积）
    BOSS_STASIS_FIRST_DURATION: 10,
    BOSS_WAVE_INTERVAL: 30,    // BOSS 战四周无收益小怪波次间隔
    BOSS_WAVE_COUNTS: [15, 20], // BOSS1 / BOSS2 每波数量
    BOSS_WAVE_RADIUS: 320,

    // ---------- 元素共鸣 / 灼烧 ----------
    BURN_RESONANCE_MUL: 2,     // 火系共鸣：灼烧伤害倍数（翻倍）
    BURN_SPREAD_RADIUS: 40,    // 火系共鸣：灼烧蔓延半径（跳到附近未灼烧敌人）

    FIRE_COOLDOWN_MUL: 1.5,      // 所有机体的火武常态间隔，相对武器表原间隔
    FIRE_BURN_DURATION_MUL: 0.8, // 常态灼烧时长，相对武器表原时长
    FIRE_BASE_BURN_DURATION: 3,
    VEGA_BURN_DURATION_MUL: 1.5, // 焰锋常态/超载每层灼烧时长额外乘 1.5
    BURN_TICK_INTERVAL: 0.4,
    // 焰锋：15 格储存后按空格开启 15 秒超载；间隔/时长倍率都相对原表，不叠常态倍率。
    // 全火系共享计热间隔，超载期间不积热，至少 30 秒重新蓄满（理想覆盖率 ≤ 1/3）。
    VEGA_HEAT: { threshold: 15, interval: 2, duration: 15, cooldownMul: 0.8, burnDurationMul: 2 },
    // 磁暴专属：普通单发收敛；满仓一炮 = 原单发 ×3.3，比原三发总量高 10%。
    // 其它机体使用同一武器时不应用这两个伤害倍率。
    THUNDER_CAPACITOR: { normalDamageMul: 0.85, burstDamageMul: 3.3, burstSizeMul: 1.25, burstBeamLifeMul: 2.5 },

    // ---------- 冰冻易伤 / 冰蚀层数（敌方承伤乘区，统一在 Enemy.takeDamage 收口） ----------
    VULN_FREEZE_MUL: 1.2,      // 被冰冻后 5 秒内受伤倍率（对 BOSS 无效）
    VULN_FREEZE_DURATION: 5,   // 冰冻易伤持续时间
    ICE_STACK_MUL: 1.1,        // 霜翎冰蚀：每层受伤倍率（对 BOSS 有效）
    ICE_STACK_MAX: 3,          // 冰蚀层数上限
    ICE_STACK_DURATION: 5,     // 冰蚀持续时间（5 秒内未受冰系攻击则层数清零）
    ICE_FREEZE_DURATION_MUL: 0.5, // 武器表冻结时长的实际折算；新冻结和续冻都按半时长
    ICE_RESONANCE_SLOW_MUL: 0.75,
    ICE_RESONANCE_FREEZE_MUL: 1.5,

    // ---------- 霜翎主动防反 / 受击反制冰域 ----------
    FIREFLY_CYCLE_INTERVAL: 20,
    FIREFLY_COUNTER_MIN_COOLDOWN: 14,
    FIREFLY_CYCLE_INVULN_BASE: 0.2,
    FIREFLY_CYCLE_INVULN_CAP: 0.2,
    FROST_SPECIALIZATION: { root: { iceAreaMul: 0.05 }, counter: { counterDamage: 0.15 } },
    MATRIX_EXTENSIONS: {
      orion: { cost: 5, f: { fireDmg: 0.06 }, g: { fireAreaMul: 0.08 } },
      cygnus: { cost: 5, f: { frostCounterReduction: 3 }, g: { frostCounterReduction: 3 } },
      nexus: { cost: 5, f: { boltDmg: 0.06 }, g: { boltAreaMul: 0.08 } },
    },
    FIREFLY_ICE_RETALIATE_TICK: 3,
    FIREFLY_ICE_RETALIATE_BASE_RADIUS: 24,
    FIREFLY_ICE_RETALIATE_LEVEL_RADIUS: 3,
    FIREFLY_ICE_RETALIATE_BASE_LIFE: 3.2,
    FIREFLY_ICE_RETALIATE_LEVEL_LIFE: 0.15,
    FIREFLY_ICE_RETALIATE_SUPER_RADIUS: 78,
    FIREFLY_ICE_RETALIATE_SUPER_LIFE: 5,
    FIREFLY_ICE_RETALIATE_CENTER_MUL: 2,
    FIREFLY_FROST_MAX_HITS: 3, // 同一发强化霜棱弹对每个目标的冰爆伤害/控制次数上限

    // ---------- 玩家 ----------
    INVULN_TIME: 0.8,          // 受击无敌
    PICKUP_RADIUS_BASE: 42,    // 拾取吸附半径
    XP_MAGNET_SPEED: 320,
    FIREFLY_SPEED_BOOST: 1.35, // 霜翎受击加速倍率（被动文案同步）

    // ---------- 掉落补充 ----------
    DUST_CAP_PER_DROP: 14,     // 单次掉落星尘颗数上限（超出部分转为高价值星尘）
    CHEST_COMPENSATION_DUST: 60, // 终局未拾取宝箱的结算补偿，避免胜利延迟内必丢奖励
    HEAL_PICKUP_AMOUNT: 25,    // 回血道具回复量
    MISSILE_BLIND_SPREAD: 120, // 导弹无目标时以玩家为中心的盲炸散布半径

    // ---------- 渲染 ----------
    SCREEN_SHAKE_BOOM: 3.2,
    SCREEN_SHAKE_HURT: 4.0,

    // ---------- 结算 ----------
    SCORE_PER_KILL: 10,
    SCORE_PER_LEVEL: 100,
    SCORE_VICTORY: 5000,
    SCORE_TIME_BONUS: 2,      // 每秒存活分
    SCORE_BOSS1_KILL: 3000,   // 击杀第一个 BOSS 的奖励分
    MOB_BOSS1_KILL_BOOST: 1.5,  // BOSS1 击杀后小怪接触伤害额外跳升（叠加在线性成长上）
    MOB_DAMAGE_PER_MIN: 0.12,   // 小怪接触伤害每分钟线性成长率（+12%/分钟）
    ELITE_BOSS1_KILL_BOOST: 1.25, // BOSS1 击杀后精英伤害提升（接触 + 弹幕）

    // ---------- 局外工坊 ----------
    UPGRADE_COSTS: [150, 300, 600, 1200, 2400], // 每次购买费用；属性 5 级封顶，武器 5 次购买入场 Lv.6
    UPGRADE_LEVEL_CAPS: { hp: 5, speed: 5, dmg: 5, weapon: 5 },
    DUST_XP_MUL: 3,            // 星尘产出倍率（每颗星尘 XP 提到 3）
  };
})();
