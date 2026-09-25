/* ============================================================
 * menus.js — 主菜单 / 角色选择 / 暂停 / 结算
 * ============================================================ */
(function () {
  'use strict';
  const SF = (window.SF = window.SF || {});
  const { clamp } = SF.util;

  const MENU_ACTIONS = [
    {x:30,y:145,w:152,h:28,act:'start',label:'开始征程'},
    {x:30,y:184,w:72,h:21,act:'help',label:'操作说明'},
    {x:110,y:184,w:72,h:21,act:'credits',label:'美术鸣谢'},
    {x:30,y:211,w:152,h:16,act:'wipe',label:'重置存档'},
  ];
  const inside = (m,b) => m.x>=b.x && m.x<=b.x+b.w && m.y>=b.y && m.y<=b.y+b.h;

  // ============ 主菜单 ============
  class MainMenu {
    constructor(game) {
      this.game=game;this.t=0;this.sel=0;this.wipeArmed=false;this.wipeArmT=0;
      this.showHelp=false;this.showCredits=false;this.notice='';this.noticeT=0;
    }
    update(dt) {
      this.t+=dt;this.noticeT=Math.max(0,this.noticeT-dt);
      if(this.wipeArmed){this.wipeArmT-=dt;if(this.wipeArmT<=0)this.wipeArmed=false;}
      const input=SF.input,m=this.game.mouse;
      if(this.showHelp||this.showCredits){
        if(input.isPressed('cancel')||input.isPressed('confirm')||(m.clicked&&inside(m,{x:388,y:43,w:25,h:20}))){
          this.showHelp=false;this.showCredits=false;SF.audio.sfx.cancel();
        }
        return;
      }
      if(input.isPressed('down')){this.sel=(this.sel+1)%MENU_ACTIONS.length;SF.audio.sfx.uiTick();}
      if(input.isPressed('up')){this.sel=(this.sel+MENU_ACTIONS.length-1)%MENU_ACTIONS.length;SF.audio.sfx.uiTick();}
      if(input.isPressed('confirm')){this.act(MENU_ACTIONS[this.sel].act);return;}
      // 主菜单 Esc 不再误开帮助；帮助使用明确的「操作说明」按钮。
      this.hoverAct=null;
      for(let i=0;i<MENU_ACTIONS.length;i++){
        if(inside(m,MENU_ACTIONS[i])){this.hoverAct=MENU_ACTIONS[i].act;if(m.clicked){this.sel=i;this.act(this.hoverAct);return;}}
      }
      if(m.clicked)this.wipeArmed=false;
    }
    act(action) {
      if(action==='start'){this.wipeArmed=false;SF.audio.sfx.confirm();this.done=true;this.game.openCharSelect();}
      else if(action==='help'||action==='credits'){
        this.wipeArmed=false;SF.audio.sfx.select();
        this.showHelp=action==='help';this.showCredits=action==='credits';
      }else if(action==='wipe'){
        if(!this.wipeArmed){this.wipeArmed=true;this.wipeArmT=3;SF.audio.sfx.uiTick();return;}
        this.wipeArmed=false;
        SF.save.reset().then(()=>{this.notice='存档已重置';this.noticeT=3;}).catch(()=>{this.notice='重置失败，请重试';this.noticeT=3;});
        SF.audio.sfx.cancel();
      }
    }
    draw(ctx) {
      const pal=SF.palette,R=SF.renderer;
      // 右侧静谧行星、轨道仪与授权战机，保留左侧文字的留白。
      R.glowScreen(353,117,180,'nebulaBlue',0.38);
      SF.world.drawPlanet(ctx,354,112,84,0.95);
      ctx.save();ctx.translate(354,119);ctx.rotate(-0.38);
      ctx.strokeStyle=pal.css('metalLight',0.23);ctx.lineWidth=0.55;
      ctx.beginPath();ctx.ellipse(0,0,109,38,0,0,Math.PI*2);ctx.stroke();
      ctx.strokeStyle=pal.css('uiAccent',0.3);ctx.beginPath();ctx.ellipse(0,0,111,39,0,0.3,1.65);ctx.stroke();ctx.restore();
      ctx.strokeStyle=pal.css('metalLight',0.15);ctx.lineWidth=0.5;
      ctx.beginPath();ctx.moveTo(257,214);ctx.lineTo(291,214);ctx.lineTo(308,197);ctx.stroke();
      SF.font.drawText(ctx,'SECTOR 07 / 星穹边境',260,222,{size:6,color:'uiDim'});
      SF.font.drawText(ctx,'航行许可  /  ACTIVE',448,28,{size:6,color:'uiDim',align:'right'});
      SF.font.drawText(ctx,'✦',30,23,{size:13,color:'uiAccent'});
      SF.font.drawText(ctx,'STARFALL  /  深空航行计划',48,28,{size:7,color:'silver',weight:'600'});
      SF.font.drawText(ctx,'星穹幸存者',29,65,{size:29,color:'white',weight:'650'});
      SF.font.drawText(ctx,'S T A R F A L L   S U R V I V O R S',31,104,{size:6.5,color:'uiAccent'});
      SF.font.drawText(ctx,'穿越星海，在最后一刻成为传奇。',31,122,{size:8.5,color:'uiDim'});
      // 大比例预览直接使用游戏中的同一张美术，避免展示与实机不一致。
      const bob=Math.sin(this.t*1.2)*2;
      R.glowScreen(353,167+bob,44,'fire1',0.14);
      SF.sprites.draw(ctx,'player_vega',354,160+bob,78,-0.22);
      for(let i=0;i<MENU_ACTIONS.length;i++){
        const b=MENU_ACTIONS[i],hover=this.hoverAct===b.act || (!this.hoverAct&&this.sel===i);
        if(b.act==='wipe'){
          SF.font.drawText(ctx,this.noticeT>0?this.notice:this.wipeArmed?'再点一次确认重置':'重置存档',106,b.y+3,
            {size:6.8,color:this.wipeArmed?'uiWarn':hover?'silver':'uiDim',align:'center'});
          if(hover){ctx.fillStyle=pal.css('uiLine',0.7);ctx.fillRect(79,b.y+14,54,0.5);}
        }else SF.widgets.button(ctx,b.x,b.y,b.w,b.h,b.label,{hovered:hover,primary:b.act==='start',small:b.act!=='start'});
      }
      ctx.strokeStyle=pal.css('uiLine',0.55);ctx.lineWidth=0.5;ctx.beginPath();ctx.moveTo(30,239);ctx.lineTo(450,239);ctx.stroke();
      const p=SF.save.profile;
      const best = p ? Math.max(...Object.values(p.bestScores || { normal: p.bestScore || 0 })) : 0;
      SF.font.drawText(ctx,p?'星尘 '+p.currency+'     最高分 '+Math.floor(best)+'     航行 '+p.totalRuns+' 次':'星穹导航系统就绪',30,249,{size:6.5,color:'uiDim'});
      SF.font.drawText(ctx,'↑↓ 选择 · Enter 确认 · M 静音',450,249,{size:6.5,color:'uiDim',align:'right'});

      if(this.showHelp||this.showCredits){
        ctx.fillStyle=pal.css('bg0',0.8);ctx.fillRect(0,0,480,270);
        SF.widgets.panel(ctx,67,39,346,191,{alpha:0.99,accent:true});
        SF.widgets.button(ctx,388,43,20,18,'×',{small:true});
        SF.font.drawText(ctx,this.showCredits?'美术鸣谢':'飞行手册',86,56,{size:17,color:'white',weight:'600'});
        SF.font.drawText(ctx,this.showCredits?'ART & LICENSES':'FLIGHT MANUAL',86,81,{size:6,color:'uiAccent'});
        const lines=this.showCredits?[
          '舰体、空间站与行星：MillionthVector',
          '授权：Creative Commons Attribution 4.0',
          'millionthvector.blogspot.com/p/free-sprites.html',
          'creativecommons.org/licenses/by/4.0/',
          '本作调整：调色、尺寸、机体外翼与装甲改装。',
          '引擎光效、护盾与 Boss 动态效果由游戏叠加。',
          '完整素材来源与授权见 assets/CREDITS.md。',
        ]:[
          'WASD / 方向键 移动 · 武器自动开火',
          '电磁炮：鼠标点击发射；磁暴满仓合成一炮',
          'Tab 专精矩阵 · P 暂停 · M 静音',
          '选卡：数字 1–4，或 ← → 与 Enter',
          '机库：B 查看特性 · U 进入工坊',
          '焰锋：热量 15 格后按空格开启超载',
          '满级武器 + 对应被动 Lv.3 可进化',
          '04:00 湮灭之眼     /     08:00 深渊君王',
        ];
        lines.forEach((line,i)=>SF.font.drawText(ctx,line,86,101+i*(this.showCredits?15:13),{size:8,color:i===0?'uiText':'uiDim'}));
        SF.font.drawText(ctx,'Enter / Esc 返回',392,213,{size:7,color:'uiAccent',align:'right'});
      }
    }
  }

  // ============ 角色选择 ============
  class CharSelect {
    constructor(game) {
      this.game = game;
      this.sel = 0;
      this.ids = Object.keys(SF.characters);
      this.diffIdx = 1; // 默认正常
      this.diffIds = ['easy', 'normal', 'hard'];
      this.showPassive = false; // 左上角「被」按钮：查看当前选中角色被动
    }

    update(dt) {
      const input = SF.input;
      const W = SF.renderer.width, H = SF.renderer.height;
      if (input.isPressed('left')) { this.sel = (this.sel + this.ids.length - 1) % this.ids.length; SF.audio.sfx.uiTick(); }
      if (input.isPressed('right')) { this.sel = (this.sel + 1) % this.ids.length; SF.audio.sfx.uiTick(); }
      if (input.isPressed('details')) { this.showPassive = !this.showPassive; SF.audio.sfx.select(); }
      if (this.showPassive) {
        const m = this.game.mouse;
        const close = this._passiveCloseBounds && inside(m,this._passiveCloseBounds);
        const outside = this._passiveBounds && !inside(m,this._passiveBounds);
        if (input.isPressed('cancel') || input.isPressed('confirm') || (m.clicked && (close || outside))) {
          this.showPassive=false;SF.audio.sfx.cancel();
        }
        return;
      }
      if (input.isPressed('workshop')) { this.done = true; this.game.openWorkshop(this.ids[this.sel]); return; }
      if (input.isPressed('cancel')) {
        if (this.showPassive) { this.showPassive = false; SF.audio.sfx.cancel(); return; }
        this.done = true; this.game.openMenu(); SF.audio.sfx.cancel(); return;
      }
      if (input.isPressed('confirm')) { this.launch(); return; }
      // 上下切换难度
      if (input.isPressed('up')) { this.diffIdx = (this.diffIdx + 2) % 3; SF.audio.sfx.uiTick(); }
      if (input.isPressed('down')) { this.diffIdx = (this.diffIdx + 1) % 3; SF.audio.sfx.uiTick(); }
      // 鼠标（坐标由 engine 持续注入 game.mouse）
      const m = this.game.mouse || { x: -99, y: -99, clicked: false };
      if (m.clicked && inside(m, {x:430,y:8,w:42,h:18})) { this.done=true; this.game.openMenu(); return; }
      // 被动按钮（屏幕左上角）
      this.hoverPassive = m.x > 8 && m.x < 30 && m.y > 8 && m.y < 26;
      const cw = 92, ch = 120, gap = 14;
      const x0 = W / 2 - (this.ids.length * cw + (this.ids.length - 1) * gap) / 2;
      const y0 = H / 2 - ch / 2;
      this.hover = -1;
      this.hoverWorkshop = -1;
      for (let i = 0; i < this.ids.length; i++) {
        const x = x0 + i * (cw + gap);
        if (m.x > x && m.x < x + cw && m.y > y0 && m.y < y0 + ch) this.hover = i;
        // 工坊小按钮（卡右上角）
        const wx = x + cw - 20, wy = y0 + 2;
        if (m.x > wx && m.x < wx + 18 && m.y > wy && m.y < wy + 18) this.hoverWorkshop = i;
      }
      // 难度徽标点击
      const dw = 52, dgap = 8;
      const dx0 = W / 2 - (3 * dw + 2 * dgap) / 2;
      const dy = H - 52;
      this.hoverDiff = -1;
      for (let i = 0; i < 3; i++) {
        const x = dx0 + i * (dw + dgap);
        if (m.x > x && m.x < x + dw && m.y > dy && m.y < dy + 16) this.hoverDiff = i;
      }
      if (m.clicked) {
        if (this.hoverPassive) {
          this.showPassive = !this.showPassive;
          SF.audio.sfx.select();
          return;
        }
        if (this.hoverWorkshop >= 0) {
          SF.audio.sfx.select();
          this.done = true;
          this.game.openWorkshop(this.ids[this.hoverWorkshop]);
          return;
        }
        if (this.hoverDiff >= 0) {
          this.diffIdx = this.hoverDiff;
          SF.audio.sfx.uiTick();
        } else if (this.hover >= 0) {
          this.sel = this.hover;
          SF.audio.sfx.uiTick();
          return;
        }
      }
    }

    launch() {
      SF.audio.sfx.confirm();
      const id = this.ids[this.sel];
      this.done = true;
      this.game.startRun(id, this.diffIds[this.diffIdx]);
    }

    drawPassivePanel(ctx) {
      const c = SF.characters[this.ids[this.sel]];
      const pw = 312, px = 84;
      const lines = SF.font.wrapText(ctx, c.passive.desc, pw - 44, 8.5);
      const ph = Math.max(113, 90 + lines.length * 12);
      const py = Math.max(10,(SF.renderer.height-ph)/2);
      this._passiveBounds={x:px,y:py,w:pw,h:ph};
      this._passiveCloseBounds={x:px+pw-27,y:py+8,w:19,h:18};
      ctx.fillStyle=SF.palette.css('bg0',0.8);ctx.fillRect(0,0,480,270);
      SF.widgets.panel(ctx, px, py, pw, ph, { alpha: 1, accent: true });
      SF.sprites.draw(ctx,'player_'+c.id,px+30,py+30,c.id==='dawn'?46:37);
      SF.font.drawText(ctx, 'CHARACTER TRAIT / '+c.name, px+59, py+12, {size:6,color:'uiAccent'});
      SF.font.drawText(ctx, c.passive.name, px+59, py+27, {size:15,color:'white',weight:'600'});
      const close=this._passiveCloseBounds;
      SF.widgets.button(ctx,close.x,close.y,close.w,close.h,'×',{small:true});
      let ly = py + 58;
      for (const ln of lines) {
        SF.font.drawText(ctx, ln, px + 22, ly, { size: 8.5, color: 'uiText' });
        ly += 12;
      }
      SF.font.drawText(ctx,'←→ 查看其它角色 · B / Enter / Esc 收起',px+pw/2,py+ph-16,{size:6.8,color:'uiDim',align:'center'});
    }

    draw(ctx) {
      const R = SF.renderer;
      const W = R.width, H = R.height;
      const pal = SF.palette;
      SF.font.drawText(ctx, 'H A N G A R  /  选择战机', W / 2, 21, { size: 7, color: 'uiAccent', align: 'center' });
      SF.font.drawText(ctx, '你的下一次远征，从这里开始', W / 2, 42, { size: 15, color: 'white', align: 'center', weight: '600' });
      SF.widgets.button(ctx,430,8,42,18,'返回',{small:true});

      // 被动查看按钮（左上角）
      SF.widgets.button(ctx, 8, 8, 22, 18, '被', { hovered: this.hoverPassive || this.showPassive, small: true });

      const cw = 92, ch = 120, gap = 14;
      const x0 = W / 2 - (this.ids.length * cw + (this.ids.length - 1) * gap) / 2;
      const y0 = H / 2 - ch / 2;
      for (let i = 0; i < this.ids.length; i++) {
        const id = this.ids[i];
        const c = SF.characters[id];
        const x = x0 + i * (cw + gap);
        const sel = i === this.sel;
        SF.widgets.panel(ctx, x, y0, cw, ch, { alpha: sel ? 0.97 : 0.8, accent: sel });
        if (sel) {
          ctx.strokeStyle = pal.css('uiAccent');
          ctx.strokeRect(x + 0.5, y0 + 0.5, cw - 1, ch - 1);
        }
        // 每个角色使用独立授权舰体与专属配色，机库、实战共享同一美术。
        SF.font.drawText(ctx, '0' + (i + 1), x + 8, y0 + 7, {size: 6, color: 'uiDim'});
        R.glowScreen(x + cw / 2, y0 + 34, 34, c.color, sel ? 0.32 : 0.12);
        ctx.strokeStyle = pal.css(c.color, 0.18); ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.ellipse(x + cw/2, y0 + 48, 23, 6, 0, 0, Math.PI*2); ctx.stroke();
        const hullSize = id === 'dawn' ? (sel ? 51 : 47) : (sel ? 41 : 37);
        SF.sprites.draw(ctx, 'player_' + id, x + cw/2, y0 + 29, hullSize);
        SF.font.drawText(ctx, c.name, x + cw / 2, y0 + 58, { size: 12, color: sel ? 'white' : 'uiText', align: 'center' });
        SF.font.drawText(ctx, c.title, x + cw / 2, y0 + 74, { size: 7, color: c.color, align: 'center' });
        // 属性简报（含工坊加成）：只展示生命 / 速度 / 伤害倍率（生命 = 基础 × (1 + 10%×级)）
        const upg = (SF.save.profile && SF.save.profile.charUpgrades && SF.save.profile.charUpgrades[id]) || {};
        const upHp = c.bonus.maxHp * (upg.hp || 0) * c.upgradeStats.hp.per;
        const upSpd = (upg.speed || 0) * c.upgradeStats.speed.per;
        SF.font.drawText(ctx, `生命 ${Math.round(c.bonus.maxHp + upHp)}  速度 ${c.bonus.speed + upSpd}`, x + cw / 2, y0 + 88, { size: 8, color: 'uiDim', align: 'center' });
        SF.font.drawText(ctx, `伤害 ×${((c.dmgMul || 1) * (1 + (upg.dmg || 0) * c.upgradeStats.dmg.per)).toFixed(2)}`, x + cw / 2, y0 + 98, { size: 8, color: 'gold', align: 'center' });
        // 工坊等级总览（含初始武器强化）
        const keys = Object.keys(c.upgradeStats);
        const totalLv = keys.reduce((sum,key)=>sum+Math.min(upg[key]||0,SF.save.upgradeCap(key)),0);
        const maxLv = keys.reduce((sum,key)=>sum+SF.save.upgradeCap(key),0);
        SF.font.drawText(ctx, `工坊 Lv.${totalLv}/${maxLv}`, x + cw / 2, y0 + 108, { size: 7, color: totalLv > 0 ? 'gold' : 'uiDim', align: 'center' });
        // 工坊按钮（卡右上角）
        const hov = this.hoverWorkshop === i;
        SF.widgets.button(ctx, x + cw - 20, y0 + 2, 18, 18, '工', { hovered: hov, small: true });
      }

      // ---- 难度徽标 ----
      const dw = 52, dgap = 8;
      const dx0 = W / 2 - (3 * dw + 2 * dgap) / 2;
      const dy = H - 52;
      const diffMeta = [
        { name: '简单', col: 'hero1', desc: '敌 75% · 分尘 60%' },
        { name: '正常', col: 'uiText', desc: '标准体验' },
        { name: '困难', col: 'uiWarn', desc: '敌 125% · 分尘 150%' },
      ];
      for (let i = 0; i < 3; i++) {
        const x = dx0 + i * (dw + dgap);
        const on = i === this.diffIdx;
        SF.widgets.button(ctx, x, dy, dw, 16, diffMeta[i].name, { hovered: this.hoverDiff === i || on, small: true });
        if (on) {
          ctx.strokeStyle = pal.css('uiAccent');
          ctx.strokeRect(x + 0.5, dy + 0.5, dw - 1, 15);
          SF.font.drawText(ctx, diffMeta[i].desc, x + dw / 2, dy + 24, { size: 7, color: 'uiDim', align: 'center' });
        }
      }

      SF.font.drawText(ctx, '←→ 选机 · ↑↓ 难度 · B 特性 · U 工坊 · Enter 出击 · Esc 返回', W / 2, H - 12, { size: 7, color: 'uiDim', align: 'center' });
      if (this.showPassive) this.drawPassivePanel(ctx);
    }
  }

  // ============ 装甲工坊（局外升级） ============
  class WorkshopPanel {
    constructor(game, charId) {
      this.game = game;
      this.charId = charId;
      this.char = SF.characters[charId];
      this.keys = Object.keys(this.char.upgradeStats); // hp / speed / dmg
      this.busy = false; // 防连点
      this.msg = null;
      this.msgT = 0;
    }

    update(dt) {
      const input = SF.input;
      if (this.msgT > 0) this.msgT -= dt;
      if (input.isPressed('cancel')) {
        this.done = true;
        SF.audio.sfx.cancel();
        this.game.openCharSelect();
        return;
      }
      // 数字键购买（含第 4 行「初始武器」= slot4）
      for (let i = 0; i < this.keys.length; i++) {
        if (input.isPressed('slot' + (i + 1))) this.buy(i);
      }
      // 鼠标
      const m = this.game.mouse || { x: -99, y: -99, clicked: false };
      const W = SF.renderer.width;
      const rw = 300;
      const rx = W / 2 - rw / 2, ry = 20;
      if (m.clicked && inside(m, {x:400,y:20,w:64,h:20})) { this.done=true; this.game.openCharSelect(); return; }
      this.hoverBuy = -1;
      const rowY0 = ry + 62, rowH = 30;
      for (let i = 0; i < this.keys.length; i++) {
        const by = rowY0 + i * rowH + 4;
        const bx = rx + rw - 74;
        if (m.x > bx && m.x < bx + 66 && m.y > by && m.y < by + 22) this.hoverBuy = i;
      }
      if (m.clicked && this.hoverBuy >= 0 && !this.busy) this.buy(this.hoverBuy);
    }

    async buy(i) {
      if (this.busy || this.done) return;
      const key = this.keys[i];
      const p = SF.save.profile;
      const lv = (p.charUpgrades[this.charId] && p.charUpgrades[this.charId][key]) || 0;
      if (lv >= SF.save.upgradeCap(key)) { this.msg = '已满级'; this.msgT = 1.2; SF.audio.sfx.cancel(); return; }
      const cost = SF.config.UPGRADE_COSTS[lv];
      if (p.currency < cost) { this.msg = '星尘不足'; this.msgT = 1.2; SF.audio.sfx.cancel(); return; }
      this.busy = true;
      try {
        const ok = await SF.save.buyCharUpgrade(this.charId, key);
        if (ok) {
          this.msg = '升级成功！'; this.msgT = 1.2;
          SF.audio.sfx.evolve();
          SF.particles.burst(SF.renderer.cam.x, SF.renderer.cam.y, { color: 'gold', count: 10, speed: 60, life: 0.4 });
        } else {
          this.msg = '购买失败'; this.msgT = 1.2;
        }
      } catch (error) {
        console.warn('[save] upgrade failed', error);
        this.msg = '保存失败，未扣费，请重试'; this.msgT = 3;
      } finally {
        this.busy = false;
      }
    }

    draw(ctx) {
      const R = SF.renderer;
      const W = R.width;
      const pal = SF.palette;
      const p = SF.save.profile;
      const upg = (p.charUpgrades && p.charUpgrades[this.charId]) || {};
      const c = this.char;

      const rw = 300, rh = 200;
      const rx = W / 2 - rw / 2, ry = 20;
      SF.widgets.panel(ctx, rx, ry, rw, rh, { alpha: 0.97, accent: true });
      SF.widgets.button(ctx,400,20,64,20,'返回机库',{small:true});
      R.glowScreen(44,128,45,c.color,0.35);
      SF.sprites.draw(ctx,'player_'+this.charId,44,122,57);

      SF.font.drawText(ctx, `装 甲 工 坊 — ${c.name}`, W / 2, ry + 14, { size: 13, color: 'white', align: 'center' });
      SF.font.drawText(ctx, `持有星尘 ✦ ${p.currency}`, W / 2, ry + 30, { size: 9, color: 'starDust', align: 'center' });

      const rowY0 = ry + 62, rowH = 30;
      for (let i = 0; i < this.keys.length; i++) {
        const key = this.keys[i];
        const meta = c.upgradeStats[key];
        const cap = SF.save.upgradeCap(key);
        const lv = Math.min(upg[key] || 0, cap);
        const y = rowY0 + i * rowH;
        // 属性行
        SF.font.drawText(ctx, meta.name, rx + 12, y + 2, { size: 9, color: 'uiText' });
        // 当前值 → 下一级值
        let curTxt, nextTxt;
        if (key === 'hp') {
          // 生命百分比制：每级 +10% 基础生命
          curTxt = `${Math.round(c.bonus.maxHp * (1 + lv * meta.per))} HP`;
          nextTxt = lv < cap ? `→ ${Math.round(c.bonus.maxHp * (1 + (lv + 1) * meta.per))}` : 'MAX';
        } else if (key === 'speed') {
          curTxt = `${c.bonus.speed + lv * meta.per} SPD`;
          nextTxt = lv < cap ? `→ ${c.bonus.speed + (lv + 1) * meta.per}` : 'MAX';
        } else if (key === 'weapon') {
          curTxt = `入场 Lv.${SF.Player.startingWeaponLevel(lv)}`;
          nextTxt = lv < cap ? `→ 入场 Lv.${SF.Player.startingWeaponLevel(lv + 1)}` : 'MAX';
        } else {
          curTxt = `+${Math.round(lv * meta.per * 100)}% 伤害`;
          nextTxt = lv < cap ? `→ +${Math.round((lv + 1) * meta.per * 100)}%` : 'MAX';
        }
        SF.font.drawText(ctx, curTxt, rx + 78, y + 2, { size: 7.5, color: 'uiAccent' });
        SF.font.drawText(ctx, nextTxt, rx + 139, y + 2, { size: 7.5, color: lv < cap ? 'starDust' : 'uiDim' });
        // 等级条（ghost 显示下一级进度）
        const bpct = lv / cap;
        const gpct = Math.min(1, (lv + 1) / cap);
        SF.widgets.bar(ctx, rx + 12, y + 18, 150, 3, bpct, 'gold', { showGhost: true, ghostPct: gpct });
        SF.font.drawText(ctx, `${lv}/${cap}`, rx + 166, y + 12, { size: 8, color: 'uiDim' });
        // 购买按钮
        const bx = rx + rw - 74, by = y + 4;
        const cost = lv < cap ? SF.config.UPGRADE_COSTS[lv] : null;
        const label = cost !== null ? `✦${cost}` : '满级';
        const canBuy = cost !== null && p.currency >= cost;
        SF.widgets.button(ctx, bx, by, 66, 22, label, { hovered: this.hoverBuy === i && canBuy });
        if (cost !== null && !canBuy) {
          ctx.fillStyle = pal.css('bg0', 0.55);
          ctx.fillRect(bx + 1, by + 1, 64, 20);
        }
        // 快捷键
        SF.font.drawText(ctx, `${i + 1}`, bx - 10, by + 6, { size: 8, color: 'uiDim' });
      }

      // 提示
      SF.font.drawText(ctx, this.msgT > 0 && this.msg ? this.msg : '1 / 2 / 3 / 4 购买 · Esc 返回 · 初始武器最高 Lv.6', W / 2, ry + rh - 12, {
        size: 7, color: this.msgT > 0 ? 'gold' : 'uiDim', align: 'center',
      });
    }
  }

  // ============ 暂停 ============
  class PauseMenu {
    constructor(game) { this.game = game; }
    update(dt) {
      const m = this.game.mouse;
      this.hoverResume = inside(m, {x:158,y:139,w:164,h:26});
      this.hoverMap = inside(m, {x:158,y:176,w:164,h:22});
      if (SF.input.isPressed('starmap') || (m.clicked && this.hoverMap)) { this.game.openStarMap(); return; }
      if (SF.input.isPressed('pause') || SF.input.isPressed('cancel') || SF.input.isPressed('confirm') || (m.clicked && this.hoverResume)) { this.done = true; SF.audio.sfx.cancel(); }
    }
    draw(ctx) {
      const R = SF.renderer;
      const W = R.width, H = R.height;
      ctx.fillStyle = SF.palette.css('bg0', 0.7);
      ctx.fillRect(0, 0, W, H);
      SF.widgets.panel(ctx,134,62,212,158,{accent:true});
      SF.font.drawText(ctx, 'FLIGHT PAUSED', W/2, 79, {size: 6.5, color: 'uiAccent', align: 'center'});
      SF.font.drawText(ctx, '航行已暂停', W / 2, 99, { size: 20, color: 'white', align: 'center', weight: '600' });
      SF.widgets.button(ctx,158,139,164,26,'继续航行',{hovered:this.hoverResume,primary:true});
      SF.widgets.button(ctx,158,176,164,22,'专精矩阵 · Tab',{hovered:this.hoverMap});
      SF.font.drawText(ctx, 'P / Enter / Esc 返回战斗', W/2, 208, {size: 6, color: 'uiDim', align: 'center'});
    }
  }

  // ============ 结算 ============
  class ResultScreen {
    constructor(game, victory) {
      this.game = game;
      this.victory = victory;
      this.t = 0;
      const rs = game.runStats;
      this.score = game.score;
      this.newBest = this.score > (SF.save.profile?.bestScores?.[game.difficultyId || 'normal'] || 0);
      this.rows = [
        ['难度', `${game.difficulty ? game.difficulty.name : '正常'}`],
        ['存活时间', `${Math.floor(game.time)} 秒`],
        ['击杀数', `${rs.kills}`],
        ['造成伤害', `${Math.round(rs.damage)}`],
        ['达成等级', `Lv.${game.level}`],
        ['星尘收益', `${game.dustReward()}`],
        ['最终评分', `${Math.floor(this.score).toLocaleString('en-US')}`],
      ];
      // 保留结算快照，落盘失败后重试同一份记录；不能重复计入或提前离开丢失收益。
      this.run = {
        score: this.score, time: game.time, kills: rs.kills, damage: rs.damage,
        dustEarned: game.dustReward(), victory, difficulty: game.difficultyId || 'normal',
      };
      this.saveState = 'pending';
      if (victory) SF.audio.sfx.victory(); else SF.audio.sfx.defeat();
    }

    async persistRun() {
      if (this.saveState === 'saving' || this.saveState === 'saved') return;
      this.saveState = 'saving';
      try {
        await SF.save.recordRun(this.run);
        this.saveState = 'saved';
      } catch (error) {
        console.warn('[save] run failed', error);
        this.saveState = 'failed';
      }
    }

    update(dt) {
      this.t += dt;
      // 延迟落库
      if (this.saveState === 'pending' && this.t > 0.5) this.persistRun();
      const m = this.game.mouse;
      if (this.t > 1 && (SF.input.isPressed('confirm') || (m?.clicked && inside(m, {x:165,y:233,w:150,h:24})))) {
        if (this.saveState === 'failed') this.persistRun();
        else if (this.saveState === 'saved') {
          this.done = true;
          this.game.openMenu();
        }
      }
    }

    draw(ctx) {
      const R = SF.renderer;
      const W = R.width, H = R.height;
      const pal = SF.palette;
      ctx.fillStyle = pal.css('bg0', 0.82);
      ctx.fillRect(0, 0, W, H);

      const title = this.victory ? '✦ 胜 利 ✦' : '征 程 终 焉';
      const tcol = this.victory ? 'gold' : 'uiWarn';
      const k = SF.util.ease.outCubic(Math.min(1, this.t / 0.6));
      SF.font.drawText(ctx, 'FLIGHT REPORT / 航行记录', W/2, 21, {size: 6.5, color: 'uiDim', align: 'center'});
      SF.font.drawText(ctx, title, W / 2, 39 + (1 - k) * 8, { size: 24, color: tcol, align: 'center', alpha: clamp(k * 2, 0, 1), weight: '600' });
      SF.font.drawText(ctx, this.victory ? '深渊君王已陨落，星穹为你闪耀' : '星海无情，下次再来',
        W / 2, 70, { size: 8, color: 'uiDim', align: 'center' });

      const pw = 230;
      SF.widgets.panel(ctx, W / 2 - pw / 2, 89, pw, this.rows.length * 14 + 16, {line: tcol});
      let y = 98;
      for (const [k2, v] of this.rows) {
        SF.font.drawText(ctx, k2, W / 2 - pw / 2 + 14, y, { size: 8, color: 'uiDim' });
        SF.font.drawText(ctx, v, W / 2 + pw / 2 - 14, y, { size: 8, color: k2 === '最终评分' ? 'gold' : 'uiText', align: 'right' });
        y += 14;
      }

      if (this.saveState === 'failed') {
        SF.font.drawText(ctx, '保存失败，记录保留在本页，请重试', W / 2, 215, { size: 7, color: 'uiWarn', align: 'center' });
      } else if (this.newBest && this.t > 0.8) {
        SF.font.drawText(ctx, '✦ 创下新的航行纪录', W / 2, 210, { size: 8, color: 'starDust', align: 'center' });
      }

      if (this.t > 1) {
        const label = this.saveState === 'failed' ? '重试保存 · Enter' : this.saveState === 'saved' ? '返回星港 · Enter' : '正在保存…';
        SF.widgets.button(ctx,165,233,150,24,label,{hovered:inside(this.game.mouse,{x:165,y:233,w:150,h:24}),primary:true});
      }
    }
  }

  SF.menus = { MainMenu, CharSelect, PauseMenu, ResultScreen, WorkshopPanel };
})();
