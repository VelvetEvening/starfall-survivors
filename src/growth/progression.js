/* ============================================================
 * progression.js — 升级三选一生成器
 * 权重卡池：新武器 / 武器升级 / 新被动 / 被动升级 / 超武进化(宝箱另算)
 * ============================================================ */
(function () {
  'use strict';
  const SF = (window.SF = window.SF || {});

  // 生成一次三选一（依赖 player 状态）
  function rollChoices(player, count = SF.config.LEVELUP_CHOICES) {
    const pool = [];

    // 武器卡
    for (const w of player.weapons) {
      if (!w.isMaxed) {
        pool.push({
          kind: 'weaponUp', ref: w, weight: 10,
          title: w.def.name + ' Lv.' + (w.level + 1),
          sub: w.def.levelDesc[w.level - 1] || '',
          icon: w.def.icon, color: SF.palette.elementColor(w.def.element),
        });
      } else if (w.canEvolve(player)) {
        pool.push({
          kind: 'evolve', ref: w, weight: 30,
          title: '✦ ' + SF.weapons[w.def.evolveTo].name,
          sub: SF.weapons[w.def.evolveTo].desc,
          icon: SF.weapons[w.def.evolveTo].icon, color: 'gold',
        });
      }
    }
    if (player.weapons.length < SF.config.MAX_WEAPONS) {
      for (const id in SF.weapons) {
        const def = SF.weapons[id];
        if (def.super) continue;
        if (player.hasWeapon(id)) continue;
        // 进化体已持有时，基础形态也不能再次进入新武器池。
        if (def.evolveTo && player.hasWeapon(def.evolveTo)) continue;
        pool.push({
          kind: 'weaponNew', ref: id, weight: 8,
          title: def.name,
          sub: def.desc,
          icon: def.icon, color: SF.palette.elementColor(def.element),
        });
      }
    }

    // 被动卡
    for (const [id, inst] of player.passives) {
      const def = SF.passives[id];
      if (inst.level < def.maxLevel) {
        pool.push({
          kind: 'passiveUp', ref: id, weight: 9,
          title: def.name + ' Lv.' + (inst.level + 1),
          sub: def.levelDesc[inst.level] || '',
          icon: def.icon, color: 'hero2',
        });
      }
    }
    if (player.passives.size < SF.config.MAX_PASSIVES) {
      for (const id in SF.passives) {
        if (player.passives.has(id)) continue;
        const def = SF.passives[id];
        pool.push({
          kind: 'passiveNew', ref: id, weight: 7,
          title: def.name,
          sub: def.desc,
          icon: def.icon, color: 'hero2',
        });
      }
    }

    // 加权抽取（不重复）
    const choices = [];
    const used = new Set();
    while (choices.length < count && used.size < pool.length) {
      let total = 0;
      for (let i = 0; i < pool.length; i++) {
        if (!used.has(i)) total += pool[i].weight;
      }
      let r = Math.random() * total;
      for (let i = 0; i < pool.length; i++) {
        if (used.has(i)) continue;
        r -= pool[i].weight;
        if (r <= 0) {
          used.add(i);
          choices.push(pool[i]);
          break;
        }
      }
    }
    // 池空兜底：不重复的星尘补给卡，避免三选一出现完全相同的卡面。
    while (choices.length < count) {
      const amount = 20 * (choices.length + 1);
      choices.push({ kind: 'dust', amount, weight: 1, title: `星尘补给 +${amount}`, sub: `立即获得 ${amount} 点经验`, icon: 'dust', color: 'starDust' });
    }
    return choices;
  }

  function applyChoice(player, game, choice) {
    switch (choice.kind) {
      case 'weaponNew':
        player.addWeapon(choice.ref);
        break;
      case 'weaponUp':
        choice.ref.levelUp();
        break;
      case 'passiveNew':
        player.addPassive(choice.ref);
        break;
      case 'passiveUp':
        player.passives.get(choice.ref).level++;
        player.recalcStats();
        break;
      case 'evolve': {
        const w = choice.ref;
        const superDef = SF.weapons[w.def.evolveTo];
        if (!superDef || player.hasWeapon(superDef.id) || !w.canEvolve(player)) break;
        const idx = player.weapons.indexOf(w);
        const evolved = new SF.WeaponInstance(superDef, 1);
        evolved.frostEmpowered = w.frostEmpowered;
        const chargeProgress = w.spec.charge ? w.chargeT / w.chargeDuration(player) : 0;
        player.weapons[idx] = evolved;
        player.recalcStats(); // 超武联动：对应被动每层 ×1.5 追溯生效
        evolved.owner = player;
        if (evolved.spec.charge) {
          evolved.charges = Math.min(w.charges, player.stats.railgunStorage);
          evolved.chargeT = evolved.charges >= player.stats.railgunStorage
            ? 0 : Math.min(1, chargeProgress) * evolved.chargeDuration(player);
        }
        SF.particles.ring(player.x, player.y, { color: 'gold', maxR: 60, life: 0.6, width: 3 });
        SF.particles.floatText(player.x, player.y - 20, '✦ 超武觉醒 ✦', { color: SF.palette.css('gold'), size: 11, life: 1.2 });
        SF.audio.sfx.evolve();
        break;
      }
      case 'dust':
        game.gainXp(choice.amount || 20);
        break;
    }
    SF.audio.sfx.confirm();
  }

  function affinityFor(choice) {
    const passive = choice.kind.startsWith('passive');
    const id = typeof choice.ref === 'string' ? choice.ref : choice.kind === 'evolve' ? choice.ref?.def.evolveTo : choice.ref?.def.id;
    const def = (passive ? SF.passives : SF.weapons)[id];
    const element = def?.element || 'none';
    const recipe = passive ? Object.values(SF.weapons).find(w => w.evolveWith === id) : null;
    return { element, recipe, label: { fire: '火系', ice: '冰系', bolt: '雷系', none: '通用' }[element] };
  }
  SF.progression = { rollChoices, applyChoice, affinityFor };
})();
