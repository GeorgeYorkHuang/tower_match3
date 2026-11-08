/**
 * mail-ui.js —— 邮箱布局配置：统一弹窗、邮件列表、底部按钮及滚动条的尺寸。
 * 根据附件行数计算邮件高度，供绘制层和触摸滚动逻辑共用。
 */
'use strict';
const Rewards = require('../economy/mail-rewards.js');
const panel = { x: 50, y: 270, w: 650, h: 1040 },
  viewport = { x: 96, y: 488, w: 530, h: 648 },
  rowHeight = 190,
  rowGap = 18;

// 附件超过一行时逐行增高，避免多种奖励挤出邮件边框。
function height(mail) {
  return Math.max(
    rowHeight,
    175 + Math.max(0, Rewards.entries(Rewards.ofMail(mail)).length - 1) * 27
  );
}

function contentHeight(mails) {
  return Math.max(0, mails.reduce((sum, mail) => sum + height(mail) + rowGap, 0) - rowGap);
}

// 支持邮件数组和旧的邮件数量参数；实际列表使用数组以计算动态行高。
function maximum(mails) {
  const total = Array.isArray(mails)
    ? contentHeight(mails)
    : Math.max(0, mails * (rowHeight + rowGap) - rowGap);
  return Math.max(0, total - viewport.h);
}
const listFrame = { x: 82, y: 472, w: 586, h: 682 };

// 把内容滚动距离映射为滑块位置；保留最小滑块高度并扩大触摸命中宽度。
function scrollbar(mails, offset = 0) {
  const max = maximum(mails),
    track = { x: 643, y: viewport.y, w: 10, h: viewport.h },
    h = max > 0 ? Math.max(54, (track.h * viewport.h) / (viewport.h + max)) : track.h,
    position = Math.max(0, Math.min(max, offset));
  return {
    max,
    track,
    thumb: {
      x: track.x,
      y: track.y + (max > 0 ? ((track.h - h) * position) / max : 0),
      w: track.w,
      h,
    },
    hit: { x: track.x - 11, y: track.y, w: 32, h: track.h },
  };
}
const footer = {
  claim: { x: 112, y: 1174, w: 250, h: 64 },
  remove: { x: 388, y: 1174, w: 250, h: 64 },
};
module.exports = {
  panel,
  viewport,
  footer,
  listFrame,
  scrollbar,
  rowHeight,
  rowGap,
  height,
  maximum,
  background: 'assets/images/interface/home/mail-garden-v1.jpg',
};
