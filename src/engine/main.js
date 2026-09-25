/* ============================================================
 * main.js — 引擎入口：初始化 + 主循环
 * ============================================================ */
(function () {
  'use strict';
  const SF = (window.SF = window.SF || {});

  SF.boot = async function (canvas) {
    // ---- 初始化子系统 ----
    SF.renderer.init(canvas);
    await SF.assets.load();
    SF.particles.init();
    SF.input.attach();
    SF.sprites.build();
    SF.world.setSeed(SF.waveSeed());
    SF.audio.unlock(); // 尽早尝试；真正解锁在首次交互

    // 任意首次交互解锁音频
    const unlockOnce = () => {
      SF.audio.unlock();
      window.removeEventListener('keydown', unlockOnce);
      window.removeEventListener('mousedown', unlockOnce);
    };
    window.addEventListener('keydown', unlockOnce);
    window.addEventListener('mousedown', unlockOnce);

    // 静音快捷键
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM') SF.audio.setMuted(!SF.audio.muted);
    });

    // ---- 存档载入后进入主菜单 ----
    SF.save.init().then(() => {
      game.openMenu();
    });

    // ---- 游戏实例 ----
    const game = new SF.Game();
    SF.game = game; // 调试入口

    // ---- 鼠标（菜单/专精矩阵/超电磁炮用，虚拟坐标换算） ----
    // clicked 由 game.update 逻辑步消费后清除，避免高刷屏渲染帧空转时丢点击
    const toVirtual = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) * SF.renderer.width / r.width,
        y: (e.clientY - r.top) * SF.renderer.height / r.height };
    };
    canvas.addEventListener('mousemove', (e) => {
      const v = toVirtual(e);
      game.mouse.x = v.x;
      game.mouse.y = v.y;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      const v = toVirtual(e);
      game.mouse.x = v.x;
      game.mouse.y = v.y;
      game.mouse.clicked = true;
    });

    // ---- 主循环 ----
    let last = performance.now();
    let acc = 0;
    const STEP = 1 / 60;   // 固定步长，保证数值稳定
    const MAX_FRAME = 0.1; // 防切页回来暴走

    function frame(now) {
      const dt = Math.min(MAX_FRAME, (now - last) / 1000);
      last = now;

      // 固定步长更新（可拆多步）；异常不终止主循环——任何 UI bug 都不能永久卡死游戏
      acc += dt;
      let steps = 0;
      try {
        while (acc >= STEP && steps < 4) {
          game.update(STEP);
          acc -= STEP;
          steps++;
        }
      } catch (e) { console.error('[update]', e); acc = 0; }
      if (steps === 4) acc = 0;

      // 渲染
      try {
        const ctx = SF.renderer.begin(dt);
        game.draw(ctx);
        SF.renderer.end();
      } catch (e) { console.error('[draw]', e); }

      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    console.log('%c★ 星穹幸存者 Starfall Survivors 已启动', 'color:#5df2c8;font-weight:bold');
    console.log('调试入口: SF.game / SF.player / SF.save');
  };
})();
