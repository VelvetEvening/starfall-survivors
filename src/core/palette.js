/* ============================================================
 * palette.js — 全局调色板（统一视觉的唯一定义处）
 * 深空蓝 / 钛金属 / 冷白仪表；敌方保持红、金、深暗红危险语义。
 * ============================================================ */
(function () {
  'use strict';
  const SF = (window.SF = window.SF || {});

  const PALETTE = {
    // 背景 / 深空
    bg0: '#060b14',
    bg1: '#0b1423',
    bg2: '#142438',
    bg3: '#23394f',

    // 中性
    ink: '#0b0e18',        // 描边深色
    gray: '#3b5063',
    grayLight: '#728a9c',
    silver: '#b0c3d0',
    white: '#edf7fa',
    metalDark: '#152737',
    metal: '#385669',
    metalLight: '#7c9cae',
    metalEdge: '#c5dbe2',

    // 点缀
    starDust: '#ffe9a3',   // 星尘（经验）
    gold: '#eec47b',
    amber: '#e9a55f',
    armor0: '#b9ab8d',     // 重装机体：灰金装甲，不与敌方金弹混用

    // 火系
    fire0: '#ff5c47',
    fire1: '#ff9e4a',
    fire2: '#ffd166',

    // 雷系
    bolt0: '#4fd8ff',
    bolt1: '#7ae0ff',
    bolt2: '#c9f6ff',

    // 冰系
    ice0: '#4f8bff',
    ice1: '#7fb0ff',
    ice2: '#c4dcff',

    // 敌方
    enemy0: '#7352a5',     // 虚空紫
    enemy1: '#b28bdd',     // 冷紫边光
    enemy2: '#ed6989',     // 危机红紫
    voidDark: '#170f29',
    voidMetal: '#423253',
    voidEdge: '#89719c',
    abyssDark: '#220f1c',
    abyssMetal: '#58313e',
    abyssEdge: '#ac626b',
    elite: '#ffd166',
    darkRed: '#b3202f',    // 深暗红：最高危弹幕（BOSS2 高伤弹/被强化精英弹）

    // 玩家 / 友方
    hero0: '#66dfc6',      // 主角青绿
    hero1: '#c1fff0',
    hero2: '#288f85',

    // UI
    uiPanel: '#101e2d',
    uiLine: '#304858',
    uiAccent: '#88acd3',
    uiAccentHi: '#cfdef0',
    uiButton: '#23364f',
    uiButtonHover: '#354f70',
    uiWarn: '#ff5c47',
    uiText: '#d4e3eb',
    uiDim: '#8ca3b5',
    nebulaTeal: '#195a63',
    nebulaBlue: '#25395f',
    nebulaPurple: '#443058',
    planetDark: '#09131f',
    planetMid: '#243e50',
    planetLight: '#507583',
  };

  // 预解析 rgb，供粒子上色用
  const rgbCache = {};
  for (const k in PALETTE) rgbCache[k] = SF.util.hexToRgb(PALETTE[k]);

  // 元素 → 主色映射
  const ELEMENT_COLORS = { fire: 'fire0', bolt: 'bolt0', ice: 'ice0', none: 'silver' };

  SF.palette = {
    colors: PALETTE,
    css(key, alpha) {
      const c = rgbCache[key] || rgbCache.silver;
      return alpha === undefined ? PALETTE[key] || key : `rgba(${c.r},${c.g},${c.b},${alpha})`;
    },
    elementColor(el) { return ELEMENT_COLORS[el] || ELEMENT_COLORS.none; },
  };
})();
