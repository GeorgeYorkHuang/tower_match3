'use strict';
const CONFIG = require('../config.js');
const DUST = require('../config/relic-dust.js');
const RETIRED = require('../config/retired-relics.js');
// Explicit profile input: no stored player references, storage writes, wx or UI effects.
function starOf(meta, id) { if(RETIRED.includes(id))return 0; return meta.relicStars[id] || (meta.runCodex[id] ? 1 : 0);
}

// Keep only fragments still needed to unlock and reach three stars.
function shardCapacity(meta, id) {
 if(RETIRED.includes(id))return Infinity;
 const rarity = CONFIG.relicRarity(id);
 if (!DUST.convert[rarity]) return Infinity;
 const star = starOf(meta, id);
 let remaining = star ? 0 : shardNeed(meta, id);
 for (let next = Math.max(2, star + 1); next <= 3; next++) remaining += CONFIG.STAR_UP.cost[next].shards;
 return remaining;
}
function normalizeShard(meta, id) {
 if(RETIRED.includes(id))return 0;
 const have = Math.max(0, Math.floor(Number(meta.shards[id]) || 0));
 const kept = Math.min(have, shardCapacity(meta, id));
 const dust = (have - kept) * (DUST.convert[CONFIG.relicRarity(id)] || 0);
 meta.shards[id] = kept;
 meta.relicDust = (meta.relicDust || 0) + dust;
 return dust;
}
function addShard(meta, id, n) {
 const amount = Math.max(0, Math.floor(Number(n) || 0));
 const before = meta.shards[id] || 0;
 meta.shards[id] = before + amount;
 const dust = normalizeShard(meta, id);
 return { kept: Math.max(0, meta.shards[id] - before), dust };
}
function craftShard(meta, id) {
 if (!CONFIG.relicRunDef(id)) return '圣物不存在';
 const cost = DUST.craft[CONFIG.relicRarity(id)];
 if (!cost) return '该品质不支持合成';
 if ((meta.shards[id] || 0) >= shardCapacity(meta, id)) return '碎片已满';
 if ((meta.relicDust || 0) < cost) return '圣物粉尘不足';
 meta.relicDust -= cost;
 addShard(meta, id, 1);
 return null;
}

function shardNeed(meta, id) { if(RETIRED.includes(id))return 0; return CONFIG.DUPLICATE_SHARDS[CONFIG.relicRarity(id)] || 0;
}

function canUnlockByShard(meta, id) {
    const need = meta.shardNeed(id);
    return need > 0 && meta.starOf(id) < 1 && (meta.shards[id] || 0) >= need;
}

function unlockByShard(meta, id) {
    if (meta.starOf(id) >= 1) return '已解锁';
    const need = meta.shardNeed(id);
    if (!need) return '该圣遗物无需碎片解锁';
    const have = meta.shards[id] || 0;
    if (have < need) return `碎片不足（${have}/${need}）`;
    meta.shards[id] = have - need;
    meta.codexUnlock(id);
    return null;
}

function upStar(meta, id) {
    const cur = meta.starOf(id);
    if (!cur) return '未解锁该圣遗物';
    if (cur >= 3) return '已达 3★';
    const next = cur + 1;
    const c = CONFIG.STAR_UP.cost[next];
    if (meta.gold < c.gold) return '金币不足';
    if ((meta.shards[id] || 0) < c.shards) return `碎片不足（${meta.shards[id] || 0}/${c.shards}）`;
    if (next === 3 && CONFIG.STAR_UP.goldStarExtraDiamond && CONFIG.relicRarity(id) === 'ssr' && meta.diamond < (c.diamond || 0)) return '钻石不足';
    meta.gold -= c.gold;
    meta.shards[id] -= c.shards;
    if (next === 3 && CONFIG.STAR_UP.goldStarExtraDiamond && CONFIG.relicRarity(id) === 'ssr' && c.diamond) { meta.diamond -= c.diamond; meta.totalDiamondSpent = (meta.totalDiamondSpent || 0) + c.diamond; }
    meta.relicStars[id] = next;
    normalizeShard(meta, id);
    return null;
}

function codexOwned(meta, id) { if(RETIRED.includes(id))return false; return (meta.runCodex[id] || 0) > 0;
}

function codexUnlock(meta, id) { if(RETIRED.includes(id))return; meta.runCodex[id] = 1; normalizeShard(meta, id);
}

module.exports = { shardCapacity, normalizeShard, craftShard, starOf, addShard, shardNeed, canUnlockByShard, unlockByShard, upStar, codexOwned, codexUnlock };
