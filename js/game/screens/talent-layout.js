/**
 * talent-layout.js —— 天赋弹窗布局：统一镶嵌列表、整体加成列表和节点提示框的尺寸与位置。
 * 提供列表内容、动态高度和滚动上限，供绘制层与滚动交互共用。
 */
'use strict';
const T = require('../../talents/model.js');
const towerNames = {
  fire: '火塔',
  cannon: '炮塔',
  boomerang: '回旋塔',
  electric: '电塔',
  ice: '冰塔',
  poison: '毒塔',
};
const gallery = { x: 50, y: 270, w: 650, h: 1040 },
  galleryViewport = { x: 74, y: 360, w: 602, h: 834 };
const card = { w: 290, h: 544, gap: 22, rowGap: 20 };
const summary = { x: 50, y: 270, w: 650, h: 1040 },
  summaryViewport = { x: 78, y: 370, w: 594, h: 850 };

// 当前槽位的红卡放在首位，其余只列出尚未镶嵌的已持有红卡。
function galleryList(meta, slot) {
  const state = T.normalize(meta),
    current = T.get(state.slots[slot]);
  return (current ? [current] : []).concat(T.candidates(meta));
}

function summaryItems(meta) {
  const a = T.analyze(meta);
  return Object.keys(towerNames).map((key) => {
    const b = a.bonuses[key] || {},
      equipped = a.cards.filter((c) => c.def.tower === key),
      lines = [];
    equipped.forEach((c) => {
      if (a.purple.includes(c.id))
        lines.push({ kind: 'purple', name: c.def.purple.name, desc: c.def.purple.desc });
      if (a.gold.includes(c.id))
        lines.push({ kind: 'gold', name: c.def.gold.name, desc: c.def.gold.desc });
    });
    const h = 215 + lines.reduce((sum, l) => sum + 33 + Math.ceil(l.desc.length / 28) * 27 + 12, 0);
    return { key, name: towerNames[key], bonus: b, cards: equipped, lines, h };
  });
}

// 滚动交互和绘制共用这些尺寸，保证列表末尾和按钮命中保持一致。
function scroll(meta, p) {
  if (!p) return null;
  if (p.type === 'talentPicker') {
    const rows = Math.ceil(galleryList(meta, p.slot).length / 2),
      height = rows ? rows * card.h + (rows - 1) * card.rowGap : 0;
    return { viewport: galleryViewport, max: Math.max(0, height - galleryViewport.h) };
  }
  if (p.type === 'talentSummary') {
    const items = summaryItems(meta),
      height = items.reduce((s, i) => s + i.h + 18, 0) - 18;
    return { viewport: summaryViewport, max: Math.max(0, height - summaryViewport.h) };
  }
  return null;
}

// 优先把弹窗左上角放在点击处，接近屏幕边缘时再向内修正。
function tooltip(p, w, h) {
  const a = p.anchor || { x: 375, y: 800 };
  return {
    x: Math.max(18, Math.min(732 - w, a.x)),
    y: Math.max(220, Math.min(1480 - h, a.y)),
    w,
    h,
  };
}

module.exports = {
  towerNames,
  gallery,
  galleryViewport,
  card,
  summary,
  summaryViewport,
  galleryList,
  summaryItems,
  scroll,
  tooltip,
};
