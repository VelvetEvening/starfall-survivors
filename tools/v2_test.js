/* v2.0 integration regressions; isolated memory, never the user's save. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const noop = () => {};
global.window = global; global.location = {search:''}; global.SF = {};
SF.renderer = {cam:{x:0,y:0},width:480,height:270,addShake:noop};
SF.particles = new Proxy({}, {get:()=>noop});
SF.audio = {sfx:new Proxy({}, {get:()=>noop}),playMusic:noop,stopMusic:noop};
SF.widgets = new Proxy({}, {get:()=>noop}); SF.world = {setSeed:noop,update:noop};
SF.input = {moveVector:()=>({x:0,y:0}),isPressed:()=>false,endFrame:noop};
SF.save = {profile:null};
for(const file of ['core/utils','core/palette','data/config','data/weapons','data/passives','data/enemies','data/characters',
  'growth/constellations','sim/projectiles','sim/pickups','sim/enemies','sim/boss','sim/weapons','sim/spawner',
  'growth/player','growth/progression','engine/game']) require('../src/'+file+'.js');
const STEP=1/60,results=[];
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function test(name,run){run();results.push(name);console.log('PASS',name);}
function fixture(char='firefly'){
  SF.save.profile=null;SF.input.isPressed=()=>false;SF.input.moveVector=()=>({x:0,y:0});
  const g=SF.game=new SF.Game();g.reset(char,'normal');g.state='playing';g.spawner.update=noop;
  g.player.stats.critChance=0;return g;
}
function target(g,x=40,y=0){const e=g.enemies.spawnAt('grub',x,y,1000,0);e.speed=0;return e;}

test('20 秒内不会自动防反；空格激活后恰好 0.2 秒免伤、一次反击',()=>{
  const g=fixture(),p=g.player; p.weapons=[];
  for(let i=0;i<1200;i++)p.update(STEP,g);
  assert.equal(p.phaseInvulnT,0);assert.equal(p.cycleInvulnCd,0);
  p.addWeapon('orb');p.addWeapon('mirrorWheel');const e=target(g);
  SF.input.isPressed=key=>key==='skill';p.update(STEP,g);SF.input.isPressed=()=>false;
  near(p.phaseInvulnT,0.2);near(p.cycleInvulnCd,20);
  const hp=p.hp;p.takeDamage(10,{game:g,attacker:e});p.takeDamage(10,{game:g,attacker:e});
  near(p.hp,hp);assert.equal(SF.projectiles.iceFields.length,1);assert.ok(p.weapons[1].frostEmpowered);
  p.weapons=[];for(let i=0;i<11;i++)p.update(STEP,g);
  assert.ok(p.phaseInvulnT>0);p.update(STEP,g);assert.equal(p.phaseInvulnT,0);
  p.takeDamage(10,{game:g,attacker:e});near(p.hp,hp-10);
  for(let i=12;i<1199;i++)p.update(STEP,g);
  assert.equal(p.activateFrostCounter(),false);p.update(STEP,g);
  assert.equal(p.activateFrostCounter(),true);
});
test('全矩阵、满级材料、旧时长属性和受击无敌均不能延长 0.2 秒防反',()=>{
  const g=fixture(),p=g.player;
  p.litStars=new Set(Object.keys(SF.constellations));
  for(const [id,def] of Object.entries(SF.passives))p.passives.set(id,{level:def.maxLevel});
  p.recalcStats();near(p.stats.phaseInvulnDuration,0.2);
  Object.assign(p.stats,{phaseInvulnDuration:9,phaseInvulnBonus:9,invulnBonus:9,cooldownMul:0.01});
  p.invulnT=9;p.activateFrostCounter();near(p.phaseInvulnT,0.2);near(p.cycleInvulnCd,14);
  const e=target(g);p.weapons=[];
  for(let i=0;i<12;i++)p.update(STEP,g);
  assert.equal(p.phaseInvulnT,0);near(p.cycleInvulnCd,13.8);
  p.takeDamage(10,{game:g,attacker:e});assert.equal(SF.projectiles.iceFields.length,0);
  assert.equal(p.counterFlashT,0);assert.ok(p.invulnT>0);
});
test('三系新增节点遵守前置与费用；防反 20→17→14 秒，刷新属性保留冷却进度',()=>{
  for(const char of ['vega','firefly','thunder']){
    const p=fixture(char).player,tree=p.char.homeTree;
    p.starPoints=30;assert.equal(p.lightStar(tree+'_g'),false);
    const ids=Object.keys(SF.constellations).filter(id=>SF.constellations[id].con===tree);
    assert.equal(ids.length,8);
    for(const id of ids)assert.equal(p.lightStar(id),true,id);
    assert.equal(p.starPoints,0);assert.equal(p.lightStar(tree+'_f'),false);
    assert.equal(p.starCost(tree+'_g'),5);
    assert.equal(p.starCost((tree==='orion'?'nexus':'orion')+'_f'),10);
  }
  const p=fixture().player;p.starPoints=30;
  for(const id of ['root','a'])p.lightStar('cygnus_'+id);
  near(p.stats.frostCounterCooldown,20);p.activateFrostCounter();p.cycleInvulnCd=10;
  p.lightStar('cygnus_f');near(p.stats.frostCounterCooldown,17);near(p.cycleInvulnCd,8.5);
  assert.equal(p.starPoints,21);assert.equal(p.litStars.has('cygnus_e'),false);
  assert.equal(p.lightStar('cygnus_g'),false);p.lightStar('cygnus_c');
  p.lightStar('cygnus_g');near(p.stats.frostCounterCooldown,14);near(p.cycleInvulnCd,7);
  assert.equal(p.starPoints,12);assert.equal(p.litStars.has('cygnus_e'),false);
  for(const id of ['b','d','e'])assert.equal(p.lightStar('cygnus_'+id),true);
  assert.equal(p.starPoints,0);
  near(p.counterCooldownMax,14);near(p.phaseInvulnT,0.2);
  const original=SF.constellations.cygnus_g.fx.frostCounterReduction;
  try { SF.constellations.cygnus_g.fx.frostCounterReduction=999;p.recalcStats();near(p.stats.frostCounterCooldown,14); }
  finally { SF.constellations.cygnus_g.fx.frostCounterReduction=original; }
  const g=fixture();g.player.litStars=new Set(Object.keys(SF.constellations));g.player.recalcStats();
  g.player.weapons=[];g.player.activateFrostCounter();
  for(let i=0;i<839;i++)g.player.update(STEP,g);
  assert.equal(g.player.activateFrostCounter(),false);g.player.update(STEP,g);
  assert.equal(g.player.activateFrostCounter(),true);near(g.player.cycleInvulnCd,14);
});
test('防反就绪特效只表示可释放状态；成功反馈不追加伤害',()=>{
  const g=fixture(),p=g.player;assert.equal(p.frostAuraState,'ready');
  p.activateFrostCounter();assert.equal(p.frostAuraState,'active');
  const e=target(g);p.takeDamage(5,{game:g,attacker:e});const hp=e.hp;
  p.takeDamage(5,{game:g,attacker:e});near(e.hp,hp);assert.equal(SF.projectiles.iceFields.length,1);
  p.weapons=[];for(let i=0;i<12;i++)p.update(STEP,g);assert.equal(p.frostAuraState,null);
  p.cycleInvulnCd=0;p.weaponLockT=1;assert.equal(p.frostAuraState,null);
  p.weaponLockT=0;assert.equal(p.frostAuraState,'ready');p.dead=true;assert.equal(p.frostAuraState,null);
});
test('新增火雷范围节点只增强相应元素，保留冰系判定',()=>{
  const p=fixture('vega').player;p.addWeapon('orb');p.addWeapon('laser');
  const [fire,ice,bolt]=p.weapons,before=p.weapons.map(w=>w.scaledSpec(p));
  p.litStars.add('orion_g');p.recalcStats();near(fire.scaledSpec(p).blast,before[0].blast*1.08);
  near(ice.scaledSpec(p).radius,before[1].radius);near(bolt.scaledSpec(p).length,before[2].length);
  p.litStars.add('nexus_g');p.recalcStats();near(bolt.scaledSpec(p).length,before[2].length*1.08);
});
test('暂停冻结防反；停滞不缓存技能；死亡和重开清空状态',()=>{
  const g=fixture(),p=g.player;p.activateFrostCounter();g.openPause=()=>{g.state='pause';};g.openPause();
  for(let i=0;i<90;i++)g.update(STEP);
  near(p.cycleInvulnCd,20);near(p.phaseInvulnT,0.2);
  p.cycleInvulnCd=0;p.phaseInvulnT=0;p.weaponLockT=1;
  assert.equal(p.activateFrostCounter(),false);p.weaponLockT=0;p.update(STEP,g);assert.equal(p.phaseInvulnT,0);
  p.activateFrostCounter();p.die();assert.equal(p.phaseInvulnT,0);
  g.reset('firefly','normal');assert.equal(g.player.cycleInvulnCd,0);assert.equal(SF.projectiles.iceFields.length,0);
});
test('三角色工坊移速乘 0.8，进化材料实际增强对应元素',()=>{
  for(const [char,per] of [['vega',2.4],['firefly',3.2],['thunder',2.4]]){
    const g=fixture(char);SF.save.profile={charUpgrades:{[char]:{speed:5}}};g.player.recalcStats();
    near(g.player.stats.speed,SF.characters[char].bonus.speed+5*per);
  }
  const g=fixture('vega'),p=g.player,w=p.weapons[0],before=w.scaledSpec(p).burnDuration;
  p.addPassive('engine');p.stats.critChance=0;near(w.rollDamage(100,p),103);near(w.scaledSpec(p).burnDuration,before*1.04);
  p.addWeapon('prism');p.recalcStats();p.stats.critChance=0;near(w.rollDamage(100,p),104.5);
  p.addWeapon('laser');p.addPassive('armor');const laser=p.weapons.find(w=>w.def.id==='laser');
  p.stats.critChance=0;near(laser.rollDamage(100,p),103);near(laser.scaledSpec(p).length,90*1.04);
  near(p.stats.speed,72);near(p.stats.armor,0);
});
test('升级卡实际属性与元素标记一致，通用暴击不伪装火系专属',()=>{
  assert.equal(SF.progression.affinityFor({kind:'passiveNew',ref:'cryo'}).element,'ice');
  assert.equal(SF.progression.affinityFor({kind:'passiveNew',ref:'engine'}).element,'fire');
  assert.equal(SF.progression.affinityFor({kind:'passiveUp',ref:'armor'}).element,'bolt');
  const crit=SF.progression.affinityFor({kind:'passiveNew',ref:'crit'});
  assert.equal(crit.element,'none');assert.equal(crit.recipe.id,'missile');
  const g=fixture('thunder');g.player.addPassive('cooldown');g.player.passives.get('cooldown').level=3;
  g.player.weapons[0].level=6;g.player.weapons[0].recalc();
  assert.equal(SF.progression.affinityFor({kind:'evolve',ref:g.player.weapons[0]}).element,'bolt');
  for(let i=0;i<150;i++)for(const c of SF.progression.rollChoices(g.player))
    assert.ok(!['dawn','satellite','galaxy','shieldDisc','magnet'].includes(c.ref));
});
test('宝箱15、磁铁13、血包13：边界可拾取，边界外不拾取，高速擦边不漏',()=>{
  for(const [kind,radius] of [['chest',15],['magnet',13],['heal',13]]){
    for(const [distance,expected] of [[radius,true],[radius+0.01,false]]){
      const g=fixture();g.player.hp=1;let collected=0;g.openChest=()=>collected++;
      SF.pickups.dropSpecial(distance,0,kind);const item=SF.pickups.list[0];item.vx=item.vy=0;
      SF.pickups.update(0,g);assert.equal(SF.pickups.list.length,expected?0:1);
      if(kind==='chest')assert.equal(collected,expected?1:0);
      if(kind==='heal')near(g.player.hp,expected?26:1);
    }
    const g=fixture();g.openChest=noop;g.player.pickupFrom={x:-30,y:radius-0.1};g.player.x=30;g.player.y=radius-0.1;
    SF.pickups.dropSpecial(0,0,kind);SF.pickups.list[0].vx=SF.pickups.list[0].vy=0;
    SF.pickups.update(0,g);assert.equal(SF.pickups.list.length,0);
  }
});
test('附近多个宝箱逐个选卡，升级面板不会吞掉后续宝箱',()=>{
  const g=fixture();let count=0;g.openChest=()=>{count++;g.state='levelup';};
  for(let i=0;i<3;i++){SF.pickups.dropSpecial(14,0,'chest');const p=SF.pickups.list.at(-1);p.vx=p.vy=0;}
  SF.pickups.update(0,g);assert.equal(count,1);assert.equal(SF.pickups.list.length,2);
  g.state='playing';SF.pickups.update(0,g);assert.equal(count,2);assert.equal(SF.pickups.list.length,1);
});
test('天罚满三层光束保持普通的 2.5 倍时长，每敌只结算一次，余辉不再伤人',()=>{
  for(const burst of [false,true]){
    const g=fixture('thunder'),p=g.player;p.weapons=[];p.addWeapon('tempest');
    const w=p.weapons[0],e=target(g,100,0);w.charges=burst?3:1;
    let hits=0;const take=e.takeDamage.bind(e);e.takeDamage=(...args)=>{hits++;return take(...args);};
    g.mouse={x:SF.renderer.width/2+200,y:SF.renderer.height/2,clicked:true};g.update(STEP);
    assert.equal(w.charges,0);assert.equal(hits,1);near(g.lightning[0].life,burst?0.75:0.3);
    const hp=e.hp,late=target(g,150,0);
    for(let i=1;i<30;i++)g.update(STEP);
    assert.equal(g.lightning.length,burst?1:0);near(e.hp,hp);assert.equal(hits,1);near(late.hp,late.maxHp);
    for(let i=30;i<46;i++)g.update(STEP);
    assert.equal(g.lightning.length,0);near(e.hp,hp);assert.equal(hits,1);near(late.hp,late.maxHp);
    w.charges=3;g.mouse.clicked=true;g.update(STEP);assert.equal(g.lightning.length,1);
    g.reset('thunder','normal');assert.equal(g.lightning.length,0);
  }
});
test('光谱裁决每 tick 仅击中单束路径，旧副束方向不再伤害',()=>{
  const g=fixture('vega'),p=g.player;p.weapons=[];p.addWeapon('spectrum');p.stats.damageMul=1;
  const w=p.weapons[0],e=target(g,100,0),side=target(g,100*Math.cos(0.18),100*Math.sin(0.18));
  let hits=0;const take=e.takeDamage.bind(e);e.takeDamage=(...args)=>{hits++;return take(...args);};
  w.laserAim=0;w.laserSweepT=w.spec.sweepDuration/2;w.laserTick=0;w.update(STEP,g);
  assert.equal(hits,1);near(e.maxHp-e.hp,24);near(side.hp,side.maxHp);
  w.level=4;w.recalc();near(w.spec.damage,37.5);
});
test('定向激光锁定、间歇、重新瞄准，停滞不推进扫射',()=>{
  const g=fixture('thunder'),p=g.player;p.weapons=[];p.addWeapon('laser');const w=p.weapons[0];
  const e=target(g,45,0),back=target(g,-70,0);w.update(STEP,g);near(w.laserAim,0);
  for(let i=0;i<20;i++)w.update(STEP,g);
  assert.ok(e.hp<e.maxHp);assert.equal(back.hp,back.maxHp);
  p.weaponLockT=1;const time=w.laserSweepT;w.update(0.3,g);near(w.laserSweepT,time);p.weaponLockT=0;
  for(let i=0;i<35;i++)w.update(STEP,g);assert.equal(w._laserRender,null);
  e.dead=true;for(let i=0;i<60;i++)w.update(STEP,g);near(Math.abs(w.laserAim),Math.PI);
});
test('霜棱弹完整进化路线：6+3 门槛、宝箱进化、材料追溯、强化保留与卡池去重',()=>{
  const g=fixture(),p=g.player;p.weapons=[];p.addWeapon('mirrorWheel',5);p.addPassive('frostLens');
  const w=p.weapons[0];p.passives.get('frostLens').level=3;p.recalcStats();
  assert.equal(w.canEvolve(p),false);w.levelUp();p.passives.get('frostLens').level=2;
  assert.equal(w.canEvolve(p),false);p.passives.get('frostLens').level=3;p.recalcStats();
  assert.equal(w.canEvolve(p),true);near(w.scaledSpec(p).speed,310*1.15);
  assert.equal(SF.progression.affinityFor({kind:'passiveNew',ref:'frostLens'}).recipe.id,'mirrorWheel');
  assert.equal(SF.progression.affinityFor({kind:'passiveNew',ref:'frostLens'}).element,'ice');
  w.frostEmpowered=true;g.openChest(0,0);
  const evolved=p.weapons[0];assert.equal(evolved.def.id,'frostLance');assert.equal(evolved.level,1);
  assert.equal(p.weapons.length,1);assert.ok(evolved.frostEmpowered);
  near(p.stats.iceDmg,0.09);near(evolved.scaledSpec(p).speed,360*1.225);
  for(let i=0;i<100;i++)for(const c of SF.progression.rollChoices(p)) {
    assert.ok(!(c.kind==='weaponNew'&&['mirrorWheel','frostLance'].includes(c.ref)));
    assert.notEqual(c.kind,'evolve');
  }
  const fire=new SF.WeaponInstance(SF.weapons.blade),bolt=new SF.WeaponInstance(SF.weapons.chain);
  near(fire.scaledSpec(p).speed,fire.spec.speed);near(bolt.scaledSpec(p).speed,bolt.spec.speed);
  p.addWeapon('orb');near(p.weapons[1].scaledSpec(p).radius,p.weapons[1].spec.radius);
  near(p.stats.frostCounterCooldown,20);near(p.stats.phaseInvulnDuration,0.2);
});
test('极寒贯星常态贯穿，每敌一次；防反强化共享三次上限，BOSS 不冻结',()=>{
  for(const empowered of [false,true]){
    const g=fixture(),p=g.player;p.weapons=[];p.addWeapon('frostLance');const w=p.weapons[0];
    const victims=[target(g,100),target(g,110),target(g,120),target(g,110,20)];
    const outside=target(g,110,100),boss=g.enemies.spawnAt('boss',130,0,1000,0);boss.speed=0;
    victims.push(boss);const counts=Array(victims.length).fill(0);
    victims.forEach((e,i)=>{const original=e.takeDamage.bind(e);e.takeDamage=(...args)=>{counts[i]++;return original(...args);};});
    w.frostEmpowered=empowered;assert.equal(w.fire(g),true);assert.equal(w.frostEmpowered,false);
    const shot=SF.projectiles.list[0];SF.projectiles.update(0.5,g);
    assert.equal(SF.projectiles.list.length,1);assert.ok(shot.x>boss.x);
    assert.ok(counts.every(n=>n===(empowered?3:1)),counts.join(','));assert.equal(boss.freezeT,0);
    near(outside.hp,outside.maxHp);const hp=victims.map(e=>e.hp);
    SF.projectiles.update(0.5,g);victims.forEach((e,i)=>near(e.hp,hp[i]));
    SF.projectiles.update(1.3,g);assert.equal(SF.projectiles.list.length,0);
    g.reset('firefly','normal');assert.equal(SF.projectiles.frostBursts.length,0);
  }
});
test('进化冰枪仍能由真实防反准备强化，空场与停滞保留，死亡清理',()=>{
  const g=fixture(),p=g.player;p.addWeapon('frostLance');const w=p.weapons[1];
  const e=target(g);p.activateFrostCounter();p.takeDamage(5,{game:g,attacker:e});
  assert.ok(w.frostEmpowered);g.enemies.list=[];assert.equal(w.fire(g),false);assert.ok(w.frostEmpowered);
  p.weaponLockT=1;w.cdTimer=0;w.update(1,g);assert.ok(w.frostEmpowered);
  p.weaponLockT=0;target(g,100);w.update(STEP,g);assert.equal(w.frostEmpowered,false);
  assert.ok(SF.projectiles.list[0].empowered);w.frostEmpowered=true;p.die();assert.equal(w.frostEmpowered,false);
});
fs.mkdirSync(path.join(__dirname,'../gui-test-screenshots/v2.0'),{recursive:true});
fs.writeFileSync(path.join(__dirname,'../gui-test-screenshots/v2.0/mechanics.json'),JSON.stringify({version:SF.config.VERSION,results},null,2));
console.log(`V2: ${results.length} checks passed`);
