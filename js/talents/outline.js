/**
 * outline.js —— 红卡覆盖区域：合并六边形格子的外轮廓，绘制同色半透明填充和边线。
 * 多个红卡共用边界时错开描边，便于辨认各自的覆盖范围。
 */
'use strict';
const VERTICES = [
  [1, -1],
  [1, 1],
  [0, 2],
  [-1, 1],
  [-1, -1],
  [0, -2],
];

function boundary(keys) {
  const edges = new Map();
  new Set(keys).forEach((key) => {
    const [q, r] = key.split(',').map(Number),
      v = VERTICES.map(([x, y]) => [2 * q + r + x, 3 * r + y]);
    for (let i = 0; i < 6; i++) {
      const a = v[i],
        b = v[(i + 1) % 6],
        ak = a.join(','),
        bk = b.join(','),
        id = ak < bk ? ak + '|' + bk : bk + '|' + ak;
      // 相邻六边形的共有边出现两次，抵消后仅保留外轮廓。
      if (edges.has(id)) edges.delete(id);
      else edges.set(id, { id, a, b });
    }
  });
  return [...edges.values()];
}

function build(cards, slotNodes) {
  const contours = cards.map((c) => ({
      id: c.id,
      color: c.def.outlineColor || '#ffc384',
      cells: [...new Set(c.coverage)],
      edges: boundary(c.coverage.concat(slotNodes[c.slot])),
    })),
    shared = new Map();
  contours.forEach((c) =>
    c.edges.forEach((e) => {
      if (!shared.has(e.id)) shared.set(e.id, []);
      shared.get(e.id).push(c.id);
    })
  );
  return contours.map((c) => ({
    ...c,
    edges: c.edges.map((e) => {
      const owners = shared.get(e.id),
        index = owners.indexOf(c.id);
      // 共用边沿法线错开，各红卡仍能保留自己的颜色描边。
      return { ...e, offset: (index - (owners.length - 1) / 2) * 2.7 };
    }),
  }));
}

function fill(ctx, contours, cell, cx, cy) {
  ctx.save();
  ctx.shadowBlur = 0;
  // 区域填充为 30% 不透明，边线随后单独绘制以保持清晰。
  ctx.globalAlpha = (Number.isFinite(ctx.globalAlpha) ? ctx.globalAlpha : 1) * 0.3;
  for (const c of contours) {
    ctx.beginPath();
    for (const key of c.cells || []) {
      const [q, r] = key.split(',').map(Number);
      VERTICES.forEach(([vx, vy], i) => {
        const x = cx + ((2 * q + r + vx) * Math.sqrt(3) * cell) / 2,
          y = cy + ((3 * r + vy) * cell) / 2;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.closePath();
    }
    ctx.fillStyle = c.color;
    ctx.fill();
  }
  ctx.restore();
}

function draw(ctx, contours, cell, cx, cy) {
  fill(ctx, contours, cell, cx, cy);
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let pass = 0; pass < 2; pass++)
    for (const c of contours) {
      ctx.beginPath();
      for (const e of c.edges) {
        const a = { x: cx + (e.a[0] * Math.sqrt(3) * cell) / 2, y: cy + (e.a[1] * cell) / 2 },
          b = { x: cx + (e.b[0] * Math.sqrt(3) * cell) / 2, y: cy + (e.b[1] * cell) / 2 },
          dx = b.x - a.x,
          dy = b.y - a.y,
          len = Math.hypot(dx, dy),
          normal = e.a.join(',') < e.b.join(',') ? 1 : -1,
          ox = (-dy / len) * e.offset * normal,
          oy = (dx / len) * e.offset * normal;
        ctx.moveTo(a.x + ox, a.y + oy);
        ctx.lineTo(b.x + ox, b.y + oy);
      }
      ctx.strokeStyle = pass ? c.color : 'rgba(6,20,13,0.85)';
      ctx.lineWidth = pass ? 1.9 : 5.3;
      ctx.stroke();
    }
  ctx.restore();
}

module.exports = { boundary, build, fill, draw };
