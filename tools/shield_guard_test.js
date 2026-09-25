'use strict';
const assert = require('node:assert/strict');
global.window=global;global.location={search:''};global.SF={};
const noop=()=>{};
SF.renderer={cam:{x:0,y:0},addShake:noop};SF.world={setSeed:noop};
SF.particles=new Proxy({},{get:()=>noop});SF.widgets=new Proxy({},{get:()=>noop});
SF.audio={sfx:new Proxy({},{get:()=>noop})};SF.save={profile:null};
SF.input={isPressed:()=>false,moveVector:()=>({x:0,y:0})};
for(const f of ['core/utils','core/palette','data/config','data/weapons','data/passives','data/characters','data/enemies','growth/constellations','sim/projectiles','sim/pickups','sim/enemies','sim/boss','sim/weapons','sim/spawner','growth/player','growth/progression','engine/game'])require('../src/'+f+'.js');
let count=0;
function test(name,fn){fn();count++;console.log('PASS',name);}
function fixture(id='satellite',char='dawn'){
  const g=SF.game=new SF.Game();g.reset(char,'normal');g.level=10;
  const p=g.player;p.weapons=[new SF.WeaponInstance(SF.weapons[id])];
  p.stats.armor=0;p.stats.shieldArmor=0;p.stats.critChance=0;p.invulnT=0;
  const e=g.enemies.spawnAt('grub',1,0,1000,0);e.speed=0;
  return {g,p,e,hit:(d,type='contact',extra={})=>p.takeDamage(d,{type,game:g,attacker:e,...extra})};
}
test('无盾接触减半，弹幕与无武器角色仍为原伤害',()=>{
  const {p,hit}=fixture();let hp=p.hp;hit(20);assert.equal(hp-p.hp,10);
  p.invulnT=0;hp=p.hp;hit(20,'bullet');assert.equal(hp-p.hp,20);
  p.invulnT=0;p.weapons=[];hp=p.hp;hit(20);assert.equal(hp-p.hp,20);
});
test('8 盾×5×角色 Lv.10=400 固定伤害；不吃暴击火力易伤，小兵击退',()=>{
  const {p,e,hit}=fixture();p.shield=8;p.stats.damageMul=50;p.stats.critChance=1;
  e.vulnT=5;e.iceStacks=3;const hp=e.hp;hit(4);
  assert.equal(hp-e.hp,400);assert.equal(p.shield,6);assert.equal(p.invulnT,0);assert.ok(e.x>1);
});
test('存活盾连续吸伤不进无敌，恰好破盾进入无敌且挡后续伤害',()=>{
  const {p,hit}=fixture();p.shield=8;const hp=p.hp;
  hit(4);hit(4);assert.equal(p.shield,4);assert.equal(p.invulnT,0);
  hit(8);assert.equal(p.shield,0);assert.equal(p.hp,hp);assert.ok(p.invulnT>0);
  hit(100,'bullet');assert.equal(p.hp,hp);
  p.invulnT=0;hit(20);assert.equal(p.hp,hp-10);
});
test('超额接触和弹幕都仅清空现有盾，弹幕不减半也不反伤',()=>{
  for(const type of ['contact','bullet']){
    const {p,e,hit}=fixture();p.shield=3;const hp=p.hp,enemyHp=e.hp;hit(100,type);
    assert.equal(p.hp,hp);assert.equal(p.shield,0);assert.ok(p.invulnT>0);
    assert.equal(enemyHp-e.hp,type==='contact'?150:0);
  }
  const {p,e,hit}=fixture();p.shield=10;const hp=e.hp;hit(4,'bullet');
  assert.equal(p.shield,6);assert.equal(p.invulnT,0);assert.equal(e.hp,hp);
});
test('持续重叠只反击一次，脱离再接触重新按剩余盾计算',()=>{
  const {g,p,e}=fixture();p.shield=10;p.stats.armor=100;
  const hp=e.hp;g.enemies.update(0,g);
  // 首击击退后手动恢复重叠，模拟同次接触。
  e.x=1;g.enemies.update(0,g);assert.equal(hp-e.hp,500);
  e.x=100;g.enemies.update(0,g);e.x=1;p.shield=4;g.enemies.update(0,g);
  assert.equal(hp-e.hp,700);
});
test('Boss 与精英吃固定碰撞伤害，但不会被碰撞被动推开',()=>{
  for(const id of ['boss2','eliteGrub']){
    const {g,p}=fixture();const e=g.enemies.spawnAt(id,1,0,1000,0);p.shield=4;const hp=e.hp;
    p.takeDamage(4,{type:'contact',attacker:e,game:g});assert.equal(hp-e.hp,200);assert.equal(e.x,1);
  }
});
test('进化保留被动，其它机体获得卫星也生效，重复装备不叠乘',()=>{
  for(const id of ['satellite','galaxy']){
    const {p,hit}=fixture(id,'vega');p.weapons.push(new SF.WeaponInstance(SF.weapons[id]));
    const hp=p.hp;hit(20);assert.equal(hp-p.hp,10);
  }
});
test('盾盘出手保留定向表现，强化可辨认，特效到期及新武器清空',()=>{
  const {g,p}=fixture('shieldDisc');const w=p.weapons[0];w.owner=p;
  p.shieldDiscEmpowered=true;assert.ok(w.fire(g));assert.ok(w.shieldSwing.empowered);
  assert.equal(w.shieldSwing.range,w.spec.range);assert.equal(w.spec.knockback,0);
  w.cdTimer=10;w.update(0.5,g);assert.equal(w.shieldSwing,null);
  assert.equal(new SF.WeaponInstance(SF.weapons.shieldDisc).shieldSwing,null);
});
test('常规出怪从 2/秒平滑增至旧终盘期望频率，曲线不跳变、不越界',()=>{
  const {g}=fixture();const sp=g.spawner;
  assert.equal(sp.spawnRate(0),2);assert.equal(sp.spawnRate(480),1.3/0.28);
  let last=sp.spawnRate(0);
  for(let t=1;t<=480;t++){const rate=sp.spawnRate(t);assert.ok(rate>=last&&rate-last<0.01);last=rate;}
  assert.equal(sp.spawnRate(-1),2);assert.equal(sp.spawnRate(999),1.3/0.28);
  const rows=Array.from({length:9},(_,m)=>({minute:m,perSecond:+sp.spawnRate(m*60).toFixed(3)}));
  console.table(rows);
});
test('60Hz 实际出怪长期频率符合曲线端点，Boss 在场不推进常规计时',()=>{
  for(const t of [0,480]){
    const {g}=fixture();const sp=g.spawner;g.runTime=t;sp.bossIdx=2;sp.eliteQueue=[];
    let spawned=0;sp.spawnOne=()=>spawned++;sp.spawnBurst=()=>{};
    for(let f=0;f<60*60;f++)sp.update(1/60);
    assert.ok(Math.abs(spawned-(60-1.2)*sp.spawnRate(t))<2);
    const timer=sp.spawnTimer;g.boss={dead:false};sp.update(1);assert.equal(sp.spawnTimer,timer);
  }
});
console.log('SHIELD / SPAWN:',count,'checks passed');
