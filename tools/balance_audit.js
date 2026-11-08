/* Reproducible character DPS audit. No browser or installed dependencies.
 * node tools/balance_audit.js [--source <project-or-backup>] [--out <json>]
 * Static targets and expected crit damage measure offensive ceilings, not clear rates.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const options = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  assert.ok(['--source', '--out'].includes(key) && process.argv[i + 1], 'Use --source <dir> or --out <json>');
  options[key] = path.resolve(process.argv[i + 1]);
}
const source = options['--source'] || ROOT;
const output = options['--out'] || path.join(ROOT, 'gui-test-screenshots', 'v2.0', 'balance-audit.json');
global.window = global;
global.location = { search: '' };
global.SF = {};
const noop = () => {};
let seed = 240907, heatTimes = [];
Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
SF.renderer = { cam: { x: 0, y: 0 }, width: 480, height: 270, addShake: noop };
SF.particles = new Proxy({}, { get: () => noop });
SF.audio = { sfx: new Proxy({}, { get: (_, key) => () => {
  if (key === 'heatBurst' || key === 'fireOverdrive') heatTimes.push(SF.game.time);
} }), playMusic: noop, stopMusic: noop, setBossPhase: noop };
SF.widgets = new Proxy({}, { get: () => noop });
SF.world = { setSeed: noop };
SF.input = { moveVector: () => ({ x: 0, y: 0 }), isPressed: () => false };
SF.save = { profile: null };
for (const file of ['core/utils', 'core/palette', 'data/config', 'data/weapons', 'data/passives', 'data/enemies',
  'data/characters', 'growth/constellations', 'sim/projectiles', 'sim/pickups', 'sim/enemies', 'sim/boss',
  'sim/weapons', 'sim/spawner', 'growth/player', 'growth/progression', 'engine/game']) require(path.join(source, 'src', file + '.js'));
const STEP = 1 / 60;

function fixture(char, loadout, developed = false, passives = []) {
  SF.save.profile = { charUpgrades: { [char]: developed ? { hp: 5, speed: 5, dmg: 5, weapon: 5 } : {} } };
  const g = SF.game = new SF.Game(); g.reset(char, 'normal');
  const pl = g.player;
  pl.weapons = loadout.map(([id, level]) => new SF.WeaponInstance(SF.weapons[id], level));
  if (developed) {
    for (const [id, node] of Object.entries(SF.constellations)) if (node.con === pl.char.homeTree) pl.litStars.add(id);
    for (const id of passives) pl.passives.set(id, { level: SF.passives[id].maxLevel });
  }
  pl.recalcStats(); pl.updateResonance();
  if (!developed) pl.stats.critChance = 0;
  for (const w of pl.weapons) w.owner = pl;
  heatTimes = []; seed = 240907;
  return g;
}
function target(g, boss = true) {
  const e = g.enemies.spawnAt(boss ? 'boss2' : 'grub', 80, 0, 1, 0);
  e.hp = e.maxHp = 1e9; e.speed = 0;
  return e;
}
function critMean(pl) { return 1 + pl.stats.critChance * (pl.stats.critMult - 1); }
function expectedHit(w, pl) {
  const chance = pl.stats.critChance, mean = critMean(pl);
  pl.stats.critChance = 0;
  const value = w.rollDamage(w.spec.damage, pl) * mean;
  pl.stats.critChance = chance;
  return value;
}
function profile(pl) {
  return { character: pl.char.id, weapons: pl.weapons.map(w => ({ id: w.def.id, level: w.level })),
    passives: Object.fromEntries(pl.passives), matrixPoints: [...pl.litStars].reduce((s, id) => s + pl.starCost(id), 0),
    damageMul: pl.stats.damageMul, critChance: pl.stats.critChance, critMult: pl.stats.critMult };
}
function simulateFire(loadout, developed, withSkill) {
  const g = fixture('vega', loadout, developed, ['engine', 'crit']), pl = g.player;
  const mean = critMean(pl);
  if (!withSkill) pl.traits.heatBurst = false; // 主动版只关闭输入，保留常态被动及齐射去重。
  SF.input.isPressed = act => withSkill && act === 'skill' && pl.heat >= SF.config.VEGA_HEAT.threshold;
  const e = target(g), takeDamage = e.takeDamage;
  let direct = 0, burns = 0, fields = 0, inStatus = false, inField = false;
  let activeTime = 0, activeDamage = 0, peakLayers = 0, peakBurnDps = 0;
  e.takeDamage = function (dmg, game, color, meta) {
    const dealt = takeDamage.call(this, dmg, game, color, meta);
    const isBurn = meta?.burn || inStatus; // 兼容 --source 指定的旧版伤害入口。
    if (isBurn) burns += dealt;
    else if (inField) fields += dealt;
    else direct += dealt;
    if (pl.fireOverdriveT > 0) activeDamage += dealt * (isBurn || inField ? 1 : mean);
    return dealt;
  };
  pl.stats.critChance = 0;
  const duration = 360;
  for (let frame = 0; frame < duration * 60; frame++) {
    g.time = (frame + 1) * STEP;
    pl.update(STEP, g);
    inStatus = true; e.update(STEP, g); inStatus = false;
    SF.projectiles.update(STEP, g);
    inField = true; SF.projectiles.updateFields(STEP, g); inField = false;
    if (pl.fireOverdriveT > 0) activeTime += STEP;
    peakLayers = Math.max(peakLayers, e.burns?.filter(b => b.stacked).length || 0);
    peakBurnDps = Math.max(peakBurnDps, e.burnDps);
  }
  const gaps = heatTimes.slice(1).map((t, i) => t - heatTimes[i]);
  SF.input.isPressed = () => false;
  return { duration, activations: heatTimes.length, firstActivation: heatTimes[0] ?? null,
    minGap: gaps.length ? Math.min(...gaps) : null,
    meanGap: gaps.length ? gaps.reduce((s, t) => s + t, 0) / gaps.length : null,
    dutyCycle: activeTime / duration, activeDps: activeTime ? activeDamage / activeTime : null,
    directDps: direct * mean / duration, burnDps: burns / duration, fieldDps: fields / duration,
    totalDps: (direct * mean + burns + fields) / duration, peakLayers, peakBurnDps };
}
function heatAudit(name, loadout, developed = false) {
  const g = fixture('vega', loadout, developed, ['engine', 'crit']), pl = g.player;
  const build = profile(pl), C = SF.config, heat = C.VEGA_HEAT;
  const originalDirectDps = pl.weapons.reduce((s, w) => s + expectedHit(w, pl) * (w.spec.count || 1)
    / (w.spec.cooldown * (w.def.cooldownMul || 1) * pl.stats.cooldownMul), 0);
  let bound = null;
  if (heat.duration) {
    const recharge = heat.threshold * heat.interval, cycle = recharge + heat.duration;
    const layers = pl.weapons.map(w => {
      const interval = w.spec.cooldown * (w.def.cooldownMul || 1) * pl.stats.cooldownMul * heat.cooldownMul;
      const count = Math.ceil(heat.duration / interval);
      const dps = w.spec.burn * (pl.stats.resonance.fire ? C.BURN_RESONANCE_MUL : 1);
      const life = (w.spec.burnDuration || C.FIRE_BASE_BURN_DURATION) * heat.burnDurationMul
        * (pl.traits.layeredBurn ? C.VEGA_BURN_DURATION_MUL : 1) * (1 + (pl.stats.burnDuration || 0));
      return { weapon: w.def.id, interval, maxLayersPerActivation: count, layerDps: dps, life, totalDamage: count * dps * life };
    });
    bound = { rechargeMinimum: recharge, cycleMinimum: cycle, dutyCycleMaximum: heat.duration / cycle,
      normalDirectDps: originalDirectDps / C.FIRE_COOLDOWN_MUL,
      activeDirectDps: originalDirectDps / heat.cooldownMul,
      extraLayerDpsUpperOverCycle: layers.reduce((s, l) => s + l.totalDamage, 0) / cycle, layers };
  }
  const ordinary = simulateFire(loadout, developed, false), skill = simulateFire(loadout, developed, true);
  return { name, ...build, bound, ordinary, skill, skillExtraDps: skill.totalDps - ordinary.totalDps };
}
function railAudit(name, id, level, developed = false) {
  // nuke + crit is a legal high-crit partner; total 2 weapons / 2 passives / 30 home points.
  const g = fixture('thunder', developed ? [[id, level], ['nuke', 4]] : [[id, level]], developed, ['cooldown', 'crit']);
  const pl = g.player, w = pl.weapons[0], hit = expectedHit(w, pl), C = SF.config.THUNDER_CAPACITOR;
  const charge = w.chargeDuration(pl), store = pl.stats.railgunStorage;
  const fullDps = hit * C.burstDamageMul / (store * charge);
  const originalDps = hit / charge;
  const withoutChargeTrait = originalDps * pl.stats.chargeMul;
  return { name, ...profile(pl), charge, burstInterval: store * charge,
    ordinaryHit: hit * C.normalDamageMul, burstHit: hit * C.burstDamageMul,
    originalDps, ordinaryDps: originalDps * C.normalDamageMul, fullDps,
    capacitorExtraDps: fullDps - originalDps, chargeAndCapacitorExtraDps: fullDps - withoutChargeTrait,
    maxCritBurst: hit / critMean(pl) * pl.stats.critMult * C.burstDamageMul };
}
function frostAudit(name, orb, level, developed = false) {
  const g = fixture('firefly', [[orb, level], ['mirrorWheel', 6]], developed, ['cryo', 'crit']), pl = g.player;
  const C = SF.config, cycle = pl.stats.frostCounterCooldown, stacks = C.ICE_STACK_MUL ** C.ICE_STACK_MAX;
  const ring = expectedHit(pl.weapons[0], pl), shard = expectedHit(pl.weapons[1], pl);
  const cap = C.FIREFLY_FROST_MAX_HITS || C.ENEMY_CAP;
  const retaliation = ring * C.FIREFLY_ICE_RETALIATE_CENTER_MUL * (1 + (pl.stats.counterDamage || 0)) * stacks / cycle;
  // One ordinary shard hit is already in weapon DPS; count only the extra overlap hits.
  const shardExtra = (cap - 1) * shard * stacks / cycle;
  const normalWeapons = pl.weapons.reduce((s, w) => s + expectedHit(w, pl) / (w.spec.cooldown * pl.stats.cooldownMul), 0);
  return { name, ...profile(pl), cycle, window: pl.stats.phaseInvulnDuration, maxHitsPerTarget: cap,
    normalWeaponsDps: normalWeapons, iceStackExtraDpsAtFullUptime: normalWeapons * (stacks - 1),
    retaliationDpsAtEveryWindow: retaliation, extraShardDpsAtEveryWindow: shardExtra,
    counterExtraDpsBySuccessRate: Object.fromEntries([0.25, 0.5, 1].map(p => [p, (retaliation + shardExtra) * p])) };
}
function frostCrowd(count) {
  const g = fixture('firefly', [['mirrorWheel', 6]]), pl = g.player, w = pl.weapons[0];
  const boss = target(g);
  for (let i = 1; i < count; i++) target(g, false);
  // Preload the strongest legal boss vulnerability. Total enemies stays within the configured cap.
  boss.iceStacks = SF.config.ICE_STACK_MAX; boss.iceStackT = 5;
  w.frostEmpowered = true; w.fire(g); SF.projectiles.update(0.5, g);
  const p = SF.projectiles.list.find(p => p.kind === 'frostShard');
  const single = w.spec.damage * pl.stats.damageMul * SF.config.ICE_STACK_MUL ** SF.config.ICE_STACK_MAX;
  return { enemies: count, contacts: p.hitSet.size, bossDamage: boss.maxHp - boss.hp,
    damageInSingleHits: (boss.maxHp - boss.hp) / single, freezeT: boss.freezeT };
}
const report = {
  source, assumptions: {
    base: '零工坊、无矩阵/被动/暴击，保留角色倍率；双冰共鸣只影响控制，不增伤。',
    developed: '满工坊、30 点本系、列出的满级武器/被动，暴击取期望；没有假设所有矩阵同时点满。',
    damage: '单目标；霜翎按 Boss 可用的满冰蚀 ×1.331，其它角色无冰蚀。小怪冻结易伤另乘 ×1.2。',
    cadence: '焰锋用实际固定步长 360 秒孤立 Boss 木桩，分别关闭/开启技能；命中丢失、停滞、等待会降低输出。',
    fire: '火武直伤用平均暴击倍率换算，灼烧/火海沿用不吃火力暴击的原规则；技能额外 DPS 是同版本开启与关闭技能的差。',
    frost: '防反成功率是条件场景，不是实测人类成功率；穿透的普通第一击已排除在额外 DPS 之外。',
  },
  config: { heat: SF.config.VEGA_HEAT, normalFireCooldownMul: SF.config.FIRE_COOLDOWN_MUL || 1,
    normalBurnDurationMul: SF.config.FIRE_BURN_DURATION_MUL || 1, capacitor: SF.config.THUNDER_CAPACITOR,
    frostMaxHits: SF.config.FIREFLY_FROST_MAX_HITS || null },
  heat: [heatAudit('初始飞刃', [['blade', 1]]), heatAudit('满级飞刃', [['blade', 6]]),
    heatAudit('双火超武', [['prism', 4], ['nuke', 4]]), heatAudit('双火终盘', [['prism', 4], ['nuke', 4]], true)],
  rail: [railAudit('电磁 Lv.1', 'chain', 1), railAudit('电磁 Lv.6', 'chain', 6),
    railAudit('天罚 Lv.1', 'tempest', 1), railAudit('天罚 Lv.4', 'tempest', 4), railAudit('天罚终盘', 'tempest', 4, true)],
  frost: [frostAudit('满级双冰', 'orb', 6), frostAudit('双冰终盘', 'absoluteZero', 4, true)],
  frostCrowd: [1, 3, 12, SF.config.ENEMY_CAP].map(frostCrowd),
};
const json = JSON.stringify(report, (_, v) => { assert.ok(typeof v !== 'number' || Number.isFinite(v), 'Non-finite measurement'); return v; }, 2);
fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, json + '\n');
console.table(report.heat.map(({ name, ordinary, skill, skillExtraDps }) =>
  ({ name, ordinaryDps: ordinary.totalDps, cycleDps: skill.totalDps, activeDps: skill.activeDps,
    skillExtraDps, activations: skill.activations, minGap: skill.minGap, peakLayers: skill.peakLayers })));
console.table(report.rail.map(({ name, burstInterval, fullDps, capacitorExtraDps }) => ({ name, burstInterval, fullDps, capacitorExtraDps })));
console.table(report.frostCrowd);
console.log('Balance audit:', output);
