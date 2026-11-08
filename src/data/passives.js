/* ============================================================
 * passives.js — 被动道具表（6 种）
 * 数值为基础档；玩家持有对应超武进化后，该被动每层效果 ×1.5
 * （追溯已获得层数，见 player.recalcStats / SF.passiveSuperMap）
 * 每级数值为加法叠加。
 * ============================================================ */
(function () {
  'use strict';
  const SF = (window.SF = window.SF || {});

  SF.passives = {
    engine: {
      id: 'engine', name: '热能核心', element: 'fire', icon: 'boltPlayer',
      desc: '火系直伤 +3%、灼烧时长 +4%/层；飞刃进化素材，进化后效果 ×1.5。',
      maxLevel: 5,
      per: { fireDmg: +0.03, burnDuration: +0.04 },
      levelDesc: ['火系直伤 +3% 灼烧时长 +4%', '火系直伤 +3% 灼烧时长 +4%', '火系直伤 +3% 灼烧时长 +4%', '火系直伤 +3% 灼烧时长 +4%', '火系直伤 +3% 灼烧时长 +4%'],
    },
    cryo: {
      id: 'cryo', name: '寒潮核心', element: 'ice', icon: 'cryo',
      desc: '冰系武器范围 +4%、伤害 +2%/层（持有绝对零度后效果 ×1.5），冰霜新星进化素材。',
      maxLevel: 5,
      per: { iceAreaMul: +0.04, iceDmg: +0.02 },
      levelDesc: ['冰系范围 +4% 伤害 +2%', '冰系范围 +4% 伤害 +2%', '冰系范围 +4% 伤害 +2%', '冰系范围 +4% 伤害 +2%', '冰系范围 +4% 伤害 +2%'],
    },
    frostLens: {
      id: 'frostLens', name: '冰晶棱核', element: 'ice', icon: 'icon_frostLens',
      desc: '冰伤 +2%、冰弹飞行速度 +5%/层；霜棱弹进化素材，进化后效果 ×1.5。',
      maxLevel: 5,
      per: { iceDmg: +0.02, frostProjectileSpeed: +0.05 },
      levelDesc: Array(5).fill('冰伤 +2% 冰弹飞行速度 +5%'),
    },
    crit: {
      id: 'crit', name: '弱点分析', icon: 'star4',
      desc: '暴击率与暴伤提升（持有轨道天火后效果 ×1.5），导弹进化素材。',
      maxLevel: 5,
      per: { critChance: +0.035, critMult: +0.075 },
      levelDesc: ['暴击率 +3.5% 暴伤 +7.5%', '暴击率 +3.5% 暴伤 +7.5%', '暴击率 +3.5% 暴伤 +7.5%', '暴击率 +3.5% 暴伤 +7.5%', '暴击率 +3.5% 暴伤 +7.5%'],
    },
    cooldown: {
      id: 'cooldown', name: '超频芯片', element: 'bolt', icon: 'spark',
      desc: '武器蓄力时间缩短（仅对蓄力武器生效，持有天罚电磁炮后效果 ×1.5），超电磁炮进化素材。',
      maxLevel: 5,
      per: { chargeRed: +0.03 },
      levelDesc: ['蓄力时间 -3%', '蓄力时间 -3%', '蓄力时间 -3%', '蓄力时间 -3%', '蓄力时间 -3%'],
    },
    armor: {
      id: 'armor', name: '聚束晶体', element: 'bolt', icon: 'crab',
      desc: '雷系伤害 +3%、范围 +4%/层；激光进化素材，进化后效果 ×1.5。',
      maxLevel: 5,
      per: { boltDmg: +0.03, boltAreaMul: +0.04 },
      levelDesc: ['雷伤 +3% 雷系范围 +4%', '雷伤 +3% 雷系范围 +4%', '雷伤 +3% 雷系范围 +4%', '雷伤 +3% 雷系范围 +4%', '雷伤 +3% 雷系范围 +4%'],
    },
  };
})();
