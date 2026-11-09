'use strict';
const { fillRoundRect } = require('../ui.js');
const PillarFrames = require('./flame-pillar-packed.js');
// 火系表现只读事件；资源/选帧仍复用原模块，伤害窗口和队列不归本模块。
function createFireFx({ loadImg, drawImg, IMG_SRC, drawFlameTongue, drawAnimSheet }) {
  const approved = require('./approved-fire.js').create(drawImg);
  const combined = {"flame-pillar":{"src":"assets/images/towers/fx/flame-pillar/flame-pillar-sheet.png","w":184,"h":256,"ox":92,"oy":232,"duration":5,"start":0,"cols":11,"n":76}};
  // 按实际绘制需要加载火柱；地面火环由approved-fire负责，不预加载旧火环。
  function drawCombinedPillar(ctx, f, id) {
    const fx = combined[id], local = f.t - fx.start;
    if (local < 0 || local >= fx.duration) return;
    const frame = Math.min(fx.n - 1, Math.floor(local * 15));
    const scale = 2 * (f.r || 120) / 120;
    ctx.save();
    drawImg(ctx, fx.src, f.x - fx.ox * scale, f.y - fx.oy * scale, fx.w * scale, fx.h * scale,
      PillarFrames[frame]);
    ctx.restore();
  }
  class FireFx {
  /** 火柱拆层：本函数为【上层】——只有柱体本体与上升火星，地面火环见 fxPillarBase */
  fxPillar(ctx, f) { drawCombinedPillar(ctx, f, 'flame-pillar'); }
  fxPillarBase(ctx, f) { approved.ring(ctx,f); }

  /* 程序化火柱回退（原 四阶段绘制，贴图未就绪时使用） */
  _fxPillarProc(ctx, cx, cy, R, seed, p) {
      if (p < 0.25) {
        // 帧 1 地上画圈：双环火圈扩张 + 圈上火苗 + 地面红晕（圈=伤害范围，半径与 explode 一致）
        const k = p / 0.25;
        const r1 = 10 + k * R;
        ctx.globalAlpha = 0.5 + 0.5 * k;
        ctx.strokeStyle = '#ff7043'; ctx.lineWidth = 3 + k * 2;
        ctx.beginPath(); ctx.arc(cx, cy, r1, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#ff9f43'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(cx, cy, r1 * 0.75, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = 'rgba(255,112,67,0.35)';
        ctx.beginPath(); ctx.arc(cx, cy, r1 * 0.7, 0, Math.PI * 2); ctx.fill();
        for (let i = 0; i < 10; i++) {
          const s = ((i * 5171 + seed * 13) % 97) / 97;
          const a = s * Math.PI * 2;
          const px0 = cx + Math.cos(a) * r1 * 0.92, py0 = cy + Math.sin(a) * r1 * 0.92;
          ctx.fillStyle = i % 2 ? '#ffd24a' : '#ff7043';
          ctx.globalAlpha = 0.7 + 0.3 * k;
          ctx.beginPath(); ctx.arc(px0, py0, 2 + s * 3.5, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      } else if (p < 0.7) {
        // 帧 2 冲天圆柱火柱：实心柱体（深橙外柱→橙中柱→黄芯柱）+ 顶部喷涌火舌 + 上升火花
        const k = (p - 0.25) / 0.45;
        const h = 30 + k * 300;
        const w = 16 + k * R * 0.42;
        fillRoundRect(ctx, cx - w / 2, cy - h, w, h, w * 0.35, '#e74c3c');
        fillRoundRect(ctx, cx - w * 0.62 / 2, cy - h * 0.94, w * 0.62, h * 0.94, w * 0.28, '#ff7043');
        fillRoundRect(ctx, cx - w * 0.3 / 2, cy - h * 0.86, w * 0.3, h * 0.86, w * 0.16, '#ffd24a');
        const sway = Math.sin(p * 17 + seed) * 10;
        drawFlameTongue(ctx, cx, cy - h, w * 0.9, 50 + k * 30, sway, '#ff7043', 0.95);
        drawFlameTongue(ctx, cx - w * 0.25, cy - h, w * 0.55, 40 + k * 24, sway * 0.8, '#ffd24a', 0.9);
        drawFlameTongue(ctx, cx + w * 0.25, cy - h, w * 0.55, 44 + k * 26, sway * 0.8, '#ff9f43', 0.9);
        for (let i = 0; i < 6; i++) {
          const s = ((i * 6173 + seed * 9) % 89) / 89;
          const sx0 = cx + (s - 0.5) * w * 0.8;
          const sy0 = cy - h * (0.15 + s * 0.7) + Math.sin(p * 22 + i + seed) * 8;
          ctx.fillStyle = s < 0.5 ? '#ff7043' : '#ffd24a';
          ctx.globalAlpha = 0.5 + s * 0.4;
          ctx.beginPath(); ctx.arc(sx0, sy0, 2 + s * 3, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      } else if (p < 0.82) {
        // 帧 3 白热冲击环扩张
        const k = (p - 0.7) / 0.12;
        ctx.globalAlpha = 0.9 * (1 - k * 0.4);
        ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(cx, cy, R * 0.3 + k * R * 0.7, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1 - k * 0.6;
        ctx.fillStyle = '#fff3c4';
        ctx.beginPath(); ctx.arc(cx, cy, 20 * (1 - k * 0.5), 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      } else {
        // 帧 4 余烬消散
        const k = (p - 0.82) / 0.18;
        drawFlameTongue(ctx, cx, cy, 14 * (1 - k * 0.7), 40 * (1 - k * 0.8), Math.sin(p * 12 + seed) * 5, '#e74c3c', 0.7 * (1 - k));
        for (let i = 0; i < 5; i++) {
          const s = ((i * 8191 + seed * 7) % 89) / 89;
          const ex = cx + (s - 0.5) * 40;
          const ey = cy - s * k * 50 - 8;
          ctx.fillStyle = s < 0.6 ? '#ff7043' : '#ffd24a';
          ctx.globalAlpha = (1 - k) * (0.3 + s * 0.5);
          ctx.beginPath(); ctx.arc(ex, ey, 2 + s * 3, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
  }

  fxFireWall(ctx, f) { approved.wall(ctx,f); }

  /* 程序化火墙（贴图未就绪时的回退绘制：N 段竖火焰 + 亮芯） */
  _fxFireWallProc(ctx, cx, cy, w, h, seed, p, fade) {
      const segs = Math.max(4, Math.round(w / 14));
      for (let i = 0; i < segs; i++) {
        const s = ((i * 5171 + seed * 13) % 97) / 97;
        const fx2 = cx - w / 2 + (i + 0.5) * (w / segs);
        const sway = Math.sin(p * 18 + i * 1.7 + seed) * 4;
        const hh = h * (0.75 + 0.35 * s) + Math.sin(p * 24 + i * 2.1) * 4;
        const col = i % 3 === 0 ? '#e74c3c' : (i % 3 === 1 ? '#ff7043' : '#ff9f43');
        ctx.globalAlpha = (0.55 + 0.3 * s) * fade;
        ctx.fillRect(fx2 - (w / segs) * 0.34, cy + h / 2 - hh, (w / segs) * 0.68, hh);
        drawFlameTongue(ctx, fx2, cy + h / 2 - hh, (w / segs) * 0.9, 8 + 4 * s, sway, col, 0.9 * fade);
      }
      ctx.globalAlpha = (0.35 + 0.25 * Math.sin(p * 26 + seed)) * fade;
      ctx.fillStyle = '#ffd24a';
      ctx.fillRect(cx - w * 0.32, cy + h / 2 - h * 0.55, w * 0.64, h * 0.55);
      ctx.globalAlpha = 1;
  }

  fxRain(ctx, f) { approved.rain(ctx,f); }

  fxRaindrop(ctx, f) { /* Meteor instances are drawn by their wave event. */ }

  }
  return new FireFx();
}
module.exports = { createFireFx };
