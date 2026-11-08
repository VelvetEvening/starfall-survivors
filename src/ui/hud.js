/* hud.js — 低干扰的飞行仪表；首领信息、玩家状态与武器层级清晰分区。 */
(function () {
  'use strict';
  const SF=(window.SF=window.SF||{});
  const {clamp}=SF.util;

  // 仪表只读战斗状态；不在渲染帧推进资源或消费输入。
  function characterStatus(pl) {
    if(pl.traits.fireOverdrive) {
      const heat=SF.config.VEGA_HEAT,active=pl.fireOverdriveT>0,ready=pl.heat>=heat.threshold;
      return {label:'超载',value:active?'超载中 '+pl.fireOverdriveT.toFixed(1)+'s':ready?'空格 · 开启超载':pl.heat+' / '+heat.threshold,
        pct:active?pl.fireOverdriveT/heat.duration:pl.heat/heat.threshold,segments:active?1:heat.threshold,color:'fire1',ready:ready||active,
        detail:pl.weaponLockT>0?'停滞 · 技能计时暂停':active?'火武加速 · 独立灼烧叠层':ready?'已储存 · 持续 '+heat.duration+'s':
          pl.heatGateT>0?'下次积热 '+pl.heatGateT.toFixed(1)+'s':'积满后按空格开启'};
    }
    if(pl.traits.railgunBurst) {
      const w=pl.weapons.find(w=>w.spec.charge!==undefined);
      if(!w)return null;
      const max=pl.stats.railgunStorage,ready=w.charges>=max;
      const progress=clamp(w.chargeT/w.chargeDuration(pl),0,1);
      return {label:'电容',value:w.burstFlashT>0?'聚能释放':ready?'聚能就绪  '+max+'/'+max:w.charges+' / '+max,
        pct:(w.charges+(ready?0:progress))/max,segments:max,color:'bolt1',ready,
        detail:pl.weaponLockT>0?'停滞 · 储能保留':ready?'点击 · 三发合为一炮':w.charges>0?'点击单发 · 等满仓聚能':'下一发 '+Math.max(0,w.chargeDuration(pl)-w.chargeT).toFixed(1)+'s'};
    }
    if(pl.traits.cycleInvuln) {
      const active=pl.phaseInvulnT>0,ready=pl.cycleInvulnCd<=0&&pl.weaponLockT<=0;
      return {label:'防反',value:pl.counterFlashT>0?'防反成功':active?'防反中':pl.weaponLockT>0?'停滞':ready?'空格 · 防反':Math.ceil(pl.cycleInvulnCd)+'s',
        pct:1-clamp(pl.cycleInvulnCd/pl.counterCooldownMax,0,1),segments:1,color:'ice1',ready:active||ready,
        detail:pl.weapons.some(w=>w.frostEmpowered)?'穿透冰弹已备':''};
    }
    return null;
  }

  function drawCharacterStatus(ctx,pl) {
    const status=characterStatus(pl);
    if(!status)return;
    const x=224,y=246,w=176;
    SF.widgets.panel(ctx,x-4,y-4,w+8,21,{alpha:0.76,line:status.ready?status.color:'uiLine'});
    SF.font.drawText(ctx,status.label,x,y,{size:6.5,color:status.color,weight:'650'});
    SF.font.drawText(ctx,status.value,x+w,y,{size:6.5,color:status.ready?'white':'silver',align:'right'});
    const gap=2,segmentW=(w-gap*(status.segments-1))/status.segments;
    for(let i=0;i<status.segments;i++) {
      SF.widgets.bar(ctx,x+i*(segmentW+gap),y+10,segmentW,2.5,
        clamp(status.pct*status.segments-i,0,1),status.color);
    }
  }

  function draw(ctx,game) {
    const R=SF.renderer,pal=SF.palette,pl=game.player,st=pl.stats;
    const boss=game.boss&&!game.boss.dead?game.boss:null;
    const low=pl.hp<st.maxHp*0.3;
    if(pl.hurtFlash>0)R.vignette(pl.hurtFlash*2.2,'darkRed');
    else if(low)R.vignette(0.17+0.07*Math.sin(game.time*3),'darkRed');
    ctx.save();
    // 渐隐衬底在 HUD 文字下面，避免暗角再次压暗文字。
    let gradient=ctx.createLinearGradient(0,0,0,64);
    gradient.addColorStop(0,pal.css('bg0',0.92));gradient.addColorStop(0.72,pal.css('bg0',0.5));gradient.addColorStop(1,pal.css('bg0',0));
    ctx.fillStyle=gradient;ctx.fillRect(0,0,480,64);
    gradient=ctx.createLinearGradient(0,224,0,270);
    gradient.addColorStop(0,pal.css('bg0',0));gradient.addColorStop(0.65,pal.css('bg0',0.82));gradient.addColorStop(1,pal.css('bg0',0.94));
    ctx.fillStyle=gradient;ctx.fillRect(0,224,480,46);

    const xp=clamp(game.xp/game.xpNext,0,1);
    ctx.fillStyle=pal.css('bg2');ctx.fillRect(0,0,480,1.7);
    ctx.fillStyle=pal.css('starDust');ctx.fillRect(0,0,480*xp,1.7);
    SF.font.drawText(ctx,pl.char.name,12,10,{size:10,color:'uiText',weight:'650'});
    SF.font.drawText(ctx,'LV. '+game.level,124,12,{size:7,color:'starDust',align:'right'});
    SF.widgets.bar(ctx,12,27,112,4,pl.hp/st.maxHp,low?'uiWarn':pl.char.color);
    SF.font.drawText(ctx,Math.ceil(pl.hp)+' / '+Math.round(st.maxHp),12,35,{size:6.5,color:low?'uiWarn':'silver'});
    drawCharacterStatus(ctx,pl);
    if(pl.weaponLockT>0)SF.font.drawText(ctx,'武器停滞 '+Math.ceil(pl.weaponLockT)+'s',12,48,{size:7,color:'uiWarn'});

    const remain=Math.max(0,SF.config.RUN_DURATION-game.runTime);
    const mm=Math.floor(remain/60),ss=Math.floor(remain%60);
    const time=boss?(boss.def.twoPhase?'BOSS II':'BOSS I'):mm+':'+String(ss).padStart(2,'0');
    SF.font.drawText(ctx,time,240,8,{size:boss?12:17,color:boss?'gold':'white',align:'center',weight:'500'});
    if(!boss) {
      SF.font.drawText(ctx,game.bossKilledThisRun?'进入最终星域':'距离首领降临',240,30,{size:6,color:'uiDim',align:'center'});
      ctx.fillStyle=pal.css('uiLine',0.7);ctx.fillRect(206,43,68,0.5);
      ctx.fillStyle=pal.css('uiAccent');ctx.fillRect(206,43,68*clamp(game.runTime/SF.config.RUN_DURATION,0,1),0.5);
    }else{
      const color=boss.def.twoPhase?'enemy2':'enemy1';
      SF.font.drawText(ctx,boss.def.name,240,26,{size:8,color:'uiText',align:'center',weight:'600'});
      SF.widgets.bar(ctx,151,39,178,4.5,boss.hp/boss.maxHp,color,{showGhost:true,ghostPct:SF.bossVisuals?.ghostHp||boss.hp/boss.maxHp});
      const thresholds=boss.def.twoPhase?[0.5]:[0.33,0.66];
      ctx.fillStyle=pal.css('bg0');
      for(const threshold of thresholds)ctx.fillRect(151+178*threshold,39,0.8,4.5);
      SF.font.drawText(ctx,boss._phase2?'狂怒阶段':'阶段 '+(game._bossPhase+1),240,47,
        {size:5.6,color:boss._phase2?'uiWarn':'uiDim',align:'center'});
    }
    SF.font.drawText(ctx,'击杀  '+game.runStats.kills,468,11,{size:8,color:'uiText',align:'right'});
    SF.font.drawText(ctx,'得分  '+Math.floor(game.score).toLocaleString('en-US'),468,24,{size:8,color:'gold',align:'right'});
    SF.font.drawText(ctx,(game.difficulty?.name||'正常')+'  /  P 暂停',468,38,{size:6,color:'uiDim',align:'right'});

    SF.font.drawText(ctx,'武器',12,228,{size:5.7,color:'uiDim'});
    let x=12;const y=241;
    for(let i=0;i<4;i++){
      const w=pl.weapons[i];
      SF.widgets.panel(ctx,x,y,20,20,{alpha:0.92,line:w?.def.super?'gold':'uiLine'});
      if(w) {
        const icon=SF.sprites.icon('weapon',w.def.id,w.def.icon);
        SF.sprites.draw(ctx,icon,x+10,y+8.5,11);
        SF.font.drawText(ctx,w.def.super?'EX':String(w.level),x+16.8,y+14,{size:5,color:w.def.super?'gold':'silver',align:'right',weight:'600'});
        let pct=1;
        if(w.spec.charge!==undefined)pct=w.chargePct;
        else if(w.spec.cooldown>0.2)pct=1-clamp(w.cdTimer/w.cooldownDuration(pl),0,1);
        SF.widgets.bar(ctx,x+3,y+18,14,0.8,pct,w.spec.charge!==undefined?'bolt1':pal.elementColor(w.def.element));
        const primed=w.railgunReady||w.frostEmpowered;
        if(primed){
          const color=w.frostEmpowered?'ice2':w.railgunBurstReady?'white':'bolt1';
          ctx.strokeStyle=pal.css(color,0.65+Math.sin(game.time*4)*0.2);ctx.lineWidth=0.7;ctx.strokeRect(x+0.5,y+0.5,19,19);
        }
        if(pl.weaponLockT>0){ctx.strokeStyle=pal.css('uiDim');ctx.lineWidth=0.7;ctx.beginPath();ctx.moveTo(x+4,y+15);ctx.lineTo(x+16,y+3);ctx.stroke();}
      }else{
        ctx.fillStyle=pal.css('uiLine',0.5);ctx.fillRect(x+7,y+10,6,0.6);ctx.fillRect(x+10,y+7,0.6,6);
      }
      x+=24;
    }
    x+=6;
    SF.font.drawText(ctx,'模组',x,228,{size:5.7,color:'uiDim'});
    for(const [id,inst] of pl.passives){
      const def=SF.passives[id];
      SF.widgets.panel(ctx,x,y,20,20,{alpha:0.8});
      SF.sprites.draw(ctx,SF.sprites.icon('passive',id,def.icon),x+10,y+8.5,10,0,0.8);
      SF.font.drawText(ctx,String(inst.level),x+17,y+14,{size:5,color:'silver',align:'right'});
      x+=24;
    }

    SF.font.drawText(ctx,'元素共鸣',468,241,{size:5.8,color:'uiDim',align:'right'});
    const elements=[['fire','火'],['bolt','雷'],['ice','冰']];
    elements.forEach(([el,label],i)=>{
      const active=st.resonance[el],col=pal.elementColor(el);
      const xx=422+i*17;
      ctx.fillStyle=pal.css(active?col:'uiLine',active?0.18:0.35);ctx.fillRect(xx,252,13,12);
      SF.font.drawText(ctx,label,xx+6.5,254,{size:7,color:active?col:'grayLight',align:'center'});
      if(active){ctx.fillStyle=pal.css(col);ctx.fillRect(xx,263,13,0.6);}
    });
    SF.font.drawText(ctx,'Tab 矩阵 · '+pl.starPoints+' 点',468,224,{size:7,color:pl.starPoints?'uiAccentHi':'uiDim',align:'right'});
    ctx.restore();
  }
  SF.hud={draw,characterStatus};
})();

