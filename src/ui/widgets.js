/* widgets.js — 深空仪表面板、按钮和分层进度条。 */
(function () {
  'use strict';
  const SF = (window.SF = window.SF || {});
  const { clamp } = SF.util;

  function shape(ctx,x,y,w,h,cut) {
    ctx.beginPath();ctx.moveTo(x+cut,y);ctx.lineTo(x+w-cut,y);ctx.lineTo(x+w,y+cut);
    ctx.lineTo(x+w,y+h-cut);ctx.lineTo(x+w-cut,y+h);ctx.lineTo(x+cut,y+h);
    ctx.lineTo(x,y+h-cut);ctx.lineTo(x,y+cut);ctx.closePath();
  }
  function panel(ctx,x,y,w,h,{alpha=0.95,line='uiLine',fill='uiPanel',accent=false}={}) {
    const pal=SF.palette;
    ctx.save();ctx.globalAlpha*=alpha;
    const cut=h>25?4:2;
    shape(ctx,x,y,w,h,cut);
    const gradient=ctx.createLinearGradient(x,y,x+w*0.25,y+h);
    gradient.addColorStop(0,pal.css(fill));gradient.addColorStop(1,pal.css('bg1'));
    ctx.fillStyle=gradient;ctx.fill();
    ctx.strokeStyle=pal.css(accent?'uiAccent':line,accent?0.8:0.9);ctx.lineWidth=0.6;ctx.stroke();
    ctx.strokeStyle=pal.css('metalLight',0.16);ctx.lineWidth=0.5;
    ctx.beginPath();ctx.moveTo(x+cut+2,y+1.5);ctx.lineTo(x+w-cut-2,y+1.5);ctx.stroke();
    if(accent && h>25) {
      ctx.fillStyle=pal.css('uiAccent');ctx.fillRect(x+8,y,Math.min(24,w-16),1.25);
    }
    ctx.restore();
  }

  function bar(ctx,x,y,w,h,pct,colorKey,{bg='bg0',showGhost=false,ghostPct=0}={}) {
    const pal=SF.palette,filled=w*clamp(pct,0,1);
    ctx.save();ctx.fillStyle=pal.css(bg);ctx.fillRect(x,y,w,h);
    if(showGhost) {ctx.fillStyle=pal.css(colorKey,0.26);ctx.fillRect(x,y,w*clamp(ghostPct,0,1),h);}
    if(filled>0) {
      const g=ctx.createLinearGradient(x,y,x+w,y);
      g.addColorStop(0,pal.css(colorKey,0.55));g.addColorStop(1,pal.css(colorKey));
      ctx.fillStyle=g;ctx.fillRect(x,y,filled,h);
      ctx.fillStyle=pal.css('white',0.25);ctx.fillRect(x,y,filled,Math.min(0.6,h/3));
      ctx.fillStyle=pal.css('white',0.6);ctx.fillRect(x+Math.max(0,filled-0.7),y,Math.min(0.7,filled),h);
    }
    ctx.strokeStyle=pal.css('uiLine',0.55);ctx.lineWidth=0.4;ctx.strokeRect(x,y,w,h);ctx.restore();
  }

  function button(ctx,x,y,w,h,label,{hovered=false,small=false,icon=null,primary=false,color='uiAccent'}={}) {
    const pal=SF.palette;
    ctx.save();
    if(primary) {
      shape(ctx,x,y,w,h,3);
      const gradient=ctx.createLinearGradient(x,y,x,y+h);
      gradient.addColorStop(0,pal.css(hovered?'uiButtonHover':'uiButton'));
      gradient.addColorStop(1,pal.css('metalDark'));
      ctx.fillStyle=gradient;ctx.fill();
      ctx.strokeStyle=pal.css(hovered?'uiAccentHi':color,hovered?0.95:0.65);ctx.lineWidth=0.7;ctx.stroke();
      ctx.fillStyle=pal.css('amber');ctx.fillRect(x+5,y+6,1.5,h-12);
      ctx.strokeStyle=pal.css('metalEdge',0.25);ctx.lineWidth=0.45;
      ctx.beginPath();ctx.moveTo(x+5,y+1.5);ctx.lineTo(x+w-5,y+1.5);ctx.stroke();
    } else {
      panel(ctx,x,y,w,h,{alpha:hovered?1:0.92,line:hovered?color:'uiLine'});
      if(hovered){shape(ctx,x+1,y+1,w-2,h-2,2);ctx.fillStyle=pal.css(color,0.08);ctx.fill();}
    }
    const size=small?8:h<20?8.5:10;
    const cy=y+h/2;
    if(icon) SF.sprites.draw(ctx,icon,x+12,cy,10);
    SF.font.drawText(ctx,label,icon?x+24:primary?x+14:x+w/2,cy-size*0.56,{
      size,color:primary?'white':hovered?'white':'uiText',align:icon||primary?'left':'center',weight:primary?'650':'500'
    });
    if(primary){ctx.strokeStyle=pal.css('uiAccentHi');ctx.lineWidth=0.9;ctx.beginPath();ctx.moveTo(x+w-19,cy-3);ctx.lineTo(x+w-15,cy);ctx.lineTo(x+w-19,cy+3);ctx.stroke();}
    ctx.restore();
  }

  const toasts=[];
  function toast(msg,dur=2.2) {toasts.push({msg,dur,t:0});if(toasts.length>3)toasts.shift();}
  function updateToasts(dt) {
    for(let i=toasts.length-1;i>=0;i--){toasts[i].t+=dt;if(toasts[i].t>=toasts[i].dur)toasts.splice(i,1);}
  }
  function clearToasts(){toasts.length=0;}
  function drawToasts(ctx) {
    const pal=SF.palette;
    let y=62;
    for(const t of toasts) {
      const k=clamp(Math.min(t.t/0.18,(t.dur-t.t)/0.4),0,1);
      if(k<=0)continue;
      if(!t.lines){
        t.lines=SF.font.wrapText(ctx,t.msg,408,8);
        t.width=Math.min(440,Math.max(...t.lines.map(s=>SF.font.measureCn(ctx,s,8)))+26);
      }
      const lines=t.lines,w=t.width;
      ctx.save();ctx.globalAlpha*=k;
      panel(ctx,240-w/2,y,w,lines.length*11+10,{alpha:0.92,line:'amber'});
      ctx.fillStyle=pal.css('amber');ctx.fillRect(240-w/2+6,y+7,2,2);
      lines.forEach((s,i)=>SF.font.drawText(ctx,s,244,y+5+i*11,{size:8,color:'gold',align:'center'}));
      ctx.restore();y+=lines.length*11+15;
    }
  }
  SF.widgets={panel,bar,button,toast,updateToasts,drawToasts,clearToasts};
})();

