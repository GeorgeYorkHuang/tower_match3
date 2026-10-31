'use strict';
const CONFIG = require('../../config.js');
const PickLayout = require('./pick-layout.js');
const { fillRoundRect, strokeRoundRect, text } = require('../ui.js');
const LOGIC_H = CONFIG.DESIGN.H;
// 仅负责局内圣遗物三选一/详情绘制；奖励、重掷、暂停与关闭归原游戏逻辑。
// 命中区由调用方传入，不缓存Run、Meta或候选数据。
function createBattleRelics({ drawImg, IMG_SRC, TOWER_TINT, relicIconSrc }) {
  function relicPickLayer(ctx, pick, onPick, elapsed, gold) {
    if (!pick || !pick.candidates) return;
    const box = PickLayout.geometry('relic', pick), { x, y, w, h } = box;
    // v1.16.74 弹出动画：从宝箱中心(375,560) 0.5s 从小到大（easeOutBack 轻微回弹）
    const pe = Math.min(1, (elapsed || 0) / 500);
    const es = 1 + 2.70158 * Math.pow(pe - 1, 3) + 1.70158 * Math.pow(pe - 1, 2);
    const sc = pe >= 1 ? 1 : Math.min(1, Math.max(0.2, es));
    const al = pe >= 1 ? 1 : Math.min(1, pe * 1.6);
    ctx.save();
    ctx.globalAlpha = al;


    // 全屏遮罩：中心暖光、四角压暗（比纯黑更有"显现"感）
    const mask = ctx.createRadialGradient(375, 560, 60, 375, 560, 900);
    mask.addColorStop(0, 'rgba(30,20,6,0.78)');
    mask.addColorStop(1, 'rgba(8,6,10,0.92)');
    ctx.fillStyle = mask;
    PickLayout.backdrop(ctx, box);
    // Only the panel animates; its bounded scale can never cover the exposed tower strip.
    ctx.translate(375, y + h / 2); ctx.scale(sc, sc); ctx.translate(-375, -y - h / 2);
    // 背景星光粒子（确定性伪随机闪烁）
    const now = Date.now();
    for (let i = 0; i < 26; i++) {
      const sx = x + (i * 97.3) % w, sy = y + ((i * 61.7) % h);
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(now / 700 + i * 1.37));
      ctx.fillStyle = i % 3 ? '#ffd34d' : '#fff6d8';
      ctx.globalAlpha = 0.35 * tw;
      ctx.beginPath(); ctx.arc(sx, sy, i % 4 === 0 ? 2.2 : 1.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = al;
    // 主窗口：暗金渐变底 + 双层金描边
    const bg = ctx.createLinearGradient(0, y, 0, y + h);
    bg.addColorStop(0, '#2a2112'); bg.addColorStop(0.5, '#241b0e'); bg.addColorStop(1, '#1d1a10');
    fillRoundRect(ctx, x, y, w, h, 20, bg);
    strokeRoundRect(ctx, x - 3, y - 3, w + 6, h + 6, 23, '#c8860a', 3);
    strokeRoundRect(ctx, x, y, w, h, 20, '#ffd34d', 1.5);
    // 顶部金色光柱
    const beam = ctx.createLinearGradient(375, y - 6, 375, y + 120);
    beam.addColorStop(0, 'rgba(255,211,77,0.0)');
    beam.addColorStop(0.4, 'rgba(255,211,77,0.34)');
    beam.addColorStop(1, 'rgba(255,211,77,0.0)');
    ctx.fillStyle = beam;
    ctx.fillRect(375 - 90, y - 6, 180, 126);
    // 圣物纹章（菱形宝石）
    const gx = 375, gy = y + 44;
    ctx.save();
    ctx.translate(gx, gy);
    ctx.rotate(Math.PI / 4);
    const gem = ctx.createLinearGradient(-12, -12, 12, 12);
    gem.addColorStop(0, '#fff2b3'); gem.addColorStop(0.5, '#ffd34d'); gem.addColorStop(1, '#c8860a');
    ctx.fillStyle = gem;
    ctx.fillRect(-12, -12, 24, 24);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1.5;
    ctx.strokeRect(-12, -12, 24, 24);
    ctx.restore();
    text(ctx, '圣物显现', 375, y + 76, 38, '#ffd34d', 'center');
    text(ctx, '获得圣遗物本局生效 · 塔圣遗物仅对应塔在场时出现', 375, y + 112, 18, '#c9b27a', 'center');
    // 3 个候选卡片（v1.16.73 纵向扩容：bh 240→300）
    const bw = 188, bh = 300, gap = 16;
    const startX = (750 - (bw * 3 + gap * 2)) / 2;
    const cy = y + 138;
    pick.candidates.forEach((c, i) => {
      const cx = startX + i * (bw + gap);
      const tint = c.tint ? (TOWER_TINT[c.tint] || '#f7c948') : '#f7c948';
      // 卡片：暗金底 + 金色描边 + 外侧柔光
      const cg = ctx.createLinearGradient(0, cy, 0, cy + bh);
      cg.addColorStop(0, '#2b2313'); cg.addColorStop(1, '#211b0e');
      fillRoundRect(ctx, cx, cy, bw, bh, 16, cg);
      strokeRoundRect(ctx, cx, cy, bw, bh, 16, 'rgba(255,211,77,0.85)', 1.8);
      const glow = ctx.createRadialGradient(cx + bw / 2, cy + 76, 20, cx + bw / 2, cy + 76, 130);
      glow.addColorStop(0, tint + '38'); glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(cx + bw / 2, cy + 76, 130, 0, Math.PI * 2); ctx.fill();
      // 图标：双环发光（外环 tint 呼吸 + 内环白描）
      const dia = 100;
      const icx = cx + bw / 2, icy = cy + 76;
      ctx.beginPath(); ctx.arc(icx, icy, dia / 2, 0, Math.PI * 2);
      ctx.fillStyle = tint + '2e'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(icx, icy, dia / 2, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = tint; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(icx, icy, dia / 2 + 5, 0, Math.PI * 2); ctx.stroke();
      const cSrc = relicIconSrc(c.id);
      if (!(cSrc && drawImg(ctx, cSrc, icx - dia / 2, icy - dia / 2, dia, dia))) {
        text(ctx, c.icon, icx, icy + 4, 48, '#ffffff', 'center');
      }
      text(ctx, c.name, cx + bw / 2, cy + 158, 25, '#ffe9a8', 'center');
      // 效果描述（按宽度换行，最多 3 行，防出框）
      const d = c.desc || '';
      const maxW = bw - 20;
      const lines = [];
      let cur = '';
      for (const ch of d) {
        const test = cur + ch;
        const testW = test.length * 16 + (test.match(/[A-Za-z0-9.%+\-×]/g) || []).length * 4;
        if (testW > maxW && cur) { lines.push(cur); cur = ch; if (lines.length >= 3) break; }
        else cur = test;
      }
      if (lines.length < 3 && cur) lines.push(cur);
      lines.forEach((ln, li) => {
        text(ctx, ln, cx + bw / 2, cy + 190 + li * 22, 16, '#c9b27a', 'center');
      });
      // 选择按钮：金色渐变
      const btnX = cx + 24, btnY = cy + bh - 62, btnW = bw - 48, btnH = 46;
      const btnG = ctx.createLinearGradient(0, btnY, 0, btnY + btnH);
      btnG.addColorStop(0, '#3d2f14'); btnG.addColorStop(1, '#2a1f0c');
      fillRoundRect(ctx, btnX, btnY, btnW, btnH, 12, btnG);
      strokeRoundRect(ctx, btnX, btnY, btnW, btnH, 12, '#ffd34d', 1.5);
      text(ctx, '选 择', btnX + btnW / 2, btnY + btnH / 2, 24, '#ffd34d', 'center');
      onPick[i] = { hit: (px, py) => px >= btnX && px <= btnX + btnW && py >= btnY && py <= btnY + btnH };
    });
    // 本局共享重掷计数，500银币起、每次+500，无窗口次数上限。
    const cost = pick.rerollCost || CONFIG.PICK_REROLL.first;
    const canPay = (gold || 0) >= cost;
    const ry = y + h - 96, rw = 300, rh = 44, rx = (750 - rw) / 2;
    const rbG = ctx.createLinearGradient(0, ry, 0, ry + rh);
    rbG.addColorStop(0, canPay ? '#4a3a18' : '#332c22');
    rbG.addColorStop(1, canPay ? '#33250f' : '#241f18');
    fillRoundRect(ctx, rx, ry, rw, rh, 14, rbG);
    strokeRoundRect(ctx, rx, ry, rw, rh, 14, canPay ? '#ffd34d' : '#5a5448', 1.5);
    if (canPay) {
      text(ctx, `重掷 · ${cost} 银币`, 375, ry + rh / 2 + 2, 22, '#ffd34d', 'center');

    } else {
      text(ctx, `银币不足（需 ${cost}）`, 375, ry + rh / 2 + 2, 20, '#9a8a6a', 'center');
    }
    onPick.reroll = { hit: (px, py) => px >= rx && px <= rx + rw && py >= ry && py <= ry + rh };
    // 底部提示
    text(ctx, '✦ 选择后立即生效 · 本局结束失效 ✦', 375, y + h - 24, 17, '#8a7a4a', 'center');
    ctx.restore();
  }

  /** v1.16.73 本局圣遗物详情弹层（点击顶部状态栏圣遗物行打开）：分页列表，每页 8 行，▲▼ 翻页 */
  function relicDetailLayer(ctx, relics, page, onPick) {
    const w = 640, h = 760;
    const x = (750 - w) / 2, y = (LOGIC_H - h) / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(0, 0, 750, LOGIC_H);
    fillRoundRect(ctx, x, y, w, h, 20, '#1d242e');
    strokeRoundRect(ctx, x, y, w, h, 20, '#7ca8ff', 2);
    text(ctx, '本局圣遗物', 375, y + 54, 34, '#ffffff', 'center');
    text(ctx, `已获得 ×${relics.length} · 获得即本局生效${relics.some((r) => r.star3) ? ' · ★3 质变生效中' : ''}`, 375, y + 92, 18, '#8ea3b8', 'center');
    // 关闭（右上）
    ctx.beginPath(); ctx.arc(x + w - 50, y + 44, 20, 0, Math.PI * 2);
    ctx.fillStyle = '#3a4553'; ctx.fill();
    text(ctx, '✕', x + w - 50, y + 52, 26, '#ffffff', 'center');
    onPick.bg = { hit: (px, py) => px < x || px > x + w || py < y || py > y + h };
    onPick.close = { hit: (px, py) => Math.abs(px - (x + w - 50)) < 30 && Math.abs(py - (y + 44)) < 30 };
    if (!relics.length) return;
    // 分页列表（每页 8 行）
    const per = 8, pages = Math.ceil(relics.length / per);
    const pg = Math.min(Math.max(page || 0, 0), pages - 1);
    const list = relics.slice(pg * per, pg * per + per);
    let ry = y + 130;
    list.forEach((r) => {
      fillRoundRect(ctx, x + 40, ry, w - 80, 64, 12, '#20262f');
      ctx.beginPath(); ctx.arc(x + 76, ry + 32, 18, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(247,201,72,0.18)'; ctx.fill();
      ctx.strokeStyle = 'rgba(247,201,72,0.45)'; ctx.lineWidth = 1.2; ctx.stroke();
      const rSrc = relicIconSrc(r.id);
      if (!(rSrc && drawImg(ctx, rSrc, x + 61, ry + 17, 30, 30))) text(ctx, r.icon, x + 76, ry + 34, 22, '#ffffff', 'center');
      text(ctx, r.name, x + 110, ry + 26, 20, '#ffffff', 'left');
      if (r.star3) {   // v1.16.113 ★3 质变徽章
        fillRoundRect(ctx, x + w - 90, ry + 8, 42, 24, 12, '#ffb347');
        text(ctx, '★3', x + w - 69, ry + 26, 14, '#5c3800', 'center');
      }
      const dd = String(r.desc || '');
      const brief = dd.length > 22 ? dd.slice(0, 22) + '…' : dd;
      text(ctx, brief, x + 110, ry + 52, 15, '#9fb2c3', 'left');
      ry += 74;
    });
    // 翻页：▲ ▼ + 页码
    const by = y + 130 + per * 74 + 8;
    fillRoundRect(ctx, x + 40, by, 120, 46, 12, '#2c3542');
    strokeRoundRect(ctx, x + 40, by, 120, 46, 12, '#7ca8ff', 1.2);
    text(ctx, '▲ 上一页', x + 100, by + 30, 18, pages > 1 ? '#9fb2c3' : '#5a6c80', 'center');
    text(ctx, `${pg + 1} / ${pages}`, 375, by + 30, 20, '#f7c948', 'center');
    fillRoundRect(ctx, x + w - 160, by, 120, 46, 12, '#2c3542');
    strokeRoundRect(ctx, x + w - 160, by, 120, 46, 12, '#7ca8ff', 1.2);
    text(ctx, '下一页 ▼', x + w - 100, by + 30, 18, pages > 1 ? '#9fb2c3' : '#5a6c80', 'center');
    onPick.prev = { hit: (px, py) => px >= x + 40 && px <= x + 160 && py >= by && py <= by + 46 };
    onPick.next = { hit: (px, py) => px >= x + w - 160 && px <= x + w - 40 && py >= by && py <= by + 46 };
  }

  return { relicPickLayer, relicDetailLayer };
}
module.exports = { createBattleRelics };
