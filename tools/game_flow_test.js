/* Cross-system regressions: real fixed-step boss entry and queued chest/XP rewards.
 * Rendering, audio and input are stubbed; combat and reward modules are real.
 */
'use strict';
const assert = require('node:assert/strict');
global.window = global;
global.location = { search: '' };
const noop = () => {};
const SF = global.SF = {
  renderer: { cam: { x: 0, y: 0 }, width: 480, height: 270, addShake: noop },
  particles: new Proxy({}, { get: () => noop }),
  audio: { sfx: new Proxy({}, { get: () => noop }), playMusic: noop, stopMusic: noop },
  widgets: new Proxy({}, { get: () => noop }), world: { setSeed: noop, update: noop },
  input: { isPressed: () => false, moveVector: () => ({ x: 0, y: 0 }), endFrame: noop },
  save: { profile: null },
};
for (const name of ['core/utils', 'core/palette', 'data/config', 'data/weapons', 'data/passives',
  'data/enemies', 'data/characters', 'growth/constellations', 'sim/projectiles', 'sim/pickups',
  'sim/enemies', 'sim/boss', 'sim/weapons', 'sim/spawner', 'growth/player', 'growth/progression',
  'ui/levelup', 'engine/game']) require('../src/' + name + '.js');
const STEP = 1 / 60;
let count = 0;
function test(name, fn) { fn(); count++; console.log('PASS', name); }
function fixture(difficulty = 'normal') {
  const g = new SF.Game(); SF.game = g; g.startRun('vega', difficulty);
  g.player.stats.maxHp = g.player.hp = 1e9;
  return g;
}
for (const difficulty of ['easy', 'normal', 'hard']) {
  test(`${difficulty}: 真实 60Hz 到达 Boss1，击杀前波次血量不跳升，击杀后只跳一次`, () => {
    const g = fixture(difficulty); g.player.weapons = [];
    let frames = 0;
    while (!g.boss && frames++ < 14500) g.update(STEP);
    assert.ok(g.boss && !g.boss.dead);
    assert.equal(g.bossKilledThisRun, 0);
    const entryTime = g.runTime, actual = g.mobHpMul;
    g.runTime = SF.config.BOSS_SPAWN_AT[0];
    const beforeKill = g.mobHpMul;
    g.runTime = entryTime;
    assert.ok(Math.abs(actual - beforeKill) < 1e-9);
    g.enemies.list = [g.boss]; // Leave room to exercise the real wave spawn.
    g.spawner.spawnBossWave();
    const wave = g.enemies.list.filter(e => e.bossWave);
    assert.equal(wave.length, SF.config.BOSS_WAVE_COUNTS[0]);
    for (const e of wave) assert.ok(Math.abs(e.maxHp / e.def.hp - beforeKill) < 1e-9);
    g.boss.takeDamage(g.boss.hp, g);
    assert.equal(g.bossKilledThisRun, 1);
    assert.ok(g.mobHpMul > beforeKill);
    const afterKill = g.mobHpMul;
    g.boss.takeDamage(1, g);
    assert.equal(g.bossKilledThisRun, 1);
    assert.equal(g.mobHpMul, afterKill);
  });
}
for (const levels of [0, 1, 2]) {
  test(`进化宝箱与经验同帧拾取：进化后完整处理 ${levels} 次升级`, () => {
    const g = fixture();
    g.player.weapons = [new SF.WeaponInstance(SF.weapons.blade, 6), new SF.WeaponInstance(SF.weapons.missile, 6)];
    for (const w of g.player.weapons) g.player.passives.set(w.def.evolveWith, { level: 3 });
    g.player.recalcStats();
    if (levels > 0) {
      const xp = g.xpForLevel(2) + (levels === 2 ? g.xpForLevel(3) : 0);
      SF.pickups.dropDust(0, 0, 1, xp / SF.config.DUST_XP_MUL);
    }
    SF.pickups.dropSpecial(0, 0, 'chest');
    for (const p of SF.pickups.list) p.x = p.y = p.vx = p.vy = 0;
    g.update(STEP);
    assert.equal(g.panel.kind, 'chest-evolve');
    assert.equal(g.level, levels + 1);
    assert.equal(g.pendingLevelUps, levels);
    g.panel.pick(0); g.update(STEP);
    assert.equal(g.player.weapons[0].def.id, 'prism');
    assert.equal(g.pendingLevelUps, levels); // Evolution itself does not spend a queued level.
    for (let remaining = levels; remaining > 0; remaining--) {
      assert.equal(g.state, 'levelup');
      assert.equal(g.panel.kind, 'level');
      assert.equal(g.pendingLevelUps, remaining);
      g.panel.pick(0); g.update(STEP);
    }
    assert.equal(g.state, 'playing');
    assert.equal(g.panel, null);
    assert.equal(g.pendingLevelUps, 0);
  });
}
console.log('GAME FLOW:', count, 'checks passed');
