/* ============================================================
 * renderer.js — 480×270 逻辑坐标，高分辨率离屏渲染。
 * 清晰文字 / 缓存柔光 / 全场共享震屏；世界坐标统一经 toScreen。
 * 渲染倍率不参与碰撞、移动、射程或任何数值计算。
 * ============================================================ */
(function () {
  'use strict';
  const SF = (window.SF = window.SF || {});
  const { TAU, clamp } = SF.util;
  const VW = 480, VH = 270;
  let screenCv, sctx, buf, worldCtx, ctx;
  let density = 3, displayDensity = 3, worldDensity = 3, clock = 0;
  let slowTime = 0, recoveryTime = 0, qualityCooldown = 0;
  const cam = { x: 0, y: 0 };
  const shake = { t: 0, dur: 0, mag: 0, x: 0, y: 0 };
  const lights = new Map();
  const spriteMips = new WeakMap();
  let reducedMotion = false;

  function init(canvas) {
    screenCv = canvas;
    sctx = canvas.getContext('2d', { alpha: false });
    buf = document.createElement('canvas');
    worldCtx = buf.getContext('2d', { alpha: false });
    ctx = worldCtx;
    resize();
    window.addEventListener('resize', resize);
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotion = motion.matches;
    motion.addEventListener('change', e => { reducedMotion = e.matches; });
  }

  function resize() {
    const fit = Math.min(window.innerWidth / VW, window.innerHeight / VH);
    const cssW = Math.max(1, Math.floor(VW * fit));
    const cssH = Math.max(1, Math.floor(VH * fit));
    displayDensity = clamp(Math.ceil(fit * (window.devicePixelRatio || 1)), 2, 4);
    screenCv.width = VW * displayDensity;
    screenCv.height = VH * displayDensity;
    screenCv.style.width = cssW + 'px';
    screenCv.style.height = cssH + 'px';
    setWorldDensity(displayDensity);
    density = displayDensity;
    slowTime = recoveryTime = qualityCooldown = 0;
    sctx.imageSmoothingEnabled = true;
  }

  function setWorldDensity(value) {
    worldDensity = value;
    buf.width = VW * value;
    buf.height = VH * value;
    worldCtx.setTransform(value, 0, 0, value, 0, 0);
    worldCtx.imageSmoothingEnabled = true;
    // 贴图缩小在 spriteSource 中高质量预处理；每帧仅作双线性采样。
    // 文字和矢量抗锯齿不受 imageSmoothingQuality 影响。
    worldCtx.imageSmoothingQuality = 'low';
  }

  // 世界层按持续帧时调节，最低仍为 960×540；HUD/面板始终用显示分辨率。
  // 恢复需要连续空余性能和冷却，避免粒子潮来回触发画质跳变。
  function adaptQuality(dt) {
    const game = SF.game;
    if (game?.state !== 'playing') {
      if (['menu', 'charSelect', 'workshop'].includes(game?.state) && worldDensity !== displayDensity) setWorldDensity(displayDensity);
      slowTime = recoveryTime = 0;
      return;
    }
    qualityCooldown = Math.max(0, qualityCooldown - dt);
    slowTime = dt > 1 / 45 ? slowTime + dt : Math.max(0, slowTime - dt * 0.5);
    if (slowTime > 0.85 && worldDensity > 2) {
      setWorldDensity(worldDensity - 1);
      slowTime = recoveryTime = 0;
      qualityCooldown = 8;
    }
    const quiet = (game.enemies?.list.length || 0) < 70 && SF.particles.count < 240;
    recoveryTime = quiet && dt < 0.019 ? recoveryTime + dt : 0;
    if (worldDensity < displayDensity && recoveryTime > 4 && qualityCooldown === 0) {
      setWorldDensity(worldDensity + 1);
      recoveryTime = slowTime = 0;
      qualityCooldown = 8;
    }
  }

  function begin(dt) {
    adaptQuality(dt);
    ctx = worldCtx;
    density = worldDensity;
    clock += Math.min(dt, 0.1);
    shake.t = Math.max(0, shake.t - dt);
    // 一帧只采样一次，所有物体与效果保持相同空间关系。
    const magnitude = shake.t > 0 ? shake.mag * shake.t / shake.dur : 0;
    shake.x = Math.sin(clock * 117.1) * magnitude;
    shake.y = Math.cos(clock * 91.7) * magnitude * 0.65;
    ctx.setTransform(density, 0, 0, density, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
    ctx.fillStyle = SF.palette.css('bg0');
    ctx.fillRect(0, 0, VW, VH);
    return ctx;
  }

  function addShake(mag, dur = 0.25) {
    if (mag >= shake.mag || shake.t <= 0) {
      shake.mag = Math.min(mag, 6);
      shake.dur = dur;
      shake.t = dur;
    }
  }

  function toScreen(x, y) {
    return { x: x - cam.x + VW / 2 + shake.x, y: y - cam.y + VH / 2 + shake.y };
  }

  function spriteSource(img, scale = 1) {
    const longest = Math.max(img.width, img.height);
    const physical = Math.max(img.logicalWidth || img.width, img.logicalHeight || img.height) * scale * density;
    const size = Math.max(16, 2 ** Math.ceil(Math.log2(Math.max(1, physical))));
    if (size >= longest) return img;
    let levels = spriteMips.get(img);
    if (!levels) { levels = new Map(); spriteMips.set(img, levels); }
    if (!levels.has(size)) {
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(img.width * size / longest));
      cv.height = Math.max(1, Math.round(img.height * size / longest));
      const c = cv.getContext('2d');
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = 'high';
      c.drawImage(img, 0, 0, cv.width, cv.height);
      levels.set(size, cv);
    }
    return levels.get(size);
  }

  function drawSpriteScreen(img, x, y, rot = 0, alpha = 1, scale = 1, flipX = false) {
    if (!img) return;
    const w = img.logicalWidth || img.width, h = img.logicalHeight || img.height;
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    ctx.globalAlpha *= alpha;
    ctx.scale(flipX ? -scale : scale, scale);
    ctx.drawImage(spriteSource(img, scale), -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  function drawSprite(img, x, y, { rot = 0, flipX = false, alpha = 1, scale = 1 } = {}) {
    if (!img) return;
    const s = toScreen(x, y);
    const margin = Math.max(img.logicalWidth || img.width, img.logicalHeight || img.height) * scale;
    if (s.x < -margin || s.y < -margin || s.x > VW + margin || s.y > VH + margin) return;
    drawSpriteScreen(img, s.x, s.y, rot, alpha, scale, flipX);
  }

  function strokeCircle(x, y, r, color, width = 1, alpha = 1) {
    if (r <= 0) return;
    const s = toScreen(x, y);
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
  function fillCircle(x, y, r, color, alpha = 1) {
    if (r <= 0) return;
    const s = toScreen(x, y);
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // 光源纹理缓存；战斗中不反复创建径向渐变或使用 shadowBlur。
  function glowTexture(color) {
    let tex = lights.get(color);
    if (!tex) {
      tex = document.createElement('canvas');
      tex.width = tex.height = 96;
      const c = tex.getContext('2d');
      const g = c.createRadialGradient(48, 48, 0, 48, 48, 48);
      g.addColorStop(0, SF.palette.css(color, 0.7));
      g.addColorStop(0.2, SF.palette.css(color, 0.28));
      g.addColorStop(0.55, SF.palette.css(color, 0.07));
      g.addColorStop(1, SF.palette.css(color, 0));
      c.fillStyle = g;
      c.fillRect(0, 0, 96, 96);
      lights.set(color, tex);
    }
    return tex;
  }
  function glowScreen(x, y, radius, color = 'hero0', alpha = 1) {
    if (radius <= 0 || alpha <= 0) return;
    if (x + radius < 0 || x - radius > VW || y + radius < 0 || y - radius > VH) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha *= alpha;
    ctx.drawImage(glowTexture(color), x - radius, y - radius, radius * 2, radius * 2);
    ctx.restore();
  }
  function glow(x, y, radius, color, alpha = 1) {
    const s = toScreen(x, y);
    glowScreen(s.x, s.y, radius, color, alpha);
  }

  // 屏幕逻辑坐标下的纯表现电弧；不调用随机数，避免绘制频率改变战斗随机流。
  function electricArc(target, x1, y1, x2, y2, { time = 0, amplitude = 3, width = 1, alpha = 1, seed = 0 } = {}) {
    const dx = x2 - x1, dy = y2 - y1, length = Math.hypot(dx, dy);
    if (!length) return;
    const steps = Math.min(64, Math.max(4, Math.ceil(length / 7)));
    const nx = -dy / length, ny = dx / length, frame = reducedMotion ? 0 : Math.floor(time * 12);
    target.save(); target.lineJoin = 'bevel'; target.lineCap = 'butt';
    target.beginPath(); target.moveTo(x1, y1);
    for (let i = 1; i < steps; i++) {
      const noise = Math.sin(i * 17.17 + seed * 7.13 + frame * 2.31) * 43758.5453;
      const offset = ((noise - Math.floor(noise)) * 2 - 1) * amplitude;
      target.lineTo(x1 + dx * i / steps + nx * offset, y1 + dy * i / steps + ny * offset);
    }
    target.lineTo(x2, y2);
    for (const [w, color, opacity] of [[width + 2.2, 'bolt0', 0.22], [width, 'bolt1', 0.9], [width * 0.42, 'white', 1]]) {
      target.lineWidth = w; target.strokeStyle = SF.palette.css(color, alpha * opacity); target.stroke();
    }
    target.restore();
  }

  function vignette(strength = 0.45, color = 'bg0') {
    const g = ctx.createRadialGradient(VW / 2, VH / 2, 65, VW / 2, VH / 2, 265);
    g.addColorStop(0, SF.palette.css(color, 0));
    g.addColorStop(1, SF.palette.css(color, strength));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, VH);
  }
  function beginUI() {
    if (ctx === sctx) return ctx;
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.globalAlpha = 1;
    sctx.globalCompositeOperation = 'source-over';
    sctx.drawImage(buf, 0, 0, screenCv.width, screenCv.height);
    ctx = sctx;
    density = displayDensity;
    ctx.setTransform(density, 0, 0, density, 0, 0);
    ctx.imageSmoothingQuality = 'low';
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
    return ctx;
  }
  function end() { if (ctx !== sctx) beginUI(); }

  SF.renderer = {
    init, begin, beginUI, end, resize, cam, addShake, toScreen,
    drawSprite, drawSpriteScreen, spriteSource, strokeCircle, fillCircle,
    glow, glowScreen, glowTexture, electricArc, vignette,
    get ctx() { return ctx; }, get width() { return VW; }, get height() { return VH; },
    get time() { return clock; }, get density() { return density; },
    get reducedMotion() { return reducedMotion; },
    get worldDensity() { return worldDensity; }, get displayDensity() { return displayDensity; },
  };
})();

