/* ============================================================
 * spawner.js — 波次导演
 * 按时间加权随机出怪 + 周期环形爆发 + 精英时间点 + 双 BOSS 流程（4:00 / 8:00）
 * BOSS 战期间暂停常规出怪、环形怪潮和野生精英，改为每 30 秒从四周涌入无收益小怪。
 * ============================================================ */
(function () {
  'use strict';
  const SF = (window.SF = window.SF || {});
  const { TAU, rand } = SF.util;

  class Spawner {
    constructor(game) {
      this.game = game;
      this.spawnTimer = 1.2;      // 开局 1.2s 缓冲
      this.burstTimer = SF.config.WAVE_BURST_EVERY;
      this.eliteQueue = SF.config.ELITE_AT.slice();
      this.bossIdx = 0;           // 已触发 BOSS 计数（0/1/2）
      this.bossWarned = false;
      this.bossWaveTimer = SF.config.BOSS_WAVE_INTERVAL;
    }

    currentWeights(t) {
      const D = SF.waveDirector;
      let w = D[0].weights;
      for (const seg of D) if (t >= seg.from) w = seg.weights;
      return w;
    }

    spawnRate(t = this.game.runTime) {
      const C = SF.config;
      const k = Math.max(0, Math.min(1, t / C.RUN_DURATION));
      const smooth = k * k * (3 - 2 * k);
      return C.SPAWN_RATE_START + (C.SPAWN_RATE_END - C.SPAWN_RATE_START) * smooth;
    }

    pickEnemy(t) {
      const w = this.currentWeights(t);
      let total = 0;
      for (const k in w) total += w[k];
      let r = Math.random() * total;
      for (const k in w) {
        r -= w[k];
        if (r <= 0) return k;
      }
      return 'grub';
    }

    spawnOne() {
      const g = this.game;
      const t = g.runTime;
      const id = this.pickEnemy(t);
      const a = rand(TAU);
      const R = 320;
      const hpScale = g.mobHpMul;
      const spScale = Math.min(0.8, t * SF.config.ENEMY_SPEED_SCALE);
      g.enemies.spawnAt(id, g.player.x + Math.cos(a) * R, g.player.y + Math.sin(a) * R, hpScale, spScale);
    }

    spawnBurst() {
      const g = this.game;
      const t = g.runTime;
      const count = 10 + Math.floor(t / 60);
      const a0 = rand(TAU);
      const R = 300;
      const hpScale = g.mobHpMul;
      const spScale = Math.min(0.8, t * SF.config.ENEMY_SPEED_SCALE);
      for (let i = 0; i < count; i++) {
        const a = a0 + (TAU / count) * i;
        g.enemies.spawnAt(this.pickEnemy(t), g.player.x + Math.cos(a) * R, g.player.y + Math.sin(a) * R, hpScale, spScale);
      }
      SF.particles.ring(g.player.x, g.player.y, { color: 'enemy0', maxR: R, life: 0.8, width: 1.5 });
      SF.widgets.toast('怪潮来袭！');
    }

    spawnElite() {
      const g = this.game;
      const t = g.runTime;
      const id = t > 200 ? 'eliteCrab' : 'eliteGrub';
      const a = rand(TAU);
      // 精英血量 = 小怪曲线 × ELITE_HP_FACTOR（迷你 Boss 定位，不出现比 BOSS 还厚的血牛）
      const hpScale = g.mobHpMul * SF.config.ELITE_HP_FACTOR;
      const e = g.enemies.spawnAt(id, g.player.x + Math.cos(a) * 280, g.player.y + Math.sin(a) * 280, hpScale, 0.1);
      if (e) {
        SF.widgets.toast(`⚠ ${e.def.name} 出现！`);
        SF.audio.sfx.bossWarn();
      }
    }

    spawnBossWave() {
      const g = this.game;
      const C = SF.config;
      const finalBoss = g.boss?.def.id === 'boss2';
      const count = C.BOSS_WAVE_COUNTS[finalBoss ? 1 : 0];
      const a0 = rand(TAU);
      const R = C.BOSS_WAVE_RADIUS;
      const hpScale = g.mobHpMul;
      const spScale = Math.min(0.8, g.runTime * C.ENEMY_SPEED_SCALE);
      let spawned = 0;
      for (let i = 0; i < count; i++) {
        const a = a0 + (TAU / count) * i;
        const enemy = g.enemies.spawnAt(this.pickEnemy(g.runTime),
          g.player.x + Math.cos(a) * R, g.player.y + Math.sin(a) * R,
          hpScale, spScale, { noRewards: true, bossWave: true });
        if (enemy) spawned++;
      }
      if (spawned > 0) SF.widgets.toast('虚空援军从四周涌来！');
      return spawned;
    }

    bossActive() {
      const b = this.game.boss;
      return !!(b && !b.dead);
    }

    update(dt) {
      const g = this.game;
      const t = g.runTime;
      const C = SF.config;

      // ---- BOSS 流程（双 BOSS：4 分钟 / 8 分钟） ----
      const nextAt = C.BOSS_SPAWN_AT[this.bossIdx];
      if (nextAt !== undefined) {
        if (!this.bossWarned && !this.bossActive() && t >= nextAt - C.BOSS_INTRO_LEAD) {
          this.bossWarned = true;
          const isFinal = this.bossIdx === C.BOSS_SPAWN_AT.length - 1;
          SF.widgets.toast(isFinal ? '⚠⚠ 深渊君王·厄兆 降临 ⚠⚠' : '⚠⚠ 湮灭之眼 苏醒 ⚠⚠', 3);
          SF.audio.sfx.bossWarn();
        }
        if (t >= nextAt) {
          this.bossIdx++;
          this.bossWarned = false;
          const defId = this.bossIdx === 1 ? 'boss' : 'boss2';
          g.enemies.spawnBoss(g, defId);
          this.bossWaveTimer = C.BOSS_WAVE_INTERVAL;
          SF.audio.playMusic('boss', { final: this.bossIdx > 1 });
          return; // BOSS 出现帧不常规出怪
        }
      }

      if (this.bossActive()) {
        this.bossWaveTimer -= dt;
        if (this.bossWaveTimer <= 0) {
          this.bossWaveTimer += C.BOSS_WAVE_INTERVAL;
          this.spawnBossWave();
        }
      }

      // 常规出怪（BOSS 战期间停止，由独立无收益波次维持小怪压力）
      if (!this.bossActive()) {
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
          // 保留固定步长余量，避免每次重置舍掉时间造成长期出怪率偏低。
          this.spawnTimer += 1 / this.spawnRate(t);
          this.spawnOne();
        }
      }

      // 周期爆发（BOSS 战期间暂停，避免弹幕+怪潮双重压力失控）
      if (!this.bossActive()) {
        this.burstTimer -= dt;
        if (this.burstTimer <= 0) {
          this.burstTimer = C.WAVE_BURST_EVERY;
          this.spawnBurst();
        }
      }

      // 精英（BOSS 战期间暂停，恢复时不会补偿连发——冷却重置）
      if (!this.bossActive()) {
        while (this.eliteQueue.length && t >= this.eliteQueue[0]) {
          this.eliteQueue.shift();
          this.spawnElite();
        }
      }
    }
  }

  SF.Spawner = Spawner;
})();
