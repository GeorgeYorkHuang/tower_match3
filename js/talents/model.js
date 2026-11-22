/**
 * model.js —— 天赋模型：校验装配存档，计算红卡覆盖、节点激活、按塔加成和套装品质。
 * 只读配置与传入档案；装卸函数仅修改档案对象，保存由交互层负责。
 */
'use strict';
const C = require('../config/talents.js');
const byId = new Map(C.cards.map((c) => [c.id, c]));
const nodeMap = new Map(C.nodes.map((n) => [n.id, n]));

function owned(meta, id) {
  if (!byId.has(id)) return 0;
  const n = Number((meta.relicStars || {})[id] || ((meta.runCodex || {})[id] ? 1 : 0));
  return Number.isFinite(n) ? Math.max(0, Math.min(3, Math.floor(n))) : 0;
}

// 清除未持有或重复装配的红卡；中央自选的资格另由交互层校验。
function migrate(meta) {
 const raw=meta.talents||{}, slots=Array(6).fill(null),seen=new Set();let moved=0,removed=0;
 // 保留合法原位卡，错位卡随后按旧槽位顺序回位。
 for(let i=0;i<6;i++){const id=(raw.slots||[])[i],c=byId.get(id);if(c&&owned(meta,id)&&c.nativeSlot===i&&!seen.has(id)){slots[i]=id;seen.add(id);}}
 for(let i=0;i<6;i++){const id=(raw.slots||[])[i],c=byId.get(id);if(!c||!owned(meta,id)||seen.has(id))continue;seen.add(id);if(c.nativeSlot===i)continue;
  if(raw.version!==2&&!slots[c.nativeSlot]){slots[c.nativeSlot]=id;moved++;}else removed++;
 }
 return {state:{version:2,slots,center:typeof raw.center==='string'?raw.center:null},moved,removed};
}
function normalize(meta) { return migrate(meta).state; }

function rotate(q, r, n) {
  for (let i = 0; i < n; i++) {
    const a = q;
    q = -r;
    r = a + r;
  }
  return [q, r];
}
// 形状朝向属于红卡本身；移动到其他槽位时只平移，不跟随槽位旋转。
function shapeOffsets(card, star) {
  const turns = Number.isInteger(card.shapeRotation) ? card.shapeRotation : card.nativeSlot || 0;
  return card.shape[star].map(([q, r]) => rotate(q, r, turns));
}

function footprint(card, star, slot) {
  const [cq, cr] = rotate(0, -3, slot);
  return shapeOffsets(card, star).map(([q, r]) => [cq + q, cr + r].join(','));
}

function analyze(meta) {
  const state = normalize(meta),
    sources = {},
    cards = [];
  state.slots.forEach((id, slot) => {
    if (!id) return;
    const def = byId.get(id),
      star = owned(meta, id),
      coverage = footprint(def, star, slot);
    cards.push({ id, slot, star, def, coverage });
    coverage.forEach((key) => {
      if (!sources[key]) sources[key] = [];
      sources[key].push(id);
    });
  });
  // 紫天赋需二星且固定紫点被任一红卡覆盖；金天赋随三星红卡自动激活。
  const purple = cards
      .filter((c) => c.def.purple.enabled !== false && c.star >= 2 && (sources[c.def.purpleNode] || []).length > 0)
      .map((c) => c.id),
    gold = cards.filter((c) => c.def.gold.enabled !== false && c.star === 3).map((c) => c.id),
    bonuses = {}, whiteActive = {}, whiteSources = {};
  // 每张红卡把自己覆盖的白、绿节点加成计入对应塔，不能分配给其他塔。
  cards.forEach((c) => {
    const b =
      bonuses[c.def.tower] ||
      (bonuses[c.def.tower] = {
        attack: 0,
        speed: 0,
        charge: 0,
        damage: 0,
        skill: 0,
        dot: 0,
        duration: 0,
      });
    c.coverage.forEach((id) => {
      const n = nodeMap.get(id);
      if (n.type === 'green') b[n.effect] += n.value;

    });
  });
  // 固定塔攻击点：任意红卡覆盖即可激活，同节点仅计算一次。
  for (const n of C.nodes) {
    if (n.type !== 'white' || !(sources[n.id] || []).length) continue;
    whiteActive[n.id] = true; whiteSources[n.id] = sources[n.id].slice();
    const b = bonuses[n.tower] || (bonuses[n.tower] = {attack:0,speed:0,charge:0,damage:0,skill:0,dot:0,duration:0});
    b.attack += C.whiteAttack;
  }
  const series = {};
  cards.forEach((c) => (series[c.def.series] = (series[c.def.series] || 0) + 1));
  // 并列固定按系列顺序，不依赖存档中的装配时间。
  const seriesTrack = ['sanctum','forge','gale'].reduce((best, key) => (series[key] || 0) > (series[best] || 0) ? key : best, 'sanctum');
  const n = series[seriesTrack] || 0,
    rank = n >= 6 ? 'ssr' : n >= 4 ? 'sr' : n >= 2 ? 'r' : null;
  return { state, cards, sources, purple, gold, bonuses, count: cards.length, series, rank, seriesTrack, whiteActive, whiteSources };
}

function candidates(meta, slot) {
  const state = normalize(meta);
  return C.cards
    .filter((c) => owned(meta, c.id) && !state.slots.includes(c.id) && (slot === undefined || c.nativeSlot === slot))
    .map((c) => ({ ...c, star: owned(meta, c.id) }));
}

function equip(meta, slot, id) {
  if (!Number.isInteger(slot) || slot < 0 || slot > 5) return '槽位不存在';
  if (!owned(meta, id)) return '尚未持有该红色圣遗物';
  if (byId.get(id).nativeSlot !== slot) return '该红卡只能镶嵌到对应塔的固定槽位';
  const state = normalize(meta);
  if (state.slots.includes(id)) return '该圣遗物已经装配';
  state.slots[slot] = id;
  meta.talents = state;
  return null;
}

function unequip(meta, slot) {
  if (!Number.isInteger(slot) || slot < 0 || slot > 5) return '槽位不存在';
  const state = normalize(meta);
  state.slots[slot] = null;
  meta.talents = state;
  return null;
}

function get(id) {
  return byId.get(id) || null;
}

module.exports = {
  C,
  get,
  owned,
  normalize,
  migrate,
  rotate,
  shapeOffsets,
  footprint,
  analyze,
  candidates,
  equip,
  unequip,
};
