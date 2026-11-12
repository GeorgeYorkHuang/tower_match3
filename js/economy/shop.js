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
      const fresh = meta.dailyPicks.selectionVersion === CONFIG.DAILY.selectionVersion && picks.length === CONFIG.DAILY.perDay
        && picks.filter(p => p && p.rar === 'r').length >= CONFIG.DAILY.guaranteedBlue
        && new Set(picks.map(p=>p&&p.relic)).size === picks.length && picks.every((p) =>
        p && p.shards === CONFIG.DAILY.shards[p.rar] && p.price === CONFIG.DAILY.price[p.rar] && p.rar
        && CONFIG.relicRunDef(p.relic) && CONFIG.relicRarity(p.relic) === p.rar && CONFIG.GO.RARITY[p.rar]);
      if (fresh) return meta.dailyPicks;
    }
    const picks = [];
    const catalog = Object.values(CONFIG.RELIC_RUN.tower).flat().concat(CONFIG.RELIC_RUN.common);
    while (picks.length < CONFIG.DAILY.perDay) {
      const weight = CONFIG.DAILY.rarityWeight;
      const roll = picks.length < CONFIG.DAILY.guaranteedBlue ? 0 : random();
      const rar = roll < weight.r ? 'r' : roll < weight.r + weight.sr ? 'sr' : 'ssr';
      // 每栏只抽一次品质；抽到重复卡时在同品质内补选，避免改变50/35/15比例。
      const available = catalog.filter(d=>CONFIG.relicRarity(d.id)===rar&&!picks.some(p=>p.relic===d.id));
      if(!available.length)throw new Error('每日精选同品质候选不足：'+rar);
      let id = pickCard(rar);
      if(!available.some(d=>d.id===id))id=available[Math.min(available.length-1,Math.floor(random()*available.length))].id;
      picks.push({ relic: id, rar, shards: CONFIG.DAILY.shards[rar], price: CONFIG.DAILY.price[rar] });
    }
    meta.dailyPicks = { date, selectionVersion:CONFIG.DAILY.selectionVersion, picks };
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
    // 在影子库存中复用通关箱碎片抽取；金币/钻石及开箱槽位不转入真实账号。
    const shadow = Object.create(meta);
    shadow.shards = {...meta.shards}; shadow.relicDust = meta.relicDust || 0;
    shadow.deepChests = [{tier:def.tier,openAt:0}];
    const reward = require('../relics/deep-chests.js').createDeepChestService({now,random,pickCard}).openDeepChest(shadow,0);
    if (!reward) return {ok:false,reason:'reward'};
    meta.gold -= def.price;
    const date = todayStr(now());
    if (!meta.shopDaily || meta.shopDaily.date !== date) meta.shopDaily = { date, chests: {} };
    meta.shopDaily.chests[key] = (meta.shopDaily.chests[key] || 0) + 1;
    meta.shards=shadow.shards;meta.relicDust=shadow.relicDust;
    const gains=Object.entries(reward.shardDetail).map(([id,n])=>({id,n}));
    return {ok:true,gains,dust:reward.dust};
  }
  // Offer comes from the already-rendered daily selection; preserve existing purchase semantics.
  function buyShardOffer(meta, offer) {
    if (meta.gold < offer.price) return { ok: false, reason: 'gold' };
    meta.gold -= offer.price;
    const result = meta.addShard(offer.relic, offer.shards);
    return { ok: true, dust: result.dust, kept: result.kept };
  }
  return { ensureDailyPicks, shopChestLeft, buyShopChest, buyShardOffer };
}
module.exports = { createShopService, ...createShopService() };
