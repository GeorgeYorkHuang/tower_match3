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
    if (meta.deepChests.length >= CONFIG.DEPTH_CHEST.slots) return false;   // 槽满（设计：碎片金币走即时掉落线兜底）
    meta.deepChests.push({ tier: tierDef.key, gotAt: now(), openAt: now() + tierDef.openSec * 1000 });
    return true;
  }

  function chestReady(meta, ch) { return now() >= ch.openAt;
  }

  function openDeepChest(meta, idx) {
    const ch = meta.deepChests[idx];
    if (!ch || !chestReady(meta, ch)) return null;
    const tier = CONFIG.DEPTH_CHEST.tiers.find((t) => t.key === ch.tier);
    meta.deepChests.splice(idx, 1);
    const rnd = (a) => a[0] + Math.floor(random() * (a[1] - a[0] + 1));
    const gain = {
      gold: rnd(tier.gold),
      shards: rnd(tier.shards),
      diamond: tier.diamond || (tier.diamondChance && random() < tier.diamondChance ? 1 : 0),
      stone: tier.stone || (tier.stoneChance && random() < tier.stoneChance ? 1 : 0),
      card: null,
    };
    // 圣遗物卡：按 cardChance 出卡，黄金档 25% 升金卡
    if (random() < tier.cardChance) {
      let rar = tier.cardRarity;
      if (tier.goldCardChance && random() < tier.goldCardChance) rar = 'ssr';
      gain.card = pickCard(rar);
      if (gain.card) meta.addShard(gain.card, 5);   // 卡=直接注入 5 碎片（简化：卡即碎片包）
    }
    meta.gold += gain.gold;
    if (gain.diamond) meta.diamond += gain.diamond;
    if (gain.stone) meta.starStones += gain.stone;
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
