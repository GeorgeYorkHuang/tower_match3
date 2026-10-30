'use strict';
const CONFIG = require('../config.js');
// Explicit profile input: no stored player references, storage writes, wx or UI effects.
function starOf(meta, id) { return meta.relicStars[id] || (meta.runCodex[id] ? 1 : 0);
}

function addShard(meta, id, n) {
    meta.shards[id] = (meta.shards[id] || 0) + n;
}

function shardNeed(meta, id) { return CONFIG.DUPLICATE_SHARDS[CONFIG.relicRarity(id)] || 0;
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
    if (next === 3 && CONFIG.STAR_UP.goldStarExtraStone && CONFIG.relicRarity(id) === 'ssr' && meta.starStones < (c.stone || 0)) return '星辉石不足';
    meta.gold -= c.gold;
    meta.shards[id] -= c.shards;
    if (next === 3 && c.stone) meta.starStones -= c.stone;
    meta.relicStars[id] = next;
    return null;
}

function codexOwned(meta, id) { return (meta.runCodex[id] || 0) > 0;
}

function codexUnlock(meta, id) { meta.runCodex[id] = 1;
}

module.exports = { starOf, addShard, shardNeed, canUnlockByShard, unlockByShard, upStar, codexOwned, codexUnlock };
