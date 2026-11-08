/* Isolated, staged projectile screenshots. Run after tools/build.py. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'gui-test-screenshots', 'v2.0/frost');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const errors = [], results = [];
  try {
    const context = await browser.newContext({ offline: true });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(pathToFileURL(path.join(ROOT, 'starfall.html')).href);
    await page.waitForFunction(() => SF.game?.state === 'menu');
    for (const [label, viewport] of [['desktop', { width: 1440, height: 810 }], ['mobile', { width: 390, height: 844 }]]) {
      await page.setViewportSize(viewport);
      for (const stage of ['flight', 'impact', 'empowered', 'ready']) {
        const report = await page.evaluate(stage => {
          const g = SF.game;
          g.startRun('firefly', 'normal'); g.update = () => {};
          const pl = g.player;
          pl.x = -120; pl.y = 0; pl.stats.critChance = 0;
          SF.renderer.cam.x = 0; SF.renderer.cam.y = 0;
          pl.weapons = [new SF.WeaponInstance(SF.weapons.mirrorWheel, 3)];
          const w = pl.weapons[0]; w.owner = pl;
          const enemies = [-35, 0, 35, 140].map(x => g.enemies.spawnAt('grub', x, 0, 100, 0));
          for (const y of [-42, 42]) g.enemies.spawnAt('crab', 105, y, 100, 0);
          if (stage === 'empowered' || stage === 'ready') {
            pl.activateFrostCounter();
            pl.takeDamage(5, { game: g, attacker: enemies[0] });
            SF.projectiles.clear();
          }
          if (stage !== 'ready') {
            w.fire(g);
            const duration = stage === 'flight' ? 0.17 : stage === 'impact' ? 0.35 : 0.59;
            for (let t = 0; t < duration; t += 1 / 60) {
              SF.projectiles.update(1 / 60, g); SF.particles.update(1 / 60);
            }
          }
          const tex = SF.sprites.get('frostShard');
          const pixels = tex.getContext('2d').getImageData(0, 0, tex.width, tex.height).data;
          let opaque = 0;
          for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 50) opaque++;
          return {
            opaque, ready: w.frostEmpowered, projectiles: SF.projectiles.list.length,
            contacts: SF.projectiles.list[0]?.hitSet.size || 0,
            bursts: SF.projectiles.frostBursts.length,
            assets: ['frostCore', 'frostBurst'].every(id => SF.assets.get(id)?.complete),
          };
        }, stage);
        assert.ok(report.assets && report.opaque > 100, 'Loaded frost assets and nonblank sprite');
        if (stage === 'flight') assert.equal(report.projectiles, 1);
        if (stage === 'impact') { assert.equal(report.projectiles, 0); assert.ok(report.bursts > 0); }
        if (stage === 'empowered') { assert.equal(report.projectiles, 1); assert.equal(report.contacts, 3); }
        if (stage === 'ready') assert.ok(report.ready);
        await page.waitForTimeout(80);
        await page.screenshot({ path: path.join(OUT, `${label}-${stage}.png`) });
        results.push({ label, stage, ...report });
      }
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(OUT, 'audit.json'), JSON.stringify({ results, errors }, null, 2));
    console.log(`FROST VISUAL PASS: ${results.length} desktop/mobile fixtures, nonblank assets, 0 errors`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
