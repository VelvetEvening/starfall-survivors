/* world.js — 缓存星云、行星材质、四层视差；随机仅用本地 seed，不干扰战斗 RNG。 */
(function () {
  'use strict';
  const SF = (window.SF = window.SF || {});
  const { TAU, mulberry32 } = SF.util;
  let seed = 1, time = 0, layers = [], sky = null, planet = null;
  const TILE_W = 720, TILE_H = 405;
  const mod = (v, size) => ((v % size) + size) % size;

  function makeSky(rng) {
    const cv = document.createElement('canvas');
    cv.width = 960; cv.height = 540;
    const c = cv.getContext('2d');
    c.scale(2, 2);
    c.fillStyle = SF.palette.css('bg0');
    c.fillRect(0, 0, 480, 270);
    // 多尺度云团叠成斜向尘埃带，留出中央战斗区的明暗对比。
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 110; i++) {
      const x = rng() * 560 - 40;
      const y = 220 - x * 0.34 + (rng() - 0.5) * 150;
      const radius = 18 + rng() * 90;
      const col = i % 3 === 0 ? 'nebulaPurple' : i % 3 === 1 ? 'nebulaTeal' : 'nebulaBlue';
      const gradient = c.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, SF.palette.css(col, 0.03 + rng() * 0.04));
      gradient.addColorStop(0.5, SF.palette.css(col, 0.015));
      gradient.addColorStop(1, SF.palette.css(col, 0));
      c.fillStyle = gradient;
      c.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    c.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 2600; i++) {
      const x = rng() * 480, y = rng() * 270;
      c.fillStyle = SF.palette.css(i % 2 ? 'silver' : 'bg0', rng() * 0.035);
      c.fillRect(x, y, 0.35 + rng() * 0.6, 0.35);
    }
    return cv;
  }

  function setSeed(value) {
    seed = value >>> 0;
    time = 0;
    const rng = mulberry32(seed);
    sky = makeSky(rng);
    planet = SF.assets.get('planet');
    layers = [
      { par: 0.06, pts: [] }, { par: 0.16, pts: [] },
      { par: 0.34, pts: [] }, { par: 0.65, pts: [] },
    ];
    layers.forEach((layer, index) => {
      const count = [180, 85, 42, 18][index];
      for (let i = 0; i < count; i++) layer.pts.push({
        x: rng() * TILE_W, y: rng() * TILE_H,
        r: 0.2 + rng() * (index === 3 ? 0.7 : 0.4),
        a: 0.18 + rng() * 0.6, phase: rng() * TAU,
        color: rng() < 0.2 ? 'starDust' : rng() < 0.5 ? 'silver' : 'bolt2',
      });
    });
  }

  function update(dt) { time += dt; }

  function drawPlanet(ctx, x, y, radius, alpha = 1) {
    if (!planet) return;
    ctx.save(); ctx.globalAlpha *= alpha;
    SF.renderer.glowScreen(x - radius * 0.5, y - radius * 0.4, radius * 1.8, 'nebulaTeal', 0.28);
    ctx.drawImage(planet, x - radius, y - radius, radius * 2, radius * 2);
    ctx.restore();
  }

  function draw(ctx, camX, camY) {
    if (!sky) return;
    const R = SF.renderer, pal = SF.palette;
    // 云层低频漂移，纹理比视口宽，平移不会露边。
    const dx = Math.sin(camX * 0.0009 + time * 0.012) * 10;
    const dy = Math.sin(camY * 0.0009 + time * 0.008) * 5;
    ctx.drawImage(sky, -24 + dx, -14 + dy, 528, 298);
    const inMenu = ['boot', 'menu', 'charSelect', 'workshop'].includes(SF.game?.state);
    if (!inMenu) drawPlanet(ctx, 409 - Math.sin(camX * 0.0007) * 18, 204 - Math.sin(camY * 0.0007) * 10, 92, 0.24);
    for (const layer of layers) {
      for (const pt of layer.pts) {
        const pos = R.toScreen(pt.x + camX * (1 - layer.par), pt.y + camY * (1 - layer.par));
        const x = mod(pos.x + 3, TILE_W) - 3;
        const y = mod(pos.y + 3, TILE_H) - 3;
        if (x > 483 || y > 273) continue;
        const twinkle = 0.78 + 0.22 * Math.sin(time * 0.9 + pt.phase);
        ctx.fillStyle = pal.css(pt.color, pt.a * twinkle);
        ctx.fillRect(x, y, pt.r, pt.r);
        if (pt.r > 0.68) {
          ctx.fillStyle = pal.css(pt.color, pt.a * 0.18 * twinkle);
          ctx.fillRect(x - 1.5, y + pt.r / 2 - 0.15, 3 + pt.r, 0.3);
          ctx.fillRect(x + pt.r / 2 - 0.15, y - 1.5, 0.3, 3 + pt.r);
        }
      }
    }
    // 稀疏流星是背景绘制，不占战斗粒子池。
    const cycle = mod(time + seed % 17, 13);
    if (cycle < 1.15) {
      const x = 90 + cycle * 160, y = 34 + cycle * 58;
      ctx.strokeStyle = pal.css('silver', Math.sin(cycle / 1.15 * Math.PI) * 0.28);
      ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 28, y - 10); ctx.stroke();
    }
  }

  SF.world = { setSeed, update, draw, drawPlanet, get seed() { return seed; } };
})();

