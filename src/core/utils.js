/* ============================================================
 * utils.js — 通用工具：数学 / 随机 / 缓动 / 颜色
 * 全局命名空间：window.SF
 * ============================================================ */
(function () {
  'use strict';

  const SF = (window.SF = window.SF || {});

  // ---------- 数学 ----------
  const TAU = Math.PI * 2;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function dist2(x1, y1, x2, y2) { const dx = x2 - x1, dy = y2 - y1; return dx * dx + dy * dy; }
  function angleTo(x1, y1, x2, y2) { return Math.atan2(y2 - y1, x2 - x1); }

  // ---------- 确定性随机（Mulberry32，用于星域背景） ----------
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashString(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // 运行期便捷随机
  function rand(a = 1, b) { if (b === undefined) { b = a; a = 0; } return a + Math.random() * (b - a); }
  function chance(p) { return Math.random() < p; }

  // ---------- 缓动 ----------
  const ease = {
    outCubic: t => 1 - Math.pow(1 - t, 3),
  };

  // ---------- 颜色 ----------
  // hex '#rrggbb' → {r,g,b}
  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  SF.util = {
    TAU, clamp, lerp, dist2, angleTo,
    mulberry32, hashString, rand, chance,
    ease, hexToRgb,
  };
})();
