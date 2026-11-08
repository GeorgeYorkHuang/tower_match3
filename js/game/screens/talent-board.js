/**
 * talent-board.js —— 天赋盘绘制：呈现各类节点、红卡图标、覆盖区域、外围金槽和中央自选槽。
 * 将节点点击区域同步转换到缩放后的屏幕坐标，并裁剪到可操作区域内。
 */
'use strict';
const T = require('../../talents/model.js'),
  V = require('../../talents/view.js');
const { hex } = require('./talent-art.js'),
  NodeIcons = require('./talent-node-icons.js');
const Outline = require('../../talents/outline.js'),
  Socket = require('./talent-socket.js');
let outlineKey = '',
  outlineCache = [];
const { text, strokeRoundRect } = require('../ui.js');

function node(ctx, n, x, y, r, active) {
  const style = {
      white: { fill: '#e3dcc5', ink: '#3e3b2e', edge: '#fff4d4' },
      green: { fill: '#279653', ink: '#efffe9', edge: '#b4f3bd' },
      purple: { fill: '#8751b5', ink: '#fff0ff', edge: '#e2bcff' },
    }[n.type],
    radius = r * (n.type === 'white' ? 0.64 : n.type === 'green' ? 0.79 : 0.9);
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
  const fill = active ? style.fill : n.type === 'white' ? '#434b45' : '#303833',
    edge = active ? style.edge : '#788176',
    ink = active ? style.ink : '#a6afa4';
  hex(ctx, x, y, radius, fill, edge, active ? 2.4 : 1.3);
  if (n.type === 'green')
    hex(ctx, x, y, r * 0.65, 'transparent', active ? '#a0ddb0' : '#667468', 1);
  NodeIcons.draw(
    ctx,
    n.type === 'white' ? 'attack' : n.effect,
    x,
    y,
    r * (n.type === 'white' ? 0.8 : 1.0) * 0.9,
    ink
  );
}

function draw(ctx, s, push, drawImg, relicIconSrc) {
  const a = s.talent;
  if (!a) return;
  const view = V.normalize(s.talentView),
    vp = V.viewport,
    size = V.cell,
    baseScale = size / 38,
    cx = V.center.x,
    cy = V.center.y,
    at = (q, r) => [cx + Math.sqrt(3) * size * (q + r / 2), cy + 1.5 * size * r];
  ctx.save();
  require('./talent-header.js').draw(ctx, s, push);
  strokeRoundRect(ctx, vp.x, vp.y, vp.w, vp.h, 18, 'rgba(198,186,134,0.32)', 1.2);
  // 点击矩形与绘制使用同一缩放变换，并裁掉可操作区域之外的部分。
  const boardHit = (key, data, x, y, w, h) => {
    const p = V.screen(view, x, y),
      left = Math.max(vp.x, p.x),
      top = Math.max(vp.y, p.y),
      right = Math.min(vp.x + vp.w, p.x + w * view.zoom),
      bottom = Math.min(vp.y + vp.h, p.y + h * view.zoom);
    if (right > left && bottom > top) push(key, data, left, top, right - left, bottom - top);
  };
  ctx.save();
  ctx.beginPath();
  ctx.rect(vp.x, vp.y, vp.w, vp.h);
  ctx.clip();
  ctx.translate(vp.x + vp.w / 2 + view.x, vp.y + vp.h / 2 + view.y);
  ctx.scale(view.zoom, view.zoom);
  ctx.translate(-cx, -cy);
  const sockets = [];
  T.C.nodes.forEach((n) => {
    const [x, y] = at(n.q, n.r),
      source = a.sources[n.id] || [],
      owner = (a.cards.find((c) => c.def.purpleNode === n.id) || {}).def,
      slotIndex = T.C.slots.findIndex((slot) => slot.node === n.id),
      active =
        n.type === 'slot'
          ? !!a.state.slots[slotIndex]
          : n.type === 'purple'
            ? owner && a.purple.includes(owner.id)
            : source.length > 0;
    if (n.type === 'slot') {
      const id = a.state.slots[slotIndex];
      sockets.push(() =>
        Socket.draw(ctx, x, y, size * 1.02, 'red', !!id, id && T.get(id).icon, drawImg)
      );
      boardHit(
        'talentSlot',
        slotIndex,
        x - 32 * baseScale,
        y - 32 * baseScale,
        64 * baseScale,
        64 * baseScale
      );
      return;
    }
    // 紫槽装配后即可显示图标，未被覆盖激活时使用预先生成的灰色图。
    if (n.type === 'purple')
      sockets.push(() =>
        Socket.draw(
          ctx,
          x,
          y,
          size * 0.9,
          'purple',
          !!active,
          owner && (active ? owner.purple.icon || owner.icon : owner.purple.iconGray),
          drawImg
        )
      );
    else node(ctx, n, x, y, size, active);
    boardHit(
      'talentNode',
      n.id,
      x - 27 * baseScale,
      y - 27 * baseScale,
      54 * baseScale,
      54 * baseScale
    );
  });
  // 只有装配、星级或槽位变化时才重算轮廓，拖动缩放复用已有边界。
  const key = a.cards
    .map((c) => c.id + ':' + c.star + ':' + c.slot + ':' + c.def.outlineColor)
    .join('|');
  if (key !== outlineKey) {
    outlineKey = key;
    outlineCache = Outline.build(
      a.cards,
      T.C.slots.map((slot) => slot.node)
    );
  }
  Outline.draw(ctx, outlineCache, size, cx, cy);
  // 槽位最后叠在覆盖填充之上，防止红卡和技能图标被区域颜色遮住。
  sockets.forEach((draw) => draw());
  T.C.slots.forEach((slot, i) => {
    const [q, r] = T.rotate(0, -V.goldRing, i),
      [x, y] = at(q, r),
      def = T.get(a.state.slots[i]),
      active = def && a.gold.includes(def.id);
    Socket.draw(
      ctx,
      x,
      y,
      V.goldRadius,
      'gold',
      !!active,
      def && (def.gold.icon || def.icon),
      drawImg
    );
    boardHit(
      'talentGold',
      { slot: i },
      x - V.goldRadius,
      y - V.goldRadius,
      V.goldRadius * 2,
      V.goldRadius * 2
    );
  });
  const centerRadius = size * 1.07 * 0.9,
    centerId = s.talentCenterId,
    centerSrc = centerId && relicIconSrc && relicIconSrc(centerId);
  Socket.draw(ctx, cx, cy, centerRadius, 'center', !!(a.rank && centerSrc), centerSrc, drawImg);
  boardHit(
    'talentCenter',
    null,
    cx - centerRadius,
    cy - centerRadius,
    centerRadius * 2,
    centerRadius * 2
  );
  ctx.restore();
  //  text(ctx,'双指缩放 · 单指拖动 · 轻点查看详情',375,1425,20,'#d4dec8','center');text(ctx,'覆盖区域与红卡同色 · 填充不透明度30%',375,1457,17,'#bacbb2','center');
  ctx.restore();
}

function slotAnchor(s, slot) {
  const [q, r] = T.rotate(0, -3, slot);
  return V.screen(
    s.talentView,
    V.center.x + Math.sqrt(3) * V.cell * (q + r / 2),
    V.center.y + 1.5 * V.cell * r
  );
}

module.exports = { draw, slotAnchor };
