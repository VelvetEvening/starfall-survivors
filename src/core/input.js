/* ============================================================
 * input.js — 键盘输入（WASD/方向键 + 交互键）
 * ============================================================ */
(function () {
  'use strict';
  const SF = (window.SF = window.SF || {});

  const held = new Set();
  const pressed = new Set();   // 本帧刚按下，每帧末清空

  const KEYMAP = {
    'KeyW': 'up', 'ArrowUp': 'up',
    'KeyS': 'down', 'ArrowDown': 'down',
    'KeyA': 'left', 'ArrowLeft': 'left',
    'KeyD': 'right', 'ArrowRight': 'right',
    'KeyJ': 'confirm', 'Enter': 'confirm', 'Space': 'skill',
    'KeyK': 'cancel', 'Escape': 'cancel',
    'Tab': 'starmap',
    'KeyP': 'pause',
    'KeyB': 'details', 'KeyU': 'workshop',
    'Digit1': 'slot1', 'Digit2': 'slot2', 'Digit3': 'slot3', 'Digit4': 'slot4',
    'Digit5': 'slot5', 'Digit6': 'slot6', 'Digit7': 'slot7', 'Digit8': 'slot8', 'Digit9': 'slot9',
  };

  function keydown(e) {
    const act = KEYMAP[e.code];
    if (!act) return;
    e.preventDefault();
    if (!held.has(act)) pressed.add(act);
    held.add(act);
  }
  function keyup(e) {
    const act = KEYMAP[e.code];
    if (act) held.delete(act);
  }
  function blur() { held.clear(); pressed.clear(); }

  function attach() {
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    window.addEventListener('blur', blur);
  }

  // 每帧开始后读取
  const input = {
    attach,
    // 空格在面板中仍可确认；战斗只读取独立的 skill，不让 J/Enter 误开技能。
    isHeld: act => held.has(act) || (act === 'confirm' && held.has('skill')),
    isPressed: act => pressed.has(act) || (act === 'confirm' && pressed.has('skill')),
    // 归一化移动向量
    moveVector() {
      let x = 0, y = 0;
      if (held.has('left')) x -= 1;
      if (held.has('right')) x += 1;
      if (held.has('up')) y -= 1;
      if (held.has('down')) y += 1;
      if (x && y) { x *= 0.7071; y *= 0.7071; }
      return { x, y };
    },
    // 帧末调用
    endFrame() { pressed.clear(); },
  };

  SF.input = input;
})();
