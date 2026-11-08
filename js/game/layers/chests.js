const UI = require('../../config/board-chests.js');
'use strict';
const { fillRoundRect, strokeRoundRect, text } = require('../ui.js');
// 仅绘制宝箱/金光/入盘与开箱飞行；领取和发奖由board-chests工作流处理。
function createChestLayer({ drawImg, IMG_SRC }) {
  function fieldChests(ctx, list) {
    if (!list || !list.length) return;
    const now = Date.now();
    list.forEach((c) => {
      if(c.stage==='board'||c.hidden)return;
      if(c.stage==='toBoard'){
        const p=Math.min(1,c.flightT/UI.flight),ease=1-Math.pow(1-p,3),size=UI.startSize+((c.cellSize||56)*UI.cellRatio-UI.startSize)*ease;
        const x=c.fromX+(c.x-c.fromX)*ease,y=c.fromY+(c.y-c.fromY)*ease-Math.sin(p*Math.PI)*85;
        ctx.save();ctx.shadowColor='#f8d680';ctx.shadowBlur=12;
        if(!drawImg(ctx,IMG_SRC.chestClosed,x-size/2,y-size/2,size,size))text(ctx,'箱',x,y,30,'#f8d680','center');
        ctx.restore();return;
      }
      const s = 84;
      const opening = c.animT != null;   // ：animT 非空 = 开箱/飞行动画播放中（main.js 推进）
      // 飞行阶段：全开帧从原位飞向屏幕中心并逐渐放大（ease-in-out 缓动）
      let fx = c.x, fy = c.y, scale = 1;
      if (opening && c.stage === 'fly') {
        const p = Math.min(1, c.flyT / 0.7);
        const e = p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p); // ease-in-out
        fx = c.x + (375 - c.x) * e;
        fy = c.y + (560 - c.y) * e;
        scale = 1 + 1.6 * e; // 84 → 最大 ≈218
      }
      const b = 0.6 + 0.4 * Math.sin(now / 320 + c.x);
      // 呼吸光晕（开启中加强；飞行中随位置与放大）
      const gR = s * 1.5 * scale;
      const g = ctx.createRadialGradient(fx, fy, 4, fx, fy, gR);
      g.addColorStop(0, '#ffd34d'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.globalAlpha = opening ? 0.42 : 0.22 + 0.12 * b;
      ctx.beginPath(); ctx.arc(fx, fy, gR, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      // 海胆状放射金光：绘于箱体背后，不改变战斗随机序列。
      ctx.save();ctx.translate(fx,fy);ctx.rotate(now/9000);
      const core=s*0.38*scale;
      for(let k=0;k<32;k++) {
        const angle=k*Math.PI*2/32;
        const reach=s*scale*(k%3===0?1.12:k%2===0?0.92:0.72)*(0.95+0.05*b);
        const half=k%3===0?0.024:0.016;
        ctx.beginPath();ctx.moveTo(Math.cos(angle-half)*core,Math.sin(angle-half)*core);
        ctx.lineTo(Math.cos(angle)*reach,Math.sin(angle)*reach);
        ctx.lineTo(Math.cos(angle+half)*core,Math.sin(angle+half)*core);ctx.closePath();
        ctx.fillStyle=k%3===0?'#fff0b1':'#f8c348';ctx.globalAlpha=(opening?0.7:0.4)+0.12*b;ctx.fill();
      }
      ctx.restore();
      // 地面投影（仅静止时）
      if (!opening) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.ellipse(c.x, c.y + s / 2 + 4, s / 2 * 0.85, 6, 0, 0, Math.PI * 2); ctx.fill();
      }
      // 五帧动画（）：关闭 → 微开 → 半开 → 快开 → 全开，0.4s 播完；飞行阶段恒用全开帧
      const p = opening ? Math.min(1, c.animT / 0.4) : 0;
      const src = (opening && c.stage === 'fly') ? IMG_SRC.chestOpen
        : (p < 0.2 ? IMG_SRC.chestClosed : (p < 0.4 ? IMG_SRC.chestQuarter : (p < 0.6 ? IMG_SRC.chestHalf : (p < 0.8 ? IMG_SRC.chestFast : IMG_SRC.chestOpen))));
      const ss = s * scale;
      if (!drawImg(ctx, src, fx - ss / 2, fy - ss / 2, ss, ss)) {
        // 回退：金色渐变箱体（图片未加载时）
        fillRoundRect(ctx, fx - ss / 2, fy - ss / 2 + 10, ss, ss - 10, 8, 'rgba(0,0,0,0.35)');
        const bg = ctx.createLinearGradient(fx - ss / 2, fy - ss / 2 + 10, fx - ss / 2, fy + ss / 2);
        bg.addColorStop(0, '#ffe08a'); bg.addColorStop(1, '#c8860a');
        fillRoundRect(ctx, fx - ss / 2, fy - ss / 2 + 10, ss, ss - 10, 8, bg);
        fillRoundRect(ctx, fx - ss / 2 - 3, fy - ss / 2, ss + 6, 18, 6, '#f7c948');
        strokeRoundRect(ctx, fx - ss / 2 - 3, fy - ss / 2, ss + 6, 18, 6, 'rgba(255,255,255,0.6)', 1);
        fillRoundRect(ctx, fx - 8, fy - 6, 16, 16, 4, '#8a5c00');
        ctx.fillStyle = '#ffd34d';
        ctx.beginPath(); ctx.arc(fx, fy + 2, 3, 0, Math.PI * 2); ctx.fill();
      }
      // 飞行金光：轨迹粒子 + 到达中心时的光爆
      if (opening && c.stage === 'fly') {
        const p = Math.min(1, c.flyT / 0.7);
        for (let k = 0; k < 8; k++) {
          const kk = ((k * 0.618 + 0.2) % 1);
          if (kk > p) continue;
          const tx = c.x + (375 - c.x) * kk, ty = c.y + (560 - c.y) * kk;
          const fade = Math.max(0, 1 - (p - kk) * 2.4);
          ctx.fillStyle = k % 2 ? '#ffd34d' : '#fff6d8';
          ctx.globalAlpha = 0.8 * fade;
          ctx.beginPath(); ctx.arc(tx, ty, 2.5 + 1.6 * scale, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
        // 到达中心光爆（后 30% 时间）
        if (p > 0.7) {
          const bp = (p - 0.7) / 0.3;
          const br = 40 + 130 * bp;
          const bg2 = ctx.createRadialGradient(375, 560, 6, 375, 560, br);
          bg2.addColorStop(0, 'rgba(255,244,214,0.9)');
          bg2.addColorStop(0.4, 'rgba(255,211,77,0.45)');
          bg2.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = bg2;
          ctx.globalAlpha = 0.9 * (1 - bp * 0.4);
          ctx.beginPath(); ctx.arc(375, 560, br, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
      // 点击提示（未开启时显示）
      if (!opening && c.stage!=='ready') text(ctx, '飞入棋盘', c.x, c.y - s / 2 - 12, 15, '#ffd34d', 'center');
    });
  }
  return { fieldChests };
}
module.exports = { createChestLayer };
