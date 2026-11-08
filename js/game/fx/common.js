'use strict';
const { text } = require('../ui.js');
// 通用表现只读事件；素材加载与动画帧仍由宿主提供，不接管伤害或事件生命周期。
function createCommonFx({ drawImg, IMG_SRC, drawAnimSheet, animVariantOf }) {
  function fxFloatText(ctx, f) {
    const p = Math.min(1, f.t / (f.dur || 1));
    ctx.globalAlpha = Math.max(0, 1 - p);
    if (f.outlineColor) {
      ctx.save();
      ctx.font = `bold ${f.size || 22}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.strokeStyle = f.outlineColor; ctx.lineWidth = f.outlineWidth || 3;
      ctx.lineJoin = 'round';
      ctx.strokeText(f.text, f.x, f.y - 34 * p);
      ctx.restore();
    }
    text(ctx, f.text, f.x, f.y - 34 * p, f.size || 22, f.color || '#ffd24a', 'center');
    ctx.globalAlpha = 1;
  }

  function fxHitwall(ctx, f) {
      // 城墙受击闪光（怪物攻城命中）
      const p = Math.min(1, f.t / f.dur);
      ctx.globalAlpha = (1 - p) * 0.8;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(f.x - 160, f.y - 2, 320, 4);
      ctx.globalAlpha = 1;
  }

  function fxBullet(ctx, f) {
      const p = Math.min(1, f.t / f.dur);
      const x = f.x + (f.tx - f.x) * p;
      const y = f.y + (f.ty - f.y) * p;
      if (!IMG_SRC.bullet || !drawImg(ctx, IMG_SRC.bullet, x - 8, y - 8, 16, 16)) {
        ctx.fillStyle = f.color || '#ffd24a';
        ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
      }
  }

  function fxBoom(ctx, f) {
      const p = Math.min(1, f.t / f.dur);
      // 统一爆炸演出：anim_explosion 精灵表按颜色变体播放
      // （替换原 assets/images/explosionN 序列帧，并移除 程序化"爆炸增强"叠加段，避免重叠渲染）
      const size = (f.r ? f.r * 2.4 : 108);
      if (!drawAnimSheet(ctx, 'explosion', animVariantOf(f.color), f.x, f.y, size, p)) {
        // 兜底：精灵表未加载时简版闪光圆
        const r = 14 + p * 26;
        ctx.globalAlpha = (1 - p) * 0.8;
        ctx.fillStyle = f.color || '#ff9f43';
        ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
  }

  function fxFlashFx(ctx, f) {
      const p = Math.min(1, f.t / f.dur);
      // 命中火花：anim_spark 四芒星（6帧/15fps），替换原程序化闪光圆（避免重叠渲染）
      if (!drawAnimSheet(ctx, 'spark', 'gold', f.x, f.y, 60, p)) {
        ctx.globalAlpha = (1 - p) * 0.9;
        ctx.fillStyle = f.color || '#ffffff';
        ctx.beginPath(); ctx.arc(f.x, f.y, 6 + p * 8, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
  }

  function fxParticleFx(ctx, f) {
      // 技能特效粒子：随机方向小圆点 + 速度衰减 + 淡出（灼烧/毒泡/冰晶/电花/爆炸碎片）
      const p = Math.min(1, f.t / f.dur);
      const col = f.color || '#ffffff';
      const n = f.n || 6, spread = f.spread || 40, speed = f.speed || 120, size = f.size || 5;
      ctx.globalAlpha = (1 - p) * 0.9;
      for (let i = 0; i < n; i++) {
        const seed = ((i * 9301 + f.x * 7 + f.y * 13) % 97) / 97; // 稳定伪随机方向
        const ang = seed * Math.PI * 2;
        const dist = p * (speed * (0.4 + 0.6 * ((i * 5171) % 100) / 100) * 0.16 + speed * p * 0.05);
        const px = f.x + Math.cos(ang) * dist;
        const py = f.y + Math.sin(ang) * dist - p * p * 14; // 轻微上浮
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(px, py, size * (1 - p * 0.5), 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
  }

  function fxRingFx(ctx, f) {
      // 技能特效扩散环：描边圆随进度扩散淡出（冰冻/爆炸冲击/寒潮/毒雾）
      const p = Math.min(1, f.t / f.dur);
      ctx.globalAlpha = (1 - p) * 0.85;
      ctx.strokeStyle = f.color || '#ffffff';
      ctx.lineWidth = f.width || 4;
      ctx.beginPath(); ctx.arc(f.x, f.y, (f.rMax || 60) * (0.25 + 0.75 * p), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
  }

  function fxBeamFx(ctx, f) {
      // 技能特效连线：两点间亮线淡出（电连锁/电弧/雷暴/毒扩散）
      const p = Math.min(1, f.t / f.dur);
      ctx.globalAlpha = (1 - p) * 0.9;
      ctx.strokeStyle = f.color || '#f4d03f';
      ctx.lineWidth = f.width || 3.5;
      ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke();
      ctx.globalAlpha = 1;
  }
  return { fxFloatText, fxHitwall, fxBullet, fxBoom, fxFlashFx, fxParticleFx, fxRingFx, fxBeamFx };
}
module.exports = { createCommonFx };
