/* Local v1 regressions: real persistence failures, concurrent writes, result retry,
 * legacy migration and four-way evolution input. No user storage is accessed.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '..'), results = [];
const tick = () => new Promise(resolve => setImmediate(resolve));
const plain = value => JSON.parse(JSON.stringify(value));

function fixture(data) {
  const storage = { raw: data ? JSON.stringify(data) : null, fail: false, writes: 0 };
  const noop = () => {};
  const SF = {
    audio: { sfx: new Proxy({}, { get: () => noop }) },
    particles: new Proxy({}, { get: () => noop }),
    renderer: { width: 480, height: 270 },
    input: { isPressed: () => false },
  };
  const context = vm.createContext({ window: { SF }, console: { warn: noop }, localStorage: {
    getItem: () => storage.raw,
    setItem: (_, raw) => {
      storage.writes++;
      if (storage.fail) throw new Error('storage quota / permission unavailable');
      storage.raw = raw;
    },
  } });
  for (const file of ['core/utils.js', 'data/config.js', 'data/characters.js', 'core/save.js', 'ui/menus.js', 'ui/levelup.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', file), 'utf8'), context, { filename: file });
  }
  return { SF, storage };
}

async function test(name, fn) {
  await fn(); results.push(name); console.log('PASS', name);
}

(async () => {
  await test('旧 v1 档迁移保留星尘、纪录与武器第 5 次强化，补齐缺失角色', async () => {
    const { SF } = fixture({ currency: 777, bestScore: 900, charUpgrades: { vega: { weapon: 5 } } });
    await SF.save.init();
    assert.equal(SF.save.profile.currency, 777);
    assert.equal(SF.save.profile.bestScores.normal, 900);
    assert.equal(SF.save.profile.charUpgrades.vega.weapon, 5);
    assert.equal(SF.save.profile.charUpgrades.thunder.hp, 0);
  });
  await test('v2 退役铁壁只返还一次工坊投入，保留历史并拒绝继续购买', async () => {
    const {SF,storage}=fixture({currency:100,bestScore:900,charUpgrades:{dawn:{hp:5,speed:2,dmg:1,weapon:0}}});
    await SF.save.init();assert.equal(SF.save.profile.currency,5350);
    assert.equal(await SF.save.buyCharUpgrade('dawn','hp'),false);
    await SF.save.update(p=>{p.currency-=50;});
    const again=fixture(JSON.parse(storage.raw));await again.SF.save.init();
    assert.equal(again.SF.save.profile.currency,5300);assert.equal(again.SF.save.profile.charUpgrades.dawn.hp,5);
    assert.equal(again.SF.save.profile.unlockedChars.includes('dawn'),false);
  });
  await test('分难度纪录反复保存和重载不串桶，最高分兼容字段仍更新', async () => {
    for (const difficulty of ['easy', 'hard']) {
      const { SF, storage } = fixture(); await SF.save.init();
      await SF.save.recordRun({ score: 100, time: 10, difficulty: 'normal' });
      await SF.save.recordRun({ score: 2000, time: 10, difficulty });
      const expected = plain(SF.save.profile.bestScores);
      let raw = storage.raw;
      for (let i = 0; i < 2; i++) {
        const reloaded = fixture(JSON.parse(raw)); await reloaded.SF.save.init();
        assert.deepEqual(plain(reloaded.SF.save.profile.bestScores), expected);
        assert.equal(reloaded.SF.save.profile.bestScore, 2000);
        await reloaded.SF.save.recordRun({ score: 50, time: 10, difficulty: 'normal' });
        raw = reloaded.storage.raw;
      }
    }
  });
  await test('并发初始化只读取一次，不覆盖已加载的数据', async () => {
    const { SF } = fixture(); let loads = 0, release;
    SF.save._switchLayer({ load: () => { loads++; return new Promise(resolve => { release = resolve; }); } });
    const first = SF.save.init(), second = SF.save.init();
    await tick(); assert.equal(loads, 1);
    release({ currency: 42 });
    assert.equal(await first, await second); assert.equal(SF.save.profile.currency, 42);
  });
  await test('并发购买按顺序校验余额，不能重复扣同一级或透支', async () => {
    const { SF, storage } = fixture({ currency: 1000 }); await SF.save.init();
    const bought = await Promise.all(Array.from({ length: 3 }, () => SF.save.buyCharUpgrade('vega', 'hp')));
    assert.deepEqual(bought, [true, true, false]);
    assert.equal(SF.save.profile.charUpgrades.vega.hp, 2);
    assert.equal(SF.save.profile.currency, 550);
    assert.deepEqual(JSON.parse(storage.raw), plain(SF.save.profile));
  });
  await test('购买落盘失败不扣费、不升级；重试可完成一次购买', async () => {
    const { SF, storage } = fixture({ currency: 1000 }); await SF.save.init(); storage.fail = true;
    await assert.rejects(SF.save.buyCharUpgrade('vega', 'hp'));
    assert.equal(SF.save.profile.currency, 1000); assert.equal(SF.save.profile.charUpgrades.vega.hp, 0);
    storage.fail = false; assert.equal(await SF.save.buyCharUpgrade('vega', 'hp'), true);
    assert.equal(SF.save.profile.currency, 850); assert.equal(SF.save.profile.charUpgrades.vega.hp, 1);
  });
  await test('异步保存未完成时缓存不提前提交，后续写入也不会越过它', async () => {
    const { SF } = fixture({ currency: 1000 }); await SF.save.init(); let release, writes = 0;
    SF.save._switchLayer({ save: async () => { if (++writes === 1) await new Promise(resolve => { release = resolve; }); } });
    const a = SF.save.buyCharUpgrade('vega', 'hp'), b = SF.save.buyCharUpgrade('vega', 'speed');
    await tick(); assert.equal(writes, 1); assert.equal(SF.save.profile.currency, 1000);
    release(); await Promise.all([a, b]);
    assert.equal(SF.save.profile.currency, 700); assert.equal(writes, 2);
  });
  await test('重置失败保留原档；成功重置后后续操作使用新档', async () => {
    const { SF, storage } = fixture({ currency: 777, totalRuns: 4 }); await SF.save.init(); storage.fail = true;
    await assert.rejects(SF.save.reset()); assert.equal(SF.save.profile.currency, 777);
    storage.fail = false; await SF.save.reset();
    assert.equal(SF.save.profile.currency, 0); assert.equal(SF.save.profile.totalRuns, 0);
    assert.equal(JSON.parse(storage.raw).currency, 0);
  });
  await test('工坊处理存档失败并解除忙碌状态，不误报成功', async () => {
    const { SF, storage } = fixture({ currency: 1000 }); await SF.save.init(); storage.fail = true;
    const panel = new SF.menus.WorkshopPanel({}, 'vega'); await panel.buy(0);
    assert.equal(panel.busy, false); assert.match(panel.msg, /保存失败/);
    assert.equal(SF.save.profile.currency, 1000);
  });
  await test('结算失败保留快照；输入重试后只计一局，等待期间不能提前离开', async () => {
    const { SF, storage } = fixture({ currency: 100 }); await SF.save.init(); storage.fail = true;
    const g = { score: 900, time: 50, level: 2, difficultyId: 'normal', difficulty: { name: '正常' },
      runStats: { kills: 12, damage: 120, dustEarned: 60 }, dustReward() { return this.runStats.dustEarned; },
      mouse: { x: 200, y: 240, clicked: false }, openMenu() { this.left = true; } };
    const panel = new SF.menus.ResultScreen(g, true);
    panel.update(0.6); await tick(); assert.equal(panel.saveState, 'failed');
    assert.equal(SF.save.profile.totalRuns, 0); assert.equal(SF.save.profile.currency, 100);
    g.runStats.dustEarned = 999; // 重试必须使用结算快照。
    SF.input.isPressed = key => key === 'confirm';
    panel.update(0.5); assert.ok(!g.left); await tick();
    storage.fail = false; panel.update(0.1); await tick();
    assert.equal(panel.saveState, 'saved'); assert.equal(SF.save.profile.currency, 160);
    assert.equal(SF.save.profile.totalRuns, 1); assert.equal(SF.save.profile.stats.kills, 12);
    for (let i = 0; i < 4; i++) panel.update(0.1);
    assert.equal(g.left, true); assert.equal(SF.save.profile.totalRuns, 1);
  });
  await test('结算与购买同时入队时，奖励和扣费均完整保留', async () => {
    const { SF, storage } = fixture({ currency: 100 }); await SF.save.init();
    await Promise.all([
      SF.save.recordRun({ score: 10, time: 10, dustEarned: 100, difficulty: 'hard' }),
      SF.save.buyCharUpgrade('thunder', 'hp'),
    ]);
    assert.equal(SF.save.profile.currency, 50); assert.equal(SF.save.profile.totalRuns, 1);
    assert.equal(SF.save.profile.charUpgrades.thunder.hp, 1);
    assert.deepEqual(JSON.parse(storage.raw), plain(SF.save.profile));
  });
  await test('四张进化卡都在画面内，数字 4 和第四张卡鼠标命中一致', async () => {
    const { SF } = fixture(); const picked = [];
    SF.progression = { applyChoice: (_, __, choice) => picked.push(choice.id) };
    const choices = Array.from({ length: 4 }, (_, id) => ({ id }));
    const g = { player: { x: 0, y: 0 }, mouse: { x: -1, y: -1, clicked: false } };
    const panel = new SF.LevelUpPanel(g, 'chest-evolve', choices), b = panel.layout;
    assert.ok(b.x0 >= 0 && b.x0 + b.cardW * 4 + 14 * 3 <= 480);
    SF.input.isPressed = key => key === 'slot4'; panel.update(1 / 60);
    const second = new SF.LevelUpPanel(g, 'chest-evolve', choices);
    SF.input.isPressed = () => false;
    g.mouse = { x: 480 - b.x0 - b.cardW / 2, y: b.y0 + 60, clicked: true };
    second.update(1 / 60); second.pick(3); // 已选的面板不能二次发奖。
    assert.deepEqual(picked, [3, 3]);
  });
  const out = path.join(ROOT, 'gui-test-screenshots', 'v2.0'); fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'local-v1-tests.json'), JSON.stringify({ checks: results.length, results }, null, 2));
  console.log(`LOCAL V1: ${results.length} checks passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
