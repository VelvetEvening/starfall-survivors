/* ============================================================
 * game.js — 游戏状态机 + 一局的主循环逻辑
 * 状态：menu / charSelect / playing / levelup / starmap / pause / result
 * ============================================================ */
(function () {
  'use strict';
  const SF = (window.SF = window.SF || {});
  const { TAU } = SF.util;

  class Game {
    constructor() {
      this.state = 'boot';
      this.panel = null;      // 当前 UI 面板（菜单/升级/专精矩阵/结算）
      this.mouse = { x: -99, y: -99, clicked: false };
    }

    // ---------- 状态切换 ----------
    openMenu() {
      SF.widgets.clearToasts?.();
      SF.particles.clear();
      SF.bossVisuals?.reset();
      this.state = 'menu';
      this.panel = new SF.menus.MainMenu(this);
      SF.audio.playMusic('menu');
    }
    openCharSelect() {
      this.state = 'charSelect';
      this.panel = new SF.menus.CharSelect(this);
    }
    openWorkshop(charId) {
      this.state = 'workshop';
      this.panel = new SF.menus.WorkshopPanel(this, charId);
    }
    startRun(charId, difficultyId) {
      this.reset(charId, difficultyId);
      this.state = 'playing';
      this.panel = null;
      SF.audio.playMusic('battle');
    }
    openLevelUp(kind = 'level', choices = null) {
      this.state = 'levelup';
      this.panel = new SF.LevelUpPanel(this, kind, choices);
    }
    openStarMap() {
      if (this.state !== 'playing' && this.state !== 'pause') return;
      this._prevPause = this.state === 'pause';
      this.state = 'starmap';
      this.panel = new SF.StarMapPanel(this);
    }
    openPause() {
      if (this.state !== 'playing') return;
      this.state = 'pause';
      this.panel = new SF.menus.PauseMenu(this);
    }
    openResult(victory) {
      this.state = 'result';
      this.panel = new SF.menus.ResultScreen(this, victory);
      SF.audio.stopMusic();
    }

    // ---------- 一局初始化 ----------
    reset(charId, difficultyId) {
      this.time = 0;            // 真实时钟（动画/节流用）
      this.runTime = 0;         // 倒计时时钟（BOSS 战暂停）
      this.difficulty = SF.config.DIFFICULTIES[difficultyId] || SF.config.DIFFICULTIES.normal;
      this.difficultyId = this.difficulty.id;
      this.level = 1;
      this.xp = 0;
      this.xpNext = this.xpForLevel(2);
      this.score = 0;
      this.boss = null;
      this.bossKilledThisRun = 0;  // 双 BOSS 胜利计数
      this.lightning = [];      // BOSS 激光与天罚光束的渐隐线段
      this.runStats = { kills: 0, damage: 0, dustEarned: 0 };
      this.pendingLevelUps = 0;
      this._bossPhase = 0;
      this._victoryPending = undefined;
      this._boss1MobBoost = 0;   // BOSS1 击杀后的额外跳升
      // 小怪伤害成长：每分钟线性 +MOB_DAMAGE_PER_MIN（防后期高免伤刮痧）

      this.player = new SF.Player(charId);
      SF.renderer.cam.x = this.player.x;
      SF.renderer.cam.y = this.player.y;

      this.enemies = new SF.EnemyManager();
      this.spawner = new SF.Spawner(this);
      SF.projectiles.clear();
      SF.pickups.clear();
      SF.particles.clear();
      SF.world.setSeed(SF.waveSeed());
      SF.bossVisuals?.reset();
      SF.widgets.clearToasts?.();
    }

    xpForLevel(n) {
      return Math.round(SF.config.LEVEL_XP_BASE * Math.pow(SF.config.LEVEL_XP_GROWTH, n - 2));
    }

    // ---------- 事件回调 ----------
    gainXp(n) {
      const pl = this.player;
      // 保留小数经验，避免每颗低价值星尘都 Math.round 吞掉专精矩阵经验加成。
      n *= pl.stats.xpMul;
      this.xp += n;
      this.runStats.dustEarned += n; // 已拾取经验（含一次 xpMul；结算时不再重复乘）
      while (this.xp >= this.xpNext && this.level < SF.config.MAX_LEVEL) {
        this.xp -= this.xpNext;
        this.level++;
        this.score += SF.config.SCORE_PER_LEVEL;
        this.xpNext = this.xpForLevel(this.level + 1);
        pl.starPoints += SF.config.STARPOINT_PER_LEVEL;
        this.pendingLevelUps++;
      }
      // 满级后经验仍计入结算星尘，但不再无限堆积在升级条里。
      if (this.level >= SF.config.MAX_LEVEL) this.xp = 0;
      if (this.pendingLevelUps > 0 && this.state === 'playing') {
        this.openLevelUp();
      }
    }

    // 小怪接触伤害倍率（每分钟线性成长 + BOSS1 击杀跳升；精英与 BOSS 不吃成长）
    get mobDamageBoost() {
      const perMin = SF.config.MOB_DAMAGE_PER_MIN;
      const linear = 1 + (this.runTime / 60) * perMin;
      return linear + (this._boss1MobBoost || 0);
    }

    // 精英伤害倍率（BOSS1 击杀后整体提升：接触 + 弹幕；此前保持基础数值）
    get eliteDamageBoost() {
      return this.bossKilledThisRun >= 1 ? SF.config.ELITE_BOSS1_KILL_BOOST : 1;
    }

    // 小怪质量（实际基础血量倍率）：三档同为 ×3 开局，两段 smoothstep 成长。
    // BOSS1 存活期间停在第一段终点；击杀瞬间应用按难度缩放的离散跳跃。
    get mobHpMul() {
      const C = SF.config;
      const t = Math.min(this.runTime, C.RUN_DURATION);
      const boss1At = C.BOSS_SPAWN_AT[0];
      const start = C.MOB_HP_START_MUL;
      const refSpan = C.MOB_HP_REFERENCE_END_MUL - start;
      const end = this.difficulty.mobHpEndMul;
      const growthScale = (end - start) / refSpan;
      const beforeBoss = start + (C.MOB_HP_REFERENCE_BOSS1_MUL - start) * growthScale;
      const afterJump = beforeBoss + C.MOB_HP_REFERENCE_BOSS1_JUMP * growthScale;
      const smooth = x => {
        const k = Math.max(0, Math.min(1, x));
        return k * k * (3 - 2 * k);
      };
      const boss1Defeated = this.bossKilledThisRun >= 1;
      if (!boss1Defeated) return start + (beforeBoss - start) * smooth(t / boss1At);
      return afterJump + (end - afterJump) * smooth((t - boss1At) / (C.RUN_DURATION - boss1At));
    }

    // 一局结束时的星尘收益：已拾取经验 + 场上未拾取星尘按各自价值折算（结算前自动回收）+ 难度加成
    dustReward() {
      let groundXp = 0;
      let unclaimedChests = 0;
      for (const p of SF.pickups.list) {
        if (p.kind === 'dust') groundXp += (p.value || SF.config.DUST_XP);
        else if (p.kind === 'chest') unclaimedChests++;
      }
      const groundValue = groundXp * SF.config.DUST_XP_MUL * (this.player?.stats?.xpMul || 1);
      const chestComp = unclaimedChests * SF.config.CHEST_COMPENSATION_DUST;
      return Math.round((this.runStats.dustEarned + groundValue + chestComp) * this.difficulty.dustMul);
    }

    onEnemyKilled(e) {
      // BOSS 战环境波次只制造走位压力：不给经验、道具、分数或击杀统计，防止拖延刷收益。
      if (!e.noRewards) {
        this.runStats.kills++;
        this.score += SF.config.SCORE_PER_KILL * (e.def.elite ? 10 : 1) * this.difficulty.scoreMul;
        SF.pickups.onEnemyKilled(e, this);
      }
      if (e.isBoss) {
        this.bossKilledThisRun++;
        const isFinal = this.bossKilledThisRun >= SF.config.BOSS_SPAWN_AT.length;
        if (isFinal) {
          this.score += SF.config.SCORE_VICTORY;
        } else {
          this.score += SF.config.SCORE_BOSS1_KILL;
          this._boss1MobBoost = SF.config.MOB_BOSS1_KILL_BOOST; // 湮灭能量外泄：小怪跳变凶
          SF.widgets.toast('湮灭之眼已陨落！虚空能量外泄，小怪变得狂暴…', 4);
          SF.audio.playMusic('battle');
        }
        // 延迟 1.2s 进结算（让爆炸播完）；最终胜利才结算，首杀继续战斗
        if (isFinal) {
          this._victoryPending = 1.2; // 帧驱动倒计时（后台标签 setTimeout 被节流）
        }
      }
    }

    // 结算守卫：面板类状态（升级/专精矩阵）打开时延迟到其关闭
    _canSettle() {
      return this.state === 'playing' || this.state === 'pause' || this.state === 'levelup' || this.state === 'starmap';
    }

    openChest(x, y) {
      SF.particles.burst(x, y, { color: 'gold', count: 16, speed: 90, life: 0.6, size: 3 });
      SF.audio.sfx.chest();
      // 宝箱 = 必定超武进化（若可用）否则随机升级 1 次（精英频率翻倍后单宝箱只选一次）
      const pl = this.player;
      const evolutions = pl.weapons.filter(w => w.canEvolve(pl) && !pl.hasWeapon(w.def.evolveTo));
      if (evolutions.length) {
        const choices = evolutions.map(w => ({
          kind: 'evolve', ref: w, weight: 30,
          title: '✦ ' + SF.weapons[w.def.evolveTo].name,
          sub: '超武进化！' + w.def.name + ' → 觉醒',
          icon: SF.weapons[w.def.evolveTo].icon, color: 'gold',
        }));
        if (choices.length === 1) SF.progression.applyChoice(pl, this, choices[0]);
        else if (this.state === 'playing') this.openLevelUp('chest-evolve', choices);
      } else {
        // 随机升级 1 次（宝箱频率翻倍后单次收益下调）+ 专精点 +1
        pl.starPoints += 1;
        this.pendingLevelUps += 1;
        if (this.state === 'playing') this.openLevelUp('chest');
      }
    }

    // 输入帧收尾：键盘 pressed 与鼠标点击都只在逻辑步内消费一次。
    // 渲染帧可能在固定步长之间空转（高刷新率屏幕），点击若在渲染帧末清除会丢失。
    _endInput() {
      SF.input.endFrame();
      this.mouse.clicked = false;
    }

    // ---------- 主更新 ----------
    update(dt) {
      const input = SF.input;
      let st = this.state;
      SF.world.update(dt, SF.renderer.cam.x, SF.renderer.cam.y);
      SF.widgets.updateToasts(dt);
      if (st === 'menu' || st === 'charSelect' || st === 'workshop') SF.particles.update(dt);

      // 面板状态：更新面板（其内部决定 done；面板也可能在 update 中自行跳转）
      if (this.panel) {
        const panel = this.panel;
        if (!panel.done) panel.update(dt);
        if (panel.done) {
          const was = st;
          if (this.panel === panel) this.panel = null;
          if (was === 'levelup') {
            // 进化不消费升级次数；同帧拾取的经验可能已排入后续升级。
            if (panel.kind !== 'chest-evolve') this.pendingLevelUps--;
            if (this.pendingLevelUps > 0) this.openLevelUp();
            else this.state = 'playing';
          } else if (was === 'starmap') {
            this.state = this._prevPause ? 'pause' : 'playing';
            if (this._prevPause) this.panel = new SF.menus.PauseMenu(this);
          } else if (was === 'pause') {
            this.state = 'playing';
          }
          // menu/charSelect/result 的 done 已在其内部处理跳转（openXXX 已换上新 panel）
        } else {
          this._endInput();
          return;
        }
        this._endInput();
        return;
      }
      st = this.state;

      // 全局键
      if (st === 'playing') {
        if (input.isPressed('pause')) { this.openPause(); this._endInput(); return; }
        if (input.isPressed('starmap')) { this.openStarMap(); this._endInput(); return; }

        // ---- 战斗推进 ----
        this.time += dt;
        // 倒计时时钟：BOSS 存活时暂停（BOSS 战期间不再推进波次与计时）
        if (!(this.boss && !this.boss.dead)) this.runTime += dt;
        this.score += SF.config.SCORE_TIME_BONUS * dt;

        this.player.update(dt, this);
        this.spawner.update(dt);
        this.enemies.update(dt, this);
        // BOSS 专属 AI
        if (this.boss && !this.boss.dead) {
          SF.bossAI.updateBoss(this.boss, dt, this);
        }
        SF.projectiles.update(dt, this);
        SF.projectiles.updateFields(dt, this);
        SF.pickups.update(dt, this);
        SF.particles.update(dt);
        SF.bossVisuals?.update(dt, this);

        // 闪电衰减
        for (let i = this.lightning.length - 1; i >= 0; i--) {
          const l = this.lightning[i];
          l.t += dt;
          if (l.t >= l.life) this.lightning.splice(i, 1);
        }

        // 死亡
        if (this.player.dead) {
          this.openResult(false);
        }

        // 帧驱动胜利结算（BOSS2 死亡 1.2s 后；面板打开时顺延）
        if (this._victoryPending !== undefined) {
          this._victoryPending -= dt;
          if (this._victoryPending <= 0) {
            delete this._victoryPending;
            if (this._canSettle()) this.openResult(true);
          }
        }
      } else if (st === 'menu' || st === 'charSelect' || st === 'result' || st === 'pause' || st === 'levelup' || st === 'starmap' || st === 'workshop') {
        // 面板为空但状态还在（过渡帧）——仅更新背景
        SF.particles.update(dt);
      }
      this._endInput();
    }

    // ---------- 渲染 ----------
    draw(ctx) {
      const R = SF.renderer;
      const pal = SF.palette;

      // 世界背景（所有状态都画）
      SF.world.draw(ctx, R.cam.x, R.cam.y);

      if (this.state === 'menu' || this.state === 'charSelect' || this.state === 'workshop') {
        SF.particles.draw(ctx, pal);
        ctx = R.beginUI();
        if (this.panel) this.panel.draw(ctx);
        SF.widgets.drawToasts(ctx);
        return;
      }

      if (this.state === 'boot') return;

      // ---- 战斗世界 ----
      if (this.player) {
        SF.bossVisuals?.drawBackdrop(ctx, this);
        // 拾取物（底层）
        SF.pickups.draw(ctx);
        // 敌人
        this.enemies.draw(ctx);
        // 玩家
        if (!this.player.dead) this.player.draw(ctx);
        // 投射物
        SF.projectiles.draw(ctx);
        // 武器附加体（激光/卫星）
        for (const w of this.player.weapons) w.drawExtras(ctx);
        // BOSS 激光 / 天罚光束（渐隐线段，可自定义配色与宽度）
        for (const l of this.lightning) {
          const a = 1 - l.t / l.life;
          const bw = l.width || 0;
          ctx.strokeStyle = pal.css(l.color || 'bolt2', a);
          ctx.lineWidth = bw ? Math.max(2, bw * 0.5) : 1.5;
          ctx.beginPath();
          for (let i = 0; i < l.points.length; i++) {
            const s = R.toScreen(l.points[i].x, l.points[i].y);
            if (i === 0) ctx.moveTo(s.x, s.y);
            else ctx.lineTo(s.x, s.y);
          }
          ctx.stroke();
          ctx.strokeStyle = pal.css(l.color2 || 'bolt0', a * 0.4);
          ctx.lineWidth = bw || 3;
          ctx.stroke();
        }
        // BOSS 冲撞激光预警线（红色脉冲，站线上不动将被击中）
        if (this.boss && !this.boss.dead && this.boss._dashLaser && this.boss._dashLaser.stage === 'telegraph') {
          const L = this.boss._dashLaser;
          const b = R.toScreen(this.boss.x, this.boss.y);
          const pulse = 0.55 + 0.15 * Math.sin(this.time * 9);
          ctx.strokeStyle = pal.css('uiWarn', pulse);
          ctx.lineWidth = 1;
          for (let i = 0; i < L.dirs; i++) {
            const ang = L.base + (TAU / L.dirs) * i;
            ctx.beginPath();
            ctx.moveTo(b.x, b.y);
            ctx.lineTo(b.x + Math.cos(ang) * L.length, b.y + Math.sin(ang) * L.length);
            ctx.strokeStyle = pal.css('uiWarn', 0.065);
            ctx.lineWidth = L.width * 2;
            ctx.stroke();
            ctx.strokeStyle = pal.css('uiWarn', pulse);
            ctx.lineWidth = 0.65;
            ctx.stroke();
          }
        }
        // 粒子
        SF.particles.draw(ctx, pal);
        SF.bossVisuals?.drawOverlay(ctx, this);
        SF.projectiles.drawEnemyBullets(ctx);
        R.vignette(0.32);
      }

      // ---- HUD ----
      ctx = R.beginUI();
      if (this.state === 'playing' || this.state === 'pause') {
        SF.hud.draw(ctx, this);
      }

      // ---- 面板层 ----
      if (this.panel && this.state !== 'menu' && this.state !== 'charSelect' && this.state !== 'workshop') {
        this.panel.draw(ctx);
      }
      SF.widgets.drawToasts(ctx);
    }
  }

  SF.Game = Game;
})();
