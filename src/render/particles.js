/* ============================================================
 * particles.js — 粒子系统（对象池，含拖尾/光斑/飘字）
 * ============================================================ */
(function () {
  'use strict';
  const SF = (window.SF = window.SF || {});
  const { rand, TAU } = SF.util;

  const MAX = 900;
  const pool = [];
  const active = [];

  function init() {
    for (let i = 0; i < MAX; i++) pool.push({});
  }

  function acquire() {
    // 限制纯表现粒子的峰值；饱和时丢弃新粒子，不影响任何伤害结算。
    if (active.length >= MAX) return {};
    const p = pool.pop() || {};
    active.push(p);
    return p;
  }

  // ---------- 发射器 ----------
  // 通用爆炸
  function burst(x, y, { color = 'gold', count = 8, speed = 40, life = 0.5, size = 2, drag = 0.9, glow = true }) {
    for (let i = 0; i < count; i++) {
      const p = acquire();
      const a = rand(TAU);
      const sp = rand(speed * 0.3, speed);
      Object.assign(p, {
        type: 'dot', x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: rand(life * 0.6, life), t: 0,
        size: rand(size * 0.6, size), color, drag, glow,
      });
    }
  }

  // 方向命中火花
  function spark(x, y, angle, { color = 'white', count = 3, speed = 60, life = 0.25, size = 1 }) {
    for (let i = 0; i < count; i++) {
      const p = acquire();
      const a = angle + rand(-0.6, 0.6);
      const sp = rand(speed * 0.4, speed);
      Object.assign(p, {
        type: 'dot', x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: rand(life * 0.5, life), t: 0,
        size: rand(0.7, size), color, drag: 0.86, glow: true,
      });
    }
  }

  // 尾迹
  function trail(x, y, { color = 'hero0', life = 0.4, size = 2, vx = 0, vy = 0 }) {
    const p = acquire();
    Object.assign(p, {
      type: 'dot', x, y,
      vx: vx * 0.1, vy: vy * 0.1,
      life, t: 0, size, color, drag: 0.95, glow: true,
    });
  }

  // 飘字（伤害数字 / 提示）
  function floatText(x, y, text, { color = '#ffffff', size = 8, life = 0.7, vy = -26 }) {
    const p = acquire();
    Object.assign(p, {
      type: 'text', x, y, vx: rand(-6, 6), vy,
      life, t: 0, text, color, size,
    });
  }

  // 环形冲击波
  function ring(x, y, { color = 'white', maxR = 40, life = 0.35, width = 2 }) {
    const p = acquire();
    Object.assign(p, { type: 'ring', x, y, life, t: 0, maxR, color, width });
  }

  // 闪光（短暂屏幕光源）
  function flash(x, y, { color = 'white', size = 8, life = 0.15 }) {
    const p = acquire();
    Object.assign(p, { type: 'flash', x, y, size, life, t: 0, color });
  }

  // 星尘吸收轨迹（从拾取物飞向玩家）
  function suck(x, y, tx, ty, { color = 'starDust', life = 0.3 }) {
    const p = acquire();
    Object.assign(p, { type: 'suck', x, y, sx: x, sy: y, tx, ty, life, t: 0, color });
  }

  // ---------- 更新 ----------
  function update(dt) {
    for (let i = active.length - 1; i >= 0; i--) {
      const p = active[i];
      p.t += dt;
      if (p.t >= p.life) {
        active.splice(i, 1);
        pool.push(p);
        continue;
      }
      if (p.type === 'dot') {
        const d = Math.pow(p.drag, dt * 60);
        p.vx *= d; p.vy *= d;
        p.x += p.vx * dt; p.y += p.vy * dt;
      } else if (p.type === 'text') {
        p.x += p.vx * dt; p.y += p.vy * dt;
      }
    }
  }

  // ---------- 绘制 ----------
  // 粒子坐标全部是世界坐标，绘制前统一经 toScreen 换算（含摄像机/震屏）
  function draw(ctx, palette) {
    const R = SF.renderer;
    // 同一层批量叠加柔光，避免每颗光点切换混合模式；核心、文字与环在其上绘制。
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of active) {
      if ((p.type !== 'dot' || !p.glow) && p.type !== 'flash') continue;
      const k = 1 - p.t / p.life;
      const radius = p.type === 'flash' ? p.size * (0.5 + k * 0.5) * 4 : Math.max(0.3, p.size * k * 0.65) * 5;
      const s = R.toScreen(p.x, p.y);
      if (s.x + radius < 0 || s.x - radius > R.width || s.y + radius < 0 || s.y - radius > R.height) continue;
      ctx.globalAlpha = k * (p.type === 'flash' ? 0.85 : 0.32);
      ctx.drawImage(R.glowTexture(p.color), s.x - radius, s.y - radius, radius * 2, radius * 2);
    }
    ctx.restore();
    for (const p of active) {
      const k = 1 - p.t / p.life; // 剩余生命比例
      if (p.type === 'dot') {
        const s = R.toScreen(p.x, p.y);
        const c = palette.css(p.color);
        const sz = Math.max(0.3, p.size * k * 0.65);
        if (s.x < -12 || s.x > R.width + 12 || s.y < -12 || s.y > R.height + 12) continue;
        ctx.globalAlpha = k;
        ctx.fillStyle = c;
        if(Math.abs(p.vx)+Math.abs(p.vy)>35){
          ctx.strokeStyle=c;ctx.lineWidth=sz;
          ctx.beginPath();ctx.moveTo(s.x,s.y);ctx.lineTo(s.x-p.vx*0.035,s.y-p.vy*0.035);ctx.stroke();
        }else{ctx.beginPath();ctx.arc(s.x,s.y,sz/2,0,TAU);ctx.fill();}
        ctx.globalAlpha = 1;
      } else if (p.type === 'text') {
        const s = R.toScreen(p.x, p.y);
        SF.font.drawText(ctx, p.text, s.x, s.y, {
          size: p.size, color: p.color, align: 'center', alpha: Math.min(1, k * 2),
        });
      } else if (p.type === 'ring') {
        const s = R.toScreen(p.x, p.y);
        const r = p.maxR * (1 - k * k);
        ctx.globalAlpha = k * 0.8;
        ctx.strokeStyle = palette.css(p.color, 1);
        ctx.lineWidth = Math.max(0.5,p.width*0.55);
        ctx.beginPath();
        ctx.arc(s.x, s.y, r, 0, TAU);
        ctx.stroke();
        if(r>3){ctx.globalAlpha=k*0.2;ctx.lineWidth=p.width*2;ctx.stroke();}
        ctx.globalAlpha = 1;
      } else if (p.type === 'flash') {
        const s = R.toScreen(p.x, p.y);
        const sz = p.size * (0.5 + k * 0.5);
        ctx.globalAlpha = k * 0.8;
        ctx.fillStyle = palette.css(p.color, 1);
        ctx.beginPath();
        ctx.arc(s.x, s.y, Math.min(2,sz*0.3), 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else if (p.type === 'suck') {
        const t = p.t / p.life;
        const e = t * t; // 加速飞向目标
        p.x = p.sx + (p.tx - p.sx) * e;
        p.y = p.sy + (p.ty - p.sy) * e;
        const s = R.toScreen(p.x, p.y);
        ctx.globalAlpha = 1 - t * 0.3;
        ctx.fillStyle = palette.css(p.color, 1);
        ctx.fillRect(s.x - 1, s.y - 1, 2, 2);
        ctx.globalAlpha = 1;
      }
    }
  }

  function clear() {
    while (active.length) pool.push(active.pop());
  }

  SF.particles = { init, burst, spark, trail, floatText, ring, flash, suck, update, draw, clear,
    get count() { return active.length; } };
})();
