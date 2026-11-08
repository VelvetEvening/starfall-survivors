/* Offline Chromium review of all three characters. Staged screenshots are fixtures,
 * not playthroughs; real mouse/keyboard paths run separately in isolated storage.
 */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'gui-test-screenshots','v2.0/characters');
fs.mkdirSync(OUT,{recursive:true});
(async()=>{
  const browser=await chromium.launch({headless:true}),results=[],errors=[];
  try {
    const context=await browser.newContext({offline:true,viewport:{width:1440,height:810}});
    const page=await context.newPage();
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto(pathToFileURL(path.join(ROOT,'starfall.html')).href);
    await page.waitForFunction(()=>SF.game?.state==='menu');
    const shot=async name=>{await page.waitForTimeout(60);await page.screenshot({path:path.join(OUT,name+'.png')});};
    const clickAt=async(x,y)=>{
      const b=await page.locator('#screen').boundingBox();
      await page.mouse.click(b.x+x/480*b.width,b.y+y/270*b.height);
    };
    // Real input: a click at full storage fires once; holding the mouse never auto-repeats.
    await page.evaluate(()=>{
      const g=SF.game;g.startRun('thunder','normal');g.spawner.update=()=>{};g.enemies.update=()=>{};
      g.player.stats.critChance=0;const w=g.player.weapons[0];w.charges=3;
      const e=g.enemies.spawnAt('grub',100,0,1000,0);e.speed=0;
    });
    await clickAt(360,135);
    await page.waitForFunction(()=>SF.game.enemies.list[0].hp<SF.game.enemies.list[0].maxHp);
    const clicked=await page.evaluate(()=>({charges:SF.game.player.weapons[0].charges,
      damage:SF.game.enemies.list[0].maxHp-SF.game.enemies.list[0].hp}));
    assert.equal(clicked.charges,0);assert.ok(Math.abs(clicked.damage-435.6)<1e-6);
    await page.evaluate(()=>{const w=SF.game.player.weapons[0];w.charges=2;w.chargeT=0;});
    await page.mouse.down();await page.waitForTimeout(220);await page.mouse.up();
    assert.equal(await page.evaluate(()=>SF.game.player.weapons[0].charges),1);
    await page.keyboard.press('KeyP');await page.waitForFunction(()=>SF.game.state==='pause');
    const paused=await page.evaluate(()=>SF.game.player.weapons[0].chargeT);
    await page.waitForTimeout(120);assert.equal(await page.evaluate(()=>SF.game.player.weapons[0].chargeT),paused);
    results.push({name:'真实鼠标：满仓只发一炮，按住不连发；P 暂停保留充能',...clicked});

    // Real Space input must not leak across pause/menu boundaries or repeat while held.
    await page.evaluate(()=>{
      const g=SF.game;g.startRun('vega','normal');g.spawner.update=()=>{};
      g.player.weapons=[];g.player.heat=14;
    });
    await page.keyboard.press('Space');
    await page.waitForFunction(()=>!SF.input.isPressed('skill'));
    assert.equal(await page.evaluate(()=>SF.game.player.fireOverdriveT),0);
    await page.evaluate(()=>{SF.game.player.heat=15;});
    await page.keyboard.press('Enter');await page.keyboard.press('KeyJ');
    await page.waitForFunction(()=>!SF.input.isPressed('confirm'));
    assert.equal(await page.evaluate(()=>SF.game.player.fireOverdriveT),0);
    await page.keyboard.down('Space');await page.waitForFunction(()=>SF.game.player.fireOverdriveT>0);
    assert.equal(await page.evaluate(()=>SF.game.player.heat),0);
    await page.evaluate(()=>{const pl=SF.game.player;pl.setFireOverdrive(0);pl.heat=15;});
    await page.keyboard.down('Space');await page.waitForTimeout(80);
    assert.equal(await page.evaluate(()=>SF.game.player.fireOverdriveT),0);
    await page.keyboard.up('Space');
    await page.keyboard.press('KeyP');await page.waitForFunction(()=>SF.game.state==='pause');
    await page.keyboard.press('Space');await page.waitForFunction(()=>SF.game.state==='playing');
    assert.equal(await page.evaluate(()=>SF.game.player.fireOverdriveT),0);
    await page.evaluate(()=>{SF.game.player.weaponLockT=2;});
    await page.keyboard.press('Space');
    await page.waitForFunction(()=>!SF.input.isPressed('skill'));
    assert.equal(await page.evaluate(()=>SF.game.player.heat),15);
    await page.evaluate(()=>{SF.game.player.weaponLockT=0;});await page.waitForTimeout(80);
    assert.equal(await page.evaluate(()=>SF.game.player.fireOverdriveT),0);
    await page.keyboard.press('Space');await page.waitForFunction(()=>SF.game.player.fireOverdriveT>0);
    await page.keyboard.press('KeyP');await page.waitForFunction(()=>SF.game.state==='pause');
    const skillPaused=await page.evaluate(()=>SF.game.player.fireOverdriveT);
    await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>SF.game.player.fireOverdriveT),skillPaused);
    results.push({name:'真实空格：15 格手动开启、按住不重放、J/Enter 不开、暂停不泄漏、停滞不缓存'});

    // The passive dialog can grow and still closes at its actual drawn button.
    for(const [size,viewport] of [['desktop',{width:1440,height:810}],['small',{width:390,height:844}]]) {
      await page.setViewportSize(viewport);
      await page.evaluate(()=>{
        const g=SF.game;g.update=SF.Game.prototype.update;g.startRun('vega','normal');g.spawner.update=()=>{};
        const pl=g.player;
        pl.weapons=['blade','orb','chain','missile'].map(id=>new SF.WeaponInstance(SF.weapons[id],6));
        for(const id of ['engine','cryo','cooldown','crit'])pl.passives.set(id,{level:3});
        pl.recalcStats();g.openChest(0,0);
      });
      await page.waitForFunction(()=>SF.game.state==='levelup'&&SF.game.panel.choices.length===4);
      await shot(`${size}-four-evolutions-fixture`);
      const layout=await page.evaluate(()=>SF.game.panel.layout);
      assert.ok(layout.x0>=0&&layout.x0+4*layout.cardW+42<=480);
      if(size==='desktop')await page.keyboard.press('Digit4');
      else await clickAt(480-layout.x0-layout.cardW/2,layout.y0+60);
      await page.waitForFunction(()=>SF.game.state==='playing'&&SF.game.player.hasWeapon('nuke'));
      results.push({name:`${size} 四张进化卡完整显示，第四项键鼠可选`,layout});
      for(const char of ['vega','firefly','thunder']) {
        await page.evaluate(char=>{
          const g=SF.game;g.update=SF.Game.prototype.update;g.openCharSelect();
          g.panel.sel=g.panel.ids.indexOf(char);g.panel.showPassive=true;
        },char);
        await shot(`${size}-${char}-trait`);
        const bounds=await page.evaluate(()=>({panel:SF.game.panel._passiveBounds,close:SF.game.panel._passiveCloseBounds}));
        assert.ok(bounds.panel.y>=0&&bounds.panel.y+bounds.panel.h<=270);
        await clickAt(bounds.close.x+9,bounds.close.y+8);
        await page.waitForFunction(()=>!SF.game.panel.showPassive);
        results.push({name:`${size} ${char} 特性说明不裁切，鼠标关闭位置正确`,bounds});
      }
      for(const [char,stages] of [
        ['vega',['charging','ready','active','stasis']],['thunder',['charging','ready','burst','beam']],
['firefly',['window','ready','impact']],
      ]) for(const stage of stages) {
        const detail=await page.evaluate(({char,stage})=>{
          const g=SF.game;g.startRun(char,'normal');g.update=()=>{};
          const pl=g.player;pl.x=-90;pl.y=12;pl.visT=1.7;pl.stats.critChance=0;
          g.time=32.5;g.runTime=158;g.level=9;pl.starPoints=4;
          SF.renderer.cam.x=0;SF.renderer.cam.y=0;
          const setWeapon=(id,level)=>{const w=new SF.WeaponInstance(SF.weapons[id],level);w.owner=pl;pl.weapons=[w];return w;};
          let w;
          if(char==='vega')w=setWeapon('blade',6);
          if(char==='thunder')w=setWeapon(stage==='beam'?'tempest':'chain',stage==='beam'?4:6);
          if(char==='firefly'){w=setWeapon('mirrorWheel',6);pl.addWeapon('orb',4);pl.weapons[1].owner=pl;}
          const enemies=[];
          for(let i=0;i<6;i++) {
            const e=g.enemies.spawnAt(i%2?'crab':'grub',-25+i*30,12,1000,0);e.speed=0;enemies.push(e);
          }
          for(const y of [-42,64])g.enemies.spawnAt('grub',120,y,1000,0);
          const advance=seconds=>{for(let i=0;i<Math.round(seconds*60);i++){SF.projectiles.update(1/60,g);SF.particles.update(1/60);}};
          if(char==='vega') {
            pl.heat=stage==='charging'?7:15;
            if(stage==='active'||stage==='stasis'){
              pl.activateFireOverdrive();
              for(let i=0;i<3;i++){w.fire(g);advance(0.35);}
              pl.fireOverdriveT=11.4;
            }
            if(stage==='stasis')pl.weaponLockT=3;
          }
          if(char==='thunder') {
            w.charges=stage==='charging'?2:3;w.chargeT=stage==='charging'?w.chargeDuration()*0.58:0;
            if(stage==='burst'||stage==='beam') {
              g.mouse={x:365,y:147,clicked:true};w.update(0,g);g._endInput();
              if(stage==='burst')advance(0.24);
              else g.lightning.forEach(l=>l.t=0.06);
            }
          }
          if(char==='firefly') {
            pl.activateFrostCounter();
            if(stage!=='window')pl.takeDamage(5,{game:g,attacker:enemies[0]});
            if(stage==='impact'){w.fire(g);advance(0.52);}
          }
          const status=SF.hud.characterStatus(pl),ctx=SF.renderer.ctx;
          const measure=(text,size)=>SF.font.measureCn(ctx,text,size);
          return {status,withinHud:measure(status.detail,6)<=176&&measure(status.label,6.5)+measure(status.value,6.5)<=170,
            heat:pl.heat,charges:w.charges,empowered:w.frostEmpowered,burstEffects:SF.projectiles.frostBursts.length,
            damage:g.runStats.damage,projectiles:SF.projectiles.list.map(p=>({kind:p.kind,empowered:p.empowered}))};
        },{char,stage});
        assert.ok(detail.withinHud,`${char}/${stage} HUD text overflow`);
        if(char==='vega'&&(stage==='active'||stage==='stasis'))assert.equal(detail.heat,0);
        if(char==='thunder'&&(stage==='burst'||stage==='beam'))assert.equal(detail.charges,0);
        if(char==='firefly'&&stage==='ready')assert.ok(detail.empowered);
        await shot(`${size}-${char}-${stage}-fixture`);
        results.push({name:`${size} ${char} ${stage}`,detail});
      }
    }
    await page.setViewportSize({width:1440,height:810});
    const flameAudit=await page.evaluate(()=>{
      const g=SF.game;g.startRun('vega','normal');g.update=()=>{};g.player.weapons=[];
      SF.renderer.cam.x=0;SF.renderer.cam.y=0;
      const levels=[1,2,3,4,5,10], targets=levels.map((n,i)=>{
        const e=g.enemies.spawnAt('grub',-150+i*60,0,1000,0);e.speed=0;
        for(let j=0;j<n;j++)e.applyBurn(6,4,{stack:true,indicator:true});return e;
      });
      const render=e=>{
        const cv=document.createElement('canvas');cv.width=64;cv.height=64;
        const c=cv.getContext('2d');c.scale(4,4);
        const original=SF.renderer.toScreen;SF.renderer.toScreen=()=>({x:8,y:0});
        const radius=e.radius;e.radius=0;
        try {e.drawBurnIndicator(c);} finally {SF.renderer.toScreen=original;e.radius=radius;}
        return Array.from(c.getImageData(0,0,64,64).data);
      };
      const five=render(targets[4]),ten=render(targets[5]);
      const other=g.enemies.spawnAt('grub',0,55,1000,0);other.applyBurn(6,4);
      let pixels=0,minX=64,maxX=0,minY=64,maxY=0;
      five.forEach((v,i)=>{if(i%4===3&&v){pixels++;const pos=(i-3)/4,x=pos%64,y=Math.floor(pos/64);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}});
      return {same:five.every((v,i)=>v===ten[i]),pixels,width:maxX-minX+1,height:maxY-minY+1,
        ordinaryHidden:render(other).every(v=>v===0),oneDiffers:render(targets[0]).some((v,i)=>v!==five[i]),
        ratio:targets[5].burnDps/targets[4].burnDps};
    });
    assert.ok(flameAudit.same&&flameAudit.oneDiffers&&flameAudit.ordinaryHidden);
    assert.ok(flameAudit.pixels>20&&flameAudit.width<=32&&flameAudit.height<=22);
    assert.equal(flameAudit.ratio,2);
    await shot('desktop-burn-1-2-3-4-5-10-fixture');
    await page.setViewportSize({width:390,height:844});await shot('small-burn-1-2-3-4-5-10-fixture');
    results.push({name:'火苗像素验证：1–5 层增强，5/10 层相同、伤害翻倍，其它机体隐藏',flameAudit});
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(OUT,'visual-audit.json'),JSON.stringify({results,errors},null,2));
    console.log(`CHARACTER VISUAL: ${results.length} checks, ${errors.length} browser errors`);
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
