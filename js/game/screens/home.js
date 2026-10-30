'use strict';
const CONFIG = require('../../config.js');
const { roundRect, fillRoundRect, strokeRoundRect, text } = require('../ui.js');

// Presentation only: dependencies are shared helpers, never a player save.
function createHomeScreen({ drawImg, skillRow }) {
  function menuBattle(ctx, s, push) {
    const sx = 80, sy = 400, sw = 590, sh = 392;   // 卡片几何不变
    const stage = s.stage || 'ancient';
    const F = CONFIG.FIELDS[stage] || CONFIG.FIELDS.ancient;
    const isTest = stage === 'test';
    const tint = F.tint;
    const tintDark = F.tintDark;
    const title = F.short;
    const subtitle = F.subtitle;
    push('stage', { id: stage }, sx, sy, sw, sh);
    // 战场卡（渐变底 + 斜向光带 + 城齿装饰 + 塔色描边 + 呼吸光晕）
    const breath = 0.06 + 0.04 * Math.sin(Date.now() / 500);
    ctx.save();
    ctx.beginPath(); roundRect(ctx, sx, sy, sw, sh, 22); ctx.clip();
    const sgrad = ctx.createLinearGradient(0, sy, 0, sy + sh);
    sgrad.addColorStop(0, isTest ? '#2b2347' : '#1c2a38'); sgrad.addColorStop(1, isTest ? '#151229' : '#0e1a20');
    ctx.fillStyle = sgrad; ctx.fillRect(sx, sy, sw, sh);
    // 斜向光带（左上→右下 3 条低透明）
    ctx.globalAlpha = 0.05; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 18;
    for (let k = -1; k <= 2; k++) {
      const bx = sx + k * 260;
      ctx.beginPath(); ctx.moveTo(bx, sy + sh); ctx.lineTo(bx + 560, sy); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // 城齿装饰横带（卡片底部，象征城墙防线）
    ctx.fillStyle = isTest ? 'rgba(168,139,255,0.14)' : 'rgba(46,204,113,0.14)';
    for (let cx2 = sx + 16; cx2 < sx + sw - 16; cx2 += 44) {
      ctx.fillRect(cx2, sy + sh - 34, 26, 16);
    }
    ctx.fillRect(sx + 16, sy + sh - 20, sw - 32, 8);
    ctx.restore();
    ctx.globalAlpha = 1 + breath;
    strokeRoundRect(ctx, sx, sy, sw, sh, 22, tint, 2.5);
    ctx.globalAlpha = 1;
    // v1.16.78 战场图标：卡片内嵌超大图（顶部居中 260px，白底已抠透明）
    const badge = drawImg(ctx, isTest ? 'assets/images/menubg/icon_stage_test.png' : `assets/images/menubg/icon_stage_${stage}.png`, 375 - 130, sy + 18, 260, 260);
    if (!badge) { ctx.beginPath(); ctx.arc(375, sy + 148, 118, 0, Math.PI * 2); ctx.fillStyle = tint; ctx.fill(); text(ctx, isTest ? '🧪' : '🏰', 375, sy + 160, 100, '#ffffff', 'center'); }
    // 战场标题 + 副标题（图标下方）
    text(ctx, F.name, 375, sy + 316, 38, '#ffffff', 'center');
    text(ctx, subtitle, 375, sy + 350, 20, isTest ? '#b7a4e8' : '#8ea3b8', 'center');
    // v1.16.78 锁定态：未解锁战场显示 🔒 徽标 + 解锁条件
    const locked = !isTest && F.unlockWave && (s.bestWave || 0) < F.unlockWave;
    if (locked) {
      ctx.globalAlpha = 0.45; ctx.fillStyle = '#000';
      ctx.beginPath(); roundRect(ctx, sx, sy, sw, sh, 22); ctx.fill();
      ctx.globalAlpha = 1;
      fillRoundRect(ctx, 375 - 92, sy + 30, 184, 44, 22, 'rgba(0,0,0,0.65)');
      strokeRoundRect(ctx, 375 - 92, sy + 30, 184, 44, 22, '#f0b45c', 1.5);
      text(ctx, `🔒 最深 ${F.unlockWave} 波解锁`, 375, sy + 58, 22, '#f0b45c', 'center');
      text(ctx, `当前最佳 ${s.bestWave || 0} 波`, 375, sy + 92, 18, '#c9b28a', 'center');
    }
    text(ctx, isTest ? '免三消 · 无波次结算 · 专注技能验证' : (locked ? `达到第 ${F.unlockWave} 波后可进入此战场` : '◀ ▶ 切换战场 · 进入战斗按所选战场'), 375, sy + sh - 16, 17, locked ? '#c9a15c' : (isTest ? '#8f7cd0' : '#5a8a72'), 'center');
    // ◀ ▶ 战场切换箭头（v1.16.78 重设计：150° 钝角三角楔形，卡片高度垂直居中）
    const arR = 30;
    const arrow = (ax, dir) => {
      const ay = sy + sh / 2;   // 圆心：卡片上下高度的正中间
      const isPrev = dir === '‹';   // v1.16.127 修正：左侧朝左=上一个，右侧朝右=下一个
      const glow = 0.10 + 0.06 * Math.sin(Date.now() / 420 + (isPrev ? 0 : 2.1));
      // 命中区（含光晕）
      push(isPrev ? 'stagePrev' : 'stageNext', null, ax - arR - 7, ay - arR - 7, (arR + 7) * 2, (arR + 7) * 2);
      // 呼吸光晕
      ctx.globalAlpha = glow;
      ctx.fillStyle = tint;
      ctx.beginPath(); ctx.arc(ax, ay, arR + 7, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      // 底部投影
      ctx.globalAlpha = 0.35; ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(ax + 2, ay + 4, arR, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      // 渐变圆底
      const abg = ctx.createRadialGradient(ax - arR * 0.35, ay - arR * 0.42, arR * 0.12, ax, ay, arR);
      abg.addColorStop(0, isTest ? '#8f83f5' : '#45d48a');
      abg.addColorStop(0.55, isTest ? '#5a4bc8' : '#23a06a');
      abg.addColorStop(1, isTest ? '#3c2f8f' : '#14694a');
      ctx.fillStyle = abg;
      ctx.beginPath(); ctx.arc(ax, ay, arR, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(ax, ay, arR, 0, Math.PI * 2); ctx.stroke();
      // 150° 钝角三角楔形箭头（顶角 150°，两底角各 15°：宽扁利落的指向楔形）
      const h = 19;                       // 底边半高
      const d = Math.round(h / Math.tan(Math.PI * 150 / 360));   // 顶点深度 = h / tan75° ≈ 5
      ctx.save();
      ctx.translate(ax, ay);
      // 顶点在 -x 侧，默认朝左；右箭头（›）才镜像
      if (!isPrev) ctx.scale(-1, 1);
      const tg = ctx.createLinearGradient(-d, 0, 6, 0);
      tg.addColorStop(0, '#ffffff'); tg.addColorStop(1, '#dfe9e2');
      ctx.fillStyle = tg;
      ctx.beginPath();
      ctx.moveTo(-d, 0); ctx.lineTo(6, -h); ctx.lineTo(6, h); ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    };
    arrow(sx - 38, '‹');
    arrow(sx + sw + 38, '›');
    // Capsule entry button and skill rows share their left/right edges.
    const ey = 850, eh = 80, entryW = 440, entryX = (750 - entryW) / 2;
    push('enter', null, entryX, ey, entryW, eh);
    const bgrad = ctx.createLinearGradient(0, ey, 0, ey + eh);
    bgrad.addColorStop(0, tint); bgrad.addColorStop(1, tintDark);
    fillRoundRect(ctx, entryX, ey, entryW, eh, eh / 2, bgrad);
    strokeRoundRect(ctx, entryX, ey, entryW, eh, eh / 2, 'rgba(255,255,255,0.4)', 2);
    fillRoundRect(ctx, entryX + 16, ey + 7, entryW - 32, 16, 8, 'rgba(255,255,255,0.18)');
    text(ctx, '⚔ 进入战斗', 375, ey + 46, 36, '#ffffff', 'center');
    // v1.17.46 技能配置行：单行双分区（左「全局技能」/ 右「三消技能」），各 2 卡，卡片不带槽位文字
    skillRow(ctx, s, push, 55, 1130, 640, 170);
    // v1.16.44 移除主界面「测试战场 · 免三消直测技能」入口按钮（战场卡 ◀▶ 切换仍可进入测试战场）
  }
  return { menuBattle };
}
module.exports = { createHomeScreen };
