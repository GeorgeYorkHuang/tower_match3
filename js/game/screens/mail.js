/**
 * mail.js —— 邮箱界面绘制：显示标题、邮件及附件、领取按钮和底部批量操作。
 * 邮件内容限制在列表区域内，按钮只登记可见部分的点击范围。
 */
'use strict';
const UI = require('../../config/mail-ui.js'),
  Rewards = require('../../economy/mail-rewards.js');
const Footer = require('./mail-footer.js'),
  List = require('./mail-list.js');
const { fillRoundRect, strokeRoundRect, text, roundRect } = require('../ui.js');

function button(ctx, push, key, id, label, x, y, w, h, enabled) {
  fillRoundRect(ctx, x, y, w, h, 12, enabled ? '#315b3f' : '#35443c');
  strokeRoundRect(ctx, x, y, w, h, 12, enabled ? '#ddc07a' : '#718071', 1.4);
  text(ctx, label, x + w / 2, y + h / 2, 23, enabled ? '#ffebbd' : '#919f8e', 'center');
  if (enabled) push(key, id, x, y, w, h);
}

// 按可用宽度缩小字号，防止长标题、正文或奖励文字超出横向区域。
function fit(ctx, str, width, size) {
  ctx.font = 'bold ' + size + 'px sans-serif';
  return Math.min(size, (size * width) / Math.max(1, ctx.measureText(str).width));
}

// 标题和底部按钮固定，只有邮件列表在裁剪区域内随 scrollY 移动。
function draw(ctx, s, push, drawImg) {
  const b = UI.panel,
    vp = UI.viewport,
    mails = s.mails || [],
    count = mails.filter((m) => !m.claimed).length,
    max = UI.maximum(mails),
    offset = Math.max(0, Math.min(max, (s.panel && s.panel.scrollY) || 0));
  ctx.save();
  ctx.fillStyle = 'rgba(5,14,10,.72)';
  ctx.fillRect(0, 0, 750, 1626);
  fillRoundRect(ctx, b.x, b.y, b.w, b.h, 20, '#173a29');
  if (drawImg) drawImg(ctx, UI.background, b.x, b.y, b.w, b.h);
  strokeRoundRect(ctx, b.x, b.y, b.w, b.h, 20, '#c4ab6b', 2);
  push('panelBounds', null, b.x, b.y, b.w, b.h);
  text(ctx, '圣庭邮箱', 375, b.y + 143, 31, '#ffe2a0', 'center');
  text(ctx, '待领取 ' + count + ' 封', 375, b.y + 181, 19, '#c8dac0', 'center');
  List.shell(ctx);
  ctx.save();
  roundRect(ctx, vp.x, vp.y, vp.w, vp.h, 8);
  ctx.clip();
  let y = vp.y - offset;
  for (const mail of mails) {
    const h = UI.height(mail),
      top = y;
    y += h + UI.rowGap;
    // 完全离开可见区域的邮件跳过绘制，部分可见邮件由 Canvas 裁剪。
    if (top + h <= vp.y || top >= vp.y + vp.h) continue;
    const entries = Rewards.entries(Rewards.ofMail(mail));
    fillRoundRect(
      ctx,
      vp.x,
      top,
      vp.w,
      h,
      14,
      mail.claimed ? 'rgba(36,57,43,.9)' : 'rgba(39,73,46,.95)'
    );
    strokeRoundRect(ctx, vp.x, top, vp.w, h, 14, mail.claimed ? '#65785b' : '#ba9b57', 1.5);
    ctx.strokeStyle = mail.claimed ? '#7e9278' : '#efd08b';
    ctx.lineWidth = 2;
    ctx.strokeRect(vp.x + 22, top + 24, 44, 32);
    ctx.beginPath();
    ctx.moveTo(vp.x + 22, top + 24);
    ctx.lineTo(vp.x + 44, top + 43);
    ctx.lineTo(vp.x + 66, top + 24);
    ctx.stroke();
    text(
      ctx,
      mail.title,
      vp.x + 86,
      top + 39,
      fit(ctx, mail.title, vp.w - 112, 25),
      mail.claimed ? '#a6b69c' : '#ffe2a0',
      'left'
    );
    text(
      ctx,
      mail.body,
      vp.x + 22,
      top + 88,
      fit(ctx, mail.body, vp.w - 44, 19),
      '#d1dec5',
      'left'
    );
    entries.forEach((item, i) => {
      const ry = top + 140 + i * 27,
        label = item.label + ' ×' + item.amount,
        diamond = item.key === 'diamond';
      if (diamond && drawImg)
        drawImg(ctx, 'assets/images/resources/diamond.png', vp.x + 22, ry - 17, 30, 30);
      text(
        ctx,
        label,
        vp.x + (diamond ? 61 : 24),
        ry,
        fit(ctx, label, vp.w - 220, entries.length === 1 ? 23 : 19),
        mail.claimed ? '#9cb496' : diamond ? '#bde7ff' : '#e9ddae',
        'left'
      );
    });
    if (!entries.length) text(ctx, '无附件', vp.x + 24, top + 140, 19, '#a2b49b', 'left');
    button(
      ctx,
      (key, data, x, by, w, bh) => {
        // 领取按钮的点击范围也按可见区域裁剪，避免滑出列表后仍能领取。
        const upper = Math.max(vp.y, by),
          bottom = Math.min(vp.y + vp.h, by + bh);
        if (bottom > upper) push(key, data, x, upper, w, bottom - upper);
      },
      'accountMailClaim',
      mail.id,
      mail.claimed ? '已领取' : '领取',
      vp.x + vp.w - 152,
      top + h - 71,
      130,
      46,
      !mail.claimed
    );
  }
  if (!mails.length) text(ctx, '暂无邮件', 375, vp.y + 250, 28, '#d9e5cd', 'center');
  ctx.restore();
  List.fades(ctx, mails, offset);
  Footer.draw(ctx, s, push, 'accountMailClaimAll', '一键领取', UI.footer.claim, count > 0, 'claim');
  Footer.draw(
    ctx,
    s,
    push,
    'accountMailDeleteRead',
    '删除已领取',
    UI.footer.remove,
    mails.some((m) => m.claimed),
    'delete'
  );
  List.rail(ctx, mails, offset, s.mailRailDragging);
  ctx.restore();
}

module.exports = { draw };
