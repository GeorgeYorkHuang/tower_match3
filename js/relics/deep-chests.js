'use strict';
const CONFIG = require('../config.js');
// Stateless reward rules. Inject clocks/randomness for deterministic tests, never a player profile.
function createDeepChestService(options = {}) {
  const now = options.now || (() => Date.now());
  const random = options.random || (() => Math.random());
  const pickCard = options.pickCard || (rar => CONFIG.randomShardCardId(rar, random));
  function tierByWave(meta, wave) {
    const t = CONFIG.DEPTH_CHEST.tiers;
    for (const tier of t) if (wave <= tier.max) return tier;
    return t[t.length - 1];
  }

  function grantDeepChest(meta, tierDef) {
    if (meta.deepChests.length >= CONFIG.DEPTH_CHEST.slots) {
      const tiers = CONFIG.DEPTH_CHEST.tiers;
      const rank = key => tiers.findIndex(t => t.key === key);
      let lowest = 0;
      meta.deepChests.forEach((ch, i) => { if (rank(ch.tier) < rank(meta.deepChests[lowest].tier)) lowest = i; });
      const old = tiers[rank(meta.deepChests[lowest].tier)];
      if (!old || rank(tierDef.key) <= rank(old.key)) return false;
      meta.gold += Math.round((old.gold[0] + old.gold[1]) / 2 * require('../config/relic-dust.js').replacementGoldRatio);
      meta.deepChests.splice(lowest, 1);
    }   // 槽满（设计：碎片金币走即时掉落线兜底）
    meta.deepChests.push({ tier: tierDef.key, gotAt: now(), openAt: now() + tierDef.openSec * 1000 });
    return true;
  }

  function chestReady(meta, ch) { return now() >= ch.openAt;
  }

  function openDeepChest(meta, idx) {
    const ch = meta.deepChests[idx];
    if (!ch || !chestReady(meta, ch)) return null;
    const tier = CONFIG.DEPTH_CHEST.tiers.find((t) => t.key === ch.tier);
    if (!tier) return null;
    const rnd = (a) => a[0] + Math.floor(random() * (a[1] - a[0] + 1));
    const gain = { gold: rnd(tier.gold), shards: 0, diamond: (tier.diamond || 0) + (tier.bonusDiamondChance && random() < tier.bonusDiamondChance ? 1 : 0),
       card: null, shardDetail: {}, dust: 0 };
    const drawn = {};
    for (const [rarity, range] of Object.entries(tier.fragments)) {
      const count = rnd(range);
      const parts = Math.min(count, CONFIG.DEPTH_CHEST.fragmentCards);
      for (let i = 0; i < parts; i++) {
        const id = pickCard(rarity);
        if (!id || !CONFIG.relicRunDef(id)) return null;
        drawn[id] = (drawn[id] || 0) + Math.floor(count / parts) + (i < count % parts ? 1 : 0);
      }
    }
    if (tier.ssrChance && random() < tier.ssrChance) {
      const id = pickCard('ssr');
      if (!id || !CONFIG.relicRunDef(id)) return null;
      drawn[id] = (drawn[id] || 0) + 1;
    }
    meta.deepChests.splice(idx, 1);
    Object.entries(drawn).forEach(([id, n]) => {
      const result = meta.addShard(id, n);
      gain.shards += n;
      gain.dust += result.dust;
      if (result.kept) gain.shardDetail[id] = result.kept;
    });
    meta.gold += gain.gold;
    if (gain.diamond) meta.diamond += gain.diamond;
    return gain;
  }

  function speedOpen(meta, idx) {
    const ch = meta.deepChests[idx];
    if (!ch) return false;
    const tier = CONFIG.DEPTH_CHEST.tiers.find((t) => t.key === ch.tier);
    const remainMin = Math.max(0, Math.ceil((ch.openAt - now()) / 60000));
    const cost = Math.max(1, Math.ceil(remainMin / 60 * 4));   // ≈4💎/小时
    if (meta.diamond < cost) return false;
    meta.diamond -= cost; meta.totalDiamondSpent += cost;
    ch.openAt = now();
    return true;
  }
  return { tierByWave, grantDeepChest, chestReady, openDeepChest, speedOpen };
}
const service = createDeepChestService();
module.exports = { createDeepChestService, ...service };
