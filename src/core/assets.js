/* assets.js — 本地美术预加载。分发包由 build.py 注入同一批图片的数据 URL。 */
(function () {
  'use strict';
  const SF = (window.SF = window.SF || {});
  const images = new Map();
  // 尺寸仅影响美术；碰撞半径仍完全由原数值表决定。
  const manifest = {
    player_vega: ['vega', 16], player_firefly: ['firefly', 17],
    player_thunder: ['thunder', 18],
    grub: ['grub', 9], crab: ['crab', 13], falcon: ['falcon', 13],
    jelly: ['jelly', 17], turret: ['turret', 15],
    eliteGrub: ['elite-grub', 26], eliteCrab: ['elite-crab', 28],
    boss: ['annihilation-eye', 43], boss2: ['abyss-sovereign', 72],
    planet: ['planet', 200],
    frostCore: ['frost-shard', 14], frostBurst: ['frost-burst', 32],
  };

  async function load() {
    await Promise.all(Object.entries(manifest).map(([id, [file, size]]) => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const k = size / Math.max(img.naturalWidth, img.naturalHeight);
        img.logicalWidth = img.naturalWidth * k;
        img.logicalHeight = img.naturalHeight * k;
        images.set(id, img);
        resolve();
      };
      img.onerror = () => reject(new Error('无法加载美术素材: ' + file));
      const path = 'assets/art/' + file + '.webp';
      img.src = (SF.embeddedAssets && SF.embeddedAssets[path]) || path;
    })));
  }
  SF.assets = { load, manifest, get: id => images.get(id) };
})();
