'use strict';
const { fillRoundRect } = require('../ui.js');
const FirepillarFx = require('./firepillar.js');
const FirewallFx = require('./firewall.js');
// 火系表现只读事件；资源/选帧仍复用原模块，伤害窗口和队列不归本模块。
function createFireFx({ loadImg, drawImg, IMG_SRC, drawFlameTongue, drawAnimSheet }) {
  class FireFx {
  fxPillar(ctx, f) {
      // 火柱帧动画（v1.17.25）：8 帧透明贴图时间轴——圈落印→汇聚→立柱→拔高→满高→抵边→崩解→余烬
      // 帧边界压代码三阶段分界（0.60/1.68/1.97s），伤害结算 pillarWaves.t=0.6 与 F3 立柱同帧，时间常数零改动
      // 贴图未加载完成时回退 _fxPillarProc 程序化绘制，不出现空技能
      const t = Math.min(f.t, f.dur), dur = f.dur;
      const cx = f.x, cy = f.y, R = f.r || 120, seed = f.seed || 0;
      // 判定提示细环（0~0.6s 由 0 扩到 R，之后短暂渐隐；仅 1.5px 细线不填充，精确标伤害范围）
      const ring = FirepillarFx.warnRing(t, R);
      if (ring) {
        ctx.globalAlpha = 0.35 * ring.fade;
        ctx.strokeStyle = '#ff7043'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(cx, cy, ring.radius, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      const fi = FirepillarFx.frameIndex(t, dur);
      for (let i = 1; i <= FirepillarFx.N; i++) loadImg(IMG_SRC['firepillar' + i]);
      const { W, H, bx, by } = FirepillarFx.layout(cx, cy, R);
      const drawn = drawImg(ctx, IMG_SRC['firepillar' + fi], bx, by, W, H);
      if (drawn) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.45;
        drawImg(ctx, IMG_SRC['firepillar' + fi], bx, by, W, H);
        ctx.restore();
        // 上升火星（代码层粒子，0.6s 起与柱体伴生）
        for (const spark of FirepillarFx.sparkSpec(cx, cy, dur, seed, W, H, t)) {
          ctx.fillStyle = spark.color; ctx.globalAlpha = spark.alpha;
          ctx.beginPath(); ctx.arc(spark.x, spark.y, spark.r, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
        return;
      }
      this._fxPillarProc(ctx, cx, cy, R, seed, t / dur);
  }

  /* v1.17.25 程序化火柱回退（原 v1.13.9 四阶段绘制，贴图未就绪时使用） */
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

  fxFireWall(ctx, f) {
      // 火焰墙（v1.16.21 烈焰墙）：长条可穿越火墙（长 w·宽 h·持续 6s）
      // v1.17.17/18：墙体主体改为 4 帧透明贴图（12fps 循环），source-over 主体 + 45% lighter 辉光；
      //           代码层保留地面红晕与上升火花；贴图未加载完成时回退 v1.16.21 程序化绘制，不出现空墙。
      const p = Math.min(1, f.t / f.dur);
      const cx = f.x, cy = f.y, w = f.w || 100, h = f.h || 30, seed = f.seed || 0;
      const fade = FirewallFx.fade(p);
      // 地面红晕（墙体底缘）
      ctx.globalAlpha = 0.25 * fade;
      ctx.fillStyle = 'rgba(255,112,67,0.4)';
      ctx.beginPath(); ctx.ellipse(cx, cy + h / 2, w * 0.55, h * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      // 4 帧贴图：12fps 循环，按 seed 错相（同屏多面火墙不同步）；底边贴地面线，宽=墙宽，高按 512:160
      // v1.17.18：透明底帧，主体 source-over 保住卡通描边与暗红底色（加法会发白），
      //           再叠一遍 45% lighter 做辉光——暗色战场有熔光感，亮草地也不冲淡
      for (let i = 1; i <= FirewallFx.N; i++) loadImg(IMG_SRC['firewall' + i]);
      const fi = FirewallFx.frameIndex(f.t, seed);
      const { FW, FH, bx, by } = FirewallFx.layout(cx, cy, w, h);
      ctx.globalAlpha = fade;
      const drawn = drawImg(ctx, IMG_SRC['firewall' + fi], bx, by, FW, FH);
      if (drawn) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = fade * 0.45;
        drawImg(ctx, IMG_SRC['firewall' + fi], bx, by, FW, FH);
        ctx.restore();
      }
      if (!drawn) this._fxFireWallProc(ctx, cx, cy, w, h, seed, p, fade);
      // 上升火花（代码层粒子，与贴图层叠加：贴图给形，粒子给活）
      for (const spark of FirewallFx.sparkSpec(cx, cy, seed, w, h, p, fade)) {
        ctx.fillStyle = spark.color; ctx.globalAlpha = spark.alpha;
        ctx.beginPath(); ctx.arc(spark.x, spark.y, spark.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
  }

  /* v1.16.21 程序化火墙（贴图未就绪时的回退绘制：N 段竖火焰 + 亮芯） */
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

  fxRain(ctx, f) {
      // 火雨区域标识（v1.13.14）：双环 + 半透明红晕，标注火雨覆盖圈（火雨点由独立 raindrop fx 绘制）
      const p = Math.min(1, f.t / f.dur);
      const cx = f.x, cy = f.y, R = f.r || 140, seed = f.seed || 0;
      ctx.globalAlpha = 0.22 + 0.08 * Math.sin(p * 20 + seed);
      ctx.strokeStyle = '#ff7043'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#ff9f43'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.85, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(255,112,67,0.12)';
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
  }

  fxRaindrop(ctx, f) {
      // 单颗火雨点（v1.13.14）：从上方 260px 平行圈起点垂直落向落点（0.5s），落地小爆焰（0.25s 淡出）
      // 每颗独立时间线：combat 以负 t 延迟生成时刻错峰，落地瞬间同步结算伤害
      const FALL = 0.5;
      const seed = f.seed || 0;
      const s = seed % 1;
      const br = 5 + s * 4;
      if (f.t < FALL) {
        // 下落火球：起点 (x,y) → 落点 (tx,ty)，带尾焰
        const k = Math.max(0, f.t / FALL);
        const cx = f.x + (f.tx - f.x) * k;
        const cy = f.y + (f.ty - f.y) * k;
        ctx.globalAlpha = (1 - k) * 0.5 + s * 0.3;
        ctx.fillStyle = '#ff7043';
        ctx.beginPath(); ctx.arc(cx, cy - 6 - s * 14 * (1 - k * 0.5), 2.5 + s * 3, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ff7043';
        ctx.beginPath(); ctx.arc(cx, cy, br, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffe08a';
        ctx.beginPath(); ctx.arc(cx - br * 0.2, cy - br * 0.15, br * 0.5, 0, Math.PI * 2); ctx.fill();
      } else {
        // v1.16.74 落地爆焰：anim_fallstrike 冲击段（帧3-7 映射 0.25s），替换原程序化小爆焰（避免重叠渲染）
        const k = Math.min(1, (f.t - FALL) / 0.25);
        if (!drawAnimSheet(ctx, 'fallstrike', 'orange', f.tx, f.ty, 96, (3 + k * 4.99) / 8)) {
          // 兜底：原小爆焰
          ctx.globalAlpha = 0.9 * (1 - k);
          ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(f.tx, f.ty, br * (1 + k * 1.6), 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = (1 - k) * 0.9;
          ctx.fillStyle = s < 0.5 ? '#ff7043' : '#ffd24a';
          ctx.beginPath(); ctx.arc(f.tx, f.ty, br * (1 - k * 0.5), 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
  }

  }
  return new FireFx();
}
module.exports = { createFireFx };
