'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const OUT=path.resolve(__dirname,'../gui-test-screenshots/v2.0');
fs.mkdirSync(OUT,{recursive:true});
(async()=>{
  const browser=await chromium.launch({headless:true}),errors=[],results=[];
  try {
    const context=await browser.newContext({offline:true,viewport:{width:1440,height:810}}),page=await context.newPage();
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto(pathToFileURL(path.resolve(__dirname,'../starfall.html')).href);
    await page.waitForFunction(()=>SF.game?.state==='menu');
    assert.equal(await page.evaluate(()=>SF.config.VERSION),'v2.0');
    await page.evaluate(()=>{
      const g=SF.game;g.startRun('firefly','normal');g.spawner.update=()=>{};g.player.weapons=[];
      const p=g.player,activate=p.activateFrostCounter;p.activations=0;
      p.activateFrostCounter=function(){const ok=activate.call(this);if(ok)this.activations++;return ok;};
    });
    await page.keyboard.press('Enter');await page.keyboard.press('KeyJ');await page.waitForTimeout(60);
    assert.equal(await page.evaluate(()=>SF.game.player.activations),0);
    await page.keyboard.down('Space');await page.waitForFunction(()=>SF.game.player.activations===1);
    await page.evaluate(()=>{SF.game.player.cycleInvulnCd=0;});await page.keyboard.down('Space');await page.waitForTimeout(80);
    assert.equal(await page.evaluate(()=>SF.game.player.activations),1);await page.keyboard.up('Space');
    await page.keyboard.press('Space');await page.waitForFunction(()=>SF.game.player.activations===2);
    await page.keyboard.press('KeyP');await page.waitForFunction(()=>SF.game.state==='pause');
    const cd=await page.evaluate(()=>SF.game.player.cycleInvulnCd);await page.waitForTimeout(100);
    assert.equal(await page.evaluate(()=>SF.game.player.cycleInvulnCd),cd);
    await page.keyboard.press('Space');await page.waitForFunction(()=>SF.game.state==='playing');
    assert.equal(await page.evaluate(()=>SF.game.player.activations),2);
    results.push('真实键盘：仅空格触发，按住不重放，暂停冻结，恢复不泄漏技能');
    for(const char of ['vega','firefly','thunder']){
      const ids=await page.evaluate(char=>{
        const g=SF.game;g.startRun(char,'normal');g.player.starPoints=30;g.openStarMap();
        return g.panel.ids.filter(id=>SF.constellations[id].con===g.player.char.homeTree);
      },char);
      for(const id of ids){
        const position=await page.evaluate(id=>{
          const p=SF.game.panel.layout[id],r=document.querySelector('canvas').getBoundingClientRect();
          return {x:r.left+p.x*r.width/480,y:r.top+p.y*r.height/270};
        },id);
        await page.mouse.click(position.x,position.y);await page.waitForFunction(id=>SF.game.player.litStars.has(id),id);
      }
      assert.equal(await page.evaluate(()=>SF.game.player.starPoints),0);
      if(char==='firefly')assert.equal(await page.evaluate(()=>SF.game.player.stats.frostCounterCooldown),14);
      results.push(char+'：8 节点真实鼠标逐级购买、总费 30');
    }
    for(const control of ['keyboard','mouse']){
      await page.evaluate(()=>{
        const g=SF.game;g.startRun('firefly','normal');g.spawner.update=()=>{};const p=g.player;p.weapons=[];
        p.addWeapon('mirrorWheel',6);p.addWeapon('orb',6);
        for(const id of ['frostLens','cryo']){p.addPassive(id);p.passives.get(id).level=3;}p.recalcStats();
        p.weapons[0].frostEmpowered=true;g.openChest(0,0);
      });
      await page.waitForFunction(()=>SF.game.state==='levelup');
      assert.equal(await page.evaluate(()=>SF.game.panel.choices[0].sub),await page.evaluate(()=>SF.weapons.frostLance.desc));
      if(control==='keyboard')await page.keyboard.press('Digit1');
      else{
        const pos=await page.evaluate(()=>{
          const {x0,y0,cardW}=SF.game.panel.layout,r=document.querySelector('canvas').getBoundingClientRect();
          return {x:r.left+(x0+cardW/2)*r.width/480,y:r.top+(y0+60)*r.height/270};
        });await page.mouse.click(pos.x,pos.y);
      }
      await page.waitForFunction(()=>SF.game.player.hasWeapon('frostLance'));
      assert.equal(await page.evaluate(()=>SF.game.player.weapons.length),2);
      assert.equal(await page.evaluate(()=>SF.game.player.weapons[0].frostEmpowered),true);
      results.push('冰枪宝箱进化：'+control+' 真实选卡，保留防反强化');
    }
    for(const [name,viewport] of [['desktop',{width:1440,height:810}],['small',{width:390,height:844}]]){
      await page.setViewportSize(viewport);
      for(const scene of ['hangar','elements','materials','materials-four','materials-ice','ice-evolution','ice-lance','ice-lance-empowered','matrix','matrix-early','laser','laser-base','rail-charge','rail-ready','rail-empty','rail-locked','rail-shot','rail-beam','rail-beam-late','frost','frost-ready','frost-active','frost-cooldown']){
        await page.evaluate(scene=>{
          const g=SF.game;g.update=()=>{};
          if(scene==='hangar'){g.openCharSelect();return;}
          g.startRun(scene.startsWith('laser')||scene.startsWith('rail')?'thunder':'firefly','normal');g.player.stats.critChance=0;
          if(scene==='elements'||scene.startsWith('materials')){
            const ids=scene==='elements'?['blade','orb','chain']:scene==='materials-four'?['engine','cryo','armor','crit']:scene==='materials-ice'?['frostLens','cryo','armor']:['engine','cryo','armor'];
            const choices=ids.map(id=>{const d=(scene==='elements'?SF.weapons:SF.passives)[id];return {kind:scene==='elements'?'weaponNew':'passiveNew',ref:id,title:d.name,sub:d.desc,icon:d.icon,color:scene==='elements'?SF.palette.elementColor(d.element):'hero2'};});
            g.openLevelUp('level',choices);g.panel.openT=1;return;
          }
          if(scene==='ice-evolution'){
            const p=g.player;p.weapons=[];p.addWeapon('mirrorWheel',6);p.addWeapon('orb',6);
            for(const id of ['frostLens','cryo']){p.addPassive(id);p.passives.get(id).level=3;}p.recalcStats();
            g.openChest(0,0);
            g.panel.openT=1;return;
          }
          if(scene.startsWith('matrix')){
            g.player.starPoints=30;
            const ids=scene==='matrix-early'?['cygnus_root','cygnus_a','cygnus_f']:Object.keys(SF.constellations).filter(id=>id.startsWith('cygnus_'));
            for(const id of ids)g.player.lightStar(id);
            g.openStarMap();g.panel.focus=scene==='matrix-early'?'cygnus_f':'cygnus_g';return;
          }
          for(let i=0;i<9;i++){const e=g.enemies.spawnAt(i%2?'crab':'grub',45+i*15,(i%3-1)*22,100,0);e.speed=0;}
          if(scene.startsWith('ice-lance')){
            const p=g.player;p.weapons=[];p.addWeapon('frostLance');p.cycleInvulnCd=10;
            const w=p.weapons[0];w.owner=p;w.frostEmpowered=scene==='ice-lance-empowered';
            w.fire(g);SF.projectiles.update(0.27,g);SF.particles.update(0.07);
            SF.projectiles.frostBursts.forEach(f=>f.t=0.07);
          }else if(scene.startsWith('laser')){
            g.player.weapons=[];g.player.addWeapon(scene==='laser'?'spectrum':'laser',2);const w=g.player.weapons[0];
            for(let i=0;i<25;i++)w.update(1/60,g);
            g.player.visT=0.53;
          }else if(scene.startsWith('rail')){
            const p=g.player;p.weapons=[];p.addWeapon(scene.startsWith('rail-beam')?'tempest':'chain',4);
            const w=p.weapons[0];w.owner=p;w.charges=3;p.visT=0.53;
            if(scene==='rail-ready')w.charges=1;
            if(scene==='rail-empty'){w.charges=0;w.chargeT=2;}
            if(scene==='rail-locked')p.weaponLockT=2;
            if(scene==='rail-shot'||scene.startsWith('rail-beam')){
              w.charges=0;w.fireRailgun(0,g,w.scaledSpec(p),true);
              const elapsed=scene==='rail-beam-late'?0.5:0.08;
              SF.projectiles.update(0.18,g);SF.particles.update(elapsed);g.lightning.forEach(l=>l.t=elapsed);
            }
          }else if(scene==='frost-ready'){g.player.visT=0.5;}
          else if(scene==='frost-active'){g.player.activateFrostCounter();}
          else if(scene==='frost-cooldown'){g.player.activateFrostCounter();g.player.phaseInvulnT=0;g.player.cycleInvulnCd=10;}
          else{
            g.player.activateFrostCounter();g.player.takeDamage(5,{game:g,attacker:g.enemies.list[1]});
            g.player.counterFlashT=0.61;SF.projectiles.iceFields[0].t=0.09;SF.particles.update(0.09);
          }
        },scene);
        await page.waitForTimeout(80);await page.screenshot({path:path.join(OUT,`${name}-${scene}.png`)});
        results.push(`${name}/${scene}`);
      }
    }
    const arcSample=async()=>page.evaluate(()=>{
      const cv=document.createElement('canvas');cv.width=180;cv.height=40;const ctx=cv.getContext('2d');
      const sample=time=>{ctx.clearRect(0,0,180,40);SF.renderer.electricArc(ctx,5,20,175,20,{time,amplitude:7});return cv.toDataURL();};
      const original=Math.random;Math.random=()=>{throw new Error('Visual consumed combat RNG');};
      try{return [sample(0),sample(0.25)];}finally{Math.random=original;}
    });
    const animated=await arcSample();assert.notEqual(animated[0],animated[1]);
    results.push('电弧形状随逻辑时间变化，不消费战斗随机数');
    await page.setViewportSize({width:1440,height:810});
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.waitForFunction(()=>SF.renderer.reducedMotion);
    const reduced=await arcSample();assert.equal(reduced[0],reduced[1]);
    await page.evaluate(()=>{
      const g=SF.game;g.startRun('thunder','normal');const w=g.player.weapons[0];
      w.owner=g.player;w.charges=3;g.player.visT=0.5;
    });
    await page.waitForTimeout(80);
    await page.screenshot({path:path.join(OUT,'reduced-motion-rail-ready.png')});
    await page.evaluate(()=>{const g=SF.game;g.startRun('firefly','normal');g.player.visT=1;});
    await page.screenshot({path:path.join(OUT,'reduced-motion-ready.png')});
    const still=await page.locator('canvas').screenshot();
    await page.waitForTimeout(80);assert.deepEqual(await page.locator('canvas').screenshot(),still);
    results.push('减少动态效果：就绪提示保留，冻结场景没有额外时钟动画');
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(OUT,'visual.json'),JSON.stringify({version:'v2.0',results,errors},null,2));
    console.log('V2 VISUAL:',results.length,'checks,',errors.length,'errors');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
