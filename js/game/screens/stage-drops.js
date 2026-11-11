/**
 * 主页战场详情：以战场名为标题，在庭院主题背景上展示说明与专属掉落。
 * 只负责展示，解锁与进场校验仍由战场准入模块处理。
 */
'use strict';
const CONFIG = require('../../config.js');
const { fillRoundRect, strokeRoundRect, text } = require('../ui.js');

const RED=require('../../config/red-relics.js');
const UR_COLOR = '#ff5a3c';

function urListOf(fieldId) {
  return (CONFIG.RELIC_RUN.ur || []).filter((d) => d.field === fieldId);
}

function createStageDropsScreen({ drawImg, relicIconSrc, wrapText }) {
  /**
   * 单张红件卡：只给 图标 + 名称（+ 持有态小标）。
   * ：战场介绍不再写效果文案（效果统一在圣物图鉴看），图标放大 50%（86→129）。
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
    const fragments=(s.shards&&s.shards[d.id])||0;const tag = owned ? (star >= 3 ? '已满级' : `已获得 ${star}★`) : fragments>0?'碎片 '+fragments+'/'+(CONFIG.DUPLICATE_SHARDS.ur||10):'未获得';
    const tw = owned ? 96 : 72;
    fillRoundRect(ctx, cx - tw / 2, y + 14 + ic + 43, tw, 24, 12, owned ? UR_COLOR : 'rgba(255,255,255,0.10)');
    text(ctx, tag, cx, y + 14 + ic + 56, 13, owned ? '#2a0b06' : '#9aa8b6', 'center');
  }

  function draw(ctx, s, push) {
    const id = (s.panel && s.panel.stage) || s.stage || 'ancient';
    const F = CONFIG.FIELDS[id] || CONFIG.FIELDS.ancient;
    const chapter = require('../../config/prologue.js').chapters[id];
    const urs = urListOf(id);
    // 按真实换行与掉落内容计算高度，短章节介绍不留大片空白。
    const bullets = [];
    (F.desc || []).forEach((line) => {
      wrapText(ctx, line, 550, 22).forEach((seg, i) => bullets.push({ seg, first: i === 0 }));
    });
    const cardH = 218, descH = 76 + bullets.length * 34;
    const rewardH = urs.length ? cardH : 100;
    const panelH = 160 + descH + 68 + rewardH + 42;
    const px = 25, pw = 700, y0 = Math.round((CONFIG.DESIGN.H - panelH) / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(0, 0, 750, CONFIG.DESIGN.H);
    push('panelBounds', null, px, y0, pw, panelH);
    // 复用已在游戏中使用的深绿金叶背景，失败时仍保持同色系与可读性。
    if (!drawImg(ctx, 'assets/images/interface/skins/account-info-garden-v1.png', px, y0, pw, panelH)) {
      fillRoundRect(ctx, px, y0, pw, panelH, 22, '#142b20');
      strokeRoundRect(ctx, px, y0, pw, panelH, 22, '#c7aa64', 2);
    }
    text(ctx, F.name, 375, y0 + 76, 38, '#ffe4a1', 'center');
    text(ctx, F.chapterTitle || (id === 'abyss' ? '深渊挑战' : '测试战场'), 375, y0 + 119, 21, '#b9cba9', 'center');
    const closeX = px + pw - 61, closeY = y0 + 38;
    push('panelClose', null, closeX - 24, closeY - 24, 48, 48);
    fillRoundRect(ctx, closeX - 21, closeY - 21, 42, 42, 21, '#263b2a');
    strokeRoundRect(ctx, closeX - 21, closeY - 21, 42, 42, 21, '#ad985b', 1.3);
    text(ctx, '×', closeX, closeY - 1, 30, '#eddaa5', 'center');

    // 说明区使用深绿底与金色标题，避免文字和纹理混在一起。
    const descY = y0 + 160;
    fillRoundRect(ctx, 62, descY, 626, descH, 16, 'rgba(6,26,18,0.70)');
    strokeRoundRect(ctx, 62, descY, 626, descH, 16, 'rgba(200,178,111,0.38)', 1.2);
    fillRoundRect(ctx, 82, descY + 20, 5, 24, 2, '#d6be78');
    text(ctx, '战场说明', 100, descY + 32, 25, '#f1d899', 'left');
    let cy = descY + 69;
    bullets.forEach((b) => {
      if (b.first) {
        ctx.fillStyle = '#a2bb84'; ctx.beginPath(); ctx.arc(88, cy, 3, 0, Math.PI * 2); ctx.fill();
      }
      text(ctx, b.seg, 103, cy, 22, '#e0e7d1', 'left');
      cy += 34;
    });
    const dropsY = descY + descH + 35;
    text(ctx, '专属掉落', 66, dropsY, 25, '#efbb93', 'left');
    if (urs.length) text(ctx, '通关保底 ' + RED.fragments.join('～') + ' 片', 684, dropsY, 19, '#c2b78e', 'right');
    const cardY = dropsY + 33;
    if (urs.length) {
      const cw = 290, gap = 30;
      const x0 = 375 - (urs.length * cw + (urs.length - 1) * gap) / 2;
      urs.forEach((d, i) => _urCard(ctx, s, d, x0 + i * (cw + gap), cardY, cw, cardH));
    } else {
      fillRoundRect(ctx, 62, cardY, 626, 100, 14, 'rgba(6,26,18,0.55)');
      strokeRoundRect(ctx, 62, cardY, 626, 100, 14, 'rgba(200,178,111,0.25)', 1);
      const msg = chapter && chapter.rewards.firstClearRed
        ? '首次通关赠随机 1★ 红色圣遗物'
        : chapter ? '本章不掉落红色圣遗物' : '该战场不产出红色圣遗物';
      text(ctx, msg, 375, cardY + 50, 22, '#c9d3b8', 'center');
    }
  }

  return { draw };
}

module.exports = { createStageDropsScreen };
