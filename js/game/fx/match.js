'use strict';
const CONFIG = require('../../config.js');
const MATCH_GLOW = require('../../config/match-glow.js');
const CHAIN_STYLE = require('../../config/chain-flight.js');
// 只绘制三消事件；事件队列/时钟/收益/连消攻击仍由原控制器和战斗逻辑持有。
// 飞光拖尾沿用原事件的trail，不缓存或共享事件实例。
function createMatchFx({ COLOR_FILL }) {
  function fxBeamp(ctx, f) {
      // v1.16.38b 三消飞光（美化）：光点从盘面汇聚点飞向塔位/全局技能按钮
      // 200px匀减速下落0.3s → 最低点停留0.05s → 加速上升0.65s。
      const elapsed=Math.max(0,Math.min(MATCH_GLOW.duration,f.t));
      const p=elapsed/MATCH_GLOW.duration;
      const riseStart=MATCH_GLOW.dropDuration+MATCH_GLOW.holdDuration;
      let x,y;
      if(elapsed<=MATCH_GLOW.dropDuration){
        const w=elapsed/MATCH_GLOW.dropDuration;
        x=f.x0;y=f.y0+CHAIN_STYLE.dropDistance*w*(2-w);
      }else if(elapsed<=riseStart){
        x=f.x0;y=f.y0+CHAIN_STYLE.dropDistance;
      }else{
        const q=Math.min(1,(elapsed-riseStart)/MATCH_GLOW.riseDuration),qq=q*q;
        x=f.x0+(f.x1-f.x0)*qq;
        y=f.y0+CHAIN_STYLE.dropDistance+(f.y1-f.y0-CHAIN_STYLE.dropDistance)*qq;
      }
      const col = COLOR_FILL[f.blockColor] || f.color || '#ffffff';
      if (!f.trail) f.trail = [];
      f.trail.push({ x, y });
      if (f.trail.length > 8) f.trail.shift();
      // 拖尾：越靠后越淡越小（v1.16.41 ×1.5）
      for (let ti = 0; ti < f.trail.length - 1; ti++) {
        const tp = f.trail[ti];
        const k = (ti + 1) / f.trail.length;
        ctx.globalAlpha = 0.10 + 0.35 * k * (1 - p);
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(tp.x, tp.y, 2.25 + 3.3 * k, 0, Math.PI * 2); ctx.fill();
      }
      // 本体：三层光晕（外柔光 → 中彩光 → 白芯，v1.16.41 ×1.5）
      ctx.globalAlpha = 0.20 * (1 - p * 0.4);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(x, y, 19.5 + 6 * p, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.85;
      const midRadius=9+3.75*p;
      const gradient=ctx.createRadialGradient(x,y,4.2,x,y,midRadius);
      gradient.addColorStop(0,col);gradient.addColorStop(1,'#ffffff');
      ctx.fillStyle=gradient;
      ctx.beginPath();ctx.arc(x,y,midRadius,0,Math.PI*2);ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(x, y, 4.2, 0, Math.PI * 2); ctx.fill();
      // 末端：到达终点 → 扩散涟漪 + 星芒闪光（停留 0.35s 视觉，v1.16.41 涟漪同步 ×1.5）
      if (p >= 0.8) {
        const q = (p - 0.8) / 0.2;
        const qq = 1 - Math.pow(1 - q, 2);
        ctx.globalAlpha = (1 - q) * 0.75;
        ctx.strokeStyle = col;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(f.x1, f.y1, 9 + qq * 45, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = (1 - q) * 0.9;
        ctx.lineWidth = 2.5;
        const rr = 6 + qq * 24;
        ctx.beginPath();
        ctx.moveTo(f.x1 - rr, f.y1); ctx.lineTo(f.x1 + rr, f.y1);
        ctx.moveTo(f.x1, f.y1 - rr); ctx.lineTo(f.x1, f.y1 + rr);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
  }

  function fxMatch(ctx, f) {
      // 三消消除反馈：彩色星芒迸发（十字线 + 中心白点，随进度扩散淡出）+ v1.17.29 环形冲击波
      const p = Math.min(1, f.t / f.dur);
      const r = 6 + p * 16;
      const col = (f.color && COLOR_FILL[f.color]) ? COLOR_FILL[f.color] : '#ffffff';
      ctx.globalAlpha = (1 - p) * 0.9;
      ctx.strokeStyle = col;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(f.x - r, f.y); ctx.lineTo(f.x + r, f.y);
      ctx.moveTo(f.x, f.y - r); ctx.lineTo(f.x, f.y + r);
      ctx.stroke();
      // v1.17.29 外扩冲击波环
      ctx.globalAlpha = (1 - p) * 0.4;
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(f.x, f.y, r + 3 + p * 10, 0, Math.PI * 2); ctx.stroke();
      const midRadius=9+3.75*p;
      const gradient=ctx.createRadialGradient(f.x,f.y,4.2,f.x,f.y,midRadius);
      gradient.addColorStop(0,col);gradient.addColorStop(1,'#ffffff');
      ctx.fillStyle=gradient;ctx.beginPath();ctx.arc(f.x,f.y,midRadius,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=col;ctx.beginPath();ctx.arc(f.x,f.y,4.2,0,Math.PI*2);ctx.fill();
  }

  /** v5.6 特殊块生成"降临"：地面光圈 + 升空光柱 + 类型符号旋转放大定格 */
  function fxSpecialSpawn(ctx, f) {
    const p = Math.min(1, f.t / (f.dur || 0.6));
    const e = 1 - Math.min(1, p * 1.5);   // 收缩系数
    const cell = f.cell || 46;
    const r0 = f.sub ? 12 : 20;
    const col = f.sub ? '#ff5566'
      : (f.color && COLOR_FILL[f.color] ? COLOR_FILL[f.color]
        : (f.s === 'rainbow' ? '#ffe8a5' : '#ffffff'));
    // 地面光圈（类型色渐扩）
    ctx.globalAlpha = (1 - p) * 0.9;
    ctx.strokeStyle = col; ctx.lineWidth = 2 + e * 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(f.x, f.y, r0 * (1.6 - e * 0.6), 0, Math.PI * 2); ctx.stroke();
    // 升空光柱
    ctx.globalAlpha = (1 - p) * 0.55;
    ctx.strokeStyle = col; ctx.lineWidth = 3;
    const rise = 1 - Math.min(1, p * 1.8);
    ctx.beginPath();
    ctx.moveTo(f.x, f.y + r0 * 1.4);
    ctx.lineTo(f.x, f.y - r0 * (0.5 + rise * 1.1));
    ctx.stroke();
    // 类型符号：旋转 + 缩放定格
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate((1 - e) * 0.8);
    const sc = 0.6 + e * 0.7;
    ctx.scale(sc, sc);
    ctx.globalAlpha = (1 - p) * 0.95;
    ctx.strokeStyle = col; ctx.lineWidth = 3;
    ctx.beginPath();
    if (f.s === 'row') { ctx.moveTo(-r0, 0); ctx.lineTo(r0, 0); }
    else if (f.s === 'col') { ctx.moveTo(0, -r0); ctx.lineTo(0, r0); }
    else if (f.s === 'cross') { ctx.moveTo(-r0, 0); ctx.lineTo(r0, 0); ctx.moveTo(0, -r0); ctx.lineTo(0, r0); }
    else if (f.s === 'split') { ctx.moveTo(-r0 * 0.6, 0); ctx.lineTo(r0 * 0.6, 0); ctx.moveTo(0, -r0 * 0.6); ctx.lineTo(0, r0 * 0.6); }
    else if (f.s === 'rand') { ctx.moveTo(0, -r0); ctx.lineTo(r0 * 0.5, r0 * 0.4); ctx.lineTo(-r0 * 0.4, 0); ctx.lineTo(r0 * 0.3, -r0 * 0.5); }
    else { ctx.arc(0, 0, r0 * 0.55, 0, Math.PI * 2); }   // rainbow 环形
    ctx.stroke();
    ctx.restore();
    // 中心白点
    ctx.globalAlpha = (1 - p) * 0.8;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(f.x, f.y, 2 + (1 - p) * 4, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  /** v5.6 特殊块引爆：预告警示（前 25%）→ 多层爆环 + 放射线 + 粒子迸发（级联延迟由 f.t<0 控制） */
  function fxSpecialBlast(ctx, f) {
    const dur = f.dur || 0.5;
    const p = Math.min(1, f.t / dur);
    const cell = f.cell || 46;
    const col = f.s === 'rand' ? '#c69aff'
      : (f.s === 'rainbow' ? '#ffffff'
        : (f.color && COLOR_FILL[f.color] ? COLOR_FILL[f.color] : '#ffffff'));
    // 预告帧（前 25%）：波及格红框警示闪烁 / 主块白闪蓄力
    if (p < 0.25) {
      const q = p / 0.25;
      ctx.globalAlpha = (0.3 + 0.5 * Math.abs(Math.sin(q * Math.PI * 3))) * (1 - q * 0.5);
      ctx.strokeStyle = f.main ? '#ffffff' : '#ff4d5e';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(f.x - cell / 2 + 3, f.y - cell / 2 + 3, cell - 6, cell - 6);
      if (f.main) {
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = (1 - q) * 0.5;
        ctx.beginPath(); ctx.arc(f.x, f.y, 4 + q * 8, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      return;
    }
    const bp = (p - 0.25) / 0.75;   // 爆炸段 0..1
    ctx.globalAlpha = (1 - bp) * 0.9;
    ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // 波及格小闪：十字星 + 外扩环
    const r = 5 + bp * 10;
    ctx.beginPath();
    ctx.moveTo(f.x - r, f.y); ctx.lineTo(f.x + r, f.y);
    ctx.moveTo(f.x, f.y - r); ctx.lineTo(f.x, f.y + r);
    ctx.stroke();
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(f.x, f.y, r * 0.5, 0, Math.PI * 2); ctx.stroke();
    if (f.main) {
      // 主爆：类型刃线 + 第二层爆环 + 放射线 + 中心白闪 + 粒子
      const R = 30 + bp * 46;
      ctx.lineWidth = 5.5;
      ctx.beginPath();
      if (f.s === 'row') { ctx.moveTo(f.x - R, f.y); ctx.lineTo(f.x + R, f.y); }
      else if (f.s === 'col') { ctx.moveTo(f.x, f.y - R); ctx.lineTo(f.x, f.y + R); }
      else if (f.s === 'cross') {
        ctx.moveTo(f.x - R, f.y); ctx.lineTo(f.x + R, f.y);
        ctx.moveTo(f.x, f.y - R); ctx.lineTo(f.x, f.y + R);
      } else if (f.s === 'split') {
        ctx.moveTo(f.x - R * 0.7, f.y); ctx.lineTo(f.x + R * 0.7, f.y);
        ctx.moveTo(f.x, f.y - R * 0.7); ctx.lineTo(f.x, f.y + R * 0.7);
        ctx.stroke();
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(f.x - R * 0.7, f.y - R * 0.7); ctx.lineTo(f.x + R * 0.7, f.y + R * 0.7);
        ctx.moveTo(f.x + R * 0.7, f.y - R * 0.7); ctx.lineTo(f.x - R * 0.7, f.y + R * 0.7);
      } else if (f.s === 'rand') {
        for (let i = 0; i <= 4; i++) {
          const q = i / 4;
          const xx = f.x + (i % 2 ? -1 : 1) * R * 0.42;
          const yy = f.y + (q - 0.5) * R * 1.25 + Math.sin(i * 3 + f.t * 9) * 6;
          if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
        }
      } else if (f.s === 'rainbow') {
        const colors = ['#ff6174', '#ffad54', '#ffe36a', '#7ee4a1', '#78c8ff', '#c09aff'];
        colors.forEach((cc, i) => {
          ctx.strokeStyle = cc; ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(f.x, f.y, 10 + bp * 30 + i * 4, (i * Math.PI) / 3, (i * Math.PI) / 3 + 1.6);
          ctx.stroke();
        });
        ctx.strokeStyle = '#ffffff';
      }
      ctx.stroke();
      // 第二层类型色爆环
      ctx.globalAlpha = (1 - bp) * 0.55;
      ctx.strokeStyle = col; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(f.x, f.y, R * 0.55 + bp * 14, 0, Math.PI * 2); ctx.stroke();
      // 放射线
      ctx.lineWidth = 2;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + bp * 0.5;
        ctx.beginPath();
        ctx.moveTo(f.x + Math.cos(a) * R * 0.6, f.y + Math.sin(a) * R * 0.6);
        ctx.lineTo(f.x + Math.cos(a) * R * 0.9, f.y + Math.sin(a) * R * 0.9);
        ctx.stroke();
      }
      // 中心白闪
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(f.x, f.y, 6 + (1 - bp) * 10, 0, Math.PI * 2); ctx.fill();
      // 粒子迸发
      if (f.parts) {
        f.parts.forEach((pt) => {
          const qq = bp * 0.75;
          const px = f.x + pt.dx * pt.sp * qq;
          const py = f.y + pt.dy * pt.sp * qq;
          ctx.globalAlpha = (1 - bp) * 0.95;
          ctx.fillStyle = pt.col;
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(pt.rot + bp * 2);
          ctx.fillRect(-pt.sz / 2, -pt.sz / 2, pt.sz, pt.sz);
          ctx.restore();
        });
      }
    }
    ctx.globalAlpha = 1;
  }

  /** v5.6 全屏爆闪：特殊块引爆瞬间整屏闪（0.14s 渐隐；v5.6.8 支持自定义颜色/强度，用于五消金色爆闪） */
  function fxScreenFlash(ctx, f) {
    const p = Math.min(1, f.t / (f.dur || 0.14));
    const col = f.color || '#ffffff';
    const a = f.alpha != null ? f.alpha : 0.14;
    ctx.globalAlpha = (1 - p) * a;
    ctx.fillStyle = col;
    ctx.fillRect(0, 0, CONFIG.DESIGN.W, CONFIG.DESIGN.H);
    ctx.globalAlpha = 1;
  }

  /** v5.6.8 五消·彩虹生成：七色旋转光柱 + 光环升腾（0.55s） */
  function fxRainbowSpawn(ctx, f) {
    const p = Math.min(1, f.t / (f.dur || 0.55));
    const e = 1 - p;
    const R = f.cell || 46;
    const COLORS = ['#ff6174', '#ffad54', '#ffe36a', '#7ee4a1', '#78c8ff', '#c09aff'];
    // 光环：七色分段圆弧旋转 + 收缩
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(p * 2.4);
    const rr = R * (0.55 + e * 0.55);
    COLORS.forEach((cc, i) => {
      ctx.strokeStyle = cc; ctx.lineWidth = 3 + e * 3;
      ctx.globalAlpha = (1 - p) * 0.95;
      ctx.beginPath();
      ctx.arc(0, 0, rr, (i / 6) * Math.PI * 2, (i / 6 + 0.42) * Math.PI * 2);
      ctx.stroke();
    });
    // 升腾光柱（上细下粗）
    ctx.globalAlpha = (1 - p) * 0.6;
    const rise = Math.min(1, p * 1.5);
    const grad = ctx.createLinearGradient(0, R * 0.5, 0, -R * (1.2 + rise * 0.8));
    grad.addColorStop(0, '#ffe36a');
    grad.addColorStop(1, 'rgba(255,227,106,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-R * 0.18, R * 0.5);
    ctx.lineTo(R * 0.18, R * 0.5);
    ctx.lineTo(R * 0.06, -R * (1.1 + rise * 0.8));
    ctx.lineTo(-R * 0.06, -R * (1.1 + rise * 0.8));
    ctx.closePath();
    ctx.fill();
    // 中心白点脉冲
    ctx.globalAlpha = (1 - p) * 0.9;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(0, 0, 3 + e * 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** v5.6.8 五消·自动扫描：金色光幕从棋盘顶扫到底，扫过格金色描边高亮（0.5s） */
  function fxScanSweep(ctx, f) {
    const p = Math.min(1, f.t / (f.dur || 0.5));
    const { w, h, cell } = f;
    const sy = f.y + p * h;   // 光幕前沿 y
    // 光幕主体：横向渐亮带
    const band = 34;
    const grad = ctx.createLinearGradient(0, sy - band, 0, sy);
    grad.addColorStop(0, 'rgba(255,217,77,0)');
    grad.addColorStop(1, 'rgba(255,217,77,0.5)');
    ctx.fillStyle = grad;
    ctx.fillRect(f.x, sy - band, w, band);
    // 前沿线
    ctx.strokeStyle = '#ffe36a'; ctx.lineWidth = 2.5;
    ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.moveTo(f.x, sy); ctx.lineTo(f.x + w, sy); ctx.stroke();
    // 已扫过格子金色描边（间隔闪烁，增强"扫过"感）
    ctx.globalAlpha = 0.5 * (1 - p * 0.5);
    ctx.strokeStyle = '#ffd94d'; ctx.lineWidth = 1.2;
    const rows = Math.max(1, Math.floor((sy - f.y) / cell));
    for (let r = 0; r < rows && r < h / cell; r++) {
      for (let c = 0; c < w / cell; c++) {
        if ((r + c) % 2) continue;
        ctx.strokeRect(f.x + c * cell + 2, f.y + r * cell + 2, cell - 4, cell - 4);
      }
    }
    ctx.globalAlpha = 1;
  }

  /** v5.6.8 五消·染色：该色涟漪两圈扩散 + 染色格水波闪光 */
  function fxRecolorWave(ctx, f) {
    const p = Math.min(1, f.t / (f.dur || 0.4));
    const cell = f.cell || 46;
    const col = (f.color && COLOR_FILL[f.color]) || '#7ee4a1';
    ctx.globalAlpha = (1 - p) * 0.85;
    ctx.strokeStyle = col; ctx.lineCap = 'round';
    for (let k = 0; k < 2; k++) {
      const ph = (p * 1.4 + k * 0.5) % 1;
      const r = cell * (0.4 + ph * 3.2);
      ctx.lineWidth = 3 * (1 - ph) + 1;
      ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, Math.PI * 2); ctx.stroke();
    }
    // 染色格水波闪光（命中格按距离扩散期渐现）
    (f.cells || []).forEach(([gx, gy], i) => {
      const s = 1 - Math.min(1, Math.max(0, (p * 2.2 - i * 0.07)));
      if (s <= 0) return;
      ctx.globalAlpha = s * 0.65;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(gx, gy, 3 + (1 - s) * 8, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = col;
      ctx.globalAlpha = s * 0.3;
      ctx.beginPath(); ctx.arc(gx, gy, cell * 0.32 * s, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  /** v5.6.8 五消·随机播种：星光从五消中心射向播种格 + 落地闪光环 */
  function fxSeedStar(ctx, f) {
    const p = Math.min(1, f.t / (f.dur || 0.5));
    const q = Math.max(0, p);
    const x = f.x + (f.tx - f.x) * q;
    const y = f.y + (f.ty - f.y) * q;
    // 星光本体（十字芒 + 光点）
    ctx.globalAlpha = q < 0.98 ? 1 : (1 - p) * 1;
    ctx.strokeStyle = '#ffe36a'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 8, y); ctx.lineTo(x + 8, y);
    ctx.moveTo(x, y - 8); ctx.lineTo(x, y + 8);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    // 轨迹拖尾
    ctx.strokeStyle = 'rgba(255,227,106,0.5)';
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(f.x + (f.tx - f.x) * Math.max(0, q - 0.14), f.y + (f.ty - f.y) * Math.max(0, q - 0.14)); ctx.lineTo(x, y); ctx.stroke();
    // 落地闪光环
    if (q >= 0.92) {
      const lp = (q - 0.92) / 0.08;
      ctx.globalAlpha = (1 - lp) * 0.9;
      ctx.strokeStyle = '#ffd94d'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(f.tx, f.ty, 4 + lp * 16, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = (1 - lp) * 0.7;
      ctx.beginPath(); ctx.arc(f.tx, f.ty, 8 * (1 - lp) + 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** v5.6.8 五消·彩虹全消粒子雨：目标色方块碎裂粒子从棋盘格升腾下落 */
  function fxRainParticle(ctx, f) {
    const p = Math.min(1, f.t / (f.dur || 0.8));
    const cell = f.cell || 46;
    const col = (f.color && COLOR_FILL[f.color]) || '#ffffff';
    ctx.globalAlpha = (1 - p) * 0.9;
    const n = 6;
    for (let i = 0; i < n; i++) {
      const s = (i / n + p * 0.3) % 1;
      const dx = Math.sin(i * 2.4 + p * 5) * cell * 0.4;
      const dy = -cell * 0.5 * s + Math.cos(i * 3.1) * cell * 0.12;
      const sz = 3 + (1 - s) * 3;
      ctx.fillStyle = col;
      ctx.save();
      ctx.translate(f.x + dx, f.y + dy);
      ctx.rotate(p * 4 + i);
      ctx.fillRect(-sz / 2, -sz / 2, sz, sz);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }


  return { fxBeamp, fxMatch, fxSpecialSpawn, fxSpecialBlast, fxScreenFlash, fxRainbowSpawn, fxScanSweep, fxRecolorWave, fxSeedStar, fxRainParticle };
}
module.exports = { createMatchFx };
