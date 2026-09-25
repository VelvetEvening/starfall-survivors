/* boss-visuals.js — 授权母舰贴图的动态灯光、反应堆与登场演出。
 * 纯表现层：不修改生命、碰撞、移动、攻击时序或命中范围。
 */
(function () {
  'use strict';
  const SF = (window.SF = window.SF || {});
  const { TAU, clamp } = SF.util;
  let current = null, age = 0, phaseFlash = 0, lastPhase = false;
  let death = null, ghostHp = 1;

  function reset() { current = null; age = 0; phaseFlash = 0; lastPhase = false; death = null; ghostHp = 1; }
  function update(dt, game) {
    const boss = game.boss;
    if (death) { death.t += dt; if (death.t > 1.3) death = null; }
    if (boss && !boss.dead) {
      if (boss !== current) {
        current = boss; age = 0; ghostHp = 1; lastPhase = false;
        SF.renderer.addShake(1.6, 0.65);
      }
      age += dt;
      if (boss._phase2 && !lastPhase) { phaseFlash = 1; lastPhase = true; SF.renderer.addShake(2.5, 0.55); }
      phaseFlash = Math.max(0, phaseFlash - dt * 0.75);
      const hp = clamp(boss.hp / boss.maxHp, 0, 1);
      ghostHp += (hp - ghostHp) * Math.min(1, dt * 2.5);
    } else if (current) {
      death = { x: current.x, y: current.y, t: 0, color: current.def.twoPhase ? 'darkRed' : 'enemy1' };
      SF.renderer.addShake(4.5, 0.7);
      current = null;
    }
  }

  function arc(ctx, x, y, radius, start, end, color, alpha = 1, width = 0.6) {
    ctx.strokeStyle = SF.palette.css(color, alpha); ctx.lineWidth = width;
    ctx.beginPath(); ctx.arc(x, y, radius, start, end); ctx.stroke();
  }

  function drawBackdrop(ctx, game) {
    const boss = game.boss, R = SF.renderer;
    if (boss && !boss.dead) {
      const s = R.toScreen(boss.x, boss.y);
      const color = boss.def.twoPhase ? 'darkRed' : 'enemy0';
      const power = boss._phase2 ? 0.8 : 0.45;
      R.glowScreen(s.x, s.y, boss.def.twoPhase ? 140 : 110, color, power);
      // 压低周边亮度，中心走位区和危险弹幕保留对比度。
      R.vignette(0.48, boss.def.twoPhase ? 'abyssDark' : 'voidDark');
      if (phaseFlash > 0) R.vignette(phaseFlash * 0.72, 'darkRed');
    }
  }

  function drawBoss(ctx, boss) {
    const R = SF.renderer, pal = SF.palette;
    const p = R.toScreen(boss.x, boss.y);
    if (p.x < -110 || p.x > R.width + 110 || p.y < -110 || p.y > R.height + 110) return;
    const final = !!boss.def.twoPhase, rage = !!boss._phase2;
    const t = age, r = boss.radius;
    const color = final ? (rage ? 'fire0' : 'enemy2') : 'enemy1';
    const outer = final ? 49 : 31;
    const pulse = 0.8 + 0.2 * Math.sin(t * (rage ? 5 : 2));
    R.glowScreen(p.x, p.y, outer * 1.75, final ? 'darkRed' : 'enemy0', 0.55 * pulse);
    ctx.save();
    ctx.translate(p.x, p.y);

    // 稀疏轨道与细刻度始终位于舰体后面；不画成实心伤害区域。
    for (let i = 0; i < (final ? 3 : 2); i++) {
      const start = t * (i % 2 ? -0.14 : 0.11) + i * 2.2;
      arc(ctx, 0, 0, outer + i * 5, start, start + 1.7, color, 0.27, 0.5);
      arc(ctx, 0, 0, outer + i * 5, start + Math.PI, start + Math.PI + 1.2, color, 0.18, 0.5);
    }
    for (let i = 0; i < 12; i++) {
      const a = i * TAU / 12 + t * 0.09;
      const rr = outer + 4;
      ctx.strokeStyle = pal.css(color, i % 3 === 0 ? 0.45 : 0.2); ctx.lineWidth = 0.65;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      ctx.lineTo(Math.cos(a) * (rr + (i % 3 === 0 ? 3 : 1.5)), Math.sin(a) * (rr + (i % 3 === 0 ? 3 : 1.5))); ctx.stroke();
    }

    // 两位 Boss 使用不同的原作素材：环状空间站 / 尖翼异形旗舰。
    SF.sprites.draw(ctx, SF.assets.get(final ? 'boss2' : 'boss'), 0, 0, 0,
      final ? Math.PI + Math.sin(t * 0.6) * 0.025 : -t * 0.12);

    // 微亮核心边圈标示原有接触半径；装饰外翼不扩展碰撞体。
    arc(ctx, 0, 0, r, 0, TAU, color, 0.18, 0.5);
    if (final) {
      // 厄兆：层叠反应堆、发热裂隙和暗红冠光。
      const core = ctx.createRadialGradient(-2,-3,1,0,0,11);
      core.addColorStop(0, pal.css('abyssMetal')); core.addColorStop(1, pal.css('bg0'));
      ctx.fillStyle = core; ctx.beginPath(); ctx.arc(0,0,10,0,TAU); ctx.fill();
      for (let i=0;i<3;i++) arc(ctx,0,0,7+i*2,t*(i%2?-0.6:0.4),t*(i%2?-0.6:0.4)+4.6,color,0.45+i*0.1,0.75);
      ctx.fillStyle = pal.css(rage ? 'fire2' : 'enemy2');
      ctx.beginPath();ctx.moveTo(0,-6);ctx.lineTo(2,0);ctx.lineTo(0,7);ctx.lineTo(-2,0);ctx.closePath();ctx.fill();
      for(const sign of [-1,1]) {
        ctx.strokeStyle=pal.css(color,0.7*pulse);ctx.lineWidth=0.8;
        ctx.beginPath();ctx.moveTo(sign*8,-4);ctx.lineTo(sign*13,-10);ctx.lineTo(sign*16,-22);ctx.stroke();
        ctx.beginPath();ctx.moveTo(sign*7,5);ctx.lineTo(sign*12,13);ctx.lineTo(sign*10,24);ctx.stroke();
      }
    } else {
      // 湮灭之眼：空间站中心的瞳孔注视玩家，保留原画的机械外环。
      ctx.fillStyle = pal.css('bg0'); ctx.beginPath();ctx.arc(0,0,10,0,TAU);ctx.fill();
      arc(ctx,0,0,9.8,0,TAU,'enemy1',0.65,0.8);
      const pl = SF.game?.player;
      const angle = pl ? Math.atan2(pl.y-boss.y,pl.x-boss.x) : 0;
      const ex=Math.cos(angle)*1.8, ey=Math.sin(angle)*1.8;
      ctx.fillStyle = pal.css('enemy0'); ctx.beginPath();ctx.ellipse(ex,ey,6.8,4.6,0,0,TAU);ctx.fill();
      ctx.fillStyle=pal.css('enemy2');ctx.beginPath();ctx.ellipse(ex,ey,3.7,4.4,0,0,TAU);ctx.fill();
      ctx.fillStyle=pal.css('bg0');ctx.beginPath();ctx.ellipse(ex,ey,1.2,4.1,0,0,TAU);ctx.fill();
      ctx.fillStyle=pal.css('white');ctx.beginPath();ctx.arc(ex-1,ey-1.6,0.85,0,TAU);ctx.fill();
    }
    if (boss.hitFlash > 0) {
      arc(ctx,0,0,r-1,0,TAU,'white',Math.min(0.75,boss.hitFlash*7),1);
    }
    // 预警对应真实阶段；没有提前或延后原技能时序。
    const laser = boss._dashLaser;
    if (laser?.stage === 'telegraph') {
      const progress=clamp(laser.t/laser.telegraph,0,1);
      arc(ctx,0,0,r+6,-Math.PI/2,-Math.PI/2+TAU*progress,'uiWarn',0.85,1.4);
    }
    ctx.restore();
    R.glowScreen(p.x, p.y, final ? 22 : 15, rage ? 'fire0' : 'enemy2', 0.8*pulse);
  }

  function drawOverlay(ctx, game) {
    const R=SF.renderer,pal=SF.palette,b=game.boss;
    if(death) {
      const k=1-death.t/1.3, p=R.toScreen(death.x,death.y);
      R.glowScreen(p.x,p.y,45+death.t*95,death.color,k*1.4);
      arc(ctx,p.x,p.y,12+death.t*115,0,TAU,death.color,k,1.4);
      arc(ctx,p.x,p.y,8+death.t*80,0,TAU,'starDust',k*0.65,0.65);
    }
    if(!b || b.dead) return;
    const p=R.toScreen(b.x,b.y),color=b.def.twoPhase?'enemy2':'enemy1';
    if(p.x<16 || p.x>464 || p.y<59 || p.y>225) {
      const dx=p.x-240,dy=p.y-135;
      const k=Math.min(218/Math.max(1,Math.abs(dx)),84/Math.max(1,Math.abs(dy)));
      const x=240+dx*k,y=135+dy*k;
      ctx.save();ctx.translate(x,y);ctx.rotate(Math.atan2(dy,dx));
      ctx.fillStyle=pal.css(color);ctx.beginPath();ctx.moveTo(4,0);ctx.lineTo(-3,-3);ctx.lineTo(-2,0);ctx.lineTo(-3,3);ctx.closePath();ctx.fill();ctx.restore();
      SF.font.drawText(ctx,'BOSS',clamp(x,24,456),y+7,{size:5.5,color,align:'center',weight:'600'});
    }
    if(age<3.4) {
      const alpha=Math.min(1,age*3,(3.4-age)*2);
      ctx.save();ctx.globalAlpha=alpha;
      const x=132,y=194,w=216;
      const g=ctx.createLinearGradient(x,0,x+w,0);
      g.addColorStop(0,pal.css('bg0',0));g.addColorStop(0.3,pal.css('bg0',0.88));g.addColorStop(0.7,pal.css('bg0',0.88));g.addColorStop(1,pal.css('bg0',0));
      ctx.fillStyle=g;ctx.fillRect(x,y,w,35);
      SF.font.drawText(ctx,b.def.twoPhase?'终末信号 / ABYSS SOVEREIGN':'异常信号 / ANNIHILATION EYE',240,y+1,{size:6,color,align:'center'});
      SF.font.drawText(ctx,b.def.name,240,y+12,{size:15,color:'white',align:'center',weight:'600'});
      ctx.restore();
    }
  }
  SF.bossVisuals={reset,update,drawBackdrop,drawBoss,drawOverlay,get ghostHp(){return ghostHp;}};
})();
