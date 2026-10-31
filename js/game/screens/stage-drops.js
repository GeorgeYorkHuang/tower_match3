/**
 * v1.17.48 主页战场卡信息层：战场说明 + 该战场专属掉落。
 * 点击战场图标不再提示「未解锁 / 解锁条件」，改为信息展示；进场校验仍在 enter 分支。
 */
'use strict';
const CONFIG = require('../../config.js');
const BOSSES = require('../../config/bosses.js');
const { fillRoundRect, strokeRoundRect, text } = require('../ui.js');

const UR_COLOR = '#ff5a3c';

function urListOf(fieldId) {
  return (CONFIG.RELIC_RUN.ur || []).filter((d) => d.field === fieldId);
}

function bossListOf(fieldId) {
  return Object.keys(BOSSES)
    .map((k) => BOSSES[k])
    .filter((b) => b && b.field === fieldId)
    .sort((a, b) => (a.wave || 0) - (b.wave || 0));
}

function bossLine(id) {
  if (id === 'test') return '无 Boss 战 · 不计收益';
  if (id === 'abyss') return 'Boss · 复用圣坛花园三只（按诅咒乘算）';
  const bs = bossListOf(id);
  if (!bs.length) return 'Boss · 20 / 40 / 60 波（待实装）';
  return 'Boss · ' + bs.map((b) => `${b.wave} 波 ${b.name}`).join(' · ');
}

function createStageDropsScreen({ drawImg, relicIconSrc, wrapText }) {
  /**
   * 单张红件卡：只给 图标 + 名称（+ 持有态小标）。
   * v1.17.49：战场介绍不再写效果文案（效果统一在圣物图鉴看），图标放大 50%（86→129）。
   */
  function _urCard(ctx, s, d, x, y, w, h) {
    const star = (s.relicStars && s.relicStars[d.id]) || (s.runCodex && s.runCodex[d.id] ? 1 : 0);
    const owned = star > 0;
    fillRoundRect(ctx, x, y, w, h, 14, owned ? 'rgba(255,90,60,0.10)' : 'rgba(255,255,255,0.03)');
    strokeRoundRect(ctx, x, y, w, h, 14, owned ? UR_COLOR : 'rgba(255,90,60,0.45)', owned ? 1.8 : 1.2);
    // 图标（居中，放大到 129）
    const ic = 129, cx = x + w / 2, cy = y + 14 + ic / 2;
    const src = relicIconSrc(d.id);
    if (!owned) ctx.globalAlpha = 0.55;
    if (!(src && drawImg(ctx, src, cx - ic / 2, cy - ic / 2, ic, ic))) {
      ctx.beginPath(); ctx.arc(cx, cy, ic / 2 - 6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,90,60,0.20)'; ctx.fill();
      text(ctx, d.icon, cx, cy + 4, 56, '#ffd9cf', 'center');
    }
    ctx.globalAlpha = 1;
    // 名称
    text(ctx, d.name, cx, y + 14 + ic + 27, 24, owned ? '#ffd0c6' : '#c8b5b0', 'center');
    // 持有态小标（置于名称下方，避免与大图标重叠）
    const tag = owned ? (star >= 3 ? '已满级' : `已获得 ${star}★`) : '未获得';
    const tw = owned ? 96 : 72;
    fillRoundRect(ctx, cx - tw / 2, y + 14 + ic + 43, tw, 24, 12, owned ? UR_COLOR : 'rgba(255,255,255,0.10)');
    text(ctx, tag, cx, y + 14 + ic + 56, 13, owned ? '#2a0b06' : '#9aa8b6', 'center');
  }

  function draw(ctx, s, push, panelShell) {
    const id = (s.panel && s.panel.stage) || s.stage || 'ancient';
    const F = CONFIG.FIELDS[id] || CONFIG.FIELDS.ancient;
    // 先按真实换行算内容高度，再开壳（避免固定 800 导致底部大片留白 / 换行多时溢出）
    const bullets = [];
    (F.desc || []).forEach((line) => {
      wrapText(ctx, '· ' + line, 600, 20).forEach((seg, i) => bullets.push({ seg, first: i === 0 }));
    });
    const cardH = 218;   // 图标 129 + 名称 + 持有态小标
    const panelH = Math.max(600, Math.min(980, 596 + bullets.length * 30));
    const y0 = panelShell(ctx, s, push, '战场说明', panelH, true);

    // ---- 战场条 ----
    const gx = 60, gw = 630, gy = y0 + 92, gh = 88;
    const g = ctx.createLinearGradient(gx, gy, gx + gw, gy + gh);
    g.addColorStop(0, F.tint);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.globalAlpha = 0.30;
    fillRoundRect(ctx, gx, gy, gw, gh, 14, g);
    ctx.globalAlpha = 1;
    strokeRoundRect(ctx, gx, gy, gw, gh, 14, F.tint, 1.4);
    text(ctx, F.name, gx + 22, gy + 34, 30, '#ffffff', 'left');
    text(ctx, F.subtitle, gx + 22, gy + 66, 18, '#b9c6d4', 'left');
    ctx.restore();

    // ---- 玩法说明 ----
    let cy = gy + gh + 32;
    text(ctx, '玩法', 62, cy, 21, F.tint, 'left');
    cy += 26;
    bullets.forEach((b) => {
      text(ctx, b.seg, b.first ? 64 : 84, cy + 13, 20, '#c7d2de', 'left');
      cy += 30;
    });

    // ---- 分隔 ----
    cy += 12;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(60, cy); ctx.lineTo(690, cy); ctx.stroke();
    cy += 32;

    // ---- 专属掉落 ----
    const urs = urListOf(id);
    text(ctx, '专属掉落', 62, cy, 23, UR_COLOR, 'left');
    if (urs.length) text(ctx, '20 / 40 / 60 波 Boss', 690, cy, 16, '#8e6a62', 'right');

    const cardY = cy + 20;
    if (urs.length) {
      const cw = 290, gap = 30;
      const x0 = 375 - (urs.length * cw + (urs.length - 1) * gap) / 2;
      urs.forEach((d, i) => _urCard(ctx, s, d, x0 + i * (cw + gap), cardY, cw, cardH));
    } else {
      fillRoundRect(ctx, 75, cardY, 600, 96, 14, 'rgba(255,255,255,0.03)');
      strokeRoundRect(ctx, 75, cardY, 600, 96, 14, 'rgba(255,255,255,0.10)', 1);
      const msg = id === 'abyss' ? '不产出红色圣遗物 · Boss 复用圣坛花园' : '该战场无红色圣遗物掉落';
      text(ctx, msg, 375, cardY + 48, 20, '#8e97a3', 'center');
    }

    // ---- Boss 行 ----
    const by = cardY + cardH + 42;
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath(); ctx.moveTo(60, by - 20); ctx.lineTo(690, by - 20); ctx.stroke();
    text(ctx, bossLine(id), 62, by, 18, '#a9b6c4', 'left');
  }

  return { draw };
}

module.exports = { createStageDropsScreen };
