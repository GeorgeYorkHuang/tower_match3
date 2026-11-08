'use strict';
// 只读战斗表现，不缓存敌人、技能或弹道实例。
const SMALL_BOOMERANG = 'assets/images/towers/fx/boomerang/boomerang_storm_bounce_purple.png';
const VORTEX_SPRITE = 'assets/images/towers/fx/boomerang/vortex_spin.png';
function fxCyclone(ctx, f, drawImg) {
      // 风暴镖重做：三同心圈（不可见）沿圈旋转的十字飞镖，引用 combat 实时 darts（命中消失同步）
      // 小镖改用素材图中的绿色三刃回旋镖，绕轨道自旋。
      const darts = f.darts || [];
      for (const d of darts) {
        const px = f.x + Math.cos(d.a) * d.r;
        const py = f.y + Math.sin(d.a) * d.r;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(d.a + f.t * 8);
        if (!drawImg || !drawImg(ctx, SMALL_BOOMERANG, -13, -11, 26, 22)) {
          // 资源加载前回退为旧十字镖，避免首帧空白。
          ctx.globalAlpha = 0.28;
          ctx.fillStyle = '#8e44ad';
          ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
          ctx.lineCap = 'round'; ctx.strokeStyle = '#c39bd3'; ctx.lineWidth = 5;
          ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.moveTo(0, -8); ctx.lineTo(0, 8); ctx.stroke();
          ctx.lineCap = 'butt';
        }
        ctx.restore();
      }
  }
function fxVortex(ctx, f, drawImg) {
  // 风眼涡旋（2026-11-01）：中心一枚紫色三叶回旋镖高速自旋，外圈虚线风环，两枚小镖反向环绕
  const p = Math.min(1, f.t / (f.dur || 1));
  // 1) 半径风环：淡紫虚线细环，轻微呼吸
  ctx.save();
  ctx.globalAlpha = 0.20 + 0.08 * Math.sin(f.t * 6);
  ctx.strokeStyle = '#a569bd';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 9]);
  ctx.beginPath();
  ctx.arc(f.x, f.y, f.r * (0.94 + 0.04 * Math.sin(f.t * 3)), 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
  // 2) 中心紫色回旋镖高速自旋（出生 0.3s 内快速放大，收尾略收缩）
  const scale = (0.8 + 0.25 * Math.min(1, f.t * 3)) * (1 - 0.18 * p);
  const size = 84 * scale;
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.rotate(f.t * 14);   // 高速自旋（≈2.2 圈/秒）
  if (!drawImg || !drawImg(ctx, VORTEX_SPRITE, -size / 2, -size / 2, size, size)) {
    // 资源加载前回退：紫色旋涡圆盘
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#8e44ad';
    ctx.beginPath(); ctx.arc(0, 0, size * 0.32, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  // 3) 两枚小紫镖沿环反向公转（牵引速度感）
  for (let k = 0; k < 2; k++) {
    const a = f.t * 9 + k * Math.PI;
    const px = f.x + Math.cos(a) * f.r * 0.55;
    const py = f.y + Math.sin(a) * f.r * 0.55;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(a * 2);
    if (!drawImg || !drawImg(ctx, VORTEX_SPRITE, -15, -15, 30, 30)) {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#c39bd3';
      ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}
module.exports = { fxCyclone, fxVortex };
