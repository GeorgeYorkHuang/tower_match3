'use strict';
const CONFIG = require('../config.js');
const { todayStr } = require('./calendar.js');
// No profile cache, save writes or UI effects. Supply clock/RNG for deterministic purchases.
function createShopService(options = {}) {
  const now = options.now || (() => Date.now());
  const random = options.random || (() => Math.random());
  const pickCard = options.pickCard || (rar => CONFIG.randomShardCardId(rar, random));
  function ensureDailyPicks(meta, nowMs) {
    const date = todayStr(nowMs || now());
    // 旧存档兼容：同日缓存若为旧结构（无 shards/rar 或非新体系 id），视为过期重建
    if (meta.dailyPicks && meta.dailyPicks.date === date) {
      const picks = meta.dailyPicks.picks || [];
      const fresh = picks.length === CONFIG.DAILY.perDay && picks.every((p) =>
        p && p.shards > 0 && p.rar && CONFIG.relicRunDef(p.relic) && CONFIG.GO.RARITY[p.rar]);
      if (fresh) return meta.dailyPicks;
    }
    const picks = [];
    const rars = ['r', 'sr', 'ssr'];
    while (picks.length < CONFIG.DAILY.perDay) {
      const rar = rars[Math.floor(random() * 3)];
      const id = pickCard(rar);
      if (!id || picks.some((p) => p.relic === id)) continue;
      picks.push({ relic: id, rar, shards: CONFIG.DAILY.shards[rar], price: CONFIG.DAILY.price[rar] });
    }
    meta.dailyPicks = { date, picks };
    return meta.dailyPicks;
  }

  function shopChestLeft(meta, key) {
    const def = CONFIG.SHOP_CHEST[key];
    if (!def) return 0;
    if (!meta.shopDaily || meta.shopDaily.date !== todayStr(now())) return def.daily;
    return Math.max(0, def.daily - (meta.shopDaily.chests[key] || 0));
  }

  function buyShopChest(meta, key) {
    const def = CONFIG.SHOP_CHEST[key];
    if (shopChestLeft(meta, key) <= 0) return { ok: false, reason: 'limit' };
    if (meta.gold < def.price) return { ok: false, reason: 'gold' };
    meta.gold -= def.price;
    const date = todayStr(now());
    if (!meta.shopDaily || meta.shopDaily.date !== date) meta.shopDaily = { date, chests: {} };
    meta.shopDaily.chests[key] = (meta.shopDaily.chests[key] || 0) + 1;
    const n = def.shards[Math.floor(random() * def.shards.length)];
    const agg = {};
    for (let i = 0; i < n; i++) {
      const rar = def.rarities[Math.floor(random() * def.rarities.length)];
      const rid = pickCard(rar);
      if (!rid) continue;
      agg[rid] = (agg[rid] || 0) + 1;
    }
    const gains = Object.keys(agg).map((rid) => ({ id: rid, n: agg[rid] }));
    gains.forEach((g) => meta.addShard(g.id, g.n));
    return { ok: true, gains };
  }
  // Offer comes from the already-rendered daily selection; preserve existing purchase semantics.
  function buyShardOffer(meta, offer) {
    if (meta.gold < offer.price) return { ok: false, reason: 'gold' };
    meta.gold -= offer.price;
    meta.addShard(offer.relic, offer.shards);
    return { ok: true };
  }
  return { ensureDailyPicks, shopChestLeft, buyShopChest, buyShardOffer };
}
module.exports = { createShopService, ...createShopService() };
