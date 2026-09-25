/* starmap.js — 四系机体专精矩阵；电路节点与键鼠操作，保留旧内部接口。 */
(function () {
  'use strict';
  const SF=(window.SF=window.SF||{});
  const {dist2}=SF.util;
  const CENTERS={orion:[66,120],cygnus:[182,120],nexus:[298,120],cassia:[414,120]};
  const BRANCH={root:[0,-26],a:[-24,2],b:[24,2],c:[-24,31],d:[24,31],e:[0,60]};
  const NEXUS={core:[0,-26],fire:[-24,2],ice:[24,2],bolt:[0,60],a:[-24,31],b:[24,31]};
  const RETURN={x:409,y:16,w:54,h:20};
  const inside=(m,b)=>m.x>=b.x&&m.x<=b.x+b.w&&m.y>=b.y&&m.y<=b.y+b.h;

  class StarMapPanel {
    constructor(game){
      this.game=game;this.openT=0;this.hover=null;this.layout={};
      this.ids=Object.keys(SF.constellations);
      const home=game.player.char.homeTree;
      this.focus=home==='nexus'?'nexus_core':home+'_root';
      for(const id of this.ids){
        const n=SF.constellations[id],center=CENTERS[n.con],suffix=id.slice(id.indexOf('_')+1);
        const local=(n.con==='nexus'?NEXUS:BRANCH)[suffix];
        this.layout[id]={x:center[0]+local[0],y:center[1]+local[1]};
      }
      SF.audio.sfx.select();
    }
    update(dt){
      this.openT+=dt;
      const input=SF.input,pl=this.game.player,m=this.game.mouse;
      if(input.isPressed('starmap')||input.isPressed('cancel')||(m.clicked&&inside(m,RETURN))){
        this.done=true;SF.audio.sfx.cancel();return;
      }
      const direction=input.isPressed('right')?[1,0]:input.isPressed('left')?[-1,0]:input.isPressed('down')?[0,1]:input.isPressed('up')?[0,-1]:null;
      if(direction){
        const from=this.layout[this.focus];
        const next=this.ids.map(id=>{
          const p=this.layout[id],dx=p.x-from.x,dy=p.y-from.y;
          const forward=dx*direction[0]+dy*direction[1],cross=dx*direction[1]-dy*direction[0];
          return {id,forward,score:dist2(from.x,from.y,p.x,p.y)+cross*cross*2};
        }).filter(n=>n.forward>1).sort((a,b)=>a.score-b.score)[0];
        if(next){this.focus=next.id;SF.audio.sfx.uiTick();}
      }
      const available=this.ids.filter(id=>pl.canLight(id));
      for(let i=0;i<available.length&&i<9;i++){
        if(input.isPressed('slot'+(i+1))){this.focus=available[i];SF.audio.sfx.uiTick();return;}
      }
      if(input.isPressed('confirm')&&pl.canLight(this.focus)){pl.lightStar(this.focus);return;}
      this.hover=null;
      for(const id of this.ids){
        const p=this.layout[id];
        if(inside(m,{x:p.x-12,y:p.y-8,w:24,h:25})){this.hover=id;break;}
      }
      if(this.hover&&(m.x!==this._mx||m.y!==this._my||m.clicked))this.focus=this.hover;
      this._mx=m.x;this._my=m.y;
      if(m.clicked&&this.hover&&pl.canLight(this.hover))pl.lightStar(this.hover);
    }
    draw(ctx){
      const R=SF.renderer,pal=SF.palette,pl=this.game.player,home=pl.char.homeTree;
      ctx.save();ctx.fillStyle=pal.css('bg0',0.96);ctx.fillRect(0,0,480,270);
      SF.font.drawText(ctx,'专精矩阵',18,15,{size:20,color:'white',weight:'600'});
      SF.font.drawText(ctx,'FRAME SPECIALIZATION',112,24,{size:6,color:'uiDim'});
      SF.font.drawText(ctx,'◆ '+pl.starPoints+' 专精点',394,21,{size:9,color:'uiAccentHi',align:'right'});
      SF.widgets.button(ctx,RETURN.x,RETURN.y,RETURN.w,RETURN.h,'返回 · Tab',{small:true,hovered:inside(this.game.mouse,RETURN)});
      // 四块独立机体电路板，以角色颜色与结构层级区分路线。
      for(const [key,center] of Object.entries(CENTERS)){
        const meta=SF.constellationMeta[key],isHome=home===key;
        SF.widgets.panel(ctx,center[0]-54,49,108,161,{alpha:1,line:isHome?meta.color:'uiLine'});
        ctx.fillStyle=pal.css(meta.color,isHome?0.9:0.5);ctx.fillRect(center[0]-17,49,34,1.2);
        SF.font.drawText(ctx,meta.name,center[0],58,{size:9,color:meta.color,align:'center',weight:'600'});
        SF.font.drawText(ctx,meta.pilot+' / '+meta.style+' · '+(isHome?'本系 ×1':'异系 ×2'),
          center[0],73,{size:5.7,color:isHome?'uiText':'uiDim',align:'center'});
      }
      const lit=pl.litStars,available=this.ids.filter(id=>pl.canLight(id));
      for(const id of this.ids){
        const n=SF.constellations[id],p=this.layout[id],meta=SF.constellationMeta[n.con];
        for(const req of [n.req,n.req2]){
          if(!req)continue;
          const q=this.layout[req],active=lit.has(id)&&lit.has(req);
          ctx.strokeStyle=pal.css(active?meta.color:'uiLine',active?0.8:0.65);
          ctx.lineWidth=active?0.9:0.6;
          const mid=(p.y+q.y)/2;
          ctx.beginPath();ctx.moveTo(q.x,q.y+6);ctx.lineTo(q.x,mid);ctx.lineTo(p.x,mid);ctx.lineTo(p.x,p.y-6);ctx.stroke();
        }
      }
      ctx.setLineDash([]);
      for(const id of this.ids){
        const n=SF.constellations[id],p=this.layout[id],meta=SF.constellationMeta[n.con];
        const active=lit.has(id),can=pl.canLight(id),focus=this.focus===id;
        if(active||can)R.glowScreen(p.x,p.y,13,meta.color,active?0.4:0.15);
        ctx.fillStyle=pal.css(active?'uiButton':'bg1');ctx.fillRect(p.x-9,p.y-6,18,12);
        ctx.strokeStyle=pal.css(meta.color,active?1:can?0.8:0.3);ctx.lineWidth=active?1:0.6;ctx.strokeRect(p.x-9,p.y-6,18,12);
        SF.font.drawText(ctx,active?'✓':String(pl.starCost(id)),p.x,p.y-3.8,{size:6,color:active?'white':can?'uiText':'uiDim',align:'center'});
        if(focus){
          ctx.strokeStyle=pal.css('uiAccentHi',0.95);ctx.lineWidth=0.65;ctx.strokeRect(p.x-12,p.y-9,24,18);
        }
        SF.font.drawText(ctx,n.name,p.x,p.y+9,{size:5.6,color:focus?'white':active?'uiText':'uiDim',align:'center'});
        const index=available.indexOf(id);
        if(index>=0&&index<9)SF.font.drawText(ctx,String(index+1),p.x+13,p.y-9,{size:5.5,color:'uiAccentHi'});
      }
      SF.font.drawText(ctx,'本系 ×1 / 异系 ×2 · 方框内为费用',18,217,{size:6,color:'uiDim'});
      SF.font.drawText(ctx,'方向键 查看 · 1–9 聚焦 · Enter 激活',462,217,{size:6,color:'uiDim',align:'right'});
      const node=SF.constellations[this.focus],meta=SF.constellationMeta[node.con];
      SF.widgets.panel(ctx,18,233,444,31,{alpha:1,line:meta.color});
      SF.font.drawText(ctx,node.name,30,239,{size:9,color:'white',weight:'600'});
      let status='已激活';
      if(!lit.has(this.focus)) {
        const needReq = (node.req && !lit.has(node.req)) || (node.req2 && !lit.has(node.req2));
        const needPts = pl.starPoints < pl.starCost(this.focus);
        status = needReq ? '需要前置' : needPts ? `需要 ${pl.starCost(this.focus)} 点（当前 ${pl.starPoints}）` : `可激活 · ${pl.starCost(this.focus)} 点`;
      }
      SF.font.drawText(ctx,status,30,253,{size:6,color:lit.has(this.focus)?'uiAccent':'starDust'});
      const lines=SF.font.wrapText(ctx,node.desc,304,7.5);
      lines.forEach((str,i)=>SF.font.drawText(ctx,str,142,lines.length>1?238+i*11:244,{size:7.5,color:'silver'}));
      ctx.restore();
    }
  }
  SF.StarMapPanel=StarMapPanel;
})();

