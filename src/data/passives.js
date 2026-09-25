/* ============================================================
 * passives.js — 被动道具表（6 种）
 * 数值为基础档（刻意砍半）；玩家持有对应超武进化后，该被动每层效果 ×1.5
 * （追溯已获得层数，见 player.recalcStats / SF.passiveSuperMap）
 * 每级数值为加法叠加。
 * ============================================================ */
(function () {
  'use strict';
  const SF = (window.SF = window.SF || {});

  SF.passives = {
    engine: {
      id: 'engine', name: '离子引擎', icon: 'boltPlayer',
      desc: '移动速度提升（持有量子棱镜后效果 ×1.5），飞刃进化素材。',
      maxLevel: 5,
      per: { speed: +3.5 },
      levelDesc: ['移动速度 +3.5', '移动速度 +3.5', '移动速度 +3.5', '移动速度 +3.5', '移动速度 +3.5'],
    },
    magnet: {
      id: 'magnet', name: '磁力核心', icon: 'magnet',
      desc: '拾取范围提升（持有星系引擎后效果 ×1.5），卫星进化素材。',
      maxLevel: 5,
      per: { pickupRadius: +4.5 },
      levelDesc: ['拾取范围 +4.5', '拾取范围 +4.5', '拾取范围 +4.5', '拾取范围 +4.5', '拾取范围 +4.5'],
    },
    cryo: {
      id: 'cryo', name: '寒潮核心', icon: 'cryo',
      desc: '冰系武器范围 +4%、伤害 +2%/层（持有绝对零度后效果 ×1.5），冰霜新星进化素材。',
      maxLevel: 5,
      per: { iceAreaMul: +0.04, iceDmg: +0.02 },
      levelDesc: ['冰系范围 +4% 伤害 +2%', '冰系范围 +4% 伤害 +2%', '冰系范围 +4% 伤害 +2%', '冰系范围 +4% 伤害 +2%', '冰系范围 +4% 伤害 +2%'],
    },
    crit: {
      id: 'crit', name: '弱点分析', icon: 'star4',
      desc: '暴击率与暴伤提升（持有轨道天火后效果 ×1.5），导弹进化素材。',
      maxLevel: 5,
      per: { critChance: +0.035, critMult: +0.075 },
      levelDesc: ['暴击率 +3.5% 暴伤 +7.5%', '暴击率 +3.5% 暴伤 +7.5%', '暴击率 +3.5% 暴伤 +7.5%', '暴击率 +3.5% 暴伤 +7.5%', '暴击率 +3.5% 暴伤 +7.5%'],
    },
    cooldown: {
      id: 'cooldown', name: '超频芯片', icon: 'spark',
      desc: '武器蓄力时间缩短（仅对蓄力武器生效，持有天罚电磁炮后效果 ×1.5），超电磁炮进化素材。',
      maxLevel: 5,
      per: { chargeRed: +0.03 },
      levelDesc: ['蓄力时间 -3%', '蓄力时间 -3%', '蓄力时间 -3%', '蓄力时间 -3%', '蓄力时间 -3%'],
    },
    armor: {
      id: 'armor', name: '复合装甲', icon: 'crab',
      desc: '减免受到的伤害（持有光谱裁决后效果 ×1.5），激光进化素材。',
      maxLevel: 5,
      per: { armor: +1 },
      levelDesc: ['受到伤害固定减免 +1', '受到伤害固定减免 +1', '受到伤害固定减免 +1', '受到伤害固定减免 +1', '受到伤害固定减免 +1'],
    },
  };
})();
