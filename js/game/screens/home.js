'use strict';
const CONFIG = require('../../config.js');
const { roundRect, fillRoundRect, strokeRoundRect, text } = require('../ui.js');

/* v1.17.47 战场卡羽化：离屏画布缓存（wx 小游戏 / 浏览器预览双通道，取不到则退化为硬边裁剪） */
let _featherCv = null;
function getFeatherCanvas(w, h) {
  try {
    if (!_featherCv) {
      if (typeof wx !== 'undefined' && wx.createOffscreenCanvas) _featherCv = wx.createOffscreenCanvas({ type: '2d', width: w, height: h });
      else if (typeof document !== 'undefined' && document.createElement) { _featherCv = document.createElement('canvas'); _featherCv.width = w; _featherCv.height = h; }
    }
    if (_featherCv && _featherCv.width !== w) { _featherCv.width = w; _featherCv.height = h; }
    return _featherCv;
  } catch (e) { return null; }
}

// Presentation only: dependencies are shared helpers, never a player save.
function createHomeScreen({ drawImg, skillRow }) {
  function menuBattle(ctx, s, push) {
    const sx = 80, sy = 500, sw = 590, sh = 392;   // v1.17.47 战场卡下移 100（400→500）
    const stage = s.stage || 'ancient';
    const F = CONFIG.FIELDS[stage] || CONFIG.FIELDS.ancient;
    const isTest = stage === 'test';
    const tint = F.tint;
    const tintDark = F.tintDark;
    push('stage', { id: stage }, sx, sy, sw, sh);

    /** 卡片全部内容（坐标系为全局绝对坐标；羽化通道里会先平移到离屏原点） */
    const drawCardContent = (c) => {
      c.save();
      c.beginPath(); roundRect(c, sx, sy, sw, sh, 22); c.clip();
      const sgrad = c.createLinearGradient(0, sy, 0, sy + sh);
      sgrad.addColorStop(0, isTest ? '#2b2347' : '#1c2a38'); sgrad.addColorStop(1, isTest ? '#151229' : '#0e1a20');
      c.fillStyle = sgrad; c.fillRect(sx, sy, sw, sh);
      // 斜向光带（左上→右下 3 条低透明）
      c.globalAlpha = 0.05; c.strokeStyle = '#ffffff'; c.lineWidth = 18;
      for (let k = -1; k <= 2; k++) {
        const bx = sx + k * 260;
        c.beginPath(); c.moveTo(bx, sy + sh); c.lineTo(bx + 560, sy); c.stroke();
      }
      c.globalAlpha = 1;
      // 城齿装饰横带（卡片底部，象征城墙防线；随羽化遮罩自然淡出）
      c.fillStyle = isTest ? 'rgba(168,139,255,0.14)' : 'rgba(46,204,113,0.14)';
      for (let cx2 = sx + 16; cx2 < sx + sw - 16; cx2 += 44) {
        c.fillRect(cx2, sy + sh - 34, 26, 16);
      }
      c.fillRect(sx + 16, sy + sh - 20, sw - 32, 8);
      // v1.16.78 战场图标：卡片内嵌超大图（顶部居中 260px，白底已抠透明）
      const badge = drawImg(c, isTest ? 'assets/images/menubg/icon_stage_test.png' : `assets/images/menubg/icon_stage_${stage}.png`, 375 - 130, sy + 18, 260, 260);
      if (!badge) { c.beginPath(); c.arc(375, sy + 148, 118, 0, Math.PI * 2); c.fillStyle = tint; c.fill(); text(c, isTest ? '🧪' : '🏰', 375, sy + 160, 100, '#ffffff', 'center'); }
      // 战场名（v1.17.47：38→54px，金色渐变 + 立体投影，与页面主标题「深窟远征」同款工艺）
      const nameY = sy + 322;
      c.font = 'bold 54px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = 'rgba(0,0,0,0.55)';
      c.fillText(F.name, 375 + 3, nameY + 4);
      const ng = c.createLinearGradient(0, nameY - 27, 0, nameY + 27);
      ng.addColorStop(0, '#fff3c4'); ng.addColorStop(0.45, '#f7c948'); ng.addColorStop(1, '#d99e16');
      c.fillStyle = ng;
      c.fillText(F.name, 375, nameY);
      // v1.16.78 锁定态：未解锁战场显示 🔒 徽标 + 解锁条件
      const locked = !isTest && F.unlockWave && (s.bestWave || 0) < F.unlockWave;
      if (locked) {
        c.globalAlpha = 0.45; c.fillStyle = '#000';
        c.beginPath(); roundRect(c, sx, sy, sw, sh, 22); c.fill();
        c.globalAlpha = 1;
        fillRoundRect(c, 375 - 92, sy + 30, 184, 44, 22, 'rgba(0,0,0,0.65)');
        strokeRoundRect(c, 375 - 92, sy + 30, 184, 44, 22, '#f0b45c', 1.5);
        text(c, `🔒 最深 ${F.unlockWave} 波解锁`, 375, sy + 58, 22, '#f0b45c', 'center');
        text(c, `当前最佳 ${s.bestWave || 0} 波`, 375, sy + 92, 18, '#c9b28a', 'center');
      }
      c.restore();
    };

    // v1.17.47 战场卡：去描边，四边 40px 羽化（离屏 destination-in 双向渐变；无离屏环境退化为硬边裁剪）
    const FEATHER = 40;
    let feathered = false;
    try {
      const oc = getFeatherCanvas(sw, sh);
      if (oc && oc.getContext) {
        const octx = oc.getContext('2d');
        if (octx && octx.createLinearGradient) {
          octx.clearRect(0, 0, sw, sh);
          octx.save(); octx.translate(-sx, -sy);
          drawCardContent(octx);
          octx.restore();
          octx.globalCompositeOperation = 'destination-in';
          const gh = octx.createLinearGradient(0, 0, sw, 0);
          gh.addColorStop(0, 'rgba(0,0,0,0)'); gh.addColorStop(FEATHER / sw, 'rgba(0,0,0,1)');
          gh.addColorStop(1 - FEATHER / sw, 'rgba(0,0,0,1)'); gh.addColorStop(1, 'rgba(0,0,0,0)');
          octx.fillStyle = gh; octx.fillRect(0, 0, sw, sh);
          const gv = octx.createLinearGradient(0, 0, 0, sh);
          gv.addColorStop(0, 'rgba(0,0,0,0)'); gv.addColorStop(FEATHER / sh, 'rgba(0,0,0,1)');
          gv.addColorStop(1 - FEATHER / sh, 'rgba(0,0,0,1)'); gv.addColorStop(1, 'rgba(0,0,0,0)');
          octx.fillStyle = gv; octx.fillRect(0, 0, sw, sh);
          octx.globalCompositeOperation = 'source-over';
          ctx.drawImage(oc, sx, sy);
          feathered = true;
        }
      }
    } catch (e) { feathered = false; }
    if (!feathered) {
      ctx.save();
      drawCardContent(ctx);
      ctx.restore();
    }
    // ◀ ▶ 战场切换箭头（v1.16.78 重设计：150° 钝角三角楔形，卡片高度垂直居中；随卡片下移）
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
    const ey = 950, eh = 80, entryW = 440, entryX = (750 - entryW) / 2;   // v1.17.47 下移 100（850→950）
    push('enter', null, entryX, ey, entryW, eh);
    const bgrad = ctx.createLinearGradient(0, ey, 0, ey + eh);
    bgrad.addColorStop(0, tint); bgrad.addColorStop(1, tintDark);
    fillRoundRect(ctx, entryX, ey, entryW, eh, eh / 2, bgrad);
    strokeRoundRect(ctx, entryX, ey, entryW, eh, eh / 2, 'rgba(255,255,255,0.4)', 2);
    fillRoundRect(ctx, entryX + 16, ey + 7, entryW - 32, 16, 8, 'rgba(255,255,255,0.18)');
    text(ctx, '⚔ 进入战斗', 375, ey + 46, 36, '#ffffff', 'center');
    // v1.17.47 技能配置行：单行双分区，随版面整体下移 150（1130→1280）
    skillRow(ctx, s, push, 55, 1280, 640, 170);
    // v1.16.44 移除主界面「测试战场 · 免三消直测技能」入口按钮（战场卡 ◀▶ 切换仍可进入测试战场）
  }
  return { menuBattle };
}
module.exports = { createHomeScreen };
