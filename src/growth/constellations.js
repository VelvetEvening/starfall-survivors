/* ============================================================
 * constellations.js — 机体专精矩阵（保留旧内部 ID，兼容存档和接口）
 * 升级获得专精点，激活节点获得局内加成。
 * 焚灭 / 霜返 / 磁轨，对应火焰 / 冰霜 / 电磁机体。
 * 本系消耗 ×1，其它系 ×2（见 player.starCost）。
 * 数值基准：全图加成已整体减半（后续新增节点也按此量级设计）
 * 每系 8 节点、总费 30；新增节点各 5 点，霜返减冷却分散在成长路线中。
 * 每个节点有前置依赖（需先点亮相邻父节点）
 * ============================================================ */
(function () {
  'use strict';
  const SF = (window.SF = window.SF || {});
  const extra = SF.config.MATRIX_EXTENSIONS;

  // id, name, 专精系归属, 坐标(0-1 相对布局), 效果, cost, 前置
  SF.constellations = {
    // ---------- 焚灭矩阵 · 火焰突击 ----------
    orion_root:   { name: '燃烧核心', con: 'orion', x: 0.30, y: 0.30, cost: 2, req: null,
      fx: { damageMul: 0.04 }, desc: '所有武器伤害 +4%' },
    orion_a:      { name: '热刃校准', con: 'orion', x: 0.18, y: 0.42, cost: 2, req: 'orion_root',
      fx: { critChance: 0.03 }, desc: '暴击率 +3%' },
    orion_b:      { name: '循环点火', con: 'orion', x: 0.38, y: 0.44, cost: 2, req: 'orion_root',
      fx: { cooldownMul: -0.015 }, desc: '武器冷却时间 -1.5%' },
    orion_c:      { name: '爆燃临界', con: 'orion', x: 0.10, y: 0.58, cost: 4, req: 'orion_a',
      fx: { critMult: 0.15 }, desc: '暴击伤害倍率 +15%' },
    orion_d:      { name: '烈焰扩散', con: 'orion', x: 0.30, y: 0.60, cost: 4, req: 'orion_b',
      fx: { damageMul: 0.06, areaMul: 0.075 }, desc: '武器伤害 +6% 爆炸范围 +7.5%' },
    orion_e:      { name: '焚灭协议', con: 'orion', x: 0.20, y: 0.74, cost: 6, req: 'orion_c', req2: 'orion_d',
      fx: { damageMul: 0.10 }, desc: '所有武器伤害 +10%' },
    orion_f:      { name: '熔火校准', con: 'orion', cost: extra.orion.cost, req: 'orion_e',
      fx: extra.orion.f, desc: '火系武器直伤 +6%' },
    orion_g:      { name: '热域拓展', con: 'orion', cost: extra.orion.cost, req: 'orion_f',
      fx: extra.orion.g, desc: '火系武器范围 +8%' },

    // ---------- 霜返矩阵 · 冰霜防反 ----------
    cygnus_root:  { name: '相变护层', con: 'cygnus', x: 0.70, y: 0.30, cost: 2, req: null,
      fx: SF.config.FROST_SPECIALIZATION.root, desc: '冰系攻击范围 +5%'  },
    cygnus_a:     { name: '霜裂刻痕', con: 'cygnus', x: 0.60, y: 0.42, cost: 2, req: 'cygnus_root',
      fx: { iceDmg: 0.10 }, desc: '冰系武器伤害 +10%' },
    cygnus_b:     { name: '冷凝修复', con: 'cygnus', x: 0.80, y: 0.42, cost: 2, req: 'cygnus_root',
      fx: { regen: 0.3 }, desc: '每秒回复生命 0.3' },
    cygnus_f:     { name: '霜息回流', con: 'cygnus', cost: extra.cygnus.cost, req: 'cygnus_a',
      fx: extra.cygnus.f, desc: '霜翎主动防反冷却 -3 秒；判定窗口仍为 0.2 秒' },
    cygnus_c:     { name: '反制增幅', con: 'cygnus', x: 0.56, y: 0.58, cost: 4, req: 'cygnus_f',
      fx: SF.config.FROST_SPECIALIZATION.counter, desc: '霜翎防反冰域伤害 +15%'  },
    cygnus_d:     { name: '霜影推进', con: 'cygnus', x: 0.74, y: 0.58, cost: 4, req: 'cygnus_b',
      fx: { speed: 4, invulnBonus: 0.15 }, desc: '移动速度 +4 受击无敌时间 +0.15 秒' },
    cygnus_g:     { name: '瞬凝回路', con: 'cygnus', cost: extra.cygnus.cost, req: 'cygnus_c',
      fx: extra.cygnus.g, desc: '霜翎防反冷却再 -3 秒，最低 14 秒；窗口不变' },
    cygnus_e:     { name: '极寒重启', con: 'cygnus', x: 0.66, y: 0.74, cost: 6, req: 'cygnus_g', req2: 'cygnus_d',
      fx: { revive: 1 }, desc: '死亡时原地复活一次（50% 生命）' },

    // ---------- 磁轨矩阵 · 电磁蓄能与跨系耦合 ----------
    // 原六节点保留，雷系专精后延伸两枚节点。
    nexus_core:   { name: '能量枢纽', con: 'nexus', x: 0.50, y: 0.55, cost: 4, req: null,
      fx: { areaMul: 0.05 }, desc: '攻击范围 +5%' },
    nexus_fire:   { name: '热能耦合', con: 'nexus', x: 0.44, y: 0.46, cost: 4, req: 'nexus_core',
      fx: { fireRes: 1 }, desc: '火系共鸣：灼烧伤害翻倍' },
    nexus_ice:    { name: '冷凝耦合', con: 'nexus', x: 0.56, y: 0.46, cost: 4, req: 'nexus_core',
      fx: { iceRes: 1 }, desc: '冰系共鸣：减速后移速 ×0.75，冻结时长 ×1.5' },
    nexus_bolt:   { name: '电磁共振', con: 'nexus', x: 0.50, y: 0.66, cost: 4, req: 'nexus_core',
      fx: { boltRes: 1 }, desc: '雷系共鸣：雷系武器伤害 +10%' },
    nexus_a:      { name: '聚束导轨', con: 'nexus', x: 0.40, y: 0.66, cost: 2, req: 'nexus_core',
      fx: { boltDmg: 0.08 }, desc: '雷系武器伤害 +8%' },
    nexus_b:      { name: '超导线圈', con: 'nexus', x: 0.60, y: 0.66, cost: 2, req: 'nexus_core',
      fx: { chargeRed: 0.08 }, desc: '电磁炮蓄力时间 -8%' },
    nexus_f:      { name: '电弧聚焦', con: 'nexus', cost: extra.nexus.cost, req: 'nexus_bolt', req2: 'nexus_a',
      fx: extra.nexus.f, desc: '雷系武器伤害 +6%' },
    nexus_g:      { name: '磁场延展', con: 'nexus', cost: extra.nexus.cost, req: 'nexus_f', req2: 'nexus_b',
      fx: extra.nexus.g, desc: '雷系武器范围 +8%' },
  };

  // 专精系分组元数据（渲染用；home 标注对应角色本系）
  SF.constellationMeta = {
    orion:  { name: '焚灭矩阵', color: 'fire1', style: '火焰', pilot: '焰锋' },
    cygnus: { name: '霜返矩阵', color: 'ice1', style: '冰霜', pilot: '霜翎' },
    nexus:  { name: '磁轨矩阵', color: 'bolt0', style: '电磁', pilot: '磁暴' },
  };

  // 判断某节点是否可点亮（专精点够 & 前置满足；cost 由调用方按本系/异家倍率折算）
  function nodeAvailable(id, lit, points, cost) {
    const n = SF.constellations[id];
    if (lit.has(id)) return false;
    if (points < (cost !== undefined ? cost : n.cost)) return false;
    if (n.req && !lit.has(n.req)) return false;
    if (n.req2 && !lit.has(n.req2)) return false;
    return true;
  }

  // 汇总所有已点亮节点的效果 → stat 修正表
  function aggregate(litSet) {
    const fx = {};
    const add = (k, v) => { fx[k] = (fx[k] || 0) + v; };
    for (const id of litSet) {
      const n = SF.constellations[id];
      if (!n) continue;
      for (const k in n.fx) add(k, n.fx[k]);
    }
    return fx;
  }

  SF.constellationSys = { nodeAvailable, aggregate };
})();
