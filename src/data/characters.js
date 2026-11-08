/* ============================================================
 * characters.js — 可选角色表 + 局外工坊升级定义
 * upgradeStats：装甲工坊可购买的初始数值强化（局外加成，5 级封顶）
 * 生命强化为百分比制：每级 +10% 基础生命（刻意小削弱——原为固定值成长）
 * 血量平衡：全角色基础血量 ×0.8
 * （补偿「初始武器强化」——最高可携带 6 级满级武器入场，更快拿超武进化）
 * ============================================================ */
(function () {
  'use strict';
  const SF = (window.SF = window.SF || {});

  SF.characters = {
    vega: {
      id: 'vega',
      name: '焰锋',
      title: '火焰突击',
      desc: '储存热量，按空格开启炽焰超载，以加速火力叠加灼烧。',
      startWeapon: 'blade',
      homeTree: 'orion',   // 焚灭矩阵；内部 ID 保留以兼容已有存档
      color: 'fire1',
      bonus: { maxHp: 80, speed: 72 },
      dmgMul: 1.0,
      traits: { fireOverdrive: true, layeredBurn: true, luck: 1.0 },
      passive: { name: '炽焰超载', desc: '灼烧时长额外 ×1.5，常态也可无限叠层，每层独立到期；同轮齐射每敌最多一层。脚下火苗随层数增强，5 层后外观不变，伤害仍逐层累加。全火系共享 2 秒计热间隔，15 格可储存，空格开启 15 秒超载：火武间隔从原值 ×1.5 变为 ×0.8，灼烧时长从原值 ×0.8 变为 ×2，再乘专属加成。期间不积热，停滞暂停技能计时。' },
      upgradeStats: {
        hp:     { name: '装甲强化', per: 0.10, suffix: 'HP%', isPct: true },
        speed:  { name: '引擎强化', per: 2.4,  suffix: 'SPD' },
        dmg:    { name: '火力校准', per: 0.04, suffix: 'DMG%', isMul: true },
        weapon: { name: '初始武器', per: 1,  suffix: 'LV', isLevel: true },
      },
    },
    firefly: {
      id: 'firefly',
      name: '霜翎',
      title: '冰霜防反',
      desc: '按空格精准防反，以霜裂重创来敌。',
      startWeapon: 'orb',
      homeTree: 'cygnus',  // 霜返矩阵
      color: 'ice1',
      bonus: { maxHp: 56, speed: 92 },
      dmgMul: 0.9,
      traits: { hurtSpeedBoost: true, cycleInvuln: true, iceStack: true, luck: 1.025 },
      passive: { name: '霜裂反击', desc: '按空格主动防反，基础冷却 20 秒，矩阵可降至 14 秒；窗口固定 0.2 秒。窗口内受击免伤，每窗口反击一次：攻击者位置生成冰域，中心首击 ×2；若持有霜棱弹，下一发穿透并逐敌冰爆，每目标最多受伤 3 次，最多保存一发。冰击叠冰蚀，每层承伤 ×1.1、上限 3 层，对 BOSS 有效，5 秒无冰击清零。普通受击后 2 秒移速 +35%。' },
      upgradeStats: {
        hp:     { name: '装甲强化', per: 0.10, suffix: 'HP%', isPct: true },
        speed:  { name: '引擎强化', per: 3.2,  suffix: 'SPD' },
        dmg:    { name: '火力校准', per: 0.05, suffix: 'DMG%', isMul: true },
        weapon: { name: '初始武器', per: 1,  suffix: 'LV', isLevel: true },
      },
    },
    thunder: {
      id: 'thunder',
      name: '磁暴',
      title: '电磁狙击',
      desc: '三格电容蓄满后，一次点击释放聚能贯穿炮。',
      startWeapon: 'chain',
      homeTree: 'nexus',   // 磁轨矩阵：蓄能与元素耦合
      color: 'bolt0',
      bonus: { maxHp: 48, speed: 72 },
      dmgMul: 1.2,
      traits: { chargeMul: 0.8, railgunStorage: 3, railgunBurst: true, luck: 1.0 },
      passive: { name: '聚能电容', desc: '电磁炮蓄力时间 ×0.8，最多存 3 发。未满仓时点击消耗 1 发，伤害为原单发的 85%；满仓后点击消耗全部 3 发，发射原单发伤害 ×3.3 的聚能贯穿炮。进化后的天罚同样生效，已储存电量与蓄力进度保留。' },
      upgradeStats: {
        hp:     { name: '装甲强化', per: 0.10, suffix: 'HP%', isPct: true },
        speed:  { name: '引擎强化', per: 2.4,  suffix: 'SPD' },
        dmg:    { name: '火力校准', per: 0.05, suffix: 'DMG%', isMul: true },
        weapon: { name: '初始武器', per: 1,  suffix: 'LV', isLevel: true },
      },
    },
  };
})();
