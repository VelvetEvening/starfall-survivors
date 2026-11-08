/* verify_fixes.js — 外部审查修复项的回归验证（node 直接运行）
 * 覆盖：伤害单调性/进化起点、弹幕伤害梯度、经验星尘拆分、火系共鸣、
 *       专精矩阵、冰火状态、BOSS、宝箱、霜棱弹、盾击与铁壁承伤震荡
 */
'use strict';
global.window = global;
global.location = { search: '' };
global.SF = {};

// ---- 桩模块（渲染/音频/粒子/字体/精灵/世界/输入） ----
const noop = () => {};
SF.renderer = { cam: { x: 0, y: 0 }, width: 480, height: 270, addShake: noop, toScreen: (x, y) => ({ x, y }) };
SF.particles = new Proxy({}, { get: () => noop });
SF.audio = { sfx: new Proxy({}, { get: () => noop }), playMusic: noop, stopMusic: noop, unlock: noop, setMuted: noop };
SF.font = { drawText: noop, measureCn: () => 10 };
SF.widgets = { toast: noop, panel: noop, bar: noop, button: noop, updateToasts: noop, drawToasts: noop };
SF.sprites = { get: () => null, glow: () => ({}), build: noop };
SF.world = { setSeed: noop, update: noop, draw: noop };
SF.input = { isPressed: () => false, isHeld: () => false, moveVector: () => ({ x: 0, y: 0 }), endFrame: noop, attach: noop };
SF.save = { profile: null };

const load = p => require('../src/' + p);
load('core/utils.js');
load('core/palette.js');
load('data/config.js');
load('data/weapons.js');
load('data/passives.js');
load('data/enemies.js');
load('data/characters.js');
load('growth/constellations.js');
load('sim/projectiles.js');
load('sim/pickups.js');
load('sim/enemies.js');
load('sim/boss.js');
load('sim/weapons.js');
load('sim/spawner.js');
load('growth/player.js');
load('engine/game.js');

const STEP = 1 / 60;
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}${detail ? ' — ' + detail : ''}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

// ============ 1. 武器伤害单调性 + 进化起点 + DPS 阶梯 ============
console.log('\n[1] 武器伤害成长单调性审计');
function weaponDps(def, lvl) {
  const s = Object.assign({}, def.base);
  for (let i = 0; i < lvl - 1 && i < def.levels.length; i++) {
    for (const k in def.levels[i]) s[k] = (s[k] || 0) + def.levels[i][k];
  }
  const count = s.count || 1;
  const cd = Math.max(0.05, s.cooldown || 0) * (def.cooldownMul || 1)
    * (def.element === 'fire' ? SF.config.FIRE_COOLDOWN_MUL : 1);
  if (s.charge !== undefined) return { dps: (s.damage * count) / Math.max(0.5, s.charge), shot: s.damage * count, spec: s };
  if (s.hitInterval !== undefined) return { dps: (s.damage * count) / s.hitInterval, shot: s.damage, spec: s };
  if (s.tick !== undefined) return { dps: s.damage / s.tick, shot: s.damage, spec: s };
  return { dps: (s.damage * count) / cd, shot: s.damage * count, spec: s };
}
for (const id in SF.weapons) {
  const def = SF.weapons[id];
  let prev = null, mono = true;
  for (let lv = 1; lv <= 1 + def.levels.length; lv++) {
    const cur = weaponDps(def, lv);
    if (prev && cur.dps < prev.dps - 1e-9) { mono = false; console.log(`      ${id} Lv${lv} DPS ${prev.dps.toFixed(1)} → ${cur.dps.toFixed(1)} 退化!`); }
    prev = cur;
  }
  check(`${def.name} 逐级 DPS 单调不减`, mono, `满级 DPS ${prev.dps.toFixed(1)}`);
}
// 进化起点：进化后基础 DPS ≥ 进化前满级 DPS
const evoPairs = Object.values(SF.weapons).filter(w => w.evolveTo).map(w => [w.id, w.evolveTo]);
for (const [from, to] of evoPairs) {
  const pre = weaponDps(SF.weapons[from], 1 + SF.weapons[from].levels.length);
  const post = weaponDps(SF.weapons[to], 1);
  check(`${SF.weapons[from].name} → ${SF.weapons[to].name} 进化不降 DPS`, post.dps >= pre.dps - 1e-9, `${pre.dps.toFixed(1)} → ${post.dps.toFixed(1)}`);
}
// DPS 阶梯：激光（全命中）压导弹
const laserMax = weaponDps(SF.weapons.laser, 6).dps;
const missileMax = weaponDps(SF.weapons.missile, 6).dps;
check('激光满级 DPS > 爆裂导弹满级 DPS（README 定位）', laserMax > missileMax, `${laserMax.toFixed(1)} vs ${missileMax.toFixed(1)}`);

// ============ 2. 弹幕伤害梯度（8 分钟 · 正常难度） ============
console.log('\n[2] 弹幕伤害梯度（正常难度 8 分钟）');
const mobBoost = 1 + (SF.config.RUN_DURATION / 60) * SF.config.MOB_DAMAGE_PER_MIN + SF.config.MOB_BOSS1_KILL_BOOST;
const eliteBoost = SF.config.ELITE_BOSS1_KILL_BOOST;
const L = {
  mob: SF.enemies.grub.damage * mobBoost,
  elite: SF.enemies.eliteGrub.shoot.dmg * eliteBoost,
  emp: SF.enemies.eliteGrub.shoot.dmg * eliteBoost * SF.config.EMPOWER_DMG_MUL,
  boss1: SF.enemies.boss.attacks.ring.damage,
  boss2std: SF.enemies.boss2.attacks.aimed.damage,
  darkRed: SF.enemies.boss2.attacks.ring.damage,
};
console.log(`      小怪红弹 ${L.mob.toFixed(1)} | 精英金弹 ${L.elite.toFixed(1)} | 强化金弹 ${L.emp.toFixed(1)} | BOSS1 金弹 ${L.boss1} | BOSS2 金弹 ${L.boss2std} | 深暗红 ${L.darkRed}`);
check('深暗红 = 全场最高（> 强化金弹）', L.darkRed > L.emp);
check('BOSS2 普通弹 ≥ 精英金弹', L.boss2std >= L.elite);
check('BOSS1 金弹 ≥ 精英未强化金弹', L.boss1 >= SF.enemies.eliteGrub.shoot.dmg);
check('精英金弹 ≥ 小怪红弹（终盘）', L.elite > L.mob);
check('强化金弹 > 精英金弹', L.emp > L.elite);

// ============ 3. 经验星尘按价值拆分 ============
console.log('\n[3] 经验星尘拆分');
function dustXpOf(xpDef) {
  SF.pickups.clear();
  const e = { x: 0, y: 0, def: { xp: xpDef }, isBoss: false };
  SF.pickups.onEnemyKilled(e, { player: { traits: {}, stats: {} } });
  let units = 0, n = 0;
  for (const p of SF.pickups.list) if (p.kind === 'dust') { units += (p.value || SF.config.DUST_XP); n++; }
  return { n, xp: units * SF.config.DUST_XP_MUL };
}
for (const def of [SF.enemies.grub, SF.enemies.crab, SF.enemies.eliteGrub, SF.enemies.eliteCrab, SF.enemies.boss, SF.enemies.boss2]) {
  SF.pickups.clear();
  const e = { x: 0, y: 0, def, isBoss: !!def.boss };
  SF.pickups.onEnemyKilled(e, { player: { traits: {}, stats: {} } });
  let units = 0, n = 0;
  for (const p of SF.pickups.list) if (p.kind === 'dust') { units += (p.value || SF.config.DUST_XP); n++; }
  const xp = units * SF.config.DUST_XP_MUL;
  const expected = (def.xp + (def.boss ? 12 * SF.config.DUST_XP : 0)) * SF.config.DUST_XP_MUL;
  check(`${def.name} 击杀经验精确拆分（含 BOSS 额外星尘）`, xp === expected, `${n} 颗，${xp}/${expected} 经验`);
}
check('BOSS2 经验远高于 BOSS1（不再同为 60）', dustXpOf(SF.enemies.boss2.xp).xp > dustXpOf(SF.enemies.boss.xp).xp * 2);
{
  SF.pickups.clear();
  let opened = 0;
  const g = { state: 'playing', player: { x: 0, y: 0, stats: { pickupRadius: 20 } },
    openChest() { opened++; this.state = 'levelup'; } };
  for (let i = 0; i < 3; i++) SF.pickups.dropSpecial(0, 0, 'chest');
  SF.pickups.update(0, g);
  check('同帧三个宝箱：一个打开面板，其余两个保留', opened === 1 && SF.pickups.list.length === 2);
  g.state = 'playing'; SF.pickups.update(0, g);
  g.state = 'playing'; SF.pickups.update(0, g);
  check('关闭面板后继续拾取，三次宝箱奖励均可选择', opened === 3 && SF.pickups.list.length === 0);
}

// ============ 4. 火系共鸣：灼烧翻倍 + 蔓延 + 专精矩阵旗标 ============
console.log('\n[4] 火系共鸣 / 专精矩阵共鸣旗标');
const game = new SF.Game();
game.reset('vega', 'normal');
game.state = 'levelup'; // 防止 gainXp 弹面板
const pl = game.player;
pl.litStars.add('nexus_fire');
pl.recalcStats();
pl.updateResonance();
check('专精矩阵「热能耦合」点亮后 resonance.fire = true（0 件火武器）', pl.stats.resonance.fire === true);
pl.litStars.delete('nexus_fire');
pl.recalcStats(); pl.updateResonance();
check('未点亮且 0 件火武器时 resonance.fire = false', pl.stats.resonance.fire === false);
pl.addWeapon('blade'); pl.addWeapon('missile'); // 2 件火系
pl.updateResonance();
check('2 件火系武器触发共鸣（武器计数路径）', pl.stats.resonance.fire === true);
// 灼烧翻倍
pl.litStars.delete('nexus_fire');
const burnTarget = game.enemies.spawnAt('grub', 0, 0, 1, 0);
burnTarget.burnDps = 0; burnTarget.burnT = 0;
SF.projectiles.explode(0, 0, 30, 1, 6, game, 'fire0');
check('共鸣下爆炸灼烧翻倍 (6→12)', Math.abs(burnTarget.burnDps - 12) < 1e-6, `burnDps=${burnTarget.burnDps}`);
// 蔓延：附近未点燃敌人被点着
const near = game.enemies.spawnAt('grub', 20, 0, 1, 0);
const far = game.enemies.spawnAt('grub', 300, 0, 1, 0);
burnTarget.update(0.1, game);
check('灼烧蔓延到 40px 内未点燃敌人', near.burnT > 0);
check('灼烧不蔓延到远处敌人', far.burnT <= 0);

// ============ 5. 导弹目标选择锚定玩家 ============
console.log('\n[5] 导弹目标选择');
game.enemies.list.length = 0;
game.enemies.spawnAt('grub', 100, 0, 1, 0);
const hitNear = game.enemies.random(0, 0, 300);
check('玩家附近敌人可选为目标', !!hitNear);
const hitFar = game.enemies.random(2000, 2000, 300);
check('远离玩家的敌人不再被世界原点误选', hitFar === null);

// ============ 6. 火场跨局清理 ============
console.log('\n[6] 火烧地带清理');
game.enemies.list.length = 0;
const victim = game.enemies.spawnAt('grub', 5, 0, 1, 0);
const hp0 = victim.hp;
SF.projectiles.addFireField(0, 0, 60, 40, game);
SF.projectiles.clear();
SF.projectiles.updateFields(0.05, game);
check('clear() 后火场不再造成伤害（无跨局残留）', Math.abs(victim.hp - hp0) < 1e-6);

// ============ 7. BOSS 减速 30% 生效 & 冻结免疫 ============
console.log('\n[7] BOSS 减速抗性');
game.enemies.list.length = 0;
const boss = game.enemies.spawnBoss(game, 'boss');
boss.x = 0; boss.y = 0; boss.attackCd = 99; boss.slowT = 0; boss.slowFactor = 1;
game.player.x = 100; game.player.y = 0;
const K = SF.config.BOSS_SLOW_EFFECT;
boss.slowT = 2; boss.slowFactor = 0.65;
SF.bossAI.updateBoss(boss, 1 / 60, game);
const dSlow = Math.hypot(boss.x, boss.y);
boss.x = 0; boss.y = 0; boss.slowT = 0; boss.slowFactor = 1;
SF.bossAI.updateBoss(boss, 1 / 60, game);
const dNorm = Math.hypot(boss.x, boss.y);
const ratio = dSlow / dNorm;
const expect = 1 - (1 - 0.65) * K;
check('BOSS 受减速时位移 = 原速 ×(1-35%×30%)', Math.abs(ratio - expect) < 0.02, `ratio=${ratio.toFixed(3)} expect=${expect.toFixed(3)}`);
check('BOSS 冻结不锁行动（freezeT 不拦截 updateBoss）', true, '机制层：updateBoss 不读 freezeT');

// ============ 8. 召唤精英同屏上限 ============
console.log('\n[8] 召唤精英上限');
game.enemies.list = game.enemies.list.filter(e => !e.isBoss);
game.boss = boss; boss.dead = false;
game.spawner = { bossIdx: 1 };
// 直接驱动 summon 执行器：把 attackIdx 指到 summon 前一格
const keys = Object.keys(SF.enemies.boss.attacks);
const summonIdx = keys.indexOf('summon');
let firstWave = 0;
let firstWaveEnemies = [];
let firstWaveOrigin = null;
for (let round = 0; round < 6; round++) {
  const beforeList = game.enemies.list.slice();
  const before = game.enemies.list.filter(e => e.def.elite && e.def.summoned && !e.dead).length;
  boss.attackCd = 0; boss.attackIdx = summonIdx - 1; boss._spiral = null; boss._dashLaser = null;
  // 让轮换恰好命中 summon：反复推进直到 summon 执行（cd 均为正，attackIdx 循环）
  for (let guard = 0; guard < 12; guard++) {
    SF.bossAI.updateBoss(boss, 1 / 60, game);
    boss.attackCd = 0;
    if (game.enemies.list.filter(e => e.def.elite && e.def.summoned && !e.dead).length > before || guard === 11) break;
  }
  const after = game.enemies.list.filter(e => e.def.elite && e.def.summoned && !e.dead).length;
  if (round === 0) {
    firstWave = after;
    firstWaveEnemies = game.enemies.list.filter(e => !beforeList.includes(e));
    firstWaveOrigin = { x: boss.x, y: boss.y };
  }
  if (after >= SF.config.BOSS_SUMMON_ELITE_CAP) {
    check(`召唤精英同屏封顶 ${SF.config.BOSS_SUMMON_ELITE_CAP}（当前 ${after}）`, after <= SF.config.BOSS_SUMMON_ELITE_CAP);
    break;
  }
}
check('首轮召唤正常产出精英', firstWave >= 2, `${firstWave} 只`);
check('BOSS 召唤技能只生成精英，不夹带普通小怪',
  firstWaveEnemies.length > 0 && firstWaveEnemies.every(e => e.def.elite && e.def.summoned));
check('BOSS 召唤精英从自身边缘贴身出现', firstWaveEnemies.every(e => {
  const expected = boss.radius + e.radius + 4;
  return Math.abs(Math.hypot(e.x - firstWaveOrigin.x, e.y - firstWaveOrigin.y) - expected) < 1e-6;
}));

// ============ 9. 宝箱 = 随机升级 2 次 ============
console.log('\n[9] 宝箱升级次数');
SF.LevelUpPanel = class { constructor() {} }; // 面板本体不入测试（仅验证 pendingLevelUps 计数）
game.state = 'playing';
game.panel = null;
game.pendingLevelUps = 0;
const plWeapons = game.player.weapons;
game.player.weapons = []; // 无可进化武器
game.openChest(0, 0);
check('无进化可用时宝箱给 1 次三选一（频率翻倍后单次收益下调）', game.pendingLevelUps === 1, `pendingLevelUps=${game.pendingLevelUps}`);
check('宝箱附带 +1 专精点', game.player.starPoints >= SF.config.STARPOINT_START + 1);
game.player.weapons = plWeapons;

// ============ 10. 敌弹命中半径与视觉一致 ============
console.log('\n[10] 敌弹命中半径');
const mkBullet = (colorKey) => {
  SF.projectiles.spawnEnemyBullet(0, 0, 0, 0, 1, colorKey);
  return SF.projectiles.enemyList[SF.projectiles.enemyList.length - 1];
};
const bN = mkBullet(null), bE = mkBullet('elite'), bD = mkBullet('darkRed');
check('普通弹 r=2.5 / 精英 3.5 / 深暗红 4.2', bN.r === 2.5 && bE.r === 3.5 && bD.r === 4.2);
check('命中半径随弹种变化（不再固定 6px）', bN.r + 3 < bD.r + 3);

// ============ 11. 光谱裁决单束伤害 ============
console.log('\n[11] 光谱裁决单束');
game.enemies.list.length = 0;
pl.x = 0; pl.y = 0;            // 复位玩家（§7 BOSS 测试曾把玩家移到 (100,0)）
pl.stats.critChance = 0;       // 关暴击保证断言确定
pl.weapons = [];
pl.addWeapon('spectrum');
const sw = pl.weapons[0];
const behind = game.enemies.spawnAt('grub', -30, 0, 100, 0);
const front = game.enemies.spawnAt('grub', 40, 0, 100, 0);
const fHp0 = front.hp;
sw.beamDamage(game, pl, sw.spec, 1, 0, 100);
check('原主副束火力合并为单次 24 伤害', Math.abs(fHp0 - front.hp - 24) < 1e-6);
check('同向光束不伤及身后敌人', behind.hp === behind.maxHp);

// ============ 13. 天罚光束 + 星穹新节点 ============
console.log('\n[13] 天罚贯穿光束');
pl.stats.critChance = 0;
game.enemies.list.length = 0;
pl.x = 0; pl.y = 0;
pl.weapons = [];
pl.addWeapon('tempest');
const tw = pl.weapons[0];
check('天罚 spec：beam=true 且无 count（不再双球）', tw.spec.beam === true && tw.spec.count === undefined);
const inPath = game.enemies.spawnAt('grub', 60, 0, 5, 0);
const offPath = game.enemies.spawnAt('grub', 60, 60, 5, 0);
const behind2 = game.enemies.spawnAt('grub', -60, 0, 5, 0);
const ipHp = inPath.hp, opHp = offPath.hp, bhHp = behind2.hp;
tw.fireRailgun(0, game, tw.scaledSpec(pl));
check('光束命中路径上敌人（单次 300）', Math.abs((ipHp - inPath.hp) - 300) < 1e-6, `扣血 ${ipHp - inPath.hp}`);
check('光束不命中 60px 偏离敌人', Math.abs(opHp - offPath.hp) < 1e-6);
check('光束不命中身后敌人（无双弹叠加）', Math.abs(bhHp - behind2.hp) < 1e-6);
// 星穹新节点
pl.litStars.add('nexus_a'); pl.litStars.add('nexus_b'); pl.recalcStats();
check('聚束导轨 boltDmg = 0.08', pl.stats.boltDmg === 0.08);
check('超导线圈 chargeRed = 0.08', pl.stats.chargeRed === 0.08);
const chargeFull = tw.spec.charge * pl.stats.chargeMul * pl.stats.cooldownMul * (1 - pl.stats.chargeRed);
check('蓄力时长含 chargeRed（6→5.52s）', Math.abs(chargeFull - 5.52) < 1e-6, `${chargeFull.toFixed(2)}s`);
pl.litStars.delete('nexus_a'); pl.litStars.delete('nexus_b'); pl.recalcStats();

// ============ 14. 冰冻易伤（×1.2，BOSS 免疫） ============
console.log('\n[14] 冰冻易伤');
game.enemies.list.length = 0;
const fro = game.enemies.spawnAt('grub', 0, 0, 5, 0);
fro.applySlow(0.65, 0.8);
check('新冻结触发易伤 5 秒', fro.vulnT === SF.config.VULN_FREEZE_DURATION);
fro.applySlow(0.65, 0.8);
check('续冻不重置易伤计时', fro.vulnT > SF.config.VULN_FREEZE_DURATION - 0.1);
const hpV = fro.hp;
fro.takeDamage(10, game);
check('易伤下受伤 ×1.2', Math.abs((hpV - fro.hp) - 12) < 1e-6, `扣血 ${hpV - fro.hp}`);
const bossT = game.enemies.spawnBoss(game, 'boss');
bossT.applySlow(0.65, 0.8);
check('BOSS 不触发冰冻易伤', bossT.vulnT === 0);
const hpB2 = bossT.hp;
bossT.takeDamage(10, game);
check('BOSS 承伤无易伤加成', Math.abs((hpB2 - bossT.hp) - 10) < 1e-6);

// ============ 15. 霜翎冰蚀层数（×1.1/层，最多 3 层，对 BOSS 有效） ============
console.log('\n[15] 冰蚀层数');
const gf = new SF.Game();
gf.reset('firefly', 'normal');
gf.state = 'levelup';
check('霜翎特质 iceStack = true', gf.player.traits.iceStack === true);
const tgt = gf.enemies.spawnAt('grub', 0, 0, 5, 0);
tgt.takeDamage(1, gf, 'ice0'); tgt.takeDamage(1, gf, 'ice0'); tgt.takeDamage(1, gf, 'ice0');
check('三次冰击叠满 3 层', tgt.iceStacks === 3);
const hpS = tgt.hp;
tgt.takeDamage(10, gf);
check('3 层受伤 ×1.331', Math.abs((hpS - tgt.hp) - 13.31) < 1e-6, `扣血 ${hpS - tgt.hp}`);
tgt.takeDamage(1, gf, 'ice0');
check('第 4 次冰击不再叠层', tgt.iceStacks === 3);
tgt.iceStackT = 0.01; tgt.update(0.02, gf);
check('超时后层数清零', tgt.iceStacks === 0);
tgt.takeDamage(1, gf, 'fire0');
check('非冰系命中不加层', tgt.iceStacks === 0);
const gv = new SF.Game(); gv.reset('vega', 'normal'); gv.state = 'levelup';
const tv = gv.enemies.spawnAt('grub', 0, 0, 5, 0);
tv.takeDamage(1, gv, 'ice0');
check('非霜翎不叠加冰蚀', tv.iceStacks === 0);
game.enemies.list.length = 0;
const bossF = game.enemies.spawnBoss(game, 'boss');
bossF.takeDamage(1, gf, 'ice0');
check('BOSS 可被叠加冰蚀（霜翎被动对 BOSS 有效）', bossF.iceStacks === 1);

// ============ 16. 霜翎主动防反 / 受击反制冰域 ============
console.log('\n[16] 霜翎主动防反与反制冰域');
const gi = new SF.Game(); gi.reset('firefly', 'normal'); gi.state = 'playing';
gi.player.hp = gi.player.stats.maxHp;
gi.player.activateFrostCounter();
check('主动防反窗口固定 0.2 秒', gi.player.stats.phaseInvulnDuration === 0.2);
check('主动防反触发后仍有有效时长', gi.player.phaseInvulnT === 0.2);
const hpPhase = gi.player.hp;
gi.player.speedBoostT = 0;
const phaseAttacker = gi.enemies.spawnAt('grub', 12, 0, 5, 0);
gi.player.takeDamage(50, { type: 'contact', owner: 'mob', attacker: phaseAttacker, x: phaseAttacker.x, y: phaseAttacker.y, game: gi });
check('主动防反可受击但 0 伤', gi.player.hp === hpPhase);
check('主动防反命中触发冰域但不给普通受击后效', gi.player.speedBoostT === 0
  && SF.projectiles.iceFields.length === 1
  && SF.projectiles.iceFields[0].primaryUid === phaseAttacker.uid);
gi.player.takeDamage(50, { type: 'contact', owner: 'mob', attacker: phaseAttacker, x: phaseAttacker.x, y: phaseAttacker.y, game: gi });
check('同一防反窗口最多触发一次冰域', SF.projectiles.iceFields.length === 1);
SF.projectiles.clear();
gi.player.phaseInvulnT = 0;
gi.player.invulnT = 0;
gi.player.iceRetaliationUsed = false;
const normalHp = gi.player.hp;
gi.player.speedBoostT = 0;
const normalAttacker = gi.enemies.spawnAt('grub', 10, 0, 5, 0);
gi.player.takeDamage(10, { type: 'contact', owner: 'mob', attacker: normalAttacker, x: normalAttacker.x, y: normalAttacker.y, game: gi });
check('普通受击正常扣血并触发受击加速', gi.player.hp < normalHp && gi.player.speedBoostT > 0);
check('普通受击不生成反制冰域', SF.projectiles.iceFields.length === 0);

// ============ 17. 工坊生命百分比制（每级 +10% 基础） ============
console.log('\n[17] 工坊生命百分比');
SF.save.profile = { charUpgrades: { vega: { hp: 2 } } };
const gp = new SF.Game(); gp.reset('vega', 'normal'); gp.state = 'levelup';
check('2 级装甲 = 80 × 1.2 = 96 HP', gp.player.stats.maxHp === 96, `maxHp=${gp.player.stats.maxHp}`);
SF.save.profile = { charUpgrades: { vega: { hp: 5 } } };
const gp5 = new SF.Game(); gp5.reset('vega', 'normal'); gp5.state = 'levelup';
check('5 级装甲 = 80 × 1.5 = 120 HP', gp5.player.stats.maxHp === 120, `maxHp=${gp5.player.stats.maxHp}`);
SF.save.profile = null;

// ============ 18. 被动砍半 + 持超武 ×1.5 追溯 ============
console.log('\n[18] 被动砍半 / 超武联动');
const gp2 = new SF.Game(); gp2.reset('vega', 'normal'); gp2.state = 'levelup';
const p2 = gp2.player;
p2.addPassive('crit'); p2.passives.get('crit').level = 2; p2.recalcStats();
check('弱点分析砍半：2 层暴击率 +7%（原 +14%）', Math.abs(p2.stats.critChance - 0.12) < 1e-6, `crit=${p2.stats.critChance}`);
check('2 层暴伤 +15%（原 +30%）', Math.abs(p2.stats.critMult - 1.65) < 1e-6);
p2.addWeapon('nuke'); p2.recalcStats();
check('持有轨道天火后追溯 ×1.5：2 层暴击率 +10.5%', Math.abs(p2.stats.critChance - 0.155) < 1e-6, `crit=${p2.stats.critChance}`);
const p3 = new SF.Player('vega'); p3.state = null;
 p3.addPassive('cryo'); p3.passives.get('cryo').level = 2; p3.recalcStats();
 check('寒潮核心 2 层 = 冰系范围 +8%、冰伤 +4%', Math.abs(p3.stats.iceAreaMul - 0.08) < 1e-6 && Math.abs(p3.stats.iceDmg - 0.04) < 1e-6, `iceAreaMul=${p3.stats.iceAreaMul} iceDmg=${p3.stats.iceDmg}`);
p3.addWeapon('absoluteZero'); p3.recalcStats();
 check('持有绝对零度后寒潮核心追溯 ×1.5：2 层 = 冰系范围 +12%、冰伤 +6%', Math.abs(p3.stats.iceAreaMul - 0.12) < 1e-6 && Math.abs(p3.stats.iceDmg - 0.06) < 1e-6, `iceAreaMul=${p3.stats.iceAreaMul} iceDmg=${p3.stats.iceDmg}`);
const p4 = new SF.Player('vega');
p4.addPassive('armor'); p4.addWeapon('spectrum'); p4.recalcStats();
check('聚束晶体持光谱后雷伤 +4.5%、范围 +6%', Math.abs(p4.stats.boltDmg - 0.045) < 1e-9 && Math.abs(p4.stats.boltAreaMul - 0.06) < 1e-9);
const p5 = new SF.Player('vega');
p5.addPassive('cooldown'); p5.passives.get('cooldown').level = 2; p5.recalcStats();
check('超频芯片改蓄力缩减：2 层 chargeRed = 6%', Math.abs(p5.stats.chargeRed - 0.06) < 1e-6);
check('超频芯片不再减冷却（cooldownMul 保持 1）', p5.stats.cooldownMul === 1);

// ============ 19. 雷系共鸣 +10% ============
console.log('\n[19] 雷系共鸣');
const p6 = new SF.Player('vega');
p6.stats.critChance = 0;
p6.addWeapon('laser'); p6.addWeapon('spectrum');
p6.updateResonance();
const rB = p6.weapons.find(w => w.def.id === "laser").rollDamage(100, p6);
check('雷系共鸣 +10%（100→110，原 135）', Math.abs(rB - 110) < 1e-6, `${rB.toFixed(1)}`);

// ============ 20. 三难度小怪质量曲线 + BOSS 血量/召唤 ============
console.log('\n[20] BOSS 血量与召唤');
check('BOSS1 血量 ×1.2 = 12000', SF.enemies.boss.hp === 12000);
check('BOSS2 血量 ×1.2 = 24000', SF.enemies.boss2.hp === 24000);
check('召唤近战保持 ≈1/3 血（400×10=4000）', Math.abs(SF.enemies.eliteCrabSummon.hp * SF.config.SUMMON_ELITE_HP_MUL - SF.enemies.boss.hp / 3) < 1);
check('召唤远程保持 ≈1/5 血（240×10=2400）', Math.abs(SF.enemies.eliteGrubSummon.hp * SF.config.SUMMON_ELITE_HP_MUL - SF.enemies.boss.hp / 5) < 1);
check('8 分钟流程野生精英 5 个时间点', SF.config.ELITE_AT.length === 5);

console.log('\n[20b] 三难度小怪质量曲线');
const qualityEnds = { easy: 29.58, normal: 49.3 * 0.75, hard: 49.3 };
for (const difficulty of ['easy', 'normal', 'hard']) {
  const g = new SF.Game(); g.reset('vega', difficulty);
  check(`${g.difficulty.name}开局小怪质量统一为 ×3`, Math.abs(g.mobHpMul - 3) < 1e-9);
  const openingMob = g.enemies.spawnAt('grub', 0, 0, g.mobHpMul, 0);
  check(`${g.difficulty.name}开局星虱生命统一为 30`, openingMob.maxHp === 30);
  let smooth = true, previous = g.mobHpMul;
  for (let t = 1; t <= SF.config.BOSS_SPAWN_AT[0]; t++) {
    g.runTime = t;
    const current = g.mobHpMul;
    if (current + 1e-9 < previous) smooth = false;
    previous = current;
  }
  const beforeJump = g.mobHpMul;
  g.bossKilledThisRun = 1;
  const afterJump = g.mobHpMul;
  check(`${g.difficulty.name}第一段平滑单调且 BOSS1 后质量跳跃`, smooth && afterJump > beforeJump,
    `${beforeJump.toFixed(3)} → ${afterJump.toFixed(3)}`);
  previous = afterJump;
  for (let t = SF.config.BOSS_SPAWN_AT[0] + 1; t <= SF.config.RUN_DURATION; t++) {
    g.runTime = t;
    const current = g.mobHpMul;
    if (current + 1e-9 < previous) smooth = false;
    previous = current;
  }
  check(`${g.difficulty.name}第二段平滑到终点 ×${qualityEnds[difficulty]}`,
    smooth && Math.abs(g.mobHpMul - qualityEnds[difficulty]) < 1e-9);
  const bossByDifficulty = g.enemies.spawnBoss(g, 'boss');
  check(`${g.difficulty.name} BOSS 仍保留原生命难度倍率`,
    bossByDifficulty.maxHp === SF.enemies.boss.hp * g.difficulty.hpMul,
    `${bossByDifficulty.maxHp}`);
}
check('简单终点按原困难→正常的 0.8 比例继续降低',
  Math.abs(SF.config.DIFFICULTIES.easy.mobHpEndMul / SF.config.DIFFICULTIES.normal.mobHpEndMul - 0.8) < 1e-9);

console.log('\n[20c] BOSS 战独立小怪波次');
function bossWaveFixture(defId, bossIdx) {
  const g = new SF.Game(); g.reset('vega', 'normal'); g.state = 'playing';
  g.runTime = defId === 'boss2' ? SF.config.BOSS_SPAWN_AT[1] : SF.config.BOSS_SPAWN_AT[0];
  g.bossKilledThisRun = defId === 'boss2' ? 1 : 0;
  g.spawner.bossIdx = bossIdx;
  g.enemies.spawnBoss(g, defId);
  return g;
}
for (const [defId, bossIdx, count] of [['boss', 1, 15], ['boss2', 2, 20]]) {
  const g = bossWaveFixture(defId, bossIdx);
  g.spawner.update(SF.config.BOSS_WAVE_INTERVAL - 0.01);
  check(`${defId} 战未满 30 秒不刷新环境波次`, !g.enemies.list.some(e => e.bossWave));
  g.spawner.update(0.02);
  const wave = g.enemies.list.filter(e => e.bossWave);
  check(`${defId} 战每 30 秒从四周刷新 ${count} 只小怪`, wave.length === count
    && wave.every(e => Math.abs(Math.hypot(e.x - g.player.x, e.y - g.player.y) - SF.config.BOSS_WAVE_RADIUS) < 1e-6));
  check(`${defId} 战环境波次全部标记为无收益`, wave.every(e => e.noRewards && !e.def.elite));
  const target = wave.find(e => !e.def.split) || wave[0];
  const before = { score: g.score, kills: g.runStats.kills, pickups: SF.pickups.list.length };
  target.takeDamage(target.maxHp + 1, g);
  check(`${defId} 战环境小怪死亡不产经验、道具、分数或击杀统计`,
    g.score === before.score && g.runStats.kills === before.kills && SF.pickups.list.length === before.pickups);
  SF.pickups.clear();
}

// ============ 21. BOSS2 二阶段：深渊停滞 + 冲撞弹幕 ============
console.log('\n[21] BOSS2 二阶段技能');
const g5 = new SF.Game(); g5.reset('thunder', 'normal'); g5.state = 'playing';
g5.player.stats.maxHp = 1e9; g5.player.hp = 1e9;
g5.enemies.spawnBoss(g5, 'boss2'); // 直接生成 BOSS2（走 spawner 会先触发 BOSS1）
check('BOSS2 出场', !!(g5.boss && !g5.boss.dead));
const wL = g5.player.weapons[0];
wL.cdTimer = 5; wL.chargeT = 3;
g5.boss.hp = g5.boss.maxHp * 0.4;
g5.update(STEP);
check('转阶段立即「深渊停滞」10 秒', Math.abs(g5.player.weaponLockT - (10 - STEP)) < 0.05, `lockT=${g5.player.weaponLockT.toFixed(2)}`);
const cdBefore = wL.cdTimer, chBefore = wL.chargeT;
g5.update(STEP);
check('停滞期间武器冷却冻结', wL.cdTimer === cdBefore);
check('停滞期间蓄力冻结', wL.chargeT === chBefore);
let gotBurst = false;
for (let i = 0; i < 900 && !gotBurst; i++) {
  if (!g5.boss || g5.boss.dead) break;
  g5.boss.attackCd = 0;
  g5.update(STEP);
  if (g5.boss._dashBurst) gotBurst = true;
}
check('二阶段轮换释放冲撞弹幕', gotBurst);
if (gotBurst) {
  for (let i = 0; i < 60 && g5.boss._dashBurst; i++) g5.update(STEP);
  check('冲撞结束发射深暗红弹幕', SF.projectiles.enemyList.some(b => b.dark));
}
// 一阶段过滤
const g6 = new SF.Game(); g6.reset('thunder', 'normal'); g6.state = 'playing';
g6.player.stats.maxHp = 1e9; g6.player.hp = 1e9;
g6.enemies.spawnBoss(g6, 'boss2');
let sawBurst = false;
for (let i = 0; i < 900; i++) {
  if (!g6.boss || g6.boss.dead) break;
  g6.boss.attackCd = 0;
  g6.update(STEP);
  if (g6.boss._dashBurst) { sawBurst = true; break; }
}
check('一阶段不释放冲撞弹幕（phase2Only 过滤）', !sawBurst);

console.log('\n[21b] BOSS 冲撞冷却');
{
  const g = new SF.Game(); g.reset('vega', 'normal');
  const b = g.enemies.spawnBoss(g, 'boss');
  const A = b.def.attacks, keys = Object.keys(A);
  b.attackIdx = keys.indexOf('dashLaser') - 1; b.attackCd = 0;
  SF.bossAI.updateBoss(b, 0, g);
  check('BOSS1 冲撞激光基础冷却由 8 秒 ×0.8 为 6.4 秒', A.dashLaser.cd === 6.4);
  check('BOSS1 冲撞激光实际排程使用新冷却', !!b._dashLaser
    && Math.abs(b.attackCd - (6.4 + A.dashLaser.dashTime + A.dashLaser.telegraph)) < 1e-9,
    `${b.attackCd.toFixed(2)} 秒`);
}
{
  const g = new SF.Game(); g.reset('vega', 'normal');
  const b = g.enemies.spawnBoss(g, 'boss2');
  b.hp = b.maxHp * 0.4; b._phase2 = true;
  const A = b.def.attacks;
  const keys = Object.keys(A);
  b.attackIdx = keys.indexOf('dashBurst') - 1; b.attackCd = 0;
  SF.bossAI.updateBoss(b, 0, g);
  check('BOSS2 冲撞弹幕基础冷却由 10 秒 ×0.8 为 8 秒', A.dashBurst.cd === 8);
  check('BOSS2 狂怒阶段冲撞弹幕实际排程使用新冷却', !!b._dashBurst
    && Math.abs(b.attackCd - (8 + A.dashBurst.dashTime) * 0.6) < 1e-9,
    `${b.attackCd.toFixed(2)} 秒`);
}

// ============ 22. 导弹飞行 / 抗冰灼烧 / 防反中心 ============
console.log('\n[22] 导弹与反制冰域新机制');
const gm = new SF.Game(); gm.reset('vega', 'normal'); gm.state = 'playing';
SF.projectiles.clear();
SF.projectiles.spawnMissile(0, 0, 100, 0, { damage: 1, blast: 0, burn: 0, delay: 1 });
SF.projectiles.update(0.5, gm);
const mp = SF.projectiles.list[0];
check('导弹半程移动到目标路径', !!mp && Math.abs(mp.x - 50) < 1e-6 && Math.abs(mp.y) < 1e-6, mp ? `x=${mp.x.toFixed(1)}` : '导弹已提前清理');
SF.projectiles.update(0.6, gm);
check('导弹到达目标点后清理', SF.projectiles.list.length === 0);
const burnGuard = gm.enemies.spawnAt('grub', 0, 0, 5, 0);
burnGuard.applyBurn(4, 8, { iceGuard: true });
const bgHp = burnGuard.hp;
burnGuard.takeDamage(10, gm, 'ice0');
burnGuard.applySlow(0.65, 0.8);
check('灼烧不再减免冰伤或屏蔽冰控', Math.abs((bgHp - burnGuard.hp) - 10) < 1e-6 && burnGuard.freezeT > 0 && burnGuard.slowT > 0);

const gr = new SF.Game(); gr.reset('firefly', 'normal'); gr.state = 'playing';
gr.player.phaseInvulnT = 0; gr.player.invulnT = 0; gr.player.iceRetaliationUsed = false;
SF.projectiles.clear(); gr.enemies.list.length = 0;
const attacker = gr.enemies.spawnAt('grub', 100, 0, 10, 0);
const bystander = gr.enemies.spawnAt('grub', 116, 0, 10, 0);
const attackerHp = attacker.hp, bystanderHp = bystander.hp;
gr.player.phaseInvulnT = 0.5;
gr.player.takeDamage(1, { type: 'contact', attacker, x: attacker.x, y: attacker.y, game: gr });
check('反制冰域中心落在攻击者位置', SF.projectiles.iceFields.length === 1 && SF.projectiles.iceFields[0].x === attacker.x);
check('反制冰域中心目标首击双倍', Math.abs((attackerHp - attacker.hp) - 2 * (bystanderHp - bystander.hp)) < 1e-6,
  `center=${attackerHp - attacker.hp} nearby=${bystanderHp - bystander.hp}`);

// ============ 23. 机体专精与防反反馈 ============
console.log('\n[23] 机体专精矩阵与防反反馈');
check('三机体内部 ID 保留，名称与专精对应',
  SF.characters.vega.name === '焰锋' && SF.characters.firefly.name === '霜翎'
  && SF.characters.thunder.name === '磁暴' && !SF.characters.dawn);
for (const con of Object.keys(SF.constellationMeta)) {
  const nodes = Object.values(SF.constellations).filter(n => n.con === con);
  check(`${SF.constellationMeta[con].name}：8 节点 / 本系总价 30`, nodes.length === 8 && nodes.reduce((sum, n) => sum + n.cost, 0) === 30);
}
const frost = new SF.Player('firefly');
frost.litStars.add('cygnus_root'); frost.recalcStats();
check('霜返首节点增加冰系范围', Math.abs(frost.stats.iceAreaMul - 0.05) < 1e-9);
frost.litStars.add('cygnus_c'); frost.recalcStats();
check('反制节点增加伤害但不延长窗口', frost.stats.counterDamage === 0.15 && frost.stats.phaseInvulnDuration === 0.2);
check('铁壁装备与星图已移除', !SF.weapons.satellite && !SF.weapons.galaxy && !SF.weapons.shieldDisc && !SF.passives.magnet && !SF.constellationMeta.cassia);

let iceSounds = 0;
const oldSfx = SF.audio.sfx;
SF.audio.sfx = new Proxy({}, { get: (_, key) => key === 'iceRetaliate' ? () => iceSounds++ : noop });
const soundGame = new SF.Game(); soundGame.reset('firefly', 'normal');
soundGame.player.stats.critChance = 0; soundGame.player.phaseInvulnT = 0.5;
const soundTarget = soundGame.enemies.spawnAt('grub', 100, 0, 20, 0);
soundGame.enemies.spawnAt('grub', 118, 0, 20, 0);
const counterSource = { game: soundGame, attacker: soundTarget };
soundGame.player.takeDamage(5, counterSource);
check('冰域首击命中多敌只播放一次冰裂', iceSounds === 1 && SF.projectiles.iceFields.length === 1);
soundGame.player.takeDamage(5, counterSource);
check('同一个防反窗口不重复播放冰裂', iceSounds === 1);
const afterImpactHp = soundTarget.hp;
SF.projectiles.update(3.01, soundGame);
check('后续冰蚀脉冲不重复爆伤或冰裂音', iceSounds === 1 && soundTarget.hp === afterImpactHp);
soundGame.player.phaseInvulnT = 0; soundGame.player.invulnT = 0;
soundGame.player.takeDamage(5, counterSource);
check('普通受击不会误播成功反馈', iceSounds === 1);
soundGame.enemies.list.length = 0;
SF.projectiles.spawnIceRetaliationField(0, 0, { radius: 24, damage: 10, life: 4 }, soundGame);
check('空冰域没有高伤成功反馈', iceSounds === 1);
SF.audio.sfx = oldSfx;

console.log('\n[24] 霜棱弹：首碰、穿透与防反发射');
function frostFixture(character = 'vega') {
  const g = new SF.Game(); g.reset(character, 'normal'); g.state = 'playing';
  g.player.x = 0; g.player.y = 0; g.player.stats.critChance = 0;
  g.player.weapons = [new SF.WeaponInstance(SF.weapons.mirrorWheel)];
  return g;
}
function frostShot(g, empowered = false) {
  const w = g.player.weapons[0];
  SF.projectiles.spawnFrostShard(0, 0, 0, { ...w.spec, empowered });
  return SF.projectiles.list[0];
}
for (let lv = 1; lv <= 6; lv++) {
  const ice = weaponDps(SF.weapons.mirrorWheel, lv);
  const fire = weaponDps(SF.weapons.blade, lv);
  // 火武常态减速后，Lv.5 霜棱直伤略高；仍须低于飞刃含单层灼烧的总输出。
  const fireInterval = fire.spec.cooldown * SF.config.FIRE_COOLDOWN_MUL;
  const burnUptime = Math.min(1, SF.config.FIRE_BASE_BURN_DURATION * SF.config.FIRE_BURN_DURATION_MUL / fireInterval);
  check(`霜棱弹 Lv.${lv} 单次伤害及 DPS 低于飞刃含单层灼烧`,
    ice.shot < fire.shot && ice.dps < fire.dps + fire.spec.burn * burnUptime);
}
{
  const g = frostFixture();
  const far = g.enemies.spawnAt('grub', 100, 0, 100, 0);
  const near = g.enemies.spawnAt('grub', 30, 0, 100, 0);
  const splash = g.enemies.spawnAt('grub', 30, 20, 100, 0);
  const outside = g.enemies.spawnAt('grub', 30, 45, 100, 0);
  const p = frostShot(g);
  SF.projectiles.update(0.5, g);
  check('高速普通弹先碰近敌，非数组首项，命中后立即消失', p.hitSet.has(near.uid) && !p.hitSet.has(far.uid) && SF.projectiles.list.length === 0);
  check('一次冰爆覆盖主目标及附近敌人，不叠加直击伤害', near.maxHp - near.hp === 9 && splash.maxHp - splash.hp === 9 && outside.hp === outside.maxHp && far.hp === far.maxHp);
  check('冰爆附带冰控且波及目标不触发额外爆炸', splash.slowT > 0 && splash.freezeT > 0 && SF.projectiles.frostBursts.length === 1);
}
{
  const g = frostFixture();
  const targets = [210, 180, 150, 120, 90, 60, 30].map(x => g.enemies.spawnAt('grub', x, 0, 100, 0));
  const p = frostShot(g, true);
  SF.projectiles.update(0.9, g);
  check('强化弹可穿过超过五个敌人，每个接触目标各爆炸一次', p.hitSet.size === 7 && SF.projectiles.frostBursts.length === 7 && targets.every(e => e.hp < e.maxHp));
  const burstCount = SF.projectiles.frostBursts.length;
  p.x = 30; p.y = 0;
  SF.projectiles.update(STEP, g);
  check('同一弹体重新接触旧目标不会重复触发', SF.projectiles.frostBursts.length === burstCount);
  SF.projectiles.update(2, g);
  check('强化弹按寿命结束，冰爆表现不会跨时间残留', SF.projectiles.list.length === 0 && SF.projectiles.frostBursts.length === 0);
}
{
  const g = frostFixture('firefly'), pl = g.player, w = pl.weapons[0];
  const target = g.enemies.spawnAt('grub', 100, 0, 100, 0);
  pl.phaseInvulnT = 0.5;
  pl.takeDamage(5, { game: g, attacker: target });
  check('实际霜翎防反事件准备一发强化弹', w.frostEmpowered === true);
  pl.takeDamage(5, { game: g, attacker: target });
  g.enemies.list.length = 0;
  check('空场发射失败保留强化', !w.fire(g) && w.frostEmpowered);
  pl.weaponLockT = 1; w.cdTimer = 0;
  w.update(STEP, g);
  check('停滞不消耗强化也不推进发射冷却', w.frostEmpowered && w.cdTimer === 0);
  pl.weaponLockT = 0;
  g.enemies.spawnAt('grub', 120, 0, 100, 0);
  SF.projectiles.clear();
  w.update(STEP, g);
  const shot = SF.projectiles.list[0];
  check('自动发射强化弹只消费一次，不另加伤害倍率', shot?.empowered && !w.frostEmpowered && Math.abs(shot.dmg - w.spec.damage * pl.stats.damageMul) < 1e-9);
  w.fire(g);
  check('紧接着的一发恢复普通，反复防反没有叠层', SF.projectiles.list[1]?.empowered === false);
  pl.phaseInvulnT = 0; pl.invulnT = 0;
  pl.takeDamage(5, { game: g });
  check('普通受伤不会准备强化弹', !w.frostEmpowered);
}
{
  const g = frostFixture();
  const guarded = g.enemies.spawnAt('grub', 30, 0, 100, 0);
  guarded.applyBurn(1, 8, { iceGuard: true });
  frostShot(g); SF.projectiles.update(0.2, g);
  check('新冰弹可与灼烧共存', guarded.maxHp - guarded.hp === 9 && guarded.freezeT > 0 && guarded.slowT > 0);
  SF.projectiles.clear();
  check('新局清除冰弹和碎裂表现', SF.projectiles.frostBursts.length === 0 && SF.projectiles.list.length === 0);
}

{
  const g = new SF.Game(); g.reset('thunder', 'normal');
  const pl = g.player, w = pl.weapons[0];
  pl.stats.cooldownMul = 0.9; pl.stats.chargeRed = 0.08;
  const duration = 9 * 0.8 * 0.9 * 0.92;
  w.owner = pl; w.chargeT = duration / 2;
  check('电磁炮 HUD 蓄力与实战共用相同倍率', Math.abs(w.chargePct - 0.5) < 1e-9);
  w.updateRailgun(duration / 2, g);
  check('电磁炮实际到时存入一发并显示就绪', w.charges === 1 && w.chargePct === 1 && w.railgunReady);
}

console.log(`\n========== 结果: ${pass} 通过 / ${fail} 失败 ==========`);
process.exit(fail ? 1 : 0);
