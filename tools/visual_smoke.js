/* Real Chromium integration/visual audit. Authoring dependency: playwright.
 * Run: node tools/visual_smoke.js. It serves an ephemeral loopback port, uses
 * isolated browser storage, and verifies the standalone file with networking off.
 * Screenshots containing staged combat are labeled fixtures, not playthroughs.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'gui-test-screenshots', 'v2.0/general');
const results = [], errors = [];
fs.mkdirSync(OUT, { recursive: true });
const server = http.createServer((req, res) => {
  const file = path.resolve(ROOT, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  const resolved = file === ROOT ? path.join(ROOT, 'index.html') : file;
  fs.readFile(resolved, (error, data) => {
    if (error) { res.writeHead(404).end(); return; }
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.webp': 'image/webp' };
    res.setHeader('Content-Type', types[path.extname(resolved)] || 'application/octet-stream');
    res.end(data);
  });
});
const record = (name, detail = true) => { results.push({ name, detail }); console.log('PASS', name, JSON.stringify(detail)); };

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 810 } });
    const page = await context.newPage();
    const observe = p => {
      p.on('pageerror', e => errors.push(e.stack || e.message));
      p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    };
    observe(page);
    const state = name => page.waitForFunction(s => window.SF?.game?.state === s, name);
    const shot = name => page.screenshot({ path: path.join(OUT, name + '.png') });
    const clickAt = async (x, y) => {
      const box = await page.locator('#screen').boundingBox();
      await page.mouse.click(box.x + x / 480 * box.width, box.y + y / 270 * box.height);
    };
    await page.goto(url);
    await state('menu');
    assert.equal(await page.evaluate(() => Object.keys(SF.assets.manifest).filter(id => SF.assets.get(id)?.complete).length), 15);
    record('All 15 licensed images preload before play');
    await shot('01-menu');
    await clickAt(140, 194);
    await page.waitForFunction(() => SF.game.panel.showCredits);
    assert.equal(await page.evaluate(() => SF.game.panel.showCredits), true);
    await shot('02-credits');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !SF.game.panel.showCredits);
    await clickAt(65, 194);
    await page.waitForFunction(() => SF.game.panel.showHelp);
    await shot('02b-help');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !SF.game.panel.showHelp);
    await clickAt(85, 158);
    await state('charSelect');
    await shot('03-hangar');
    await page.keyboard.press('KeyB');
    await page.waitForFunction(() => SF.game.panel.showPassive);
    assert.equal(await page.evaluate(() => SF.game.panel.showPassive), true);
    for (let i = 0; i < 2; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForFunction(index => SF.game.panel.sel === index, i + 1);
      if (i === 0) {
        await shot('03c-frost-passive');
        const bounds = await page.evaluate(() => SF.game.panel._passiveBounds);
        assert.ok(bounds.y >= 0 && bounds.y + bounds.h <= 270, 'Frost counter description must fit the viewport');
      }
    }
    await page.waitForFunction(() => SF.game.panel.sel === 2);
    await shot('03b-thunder-passive');
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => SF.game.panel.sel === 0);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !SF.game.panel.showPassive);
    await page.keyboard.press('KeyU');
    await state('workshop');
    await shot('04-workshop');
    // Enough private test currency to exercise one real purchase, never user storage.
    await page.evaluate(() => { SF.save.profile.currency = 1000; });
    await page.keyboard.press('Digit1');
    await page.waitForFunction(() => SF.save.profile.charUpgrades.vega.hp === 1);
    assert.equal(await page.evaluate(() => SF.save.profile.currency), 850);
    const capCheck = await page.evaluate(async () => {
      const currency = SF.save.profile.currency;
      await SF.save.update(p => { p.currency = 10000; p.charUpgrades.vega.weapon = 3; });
      const fourth = await SF.save.buyCharUpgrade('vega', 'weapon');
      const paid = SF.save.profile.currency, level = SF.save.profile.charUpgrades.vega.weapon;
      const fifth = await SF.save.buyCharUpgrade('vega', 'weapon');
      const finalPaid = SF.save.profile.currency;
      await SF.save.update(p => { p.charUpgrades.vega.weapon = 5; }); // A legacy save must remain playable.
      const legacy = await SF.save.buyCharUpgrade('vega', 'weapon');
      const entry = new SF.Player('vega').weapons[0].level;
      const unchanged = SF.save.profile.currency === finalPaid;
      await SF.save.update(p => { p.charUpgrades.vega.weapon = 0; p.currency = currency; });
      return { fourth, paid, level, fifth, finalPaid, legacy, entry, unchanged };
    });
    assert.deepEqual(capCheck, { fourth: true, paid: 8800, level: 4, fifth: true, finalPaid: 6400, legacy: false, entry: 6, unchanged: true });
    record('Workshop permits five weapon upgrades, enters at Lv.6, blocks a sixth and accepts legacy saves');
    await clickAt(430, 29);
    await state('charSelect');
    await page.keyboard.press('Enter');
    await state('playing');
    assert.equal(await page.evaluate(() => SF.game.player.stats.maxHp), 88);
    record('Hangar / passive / workshop keyboard and mouse paths, one purchase');
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(240);
    await page.keyboard.up('KeyD');
    assert.ok(await page.evaluate(() => SF.game.player.x > 5));
    await page.keyboard.press('KeyP');
    await state('pause');
    const pausedTime = await page.evaluate(() => SF.game.time);
    await page.waitForTimeout(180);
    assert.equal(await page.evaluate(() => SF.game.time), pausedTime);
    await shot('05-pause');
    await page.keyboard.press('Tab');
    await state('starmap');
    await page.evaluate(() => { SF.game.player.starPoints = 12; });
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => SF.game.player.litStars.has('orion_root'));
    await shot('06-starmap');
    await page.keyboard.press('Tab');
    await state('pause');
    assert.ok(await page.evaluate(() => SF.game.panel instanceof SF.menus.PauseMenu));
    await clickAt(230, 152);
    await state('playing');
    record('Movement, pause freezes simulation, star map returns to a usable pause menu');
    await page.evaluate(() => SF.game.gainXp(SF.game.xpNext));
    await state('levelup');
    await page.waitForTimeout(240);
    await shot('07-levelup');
    await page.keyboard.press('Digit2');
    await state('playing');
    await page.evaluate(() => SF.game.gainXp(SF.game.xpNext));
    await state('levelup');
    const textAudit = await page.evaluate(() => {
      const textCases = [...Object.values(SF.weapons), ...Object.values(SF.passives)]
        .flatMap(def => [def.desc, ...(def.levelDesc || [])]).filter(Boolean);
      const original = SF.font.drawText, rows = [], failures = [];
      const panel = SF.game.panel, ctx = SF.renderer.ctx;
      SF.font.drawText = (ctx, text, x, y, opt) => rows.push({ text, y, size: opt.size });
      try {
        for (const text of textCases) {
          rows.length = 0; panel.drawWrapped(ctx, text, 0, 0, 104, 4);
          const complete = rows.map(r => r.text).join('').replace(/\s/g, '') === text.replace(/\s/g, '');
          const fits = rows.every(r => SF.font.measureCn(ctx, r.text, r.size) <= 104.5 && r.y + r.size <= 40);
          const punctuation = rows.every(r => !/^[，。、；：！？）》】]/u.test(r.text));
          if (!complete || !fits || !punctuation) failures.push({ text, rows, complete, fits, punctuation });
        }
      } finally { SF.font.drawText = original; }
      return { checked: textCases.length, failures };
    });
    assert.deepEqual(textAudit.failures, []);
    record('All weapon and passive card descriptions fit without truncation', textAudit.checked);
    await page.evaluate(() => {
      const panel = SF.game.panel;
      panel._auditChoices = panel.choices;
      panel.choices = ['cooldown','cryo','armor'].map(id => {
        const d = SF.passives[id];
        return { kind:'passiveNew', ref:id, title:d.name, sub:d.desc, color:'hero2', icon:d.icon };
      });
    });
    await shot('07b-long-descriptions-fixture');
    await page.evaluate(() => { const p=SF.game.panel; p.choices=p._auditChoices; delete p._auditChoices; });
    await clickAt(80, 129);
    await state('playing');
    record('Level-up selection by number and mouse');

    const bossMusic = await page.evaluate(() => {
      const g = SF.game, tracks = [], original = SF.audio.playMusic;
      SF.audio.playMusic = (name, options) => {
        if (name === 'boss') tracks.push({ name, final: options?.final });
        original(name, options);
      };
      try {
        g.startRun('firefly', 'normal'); g.runTime = SF.config.BOSS_SPAWN_AT[0];
        g.spawner.update(0); g.boss.hp = g.boss.maxHp * 0.25; SF.bossAI.updateBoss(g.boss, 0, g);
        const firstPhase = SF.audio.bossPhase;
        g.startRun('thunder', 'normal'); g.spawner.bossIdx = 1; g.bossKilledThisRun = 1;
        g.runTime = SF.config.BOSS_SPAWN_AT[1]; g.spawner.update(0);
        g.boss.hp = g.boss.maxHp * 0.4; SF.bossAI.updateBoss(g.boss, 0, g);
        return { tracks, firstPhase, secondPhase: SF.audio.bossPhase, track: SF.audio.track };
      } finally { SF.audio.playMusic = original; }
    });
    assert.deepEqual(bossMusic, { tracks: [{ name: 'boss', final: false }, { name: 'boss', final: true }], firstPhase: 2, secondPhase: 1, track: 'boss' });
    record('Real Boss spawn and rage paths select and intensify the score', bossMusic);

    await page.evaluate(() => { SF.game.startRun('firefly', 'normal'); SF.game.player.starPoints = 30; SF.game.openStarMap(); });
    await state('starmap');
    const clickNode = async id => {
      const p = await page.evaluate(id => SF.game.panel.layout[id], id);
      await clickAt(p.x, p.y);
      await page.waitForFunction(id => SF.game.player.litStars.has(id), id);
    };
    await clickNode('cygnus_root');
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(() => SF.game.panel.focus === 'cygnus_a');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => SF.game.player.litStars.has('cygnus_a'));
    for (const id of ['cygnus_f','cygnus_c','cygnus_g','cygnus_b','cygnus_d','cygnus_e']) await clickNode(id);
    assert.equal(await page.evaluate(() => SF.game.player.starPoints), 0);
    assert.equal(await page.evaluate(() => SF.game.player.stats.counterDamage), 0.15);
    assert.equal(await page.evaluate(() => SF.game.player.starCost('orion_root')), 4);
    await shot('06b-frost-matrix');
    record('All eight frost specialization nodes activate through keyboard and mouse at a total cost of 30');
    await page.keyboard.press('Tab'); await state('playing');

    // Deterministic render fixtures use real entities and effects, with only the
    // update function paused after construction so image review is reproducible.
    async function fixture(kind) {
      await page.evaluate(kind => {
        const g = SF.game;
        g.update = SF.Game.prototype.update;
        g.startRun(kind === 'flight' ? 'firefly' : 'thunder', 'normal');
        SF.audio.setMuted(true);
        g.time = kind === 'flight' ? 168 : kind === 'eye' ? 245 : 484;
        g.runTime = kind === 'flight' ? 168 : kind === 'eye' ? 240 : 480;
        g.level = 18; g.xp = 80; g.xpNext = 130; g.score = 8456;
        g.runStats.kills = 417; g.player.starPoints = 7;
        g.player.invulnT = 0;
        g.player.weapons = [];
        for (const id of ['chain','blade','orb','laser']) g.player.addWeapon(id, 5);
        g.player.addPassive('crit'); g.player.addPassive('cryo');
        g.player.addPassive('cryo');
        const types = ['grub','crab','falcon','jelly','turret'];
        const count = kind === 'flight' ? 44 : 17;
        for (let i=0;i<count;i++) {
          const angle = i * 2.3999632297, radius=60+(i%9)*14;
          const e=g.enemies.spawnAt(types[i%5],Math.cos(angle)*radius,Math.sin(angle)*radius*0.59,8,0);
          if (i%11===0) e.freezeT=1;
        }
        g.enemies.spawnAt('eliteCrab',-115,48,8,0);
        g.enemies.spawnAt('eliteGrub',122,45,8,0);
        SF.pickups.dropDust(-54,29,12);
        SF.pickups.dropSpecial(-90,51,'chest');
        for (const w of g.player.weapons) w.update(1/60,g);
        SF.projectiles.spawnOrbWave(0,0,{radius:100,damage:0,slow:1,freeze:0});
        const orb = SF.projectiles.list.find(p=>p.kind==='orb');
        if (orb) { orb.radius=69; orb.t=0.18; }
        SF.particles.burst(-55,-12,{color:'fire1',count:40,speed:80,life:0.8,size:2});
        SF.particles.update(0.14);
        if(kind!=='flight') {
          g.bossKilledThisRun=kind==='eye'?0:1;
          g.spawner.bossIdx=kind==='eye'?1:2;
          const b=g.enemies.spawnBoss(g,kind==='eye'?'boss':'boss2');
          b.x=57;b.y=-35;b.hp=b.maxHp*(kind==='rage'?0.42:0.82);
          SF.bossAI.updateBoss(b,0,g);
          if(kind==='eye') {
            const A=b.def.attacks.dashLaser;
            b._dashLaser={...A,stage:'telegraph',t:0.65,telegraph:A.telegraph,base:0.19,dirs:A.dirs};
          }
          SF.bossVisuals.update(4,g);
          for(let i=0;i<24;i++) {
            const a=i*Math.PI*2/24+0.12,radius=kind==='eye'?65:82;
            SF.projectiles.spawnEnemyBullet(b.x+Math.cos(a)*radius,b.y+Math.sin(a)*radius,a,100,26,kind==='eye'?'elite':'darkRed');
          }
        } else {
          for(let i=0;i<12;i++)SF.projectiles.spawnEnemyBullet(-134+i*21,-54+Math.sin(i)*20,1.4,100,10,i%3===0?'elite':null);
        }
        g.update=()=>{};
      },kind);
      await page.waitForTimeout(150);
    }
    await fixture('flight'); await shot('08-combat-fixture');
    await page.evaluate(() => {
      const g = SF.game; g.update = SF.Game.prototype.update; g.startRun('firefly', 'normal');
      g.time = 165; g.runTime = 165; g.level = 14; SF.audio.setMuted(true);
      g.player.weapons[0].level = 5; g.player.stats.critChance = 0; g.player.phaseInvulnT = 0.2;
      const attacker = g.enemies.spawnAt('eliteGrub', 23, -14, 10, 0);
      g.enemies.spawnAt('crab', 47, 3, 20, 0); g.enemies.spawnAt('grub', 14, 14, 30, 0);
      g.player.takeDamage(26, { game: g, attacker, type: 'contact' });
      SF.particles.update(0.07);
      g.update = () => {};
    });
    assert.equal(await page.evaluate(() => SF.projectiles.iceFields.length), 1);
    await shot('08b-counter-fixture');
    record('Frost counter impact renders once at the attacker position');
    await fixture('eye'); await shot('09-eye-laser-fixture');
    await fixture('sovereign'); await shot('10-sovereign-fixture');
    await fixture('rage'); await shot('11-rage-fixture');
    const bossState=await page.evaluate(()=>({phase:SF.game.boss._phase2,lock:SF.game.player.weaponLockT,hp:SF.game.boss.hp/SF.game.boss.maxHp}));
    assert.equal(bossState.phase,true);assert.equal(bossState.lock,10);
    record('Boss I telegraph, Boss II, and real phase-two transition render',bossState);

    const shake=await page.evaluate(()=>{
      SF.renderer.addShake(4,1);SF.renderer.begin(1/60);
      const a=SF.renderer.toScreen(1,2),b=SF.renderer.toScreen(11,22);
      return {dx:b.x-a.x,dy:b.y-a.y};
    });
    assert.ok(Math.abs(shake.dx-10)<1e-9 && Math.abs(shake.dy-20)<1e-9);
    record('Screen shake is coherent across all world objects');

    // Render-heavy scene: many real enemy sprites, bullets and bounded particles.
    await page.evaluate(()=>{
      const g=SF.game;
      for(let i=g.enemies.list.length;i<220;i++){
        const a=i*2.39996,r=30+i%150;
        g.enemies.spawnAt(['grub','crab','falcon','jelly','turret'][i%5],Math.cos(a)*r,Math.sin(a)*r*0.6,8,0);
      }
      for(let i=0;i<80;i++)SF.projectiles.spawnEnemyBullet(Math.cos(i)*190,Math.sin(i)*92,i,120,20,i%2?'elite':'darkRed');
      for(let i=0;i<40;i++)SF.particles.burst(Math.cos(i)*175,Math.sin(i)*85,{color:i%2?'fire1':'bolt0',count:30,life:2,size:2,speed:30});
    });
    assert.equal(await page.evaluate(()=>SF.particles.count),900);
    // Let the renderer settle its resolution before sampling sustained load.
    await page.waitForTimeout(2400);
    const timing=await page.evaluate(()=>new Promise(resolve=>{
      const gaps=[];let previous=performance.now();
      function frame(now){gaps.push(now-previous);previous=now;if(gaps.length<91)requestAnimationFrame(frame);else{
        const sorted=gaps.slice(1).sort((a,b)=>a-b);resolve({medianMs:sorted[45],p95Ms:sorted[85],enemies:SF.game.enemies.list.length,particles:SF.particles.count,bullets:SF.projectiles.enemyList.length,worldDensity:SF.renderer.worldDensity,uiDensity:SF.renderer.displayDensity});
      }}requestAnimationFrame(frame);
    }));
    record('Dense-scene frame intervals (informational, hardware-dependent)',timing);
    await shot('12-dense-fixture');
    if (process.env.PROFILE_RENDER === '1') {
      for (const layer of ['noParticles','noSprites','noVignette','noWorld','noHUD','noToasts','density2','emptyFrame']) {
        const sample = await page.evaluate(async layer => {
          const R = SF.renderer, noop = () => {}, restore = [];
          const replace = (obj, key) => { const value = obj[key]; obj[key] = noop; restore.push(() => { obj[key] = value; }); };
          if (layer === 'noParticles') replace(SF.particles, 'draw');
          if (layer === 'noSprites') { replace(R, 'drawSprite'); replace(SF.sprites, 'draw'); }
          if (layer === 'noVignette') replace(R, 'vignette');
          if (layer === 'noWorld') replace(SF.world, 'draw');
          if (layer === 'noHUD') replace(SF.hud, 'draw');
          if (layer === 'noToasts') replace(SF.widgets, 'drawToasts');
          if (layer === 'density2') {
            const descriptor = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');
            Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 / 3 }); R.resize();
            restore.push(() => { Object.defineProperty(window, 'devicePixelRatio', descriptor); R.resize(); });
          }
          if (layer === 'emptyFrame') replace(SF.game, 'draw');
          const draw = SF.game.draw, costs = [];
          SF.game.draw = function(ctx) { const start = performance.now(); draw.call(this, ctx); costs.push(performance.now() - start); };
          const gaps = []; let previous = performance.now();
          await new Promise(resolve => {
            function frame(now) { gaps.push(now - previous); previous = now; if (gaps.length < 41) requestAnimationFrame(frame); else resolve(); }
            requestAnimationFrame(frame);
          });
          SF.game.draw = draw;
          restore.forEach(fn => fn());
          const sorted = gaps.slice(5).sort((a, b) => a - b);
          return { medianMs: sorted[18], p95Ms: sorted[34], drawJsMs: costs.reduce((a,b) => a+b,0)/costs.length };
        }, layer);
        console.log('PROFILE', layer, JSON.stringify(sample));
      }
    }

    // Responsive fit and mouse mapping are checked after resizing a letterboxed viewport.
    const resetCheck = await page.evaluate(()=>{
      const g=SF.game;g.update=SF.Game.prototype.update;g.startRun('vega','normal');
      const clean = !g.boss && SF.particles.count===0 && SF.projectiles.list.length===0 && SF.projectiles.enemyList.length===0 && SF.pickups.list.length===0 && SF.bossVisuals.ghostHp===1;
      SF.widgets.toast('AUDIT OLD COMBAT WARNING',10);SF.widgets.updateToasts(0.5);
      g.openMenu();
      const original=SF.font.drawText, texts=[];
      SF.font.drawText=(ctx,text)=>texts.push(text);
      try { SF.widgets.drawToasts(SF.renderer.ctx); } finally { SF.font.drawText=original; }
      return {clean,oldWarnings:texts};
    });
    assert.deepEqual(resetCheck,{clean:true,oldWarnings:[]});
    record('New run and menu clear old combat effects and warnings');
    await page.setViewportSize({width:1000,height:760});
    await clickAt(85,159);await state('charSelect');
    await clickAt(451,17);await state('menu');
    await page.setViewportSize({width:384,height:216});
    await page.waitForFunction(() => {
      const r = document.querySelector('#screen').getBoundingClientRect();
      return r.width <= innerWidth && r.height <= innerHeight && r.x >= 0 && r.y >= 0;
    });
    const box=await page.locator('#screen').boundingBox();
    assert.ok(box.width<=384 && box.height<=216 && box.x>=0 && box.y>=0);
    await shot('13-small-window');
    record('Letterboxed mouse input and sub-480px window fit');

    await page.setViewportSize({width:1440,height:810});
    await page.evaluate(()=>{
      const g=SF.game;g.startRun('vega','normal');g.time=734;g.score=24850;g.runStats.kills=1563;
      g.level=26;g.runStats.damage=186550;g.runStats.dustEarned=2812;g.openResult(true);
    });
    await page.waitForTimeout(1150);await shot('14-result');
    await page.keyboard.press('Enter');await state('menu');
    assert.equal(await page.evaluate(()=>SF.save.profile.totalRuns),1);
    assert.equal(await page.evaluate(()=>SF.save.profile.currency),3662);
    await page.reload();await state('menu');
    assert.equal(await page.evaluate(()=>SF.save.profile.currency),3662);
    record('Result, reward persistence and return to menu');
    await clickAt(106,218);
    await page.waitForFunction(()=>SF.game.panel.wipeArmed);
    assert.equal(await page.evaluate(()=>SF.save.profile.currency),3662);
    await clickAt(226,135);
    await page.waitForFunction(()=>!SF.game.panel.wipeArmed);
    await clickAt(106,218);await page.waitForFunction(()=>SF.game.panel.wipeArmed);
    await clickAt(106,218);await page.waitForFunction(()=>SF.save.profile.currency===0);
    record('Reset requires two confirmations; clicking outside cancels');

    // Exercise genuine browser storage rejection, then retry with the original storage method.
    await page.evaluate(()=>{
      SF.save.profile.currency=1000;SF.game.openWorkshop('vega');
      window.auditSetItem=Storage.prototype.setItem;
      Storage.prototype.setItem=function(){throw new Error('AUDIT simulated quota failure');};
    });
    await state('workshop');await page.keyboard.press('Digit1');
    await page.waitForFunction(()=>SF.game.panel.msg?.includes('保存失败'));
    assert.equal(await page.evaluate(()=>SF.save.profile.currency),1000);
    assert.equal(await page.evaluate(()=>SF.game.panel.busy),false);
    await shot('15-storage-failure-workshop');
    await page.evaluate(()=>{Storage.prototype.setItem=window.auditSetItem;});
    await page.keyboard.press('Digit1');
    await page.waitForFunction(()=>SF.save.profile.charUpgrades.vega.hp===1);
    assert.equal(await page.evaluate(()=>SF.save.profile.currency),850);
    record('Actual storage failure leaves workshop funds intact and allows retry');
    await page.evaluate(async()=>{
      await SF.save.reset();
      const g=SF.game;g.startRun('vega','normal');g.runStats.dustEarned=60;g.openResult(false);
      Storage.prototype.setItem=function(){throw new Error('AUDIT simulated quota failure');};
    });
    await page.waitForFunction(()=>SF.game.panel.saveState==='failed'&&SF.game.panel.t>1);
    await shot('16-storage-failure-result');
    assert.equal(await page.evaluate(()=>SF.save.profile.totalRuns),0);
    await page.evaluate(()=>{Storage.prototype.setItem=window.auditSetItem;delete window.auditSetItem;});
    await page.keyboard.press('Enter');
    await page.waitForFunction(()=>SF.game.panel.saveState==='saved');
    assert.equal(await page.evaluate(()=>SF.save.profile.totalRuns),1);
    assert.equal(await page.evaluate(()=>SF.save.profile.currency),60);
    await page.keyboard.press('Enter');await state('menu');
    await page.reload();await state('menu');
    assert.equal(await page.evaluate(()=>SF.save.profile.currency),60);
    record('Failed result retains its snapshot; Enter retries exactly once, reward survives reload');

    const offlineContext=await browser.newContext({offline:true,viewport:{width:1280,height:720}});
    const offline=await offlineContext.newPage();observe(offline);
    const remoteRequests=[];offline.on('request',req=>{if(/^https?:/.test(req.url()))remoteRequests.push(req.url());});
    await offline.goto(pathToFileURL(path.join(ROOT,'starfall.html')).href);
    await offline.waitForFunction(()=>window.SF?.game?.state==='menu');
    assert.deepEqual(remoteRequests,[]);
    assert.equal(await offline.evaluate(()=>Object.keys(SF.assets.manifest).filter(id=>SF.assets.get(id)?.complete).length),15);
    await offline.keyboard.press('Enter');await offline.waitForFunction(()=>SF.game.state==='charSelect');
    await offline.keyboard.press('Enter');await offline.waitForFunction(()=>SF.game.state==='playing');
    await offline.waitForTimeout(500);
    record('Standalone file boots and plays offline with every asset embedded');
    assert.deepEqual(errors,[],'No browser or main-loop errors may be present');
    record('No browser, renderer, update or audio exceptions');
    fs.writeFileSync(path.join(OUT,'audit.json'),JSON.stringify({date:new Date().toISOString(),results,errors},null,2));
    console.log('VISUAL AUDIT COMPLETE:',results.length,'checks,',errors.length,'errors');
  } finally {
    await browser.close();await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);if(errors.length)console.error('BROWSER ERRORS',errors.slice(0,8));server.close();process.exitCode=1;});
