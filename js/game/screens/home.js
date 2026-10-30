'use strict';
const CONFIG = require('../../config.js');
const { fillRoundRect, strokeRoundRect, text } = require('../ui.js');

// Presentation only: dependencies are shared helpers, never a player save.
function createHomeScreen({ drawImg, skillRow }) {
  function menuBattle(ctx, s, push) {
    const stage = s.stage || 'ancient';
    const F = CONFIG.FIELDS[stage] || CONFIG.FIELDS.ancient;
    const isTest = stage === 'test';
    const tint = F.tint;
    // v1.17.48 战场面板背景整体移除：只留图标 + 战场名；图标放大 30%（260→338）
    const iw = 338, ix = 375 - iw / 2, iy = 480;
    const nameY = iy + iw + 42;

    // 命中区先注册箭头再注册战场本体：命中测试按 push 顺序取首个命中，
    // 箭头光晕圈与图标命中区重叠时保证箭头优先。
    const arR = 30, ay = iy + iw / 2, gap = 36;
    const aLx = ix - gap - arR, aRx = ix + iw + gap + arR;
    push('stagePrev', null, aLx - arR - 7, ay - arR - 7, (arR + 7) * 2, (arR + 7) * 2);
    push('stageNext', null, aRx - arR - 7, ay - arR - 7, (arR + 7) * 2, (arR + 7) * 2);
    push('stage', { id: stage }, ix, iy, iw, iw + 62);

    const locked = !isTest && F.unlockWave && (s.bestWave || 0) < F.unlockWave;

    // v1.16.78 战场图标：无背景直出（v1.17.48 放大 30% → 338px；锁定态整体压暗）
    ctx.globalAlpha = locked ? 0.4 : 1;
    const badge = drawImg(ctx, isTest ? 'assets/images/menubg/icon_stage_test.png' : `assets/images/menubg/icon_stage_${stage}.png`, ix, iy, iw, iw);
    ctx.globalAlpha = 1;
    if (!badge) {
      ctx.beginPath(); ctx.arc(375, iy + iw / 2, iw / 2, 0, Math.PI * 2); ctx.fillStyle = tint; ctx.fill();
      text(ctx, isTest ? '🧪' : '🏰', 375, iy + iw / 2 + 12, 130, '#ffffff', 'center');
    }
    // 战场名（v1.17.47：54px 金色渐变 + 立体投影，与页面主标题「深窟远征」同款工艺）
    ctx.font = 'bold 54px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillText(F.name, 375 + 3, nameY + 4);
    const ng = ctx.createLinearGradient(0, nameY - 27, 0, nameY + 27);
    ng.addColorStop(0, '#fff3c4'); ng.addColorStop(0.45, '#f7c948'); ng.addColorStop(1, '#d99e16');
    ctx.fillStyle = ng;
    ctx.fillText(F.name, 375, nameY);
    // v1.16.78 锁定态：未解锁战场显示 🔒 徽标 + 解锁条件（v1.17.48 无面板版：徽标悬浮图标上方）
    if (locked) {
      fillRoundRect(ctx, 375 - 92, iy + 8, 184, 44, 22, 'rgba(0,0,0,0.65)');
      strokeRoundRect(ctx, 375 - 92, iy + 8, 184, 44, 22, '#f0b45c', 1.5);
      text(ctx, `🔒 最深 ${F.unlockWave} 波解锁`, 375, iy + 36, 22, '#f0b45c', 'center');
      text(ctx, `当前最佳 ${s.bestWave || 0} 波`, 375, iy + 68, 18, '#c9b28a', 'center');
    }

    // ◀ ▶ 战场切换箭头（v1.17.48 移到战场图标两侧、保持 36px 间距；垂直对齐图标中心）
    const arrow = (ax, dir) => {
      const isPrev = dir === '‹';   // v1.16.127 修正：左侧朝左=上一个，右侧朝右=下一个
      const glow = 0.10 + 0.06 * Math.sin(Date.now() / 420 + (isPrev ? 0 : 2.1));
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
    arrow(aLx, '‹');
    arrow(aRx, '›');
    // Capsule entry button and skill rows share their left/right edges.
    // v1.17.48 按钮 440→374（再缩短 15%）；配色固定金色，不随战场切换变色
    const ey = 950, eh = 80, entryW = 374, entryX = (750 - entryW) / 2;
    push('enter', null, entryX, ey, entryW, eh);
    const bgrad = ctx.createLinearGradient(0, ey, 0, ey + eh);
    bgrad.addColorStop(0, '#f7c948'); bgrad.addColorStop(1, '#d99e16');
    fillRoundRect(ctx, entryX, ey, entryW, eh, eh / 2, bgrad);
    strokeRoundRect(ctx, entryX, ey, entryW, eh, eh / 2, 'rgba(255,255,255,0.4)', 2);
    fillRoundRect(ctx, entryX + 16, ey + 7, entryW - 32, 16, 8, 'rgba(255,255,255,0.22)');
    text(ctx, '⚔ 进入战斗', 375, ey + 46, 36, '#ffffff', 'center');
    // v1.17.47 技能配置行：单行双分区，随版面整体下移 150（1130→1280）
    skillRow(ctx, s, push, 55, 1280, 640, 170);
    // v1.16.44 移除主界面「测试战场 · 免三消直测技能」入口按钮（战场卡 ◀▶ 切换仍可进入测试战场）
  }
  return { menuBattle };
}
module.exports = { createHomeScreen };
