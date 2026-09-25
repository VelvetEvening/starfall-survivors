/* Character mechanics integration: actual weapons, hits, status pipeline and evolution.
 * No rendering dependencies. Run: node tools/character_test.js
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
global.window = global;
global.location = { search: '' };
global.SF = {};
const noop = () => {};
let sounds = {};
SF.renderer = { cam: { x: 0, y: 0 }, width: 480, height: 270, addShake: noop, toScreen: (x,y) => ({x,y}) };
SF.particles = new Proxy({}, { get: () => noop });
SF.audio = { sfx: new Proxy({}, { get: (_, key) => () => { sounds[key] = (sounds[key] || 0) + 1; } }),
  playMusic: noop, stopMusic: noop, setBossPhase: noop };
SF.font = { drawText: noop, measureCn: () => 10 };
SF.widgets = new Proxy({}, { get: () => noop });
SF.world = { setSeed: noop, update: noop };
SF.input = { moveVector: () => ({x:0,y:0}), isPressed: () => false, isHeld: () => false, endFrame: noop };
SF.save = { profile: null };
for (const file of ['core/utils', 'core/palette', 'data/config', 'data/weapons', 'data/passives', 'data/enemies',
  'data/characters', 'growth/constellations', 'sim/projectiles', 'sim/pickups', 'sim/enemies', 'sim/boss',
  'sim/weapons', 'sim/spawner', 'growth/player', 'growth/progression', 'ui/hud', 'engine/game']) require('../src/' + file + '.js');
let seed = 6754321;
Math.random = () => { seed = (Math.imul(seed,1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const STEP = 1/60, results = [], measurements = [], scenarios = [];
function test(name, run) {
  try { run(); results.push({name,pass:true}); console.log('PASS',name); }
  catch (error) { results.push({name,pass:false,error:error.stack}); console.error('FAIL',name,error); process.exitCode = 1; }
}
function near(actual, expected, message = '') { assert.ok(Math.abs(actual-expected)<1e-6, `${message}: ${actual} != ${expected}`); }
function fixture(char='vega', weapon=null, level=1, workshop=false) {
  SF.save.profile = { charUpgrades: { [char]: workshop ? {hp:5,speed:5,dmg:5,weapon:5} : {} } };
  const g = SF.game = new SF.Game(); g.reset(char,'normal'); g.state='playing';
  g.player.stats.critChance=0; sounds={};
  if(weapon) g.player.weapons=[new SF.WeaponInstance(SF.weapons[weapon],level)];
  for(const w of g.player.weapons) w.owner=g.player;
  g.spawner.update=noop;
  return g;
}
function target(g,x=80,y=0,kind='grub') {
  const e=SF.enemies[kind].boss?g.enemies.spawnBoss(g,kind):g.enemies.spawnAt(kind,x,y,1,0);
  e.x=x; e.y=y; e.hp=e.maxHp=1e7; e.speed=0; e.attackCd=1e6;
  return e;
}
function flight(g,seconds=0.8) {
  for(let i=0;i<Math.ceil(seconds/STEP);i++) { g.time+=STEP; SF.projectiles.update(STEP,g); }
}
function volley(g) {
  SF.projectiles.clear(); assert.ok(g.player.weapons[0].fire(g)); flight(g);
}
function click(g,charges,progress=0) {
  const w=g.player.weapons[0]; w.charges=charges; w.chargeT=progress*w.chargeDuration(g.player);
  g.mouse={x:340,y:135,clicked:true}; w.update(0,g); g._endInput();
}

function eligibleVolley(g) { g.player.heatGateT=0; volley(g); }

test('焰锋：空场与非火系不计热',()=>{
  const g=fixture(),pl=g.player;
  assert.equal(pl.weapons[0].fire(g),false);assert.equal(pl.heat,0);
  const e=target(g);e.takeDamage(20,g,'bolt0');e.takeDamage(20,g,'ice0');assert.equal(pl.heat,0);
});
for(const id of ['blade','prism','missile','nuke']) test(id+'：多弹、多敌、穿透共用一轮计热',()=>{
  const g=fixture('vega',id,SF.weapons[id].levels.length+1);
  for(let i=0;i<12;i++)target(g,65+i*8,(i%3-1)*8);
  eligibleVolley(g);assert.equal(g.player.heat,1);assert.equal(sounds.fireOverdrive||0,0);
});
test('焰锋：15 格储存不自动释放，空格技能不附赠爆炸伤害',()=>{
  const g=fixture(),pl=g.player,e=target(g),side=target(g,80,36);
  for(let i=0;i<15;i++)eligibleVolley(g);
  assert.equal(pl.heat,15);near(e.maxHp-e.hp,14*15);near(side.maxHp-side.hp,0);
  assert.equal(sounds.heatReady,1);assert.equal(sounds.fireOverdrive||0,0);
  volley(g);near(e.maxHp-e.hp,14*16);assert.equal(pl.heat,15);
  assert.ok(pl.activateFireOverdrive());assert.equal(pl.heat,0);assert.equal(pl.fireOverdriveT,15);
  assert.equal(sounds.fireOverdrive,1);assert.equal(pl.activateFireOverdrive(),false);
  near(e.maxHp-e.hp,14*16);near(side.maxHp-side.hp,0);
});
test('焰锋：灼烧、蔓延、火海不回填热量',()=>{
  const g=fixture(),pl=g.player,e=target(g,0,0);pl.heat=4;pl.stats.resonance.fire=true;
  e.applyBurn(10,8);e.update(0.4,g);
  SF.projectiles.addFireField(0,0,100,12);SF.projectiles.updateFields(0.25,g);
  SF.projectiles.explode(0,0,100,10,0,g,'fire1');
  assert.equal(pl.heat,4);assert.equal(sounds.fireOverdrive||0,0);
});
test('焰锋：共享 2 秒间隔，被挡齐射后续接触不能补计热',()=>{
  const g=fixture(),pl=g.player;pl.weapons=[];pl.heatGateT=0;
  pl.onFireHit({});assert.equal(pl.heat,1);
  const blocked={};pl.onFireHit(blocked);assert.equal(pl.heat,1);
  pl.update(1.99,g);pl.onFireHit({});assert.equal(pl.heat,1);
  pl.update(0.02,g);pl.onFireHit(blocked);assert.equal(pl.heat,1);
  pl.onFireHit({});assert.equal(pl.heat,2);
});
test('焰锋：致死命中计热，死敌和零伤害不计热',()=>{
  const g=fixture(),e=target(g);e.hp=1;eligibleVolley(g);assert.ok(e.dead);assert.equal(g.player.heat,1);
  e.takeDamage(10,g,'fire0',{fireAttack:{}});
  target(g,100).takeDamage(0,g,'fire0',{fireAttack:{}});assert.equal(g.player.heat,1);
});
test('焰锋：停滞保留储备与技能时间，超载弹不回填热量',()=>{
  const g=fixture(),pl=g.player;target(g);pl.heat=15;
  pl.weapons[0].fire(g);pl.weaponLockT=3;flight(g);
  assert.equal(pl.heat,15);assert.equal(pl.activateFireOverdrive(),false);
  pl.weaponLockT=0;assert.ok(pl.activateFireOverdrive());volley(g);assert.equal(pl.heat,0);
  pl.weaponLockT=3;pl.update(1,g);assert.equal(pl.fireOverdriveT,15);assert.equal(pl.heatGateT,2);
  pl.weaponLockT=0;pl.setFireOverdrive(0);pl.heatGateT=0;
  pl.onFireHit({heatEligible:false});assert.equal(pl.heat,0);
});
test('焰锋：多火武不能绕过间隔，满热命中不自动消费',()=>{
  const g=fixture('vega','prism',4),pl=g.player;target(g,60);target(g,84);target(g,108);
  pl.heat=14;eligibleVolley(g);assert.equal(pl.heat,15);
  pl.addWeapon('missile');pl.weapons[1].fire(g);flight(g);
  assert.equal(pl.heat,15);assert.equal(sounds.fireOverdrive||0,0);
});

test('飞刃：首碰耗尽时消失，Lv.5 的额外穿透仍能命中下一个目标',()=>{
  for(const level of [1,5]) {
    const g=fixture('vega','blade',level),e=target(g,50),next=target(g,150);
    volley(g);
    assert.ok(e.hp<e.maxHp); assert.equal(next.hp<next.maxHp,level===5);
    assert.equal(SF.projectiles.list.length,0);
  }
});
for(const [id,level] of [['chain',1],['chain',6],['tempest',1],['tempest',4]]) {
  test(`磁暴 ${id} Lv.${level}：未满仓一发 ×0.85，满仓单炮 ×3.3，严格消费存弹`,()=>{
    const g=fixture('thunder',id,level),pl=g.player,w=pl.weapons[0],e=target(g);
    const base=w.spec.damage*pl.stats.damageMul;
    click(g,2,0.4);
    assert.equal(w.charges,1); near(w.chargeT/w.chargeDuration(pl),0.4);
    if(!w.spec.beam) { assert.equal(SF.projectiles.list.length,1); flight(g); }
    near(e.maxHp-e.hp,base*0.85);
    e.hp=e.maxHp; SF.projectiles.clear(); g.lightning=[];
    click(g,3);
    assert.equal(w.charges,0); assert.equal(w.chargeT,0);
    if(w.spec.beam) assert.equal(g.lightning.length,1);
    else { assert.equal(SF.projectiles.list.length,1); assert.ok(SF.projectiles.list[0].empowered); flight(g); }
    near(e.maxHp-e.hp,base*3.3);
    assert.equal(sounds.railBurst,1);
    w.update(0,g); assert.equal(w.charges,0); assert.equal(sounds.railBurst,1);
    measurements.push({weapon:id,level,ordinary:base*0.85,full:base*3.3,oldThree:base*3,ratio:1.1});
  });
}
test('磁暴：同一步充满第三发再点击，立即打出聚能炮',()=>{
  const g=fixture('thunder'),w=g.player.weapons[0]; target(g);
  w.charges=2; w.chargeT=w.chargeDuration()-STEP/2;
  g.mouse={x:340,y:135,clicked:true}; w.update(STEP,g);
  assert.equal(w.charges,0); assert.ok(SF.projectiles.list[0].empowered);
  assert.equal(sounds.capacitorReady,1); assert.equal(sounds.railBurst,1);
});
test('磁暴：满仓停止充能，空仓点击无效果，停滞的点击不会延迟偷发',()=>{
  const g=fixture('thunder'),pl=g.player,w=pl.weapons[0]; target(g);
  click(g,0); assert.equal(SF.projectiles.list.length,0);
  w.charges=3; pl.weaponLockT=2; g.mouse.clicked=true; w.update(1,g); g._endInput();
  assert.equal(w.charges,3); assert.equal(w.chargeT,0); assert.equal(SF.projectiles.list.length,0);
  pl.weaponLockT=0; w.update(30,g); assert.equal(w.charges,3); assert.equal(w.chargeT,0);
  assert.ok(SF.hud.characterStatus(pl).detail.includes('点击'));
  g.mouse.clicked=true; w.update(0,g); assert.equal(w.charges,0);
});
test('电磁贯穿：扫过线段含敌人体积，高速不漏敌，重叠大目标只结算一次',()=>{
  const g=fixture('thunder'),w=g.player.weapons[0];
  const far=target(g,160),nearby=target(g,40),boss=target(g,100,25,'boss');
  const miss=target(g,100,80),behind=target(g,-80);
  click(g,3); SF.projectiles.update(0.5,g); SF.projectiles.update(0.1,g);
  for(const e of [far,nearby,boss]) near(e.maxHp-e.hp,w.spec.damage*1.2*3.3);
  near(miss.maxHp-miss.hp,0); near(behind.maxHp-behind.hp,0);
  assert.equal(SF.projectiles.list[0].hitSet.size,3);
});
test('其它机体的电磁炮伤害不受磁暴专属倍率影响',()=>{
  for(const char of ['vega','firefly','dawn']) for(const weapon of ['chain','tempest']) {
    const g=fixture(char,weapon),pl=g.player,w=pl.weapons[0],e=target(g);
    click(g,1); if(!w.spec.beam) flight(g);
    near(e.maxHp-e.hp,w.spec.damage*pl.stats.damageMul);
    assert.equal(sounds.railBurst||0,0); assert.equal(pl.heat,0);
  }
});
test('磁暴：零/满工坊下两形态逐级伤害与爆发 DPS 不倒退',()=>{
  for(const workshop of [false,true]) {
    let previous=0;
    for(const id of ['chain','tempest']) for(let level=1;level<=SF.weapons[id].levels.length+1;level++) {
      const g=fixture('thunder',id,level,workshop),w=g.player.weapons[0],e=target(g);
      click(g,3); if(!w.spec.beam) flight(g);
      const dps=(e.maxHp-e.hp)/(3*w.chargeDuration());
      assert.ok(dps>=previous-1e-6); previous=dps;
    }
  }
});
test('电磁炮进化：保存两发与蓄力比例，使用进化后芯片加速；满仓仍可聚能',()=>{
  for(const charges of [2,3]) {
    const g=fixture('thunder','chain',6),pl=g.player,w=pl.weapons[0];
    pl.passives.set('cooldown',{level:3}); pl.recalcStats();
    w.charges=charges; w.chargeT=charges===2?w.chargeDuration(pl)*0.6:0;
    const save=JSON.stringify(SF.save.profile);
    SF.progression.applyChoice(pl,g,{kind:'evolve',ref:w});
    const next=pl.weapons[0];
    assert.equal(next.def.id,'tempest'); assert.equal(next.charges,charges);
    near(next.chargeDuration(pl),6*0.8*(1-0.135));
    near(next.chargeT/next.chargeDuration(pl),charges===2?0.6:0);
    assert.equal(next.railgunBurstReady,charges===3); assert.equal(JSON.stringify(SF.save.profile),save);
  }
});
test('铁壁：只计实际盾伤，震荡与强化盾击独立，释放声不混入受伤声',()=>{
  const g=fixture('dawn'),pl=g.player,e=target(g,50); pl.addWeapon('shieldDisc');
  pl.shield=10; pl.takeDamage(2,{game:g}); assert.equal(pl.armorShockCharge,0);
  pl.takeDamage(12,{game:g}); assert.equal(pl.armorShockCharge,10); assert.ok(pl.shieldDiscEmpowered);
  pl.invulnT=0; pl.shield=2; pl.takeDamage(4,{game:g});
  near(e.maxHp-e.hp,28*1.2); assert.equal(pl.armorShockCharge,0); assert.ok(pl.shieldDiscEmpowered);
  assert.equal(sounds.armorShock,1); assert.equal(sounds.playerHurt||0,0);
  assert.equal(SF.hud.characterStatus(pl).value,'震荡释放');
});
test('铁壁：冷却内计能封顶，单纯冷却结束不自动偷发，下一次实吸盾伤才释放',()=>{
  const g=fixture('dawn'),pl=g.player; target(g,50);
  pl.armorShockCd=0.5; pl.shield=10; pl.takeDamage(12,{game:g}); pl.invulnT=0; pl.shield=10; pl.takeDamage(12,{game:g});
  assert.equal(pl.armorShockCharge,12); pl.weapons=[]; pl.update(0.6,g);
  assert.equal(sounds.armorShock||0,0); assert.ok(SF.hud.characterStatus(pl).detail.includes('下次盾伤'));
  pl.invulnT=0; pl.shield=1; pl.takeDamage(3,{game:g}); assert.equal(sounds.armorShock,1);
  pl.invulnT=0; pl.shield=0; pl.takeDamage(3,{game:g}); assert.equal(pl.armorShockCharge,0);
});
test('霜翎：每窗一次反制，HUD 显示成功及一发穿透储备，停滞保留储备',()=>{
  const g=fixture('firefly'),pl=g.player,e=target(g,40); pl.addWeapon('mirrorWheel');
  pl.phaseInvulnT=0.5; pl.takeDamage(10,{game:g,attacker:e}); pl.takeDamage(10,{game:g,attacker:e});
  const w=pl.weapons[1]; assert.ok(w.frostEmpowered); assert.equal(SF.projectiles.iceFields.length,1);
  assert.equal(SF.hud.characterStatus(pl).value,'防反成功'); assert.ok(SF.hud.characterStatus(pl).detail.includes('穿透'));
  pl.weaponLockT=2; w.update(1,g); assert.ok(w.frostEmpowered);
  pl.weaponLockT=0; w.fire(g); assert.ok(!w.frostEmpowered); assert.ok(SF.projectiles.list[0].empowered);
  assert.equal(sounds.iceRetaliate,1);
});
test('霜翎：密集敌群每个接触目标只爆一次，旁侧波及不递归，伤害有明确上界',()=>{
  const g=fixture('firefly','mirrorWheel',6),pl=g.player,w=pl.weapons[0];
  const enemies=Array.from({length:12},(_,i)=>target(g,30+i*18));
  const side=target(g,100,32); w.frostEmpowered=true; w.fire(g); SF.projectiles.update(1,g);
  assert.equal(SF.projectiles.list[0].hitSet.size,12); assert.equal(SF.projectiles.frostBursts.length,12);
  for(const e of [...enemies,side]) assert.ok(e.maxHp-e.hp<=3*w.spec.damage*0.9*1.2*1.1**3+1e-6);
  assert.ok(side.hp<side.maxHp); assert.equal(side.iceStacks,3);
  SF.projectiles.update(0,g); assert.equal(SF.projectiles.frostBursts.length,12);
});
test('霜翎：强化冰弹对两位 Boss 不冻结，抗冰灼烧仍减伤和免疫冰蚀',()=>{
  for(const kind of ['boss','boss2']) {
    const g=fixture('firefly','mirrorWheel',6),w=g.player.weapons[0],e=target(g,80,0,kind);
    w.frostEmpowered=true; w.fire(g); flight(g);
    assert.equal(e.freezeT,0); assert.equal(e.iceStacks,1);
    e.speed=e.def.speed;
    const fromX=e.x; SF.bossAI.updateBoss(e,STEP,g);
    near((fromX-e.x)/(e.speed*STEP),1-(1-e.slowFactor)*SF.config.BOSS_SLOW_EFFECT);
    const h=e.hp; e.applyBurn(4,8,{iceGuard:true}); w.frostEmpowered=true; w.fire(g); flight(g);
    near(h-e.hp,w.spec.damage*0.9*0.5); assert.equal(e.iceStacks,0); assert.equal(e.slowT,0);
  }
});
test('四机体：暂停冻结资源，死亡/重开清空储备，角色和存档 ID 保持不变',()=>{
  for(const char of ['vega','firefly','thunder','dawn']) {
    const g=fixture(char,null,1,true),pl=g.player;
    pl.heat=15; pl.fireOverdriveT=3; pl.armorShockCharge=10; pl.shieldDiscEmpowered=true;
    pl.weapons[0].charges=3; pl.weapons[0].frostEmpowered=true; pl.weapons[0].chargeT=1;
    g.state='pause'; for(let i=0;i<120;i++)g.update(STEP);
    assert.equal(pl.heat,15); assert.equal(pl.fireOverdriveT,3); assert.equal(pl.weapons[0].chargeT,1);
    pl.die(); assert.equal(pl.heat,0); assert.equal(pl.fireOverdriveT,0); assert.equal(pl.armorShockCharge,0);
    assert.equal(pl.weapons[0].charges,0); assert.equal(pl.weapons[0].frostEmpowered,false);
    g.reset(char,'normal'); assert.equal(g.player.char.id,char); assert.equal(g.player.weapons[0].level,6);
    assert.equal(g.player.heat,0); assert.equal(g.player.armorShockCharge,0);
    assert.equal(SF.projectiles.list.length,0); assert.equal(SF.projectiles.frostBursts.length,0);
  }
});

test('四机体 × 零/满工坊 × 敌潮/双 Boss：24 场 90 秒战斗压力回归',()=>{
  for(const char of ['vega','firefly','thunder','dawn']) for(const workshop of [false,true]) {
    for(const encounter of ['crowd','boss','boss2']) {
      const g=fixture(char,null,1,workshop),pl=g.player;
      const originalHp=pl.stats.maxHp;
      // 固定成型装备 + 生命保护，用于更新链与频率压力检查，不推算真人生存率。
      pl.weapons[0].level=6;pl.weapons[0].recalc();
      const partner={vega:'missile',firefly:'mirrorWheel',thunder:'laser',dawn:'shieldDisc'}[char];
      pl.addWeapon(partner,6);
      const nodes=Object.values(SF.constellations).filter(n=>n.con===pl.char.homeTree);
      for(const n of nodes.slice(0,encounter==='boss2'?6:3))pl.litStars.add(n.id);
      pl.recalcStats();pl.stats.critChance=0;
      pl.stats.maxHp=pl.hp=1e7;
      g.openLevelUp=()=>{g.pendingLevelUps=0;};
      g.runTime=encounter==='crowd'?120:encounter==='boss'?240:480;
      g.spawner.bossIdx=encounter==='boss2'?2:1;
      let boss=null,forcedPhase=false;
      if(encounter==='crowd') {
        delete g.spawner.update;
        for(let i=0;i<20;i++)g.enemies.spawnAt(i%3?'grub':'crab',Math.cos(i)*95,Math.sin(i)*95,g.mobHpMul,0);
      } else {
        boss=g.enemies.spawnBoss(g,encounter);boss.x=80;boss.y=0;
      }
      let duration=0,peakEnemies=0,peakShots=0,hpDamage=0,firstBurst=null;
      const startHp=pl.hp;
      SF.input.isPressed=act=>act==='skill'&&pl.heat>=SF.config.VEGA_HEAT.threshold;
      for(let frame=0;frame<90*60;frame++) {
        const time=frame*STEP;
        // 绕目标飞行，遇近弹略向外避让；固定输入足以覆盖移动、瞄准与受击路径。
        const anchor=boss&&!boss.dead?boss:{x:0,y:0};
        const angle=Math.atan2(pl.y-anchor.y,pl.x-anchor.x);
        const preferred=char==='dawn'?42:char==='firefly'?70:100;
        const distance=Math.hypot(pl.x-anchor.x,pl.y-anchor.y);
        const radial=(preferred-distance)*0.05;
        let mx=-Math.sin(angle)+Math.cos(angle)*radial,my=Math.cos(angle)+Math.sin(angle)*radial;
        for(const b of SF.projectiles.enemyList) {
          const dx=pl.x-b.x,dy=pl.y-b.y,d=Math.hypot(dx,dy);
          if(d>0&&d<30){mx+=dx/d*(30-d)*0.2;my+=dy/d*(30-d)*0.2;}
        }
        const length=Math.hypot(mx,my)||1;
        SF.input.moveVector=()=>({x:mx/length,y:my/length});
        const aim=boss&&!boss.dead?boss:g.enemies.nearest(pl.x,pl.y,Infinity);
        g.mouse.x=aim?aim.x-SF.renderer.cam.x+240:360;
        g.mouse.y=aim?aim.y-SF.renderer.cam.y+135:135;
        g.mouse.clicked=pl.weapons.some(w=>w.spec.charge&&w.charges>=pl.stats.railgunStorage);
        // 覆盖 Boss II 的首次 10 秒停滞；此处降低血线不计入伤害统计。
        if(encounter==='boss2'&&!forcedPhase&&time>=30){boss.hp=Math.min(boss.hp,boss.maxHp*0.49);forcedPhase=true;}
        g.update(STEP);duration=(frame+1)*STEP;
        peakEnemies=Math.max(peakEnemies,g.enemies.list.length);
        peakShots=Math.max(peakShots,SF.projectiles.list.length);
        if(firstBurst===null&&(sounds.fireOverdrive||sounds.railBurst||sounds.armorShock||sounds.iceRetaliate))firstBurst=duration;
        assert.ok(Number.isFinite(pl.x)&&Number.isFinite(pl.hp)&&Number.isFinite(g.runStats.damage));
        assert.ok(pl.heat<=SF.config.VEGA_HEAT.threshold&&pl.armorShockCharge<=SF.config.ARMOR_SHOCK.threshold);
        for(const w of pl.weapons)assert.ok(w.charges>=0&&w.charges<=pl.stats.railgunStorage);
        if(boss?.dead)break;
      }
      hpDamage=startHp-pl.hp;
      const counters={fireOverdrives:sounds.fireOverdrive||0,railBursts:sounds.railBurst||0,
        armorShocks:sounds.armorShock||0,iceCounters:sounds.iceRetaliate||0};
      scenarios.push({char,workshop,encounter,duration,baseMaxHp:originalHp,hpProtected:true,hpDamage,
        damage:g.runStats.damage,kills:g.runStats.kills,firstBurst,peakEnemies,peakShots,
        bossHp:boss?boss.hp:null,bossKilled:boss?boss.dead:null,forcedSecondPhase:forcedPhase,...counters});
      assert.ok(g.runStats.damage>0&&duration>0);
      if(char==='vega')assert.ok(counters.fireOverdrives>0||pl.heat>0);
      if(char==='thunder')assert.ok(counters.railBursts>0);
      if(encounter==='boss2')assert.ok(forcedPhase||boss.dead);
      console.log('SCENARIO',char,workshop?'full':'zero',encounter,Math.round(g.runStats.damage),JSON.stringify(counters));
    }
  }
  SF.input.moveVector=()=>({x:0,y:0});
  SF.input.isPressed=()=>false;
});

const out=path.join(__dirname,'..','gui-test-screenshots','characters');
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'logic-audit.json'),JSON.stringify({results,measurements,scenarios},null,2));
console.log(`CHARACTER TESTS: ${results.filter(r=>r.pass).length}/${results.length} passed`);
