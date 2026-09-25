/* Active fire skill and independently expiring burn layers. node tools/fire_overdrive_test.js */
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
global.window = global; global.location = { search: '' }; global.SF = {};
const noop = () => {};
SF.renderer = { cam: { x: 0, y: 0 }, width: 480, height: 270, addShake: noop };
SF.particles = new Proxy({}, { get: () => noop });
SF.audio = { sfx: new Proxy({}, { get: () => noop }) };
SF.widgets = new Proxy({}, { get: () => noop }); SF.world = { setSeed: noop };
SF.input = { moveVector: () => ({ x: 0, y: 0 }), isPressed: () => false };
SF.save = { profile: null };
for (const file of ['core/utils', 'core/palette', 'data/config', 'data/weapons', 'data/passives', 'data/enemies',
  'data/characters', 'growth/constellations', 'sim/projectiles', 'sim/pickups', 'sim/enemies', 'sim/boss',
  'sim/weapons', 'sim/spawner', 'growth/player', 'engine/game']) require('../src/' + file + '.js');
const results = [], STEP = 1 / 60;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
function test(name, run) {
  try { run(); results.push({ name, pass: true }); console.log('PASS', name); }
  catch (e) { results.push({ name, pass: false, error: e.stack }); console.error('FAIL', name, e); process.exitCode = 1; }
}
function fixture(char = 'vega', id = 'blade', level = 1) {
  const g = SF.game = new SF.Game(); g.reset(char, 'normal');
  g.player.weapons = [new SF.WeaponInstance(SF.weapons[id], level)];
  g.player.weapons[0].owner = g.player; g.player.stats.critChance = 0;
  return g;
}
function target(g, x = 80, y = 0, id = 'grub') {
  const e = g.enemies.spawnAt(id, x, y); e.hp = e.maxHp = 1e6; e.speed = 0; return e;
}
function activate(pl) { pl.heat = SF.config.VEGA_HEAT.threshold; assert.ok(pl.activateFireOverdrive()); }
function flight(g, seconds = 0.7) { for (let i = 0; i < seconds * 60; i++) SF.projectiles.update(STEP, g); }

test('理想 60Hz 命中也需至少 30 秒蓄满，15 秒期间不积热，启动间隔至少 45 秒', () => {
  const g = fixture(), pl = g.player, starts = []; pl.weapons = [];
  let activeFrames = 0;
  for (let frame = 0; frame < 180 * 60; frame++) {
    pl.update(STEP, g); pl.onFireHit({});
    if (pl.heat === 15) { starts.push((frame + 1) * STEP); assert.ok(pl.activateFireOverdrive()); }
    if (pl.fireOverdriveT > 0) { activeFrames++; assert.equal(pl.heat, 0); }
  }
  assert.ok(starts.length >= 3 && starts[0] >= 30 - 1e-6);
  for (let i = 1; i < starts.length; i++) assert.ok(starts[i] - starts[i - 1] >= 45 - 1e-6);
  assert.ok(activeFrames * STEP / 180 <= 1 / 3 + STEP);
});
test('不足 15 格、其它机体、停滞和死亡均不能开启；满热可长期保存', () => {
  for (const char of ['vega', 'firefly', 'dawn', 'thunder']) {
    const g = fixture(char), pl = g.player; pl.weapons = []; pl.heat = 14;
    assert.equal(pl.activateFireOverdrive(), false); pl.heat = 15;
    if (char !== 'vega') { assert.equal(pl.activateFireOverdrive(), false); continue; }
    pl.update(20, g); assert.equal(pl.heat, 15); assert.equal(pl.fireOverdriveT, 0);
    pl.weaponLockT = 3; assert.equal(pl.activateFireOverdrive(), false); pl.weaponLockT = 0;
    pl.dead = true; assert.equal(pl.activateFireOverdrive(), false);
  }
});
test('所有火武常态 ×1.5 / 超载 ×0.8，开始与结束按比例保存冷却进度', () => {
  for (const id of ['blade', 'prism', 'missile', 'nuke']) {
    const g = fixture('vega', id, SF.weapons[id].levels.length + 1), pl = g.player, w = pl.weapons[0];
    const original = w.spec.cooldown * (w.def.cooldownMul || 1);
    near(w.cooldownDuration(), original * 1.5); w.cdTimer = w.cooldownDuration() * 0.4;
    activate(pl); near(w.cooldownDuration(), original * 0.8); near(w.cdTimer / w.cooldownDuration(), 0.4);
    pl.setFireOverdrive(0); near(w.cdTimer / w.cooldownDuration(), 0.4);
    const other = fixture('dawn', id); near(other.player.weapons[0].cooldownDuration(), SF.weapons[id].base.cooldown * (w.def.cooldownMul || 1) * 1.5);
  }
});
test('超载不加速冰武/盾盘/激光/电磁蓄力，也不重置非火武冷却', () => {
  for (const id of ['orb', 'mirrorWheel', 'shieldDisc', 'chain', 'laser']) {
    const g = fixture('vega', id), pl = g.player, w = pl.weapons[0];
    const cd = w.cooldownDuration(), timer = w.cdTimer, charge = w.spec.charge ? w.chargeDuration() : null;
    activate(pl); near(w.cooldownDuration(), cd); near(w.cdTimer, timer);
    if (charge) near(w.chargeDuration(), charge);
  }
});
test('焰锋飞刃 3.6/9 秒、导弹 9.6/24 秒，常态叠层与发射快照保留', () => {
  for (const id of ['blade', 'prism', 'missile', 'nuke']) {
    const g = fixture('vega', id), pl = g.player, w = pl.weapons[0]; target(g);
    const base = w.spec.burnDuration || 3;
    w.fire(g); const ordinary = SF.projectiles.list[0];
    near(ordinary.burnDuration, base * 0.8 * 1.5); assert.equal(ordinary.burnStacking, true);
    assert.equal(ordinary.burnIndicator, true);
    activate(pl); near(ordinary.burnDuration, base * 0.8 * 1.5);
    SF.projectiles.clear(); w.fire(g); const charged = SF.projectiles.list[0];
    near(charged.burnDuration, base * 2 * 1.5); assert.equal(charged.burnStacking, true);
    pl.setFireOverdrive(0); near(charged.burnDuration, base * 2 * 1.5); assert.equal(charged.fireAttack.heatEligible, false);
  }
});
test('其它角色火武时长不增强、不叠层，也不显示火苗', () => {
  for (const char of ['firefly', 'dawn', 'thunder']) for (const id of ['blade', 'prism', 'missile', 'nuke']) {
    const g = fixture(char, id), w = g.player.weapons[0], e = target(g,80,0,'boss2');
    w.fire(g); const p = SF.projectiles.list[0];
    near(p.burnDuration, (w.spec.burnDuration || 3) * 0.8);
    assert.equal(p.burnStacking, false); assert.equal(p.burnIndicator, false);
    flight(g); w.fire(g); flight(g);
    assert.equal(e.burns.length, 1); assert.equal(e.burnIndicatorLayers, 0);
  }
});
test('焰锋常态连续攻击独立叠层，旧层不续时，退层同步变暗并清除火苗', () => {
  const g = fixture(), e = target(g,80,0,'boss2'), w = g.player.weapons[0];
  w.fire(g); flight(g); const old = e.burns[0]; e.update(1,g);
  const remaining = old.remaining; w.fire(g); flight(g);
  assert.equal(e.burns.length, 2); near(old.remaining,remaining); assert.equal(e.burnIndicatorLayers,2);
  e.update(remaining + 0.1,g); assert.equal(e.burnIndicatorLayers,1);
  e.update(4,g); assert.equal(e.burnIndicatorLayers,0);
});
test('5 层与 10 层火苗绘制完全相同，10 层仍为同强度 5 层的双倍 DPS', () => {
  const g = fixture(), five = target(g), ten = target(g);
  for (let i=0;i<10;i++) {ten.applyBurn(6,3,{stack:true,indicator:true});if(i<5)five.applyBurn(6,3,{stack:true,indicator:true});}
  SF.renderer.toScreen=(x,y)=>({x,y});
  const capture=e=>{const ops=[];const ctx=new Proxy({}, {get:(_,key)=>(...args)=>ops.push([key,...args]),set:(_,key,value)=>{ops.push([key,value]);return true;}});e.drawBurnIndicator(ctx);return ops;};
  assert.deepEqual(capture(five),capture(ten));near(ten.burnDps,five.burnDps*2);
  five.update(0.5,g);ten.update(0.5,g);near(ten.maxHp-ten.hp,2*(five.maxHp-five.hp));
});
test('新层不续旧层；不同到期时刻的总伤害精确等于各层 DPS × 寿命之和', () => {
  const g = fixture(), e = target(g);
  e.applyBurn(10, 1.1, { stack: true }); const first = e.burns[0]; e.update(0.6, g); near(first.remaining, 0.5);
  e.applyBurn(20, 2.3, { stack: true }); near(first.remaining, 0.5); assert.equal(e.burns.length, 2);
  e.update(0.6, g); assert.equal(e.burns.length, 1); near(e.burns[0].remaining, 1.7);
  e.update(1.71, g); near(e.maxHp - e.hp, 10 * 1.1 + 20 * 2.3); assert.equal(e.burns.length, 0); near(e.burnDamagePool, 0);
});
test('最后不足一 tick 的尾伤不丢失，也不按完整 tick 多算', () => {
  const g = fixture(), e = target(g); e.applyBurn(7, 0.33, { stack: true }); e.applyBurn(11, 0.17, { stack: true });
  e.update(0.5, g); near(e.maxHp - e.hp, 7 * 0.33 + 11 * 0.17); near(e.burnT, 0); near(e.burnDps, 0);
});
test('不设置层数上限，500 层仍逐层到期并完整清理', () => {
  const g = fixture(), e = target(g);
  for (let i = 0; i < 500; i++) e.applyBurn(1, 0.1, { stack: true });
  assert.equal(e.burns.length, 500); e.update(0.2, g);
  near(e.maxHp - e.hp, 50); assert.equal(e.burns.length, 0); near(e.burnDps, 0); near(e.burnIceGuardT, 0);
});
test('常态刷新仅修改常态条目，不能续超载层；超载结束也不抹掉剩余层', () => {
  const g = fixture(), pl = g.player, e = target(g); activate(pl);
  e.applyBurn(20, 1, { stack: true }); e.update(0.6, g); const layer = e.burns[0];
  pl.setFireOverdrive(0); e.applyBurn(5, 2); near(layer.remaining, 0.4);
  e.update(0.5, g); assert.equal(e.burns.length, 1); assert.equal(e.burns[0].stacked, false); near(e.burnDps, 5);
});
for (const id of ['prism', 'nuke']) test(id + '：同轮多弹/穿透/爆炸对每敌只加一层，下一轮能独立追加', () => {
  const g = fixture('vega', id, 4), pl = g.player, w = pl.weapons[0];
  const enemies = Array.from({ length: 12 }, () => target(g, 80, 0, 'boss2'));
  activate(pl); pl.stats.resonance.fire = true; w.fire(g); flight(g);
  for (const e of enemies) { assert.equal(e.burns.length, 1); near(e.burnDps, w.spec.burn * 2); }
  const first = enemies[0].burns[0]; first.remaining = 0.3;
  SF.projectiles.clear(); w.fire(g); flight(g);
  for (const e of enemies) assert.equal(e.burns.length, 2);
  near(first.remaining, 0.3);
});
test('蔓延只传播一层及剩余寿命，不复制总层数/DPS，不刷新抗冰', () => {
  const g = fixture(), e = target(g), next = target(g, 100); g.player.stats.resonance.fire = true;
  e.applyBurn(10, 1, { stack: true }); e.applyBurn(20, 2, { stack: true, iceGuard: true });
  e.update(0.7, g);
  assert.equal(next.burns.length, 1); near(next.burnDps, 20); near(next.burnT, 1.3); near(next.burnIceGuardT, 1.3);
  next.applyBurn(1, 3); near(next.burns[0].remaining, 1.3); near(next.burnIceGuardT, 1.3);
});
test('普通飞刃续烧不能延长导弹抗冰时间，独立层的抗冰随该层到期', () => {
  const g = fixture(), e = target(g);
  e.applyBurn(4, 1, { iceGuard: true }); e.update(0.6, g); e.applyBurn(6, 2); e.update(0.5, g);
  near(e.burnIceGuardT, 0); assert.ok(e.burnT > 0);
  e.applyBurn(4, 0.3, { stack: true, iceGuard: true }); e.applyBurn(8, 1, { stack: true });
  e.update(0.4, g); near(e.burnIceGuardT, 0); assert.ok(e.burns.some(b => b.stacked));
});
test('同一逻辑步烧死的敌人不再造成接触伤害', () => {
  const g = fixture(), e = target(g, 0, 0), hp = g.player.hp; e.hp = 0.01;
  e.applyBurn(10, 1); g.enemies.update(STEP, g); assert.ok(e.dead); near(g.player.hp, hp);
});
test('Space 独立触发且按住不重复，面板仍能用空格确认，J/Enter 不开技能', () => {
  const callbacks = new Map(); global.addEventListener = (name, fn) => callbacks.set(name, fn);
  require('../src/core/input.js'); SF.input.attach();
  const event = code => ({ code, preventDefault: noop });
  callbacks.get('keydown')(event('Space')); assert.ok(SF.input.isPressed('skill')); assert.ok(SF.input.isPressed('confirm'));
  SF.input.endFrame(); callbacks.get('keydown')(event('Space')); assert.equal(SF.input.isPressed('skill'), false);
  callbacks.get('keyup')(event('Space')); callbacks.get('keydown')(event('KeyJ'));
  assert.ok(SF.input.isPressed('confirm')); assert.equal(SF.input.isPressed('skill'), false);
  callbacks.get('blur')(); assert.equal(SF.input.isPressed('confirm'), false); assert.equal(SF.input.isHeld('skill'), false);
});
const out = path.join(__dirname, '..', 'gui-test-screenshots', 'balance-v1'); fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'fire-tests.json'), JSON.stringify({ results }, null, 2) + '\n');
console.log(`FIRE OVERDRIVE: ${results.filter(r => r.pass).length}/${results.length} passed`);
