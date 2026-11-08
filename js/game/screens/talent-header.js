/**
 * talent-header.js —— 天赋页顶部信息：绘制标题、圣庭羁绊、整体加成入口及测试档按钮。
 * 文字采用描边增强对比，绘制时同时登记相应入口的点击区域。
 */
'use strict';
const { text } = require('../ui.js');

// 通过深色描边增强文字对比，不再为顶部信息增加底板。
function label(ctx, value, x, y, size, color = '#e7f0d2', align = 'left') {
  ctx.font = 'bold ' + size + 'px sans-serif';
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = 'rgba(13,38,25,.94)';
  ctx.lineWidth = size > 28 ? 5 : 3.5;
  ctx.lineJoin = 'round';
  ctx.strokeText(value, x, y);
  text(ctx, value, x, y, size, color, align);
}

function draw(ctx, s, push) {
  const a = s.talent,
    n = a.series.sanctum || 0;
  ctx.save();
  ctx.shadowBlur = 0;
  label(ctx, '圣庭天赋', 375, 264, 34, '#ffe5a0', 'center');
  label(ctx, '复位', 667, 264, 19, '#e1eac8', 'center');
  push('talentReset', null, 618, 244, 98, 40);
  if (s.testProfile) {
    [2, 3].forEach((star, i) => {
      const x = 36 + i * 110;
      label(ctx, star + '星测试', x + 49, 264, 18, '#ffe1a5', 'center');
      push('talentTestPreset', star, x, 243, 98, 42);
    });
  }
  label(ctx, '圣庭羁绊', 48, 337, 25, '#ffe1a0');
  label(ctx, n + '/6', 342, 337, 26, '#f7d981', 'right');
  label(ctx, '2件 R · 4件 SR · 6件 SSR', 48, 375, 18);
  if (a.rank) label(ctx, a.rank.toUpperCase() + ' 自选', 342, 401, 18, '#edcf8b', 'right');
  push('talentCenter', null, 28, 309, 338, 112);
  label(ctx, '整体加成', 404, 337, 25, '#ffe1a0');
  label(ctx, '查看 ›', 700, 337, 18, '#f0d28b', 'right');
  label(ctx, a.count + ' 座塔 · ' + Object.keys(a.sources).length + ' 个天赋点', 404, 375, 20);
  push('talentSummary', null, 384, 309, 338, 112);
  ctx.beginPath();
  ctx.moveTo(375, 322);
  ctx.lineTo(375, 401);
  ctx.strokeStyle = 'rgba(216,205,152,.56)';
  ctx.lineWidth = 1;
  ctx.stroke();
  const names = a.cards.map((c) => c.def.name),
    rows = [names.slice(0, 3).join(' · '), names.slice(3).join(' · ')];
  rows.forEach((line, i) => {
    if (line) label(ctx, line, 375, 439 + i * 18, 14, '#e7edcc', 'center');
  });
  ctx.restore();
}

module.exports = { draw };
