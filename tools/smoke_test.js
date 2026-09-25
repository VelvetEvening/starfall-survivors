/* smoke_test.js — 450 秒步进 + 升级面板 + 专精矩阵开关 + 两位 BOSS 定向场景 */
'use strict';
global.window = global;
global.location = { search: '' };
global.SF = {};
const noop = () => {};
SF.renderer = { cam: { x: 0, y: 0 }, width: 480, height: 270, addShake: noop, toScreen: (x, y) => ({ x, y }), begin: () => ({}) };
SF.particles = new Proxy({}, { get: () => noop });
SF.audio = { sfx: new Proxy({}, { get: () => noop }), playMusic: noop, stopMusic: noop, unlock: noop, setMuted: noop };
SF.font = { drawText: noop, measureCn: () => 10 };
SF.widgets = { toast: noop, panel: noop, bar: noop, button: noop, updateToasts: noop, drawToasts: noop };
SF.sprites = { get: () => ({ width: 8, height: 8 }), glow: () => ({ width: 8, height: 8 }), build: noop };
SF.world = { setSeed: noop, update: noop, draw: noop };
SF.save = { profile: null, recordRun: noop, reset: async () => {} };
SF.canvas = {}; // stub

const load = p => require('../src/' + p);
load('core/utils.js'); load('core/palette.js'); load('core/input.js');
load('data/config.js'); load('data/weapons.js'); load('data/passives.js');
load('data/enemies.js'); load('data/characters.js'); load('growth/constellations.js');
load('sim/projectiles.js'); load('sim/pickups.js'); load('sim/enemies.js');
load('sim/boss.js'); load('sim/weapons.js'); load('sim/spawner.js');
load('growth/player.js');
load('growth/progression.js');
load('ui/levelup.js'); load('ui/starmap.js'); load('ui/hud.js'); load('ui/menus.js');
load('engine/game.js');

const game = new SF.Game();
game.reset('firefly', 'normal');
game.state = 'playing';
game.panel = null;
// 冒烟不为平衡性负责：抬高血压避免中途死亡，专注跑全系统更新路径
game.player.stats.maxHp = 1e9;
game.player.hp = 1e9;

const STEP = 1 / 60;
let errs = 0;
// 强制每 3 秒升一级，驱动升级面板反复开关（含鼠标点击选卡）
let forcedLevels = 0;
for (let i = 0; i < 450 * 60; i++) {
  // 模拟输入：前 10 秒按上方向移动
  if (i < 600) SF.input.isHeld = act => act === 'up';
  else SF.input.isHeld = () => false;
  if (i % 180 === 0 && game.state === 'playing' && forcedLevels < 8) {
    game.gainXp(game.xpNext); // 直接送一级
    forcedLevels++;
  }
  // 升级面板打开时：鼠标移到第二张卡上点击
  if (game.state === 'levelup' && game.panel) {
    const n = game.panel.choices.length;
    const CARD_W = 120, GAP = 14;
    const totalW = n * CARD_W + (n - 1) * GAP;
    game.mouse.x = 240 - totalW / 2 + CARD_W + GAP + 60; // 第二张卡中心
    game.mouse.y = 135;
    if (i % 180 === 30) game.mouse.clicked = true; // 半秒后点击
  } else {
    game.mouse.x = -99; game.mouse.y = -99;
  }
  // 每 20 秒开关一次专精矩阵
  if (i % 1200 === 0 && game.state === 'playing') game.openStarMap();
  if (i % 1200 === 300 && game.state === 'starmap') { game.state = 'playing'; game.panel = null; }
  try {
    if (game.state === 'playing' && !game.player.dead) game.player.hp = game.player.stats.maxHp; // 冒烟不测死亡
    game.update(STEP);
  } catch (e) {
    errs++;
    console.error(`[t=${(i / 60).toFixed(1)}s state=${game.state}]`, e.message);
    if (errs > 5) break;
  }
}
console.log(`450 秒模拟完成：state=${game.state} Lv.${game.level} 击杀 ${game.runStats.kills} BOSS=${game.boss ? (game.boss.dead ? '已击杀' : '存活') : '未出场'} 异常 ${errs}`);

// ---- 定向场景：BOSS1 战斗 15 秒（拨快 runTime 触发出场） ----
const g2 = new SF.Game();
g2.reset('vega', 'normal');
g2.state = 'playing';
g2.player.stats.maxHp = 1e9; g2.player.hp = 1e9;
g2.runTime = SF.config.BOSS_SPAWN_AT[0] - 1;
let bossErr = 0;
for (let i = 0; i < 15 * 60; i++) {
  try {
    if (!g2.player.dead) g2.player.hp = g2.player.stats.maxHp;
    g2.update(STEP);
  } catch (e) { bossErr++; console.error('[boss]', e.message); if (bossErr > 3) break; }
}
const bossOk = !!(g2.boss && !g2.boss.dead);
console.log(`BOSS1 场景：出场=${bossOk} BOSS血量=${g2.boss ? Math.round(g2.boss.hp) : '-'} 召唤精英=${g2.enemies.list.filter(e => e.def.elite && e.def.summoned).length} 异常 ${bossErr}`);

// ---- 定向场景：BOSS2 双阶段 + 深渊强化 30 秒 ----
const g3 = new SF.Game();
g3.reset('thunder', 'normal');
g3.state = 'playing';
g3.player.stats.maxHp = 1e9; g3.player.hp = 1e9;
g3.runTime = SF.config.BOSS_SPAWN_AT[1] - 1;
g3.bossKilledThisRun = 1; // 已杀 BOSS1：精英增伤生效
g3.spawner.bossIdx = 1;  // 导演也要跳过 BOSS1，不能只改击杀统计。
let b2Err = 0;
let sawBoss2 = false, sawStasis = false;
for (let i = 0; i < 30 * 60; i++) {
  try {
    if (!g3.player.dead) g3.player.hp = g3.player.stats.maxHp;
    if (g3.boss && i >= 5 * 60) g3.boss.hp = Math.min(g3.boss.hp, g3.boss.maxHp * 0.49);
    g3.update(STEP);
    sawBoss2 ||= g3.boss?.def.id === 'boss2';
    sawStasis ||= g3.player.weaponLockT > 0;
  } catch (e) { b2Err++; console.error('[boss2]', e.message); if (b2Err > 3) break; }
}
const phase2 = !!g3.boss?._phase2;
console.log(`BOSS2 场景：正确首领=${sawBoss2} 双阶段触发=${phase2} 停滞生效=${sawStasis} 异常 ${b2Err}`);
process.exit(errs || bossErr || b2Err || !bossOk || !sawBoss2 || !phase2 || !sawStasis ? 1 : 0);
