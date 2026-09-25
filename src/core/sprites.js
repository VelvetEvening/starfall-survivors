/* sprites.js — MillionthVector 授权舰体 + 原生矢量武器/补给图标，统一逻辑尺寸。 */
(function () {
  'use strict';
  const SF = (window.SF = window.SF || {});
  const { TAU } = SF.util;
  const S = {}, glowCache = new Map();
  const DENSITY = 4;
  const pal = () => SF.palette;
  const ICONS = {
    weapon: { satellite: 'satellite', galaxy: 'satellite', shieldDisc: 'satellite', mirrorWheel: 'frostShard', laser: 'icon_laser', spectrum: 'icon_laser', chain: 'icon_railgun', tempest: 'icon_railgun' },
    passive: { engine: 'icon_engine', cryo: 'icon_cryo', crit: 'icon_crit', cooldown: 'icon_chip', armor: 'icon_armor' },
  };

  function make(w, h, paint) {
    const cv = document.createElement('canvas');
    cv.width = w * DENSITY; cv.height = h * DENSITY;
    cv.logicalWidth = w; cv.logicalHeight = h;
    const ctx = cv.getContext('2d');
    ctx.scale(DENSITY, DENSITY);
    ctx.translate(w / 2, h / 2);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    paint(ctx);
    return cv;
  }
  function polygon(ctx, pts, fill, stroke, width = 0.5) {
    ctx.beginPath();
    pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
    ctx.closePath();
    if (fill) { ctx.fillStyle = pal().css(fill); ctx.fill(); }
    if (stroke) { ctx.strokeStyle = pal().css(stroke); ctx.lineWidth = width; ctx.stroke(); }
  }
  function line(ctx, pts, color, width = 0.5, alpha = 1) {
    ctx.strokeStyle = pal().css(color, alpha); ctx.lineWidth = width;
    ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke();
  }
  function disc(ctx, x, y, r, color) {
    ctx.fillStyle = pal().css(color); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  function metal(ctx, pts, light = 'metalLight', dark = 'metalDark', edge = 'metalEdge') {
    ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
    const g = ctx.createLinearGradient(-8, -10, 8, 10);
    g.addColorStop(0, pal().css(light)); g.addColorStop(0.45, pal().css(dark)); g.addColorStop(1, pal().css('ink'));
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = pal().css(edge); ctx.lineWidth = 0.45; ctx.stroke();
  }

  function build() {
    glowCache.clear();
    for (const id of Object.keys(SF.assets.manifest)) {
      if (id !== 'planet') S[id] = SF.assets.get(id);
    }
    S.player = S.player_vega;

    S.blade = make(10,10,ctx => {
      for(let i=0;i<3;i++){ctx.save();ctx.rotate(i*TAU/3);metal(ctx,[[0,0],[-1.1,-2],[0,-4.2],[2,-1.2]],'metalEdge','metalDark','fire2');ctx.restore();}
      disc(ctx,0,0,1,'fire1');
    });
    S.missile = make(8,12,ctx => {
      polygon(ctx, [[0,-5],[-1.5,-2],[-1.5,2],[-3,4],[0,3],[3,4],[1.5,2],[1.5,-2]],'metalLight','metalEdge');
      polygon(ctx, [[0,-5],[-1.4,-2],[1.4,-2]], 'fire1');
      line(ctx,[[-0.7,0],[-0.7,2]],'white',0.5);
    });
    S.orb = make(12,12,ctx => {
      for(let i=0;i<6;i++){
        ctx.save();ctx.rotate(i*TAU/6);
        line(ctx,[[0,0],[0,-4.6]],'ice1',0.75);
        line(ctx,[[-1.2,-3.3],[0,-2.2],[1.2,-3.3]],'ice2',0.5);ctx.restore();
      }
      disc(ctx,0,0,1.2,'ice2');
    });
    S.satellite = make(12,10,ctx => {
      metal(ctx,[[-2,-2],[-5,-3],[-5,2],[-2,1]],'metalLight','metalDark','hero2');
      metal(ctx,[[2,-2],[5,-3],[5,2],[2,1]],'metalLight','metalDark','hero2');
      polygon(ctx,[[0,-3],[-2,0],[0,3],[2,0]],'metalLight','hero1');
      disc(ctx,0,0,0.9,'hero0');
    });
    S.boltPlayer = make(6,6,ctx => disc(ctx,0,0,2,'bolt2'));
    S.spark = make(3,3,ctx => disc(ctx,0,0,1,'bolt2'));
    S.dust = make(5,7,ctx => {
      polygon(ctx,[[0,-2.5],[-1.8,0],[0,2.5],[1.8,0]],'gold','starDust',0.4);
      polygon(ctx,[[0,-2.1],[-1.35,0],[0,0.6]],'white');
    });
    S.magnet = make(10,10,ctx => {
      ctx.strokeStyle=pal().css('bolt0');ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(-3,-3);ctx.lineTo(-3,0);ctx.arc(0,0,3,Math.PI,0,true);ctx.lineTo(3,-3);ctx.stroke();
      line(ctx,[[-3,-3],[-3,-1.5]],'white',2);line(ctx,[[3,-3],[3,-1.5]],'white',2);
    });
    S.heal = make(10,10,ctx => {
      polygon(ctx,[[-3,-4],[3,-4],[4,-3],[4,3],[3,4],[-3,4],[-4,3],[-4,-3]],'metalDark','hero2');
      line(ctx,[[-2,0],[2,0]],'hero1',1.7);line(ctx,[[0,-2],[0,2]],'hero1',1.7);
    });
    S.chest = make(15,12,ctx => {
      metal(ctx,[[-6,-3],[-4,-5],[4,-5],[6,-3],[6,4],[-6,4]],'metalLight','metalDark','gold');
      polygon(ctx,[[-5,-2],[5,-2],[5,3],[-5,3]],'metalDark');
      line(ctx,[[-5,-1],[5,-1]],'gold',0.8);
      polygon(ctx,[[-1,-2],[1,-2],[1,1],[-1,1]],'gold','starDust');
      line(ctx,[[-4,2],[-2,2]],'metalLight',0.5);line(ctx,[[2,2],[4,2]],'metalLight',0.5);
    });
    S.star4 = make(8,8,ctx => polygon(ctx,[[0,-3.5],[0.8,-0.8],[3.5,0],[0.8,0.8],[0,3.5],[-0.8,0.8],[-3.5,0],[-0.8,-0.8]],'white'));

    // 界面符号与战斗舰体分开，装甲/护盾不再借用敌人或冰霜武器的图标。
    S.icon_armor = make(14,14,ctx => {
      metal(ctx,[[-5,-5],[5,-5],[5,1],[0,6],[-5,1]],'metalLight','metalDark','metalEdge');
      line(ctx,[[-3,-2],[0,0],[3,-2]],'hero0',0.8);
      line(ctx,[[-3,1],[0,3],[3,1]],'metalEdge',0.6);
    });
    S.frostShard = make(12,18,ctx => {
      ctx.drawImage(S.frostCore, -3, -9, 6, 18);
      polygon(ctx, [[0,-7],[-3,-1],[0,5],[3,-1]], 'ice0', 'ice2', 0.65);
      polygon(ctx, [[0,-7],[0,5],[3,-1]], 'ice1');
      line(ctx, [[0,-6],[0,4]], 'white', 0.6);
      line(ctx, [[-2,-1],[2,-1]], 'ice2', 0.5);
    });
    S.icon_cryo = make(14,14,ctx => {
      polygon(ctx,[[0,-6],[-2,-2],[-5,-1],[-2,1],[-3,5],[0,2],[3,5],[2,1],[5,-1],[2,-2]],'ice0','ice2',0.8);
      line(ctx,[[0,-4],[0,3]],'white',0.7); line(ctx,[[-2,-1],[2,-1]],'ice1',0.65);
    });
    S.icon_engine = make(14,14,ctx => {
      for(const x of [-3,3]){
        metal(ctx,[[x-1.5,-5],[x+1.5,-5],[x+1.7,2],[x-1.7,2]]);
        polygon(ctx,[[x-1.2,2],[x+1.2,2],[x,6]],'hero0');
        line(ctx,[[x,-3],[x,0]],'metalEdge',0.6);
      }
    });
    S.icon_chip = make(14,14,ctx => {
      polygon(ctx,[[-3.7,-3.7],[3.7,-3.7],[3.7,3.7],[-3.7,3.7]],'metalDark','metalEdge',0.75);
      for(const p of [-2,0,2]){
        line(ctx,[[p,-5.5],[p,-4]],'metalLight',0.7);line(ctx,[[p,4],[p,5.5]],'metalLight',0.7);
        line(ctx,[[-5.5,p],[-4,p]],'metalLight',0.7);line(ctx,[[4,p],[5.5,p]],'metalLight',0.7);
      }
      polygon(ctx,[[0,-2.5],[-1.6,0],[0,0],[0,2.5],[1.6,0],[0,0]],'bolt1');
    });
    S.icon_crit = make(14,14,ctx => {
      ctx.strokeStyle=pal().css('gold');ctx.lineWidth=0.7;ctx.beginPath();ctx.arc(0,0,4.3,0,TAU);ctx.stroke();
      for(let i=0;i<4;i++){ctx.save();ctx.rotate(i*TAU/4);line(ctx,[[0,-6],[0,-3]],'metalEdge',0.8);ctx.restore();}
      disc(ctx,0,0,1.1,'starDust');
    });
    S.icon_railgun = make(14,14,ctx => {
      metal(ctx,[[-4,5],[-4,-3],[-2,-5],[-2,3],[2,3],[2,-5],[4,-3],[4,5]],'metalLight','metalDark','bolt1');
      line(ctx,[[0,2],[0,-6]],'bolt0',1.7);line(ctx,[[0,1],[0,-6]],'bolt2',0.6);
    });
    S.icon_laser = make(14,14,ctx => {
      metal(ctx,[[-5,0],[-2,-3],[2,-2],[3,1],[0,4]],'metalLight','metalDark','bolt1');
      line(ctx,[[1,-1],[6,-6]],'bolt0',2);line(ctx,[[1,-1],[6,-6]],'bolt2',0.7);
    });
  }

  function glow(name, color, blur = 3) {
    const key = name + '|' + color + '|' + blur;
    if (!glowCache.has(key)) {
      const src = S[name];
      if (!src) return null;
      const pad = blur * 1.5;
      const w = src.logicalWidth, h = src.logicalHeight;
      const cv = make(w + pad * 2, h + pad * 2, ctx => {
        ctx.shadowColor = pal().css(color);
        ctx.shadowBlur = blur * DENSITY * 0.65;
        ctx.drawImage(src, -w/2, -h/2, w, h);
        ctx.shadowBlur = 0;
        ctx.drawImage(src, -w/2, -h/2, w, h);
      });
      glowCache.set(key, cv);
    }
    return glowCache.get(key);
  }

  function draw(ctx, name, x, y, size = 0, rot = 0, alpha = 1) {
    const src = typeof name === 'string' ? S[name] : name;
    if (!src) return;
    const w = src.logicalWidth || src.width, h = src.logicalHeight || src.height;
    const scale = size ? size / Math.max(w, h) : 1;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha *= alpha;
    ctx.drawImage(SF.renderer.spriteSource(src, scale), -w*scale/2, -h*scale/2, w*scale, h*scale); ctx.restore();
  }
  SF.sprites = { build, get: name => S[name], glow, draw,
    icon: (kind, id, fallback) => ICONS[kind]?.[id] || fallback };
})();

