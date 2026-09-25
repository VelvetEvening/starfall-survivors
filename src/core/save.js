/* ============================================================
 * save.js — 数据层（DataLayer 接口）
 * 现实现：localStorage；未来：ServerLayer（见 docs/DEPLOY.md）
 * 所有持久化必须且只能通过本模块。
 * ============================================================ */
(function () {
  'use strict';
  const SF = (window.SF = window.SF || {});

  const KEY = 'starfall.profile.v1';

  // 默认存档结构
  function defaultProfile() {
    return {
      bestScore: 0,           // 兼容字段（迁移到 bestScores.normal）
      bestScores: { easy: 0, normal: 0, hard: 0 },  // 按难度分桶的最高分
      bestTime: 0,
      totalRuns: 0,
      bossKills: 0,
      currency: 0,          // 星尘货币（每局结算转化）
      unlockedChars: ['vega', 'firefly', 'dawn', 'thunder'],
      stats: { kills: 0, damage: 0 },
      // 局外工坊：三项属性各 5 级；weapon 购买 5 次入场 Lv.6。
      charUpgrades: {
        vega: { hp: 0, speed: 0, dmg: 0, weapon: 0 },
        firefly: { hp: 0, speed: 0, dmg: 0, weapon: 0 },
        dawn: { hp: 0, speed: 0, dmg: 0, weapon: 0 },
        thunder: { hp: 0, speed: 0, dmg: 0, weapon: 0 },
      },
    };
  }

  function migrate(data) {
    const d = Object.assign(defaultProfile(), data || {});
    d.stats = Object.assign(defaultProfile().stats, d.stats || {});
    d.bestScores = Object.assign(defaultProfile().bestScores, d.bestScores || {});
    // 仅无难度分桶的旧档需要迁移；新档 bestScore 是全难度最高分。
    if (!data?.bestScores && d.bestScore > d.bestScores.normal) d.bestScores.normal = d.bestScore;
    // charUpgrades 逐角色显式合并（浅合并会整块覆盖）
    const du = defaultProfile().charUpgrades;
    d.charUpgrades = d.charUpgrades || {};
    for (const cid of Object.keys(du)) {
      d.charUpgrades[cid] = Object.assign({}, du[cid], d.charUpgrades[cid] || {});
    }
    return d;
  }

  // ---- LocalStorage 实现 ----
  const LocalStorageLayer = {
    async load() {
      try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return defaultProfile();
        return migrate(JSON.parse(raw));
      } catch (e) {
        console.warn('[save] load failed, using default', e);
        return defaultProfile();
      }
    },
    async save(profile) {
      localStorage.setItem(KEY, JSON.stringify(profile));
    },
  };

  // 未来实现占位（示例见 docs/DEPLOY.md）
  // const ServerLayer = { load: ..., save: ... };

  let layer = LocalStorageLayer;
  let cache = null;
  let loading = null;
  let pending = Promise.resolve();

  // 所有写入排队：持久化成功才提交缓存，失败不扣款、不清档，也不阻塞后续重试。
  function enqueue(write) {
    const result = pending.then(write);
    pending = result.catch(() => {});
    return result;
  }

  const save = {
    async init() {
      if (cache) return cache;
      if (!loading) loading = Promise.resolve().then(() => layer.load()).then(profile => {
        cache = profile;
        return cache;
      }).finally(() => { loading = null; });
      return loading;
    },
    get profile() { return cache; },
    upgradeCap(statKey) {
      return SF.config.UPGRADE_LEVEL_CAPS?.[statKey] ?? SF.config.UPGRADE_COSTS.length;
    },
    async update(fn) {
      return enqueue(async () => {
        const profile = await this.init();
        const draft = JSON.parse(JSON.stringify(profile));
        if (fn(draft) === false) return false;
        await layer.save(draft);
        cache = draft;
        return true;
      });
    },
    // 结算一局
    async recordRun(run) {
      await this.update(p => {
        p.totalRuns++;
        p.currency += run.dustEarned || 0;
        p.stats.kills += run.kills || 0;
        p.stats.damage += Math.round(run.damage || 0);
        const bucket = p.bestScores[run.difficulty] !== undefined ? run.difficulty : 'normal';
        if (run.score > p.bestScores[bucket]) p.bestScores[bucket] = run.score;
        if (run.score > p.bestScore) p.bestScore = run.score;
        if (run.time > p.bestTime) p.bestTime = run.time;
        if (run.victory) p.bossKills++;
      });
    },
    // ---- 局外工坊：购买装甲升级（原子校验扣费，防连点） ----
    async buyCharUpgrade(charId, statKey) {
      return this.update(p => {
        const cu = p.charUpgrades && p.charUpgrades[charId];
        if (!cu || cu[statKey] === undefined) return false;
        const level = cu[statKey];
        if (level >= this.upgradeCap(statKey)) return false; // 入场武器达到 Lv.6 上限后不再扣费
        const cost = SF.config.UPGRADE_COSTS[level];
        if (p.currency < cost) return false; // 星尘不足
        p.currency -= cost;
        cu[statKey] = level + 1;
        return true;
      });
    },
    // ---- 调试用：重置存档 ----
    async reset() {
      return enqueue(async () => {
        const draft = defaultProfile();
        await layer.save(draft);
        cache = draft;
      });
    },
    _switchLayer(l) { layer = l; }, // 测试用
  };

  SF.save = save;
})();
