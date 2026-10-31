'use strict';
// 只读战斗表现，不缓存敌人、技能或弹道实例。
function fxVine(ctx, f) {
      // 毒藤攻击帧动画（v1.16.1）：藤蔓从塔口伸展生长到目标（dur 0.55s）——主藤弯曲生长 + 叶片 + 末端毒花苞绽放
      const p = Math.min(1, f.t / f.dur);
      const seed = f.seed || 0;
      const wobDir = (seed % 2 ? 1 : -1);
      const dist = Math.hypot(f.tx - f.x, f.ty - f.y) || 1;
      const grow = Math.min(1, p * 1.35); // 生长进度（略快于总时长，先到位后绽放）
      // 主藤（贝塞尔弯曲，只画到生长进度）
      ctx.strokeStyle = '#27ae60'; ctx.lineWidth = 3.5; ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(f.x, f.y);
      const mx = (f.x + f.tx) / 2 + wobDir * 22 * Math.sin(p * 2 + seed);
      const my = (f.y + f.ty) / 2 - 8;
      ctx.quadraticCurveTo(mx, my, f.x + (f.tx - f.x) * grow, f.y + (f.ty - f.y) * grow);
      ctx.stroke();
      // 内亮线（藤蔓质感）
      ctx.strokeStyle = '#2ecc71'; ctx.lineWidth = 1.6; ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.moveTo(f.x, f.y);
      ctx.quadraticCurveTo(mx, my, f.x + (f.tx - f.x) * grow, f.y + (f.ty - f.y) * grow);
      ctx.stroke();
      // 叶片（沿藤分布，随生长出现）
      ctx.fillStyle = '#2ecc71'; ctx.globalAlpha = 0.75;
      for (let k = 0; k < 4; k++) {
        const tp = k / 4;
        if (tp > grow) break;
        const lx = f.x + (f.tx - f.x) * tp;
        const ly = f.y + (f.ty - f.y) * tp;
        const lwob = wobDir * (1 + tp);
        ctx.beginPath();
        ctx.ellipse(lx + lwob * 3, ly + Math.sin(tp * 5 + seed) * 4, 3.2, 1.8, tp * 2, 0, Math.PI * 2);
        ctx.fill();
      }
      // 末端毒花苞（到达后绽放 + 毒液溅点）
      if (p > 0.75) {
        const bloom = (p - 0.75) / 0.25;
        const bx = f.tx, by = f.ty;
        ctx.fillStyle = '#28b463'; ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.arc(bx, by, 3 + bloom * 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#58d68d'; ctx.globalAlpha = (1 - bloom) * 0.8;
        for (let k = 0; k < 6; k++) {
          const a = k * 1.047 + seed;
          ctx.beginPath(); ctx.arc(bx + Math.cos(a) * (7 + bloom * 8), by + Math.sin(a) * 4, 1.6, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
  }

function fxThorn(ctx, f) {
      // 毒棒攻击弹道（v1.16.1）：绿色毒刺飞射目标 + 尾随毒粒 + 命中溅射
      const p = Math.min(1, f.t / f.dur);
      const x = f.x + (f.tx - f.x) * p;
      const y = f.y + (f.ty - f.y) * p;
      const ang = Math.atan2(f.ty - f.y, f.tx - f.x);
      // 尾随毒粒
      for (let k = 0; k < 3; k++) {
        const tp = Math.max(0, p - 0.06 * (k + 1));
        const px = f.x + (f.tx - f.x) * tp;
        const py = f.y + (f.ty - f.y) * tp;
        ctx.fillStyle = '#58d68d'; ctx.globalAlpha = 0.5 * (1 - k / 3) * (1 - p * 0.4);
        ctx.beginPath(); ctx.arc(px + (Math.random() - 0.5) * 3, py + (Math.random() - 0.5) * 3, 2.2 - k * 0.5, 0, Math.PI * 2); ctx.fill();
      }
      // 毒针体（细长三角朝向目标）
      ctx.save();
      ctx.translate(x, y); ctx.rotate(ang);
      ctx.fillStyle = '#2e7d32'; ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.moveTo(8, 0); ctx.lineTo(-4, -2.4); ctx.lineTo(-4, 2.4);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#6fcf97'; ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.arc(0, 0, 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // 命中溅射（末尾帧毒液四溅）
      if (p > 0.85) {
        const sp = (p - 0.85) / 0.15;
        ctx.fillStyle = '#2e7d32'; ctx.globalAlpha = (1 - sp) * 0.7;
        for (let k = 0; k < 5; k++) {
          const a = k * 1.257 + f.t;
          ctx.beginPath(); ctx.arc(f.tx + Math.cos(a) * sp * 9, f.ty + Math.sin(a) * sp * 7, 1.6, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
  }
module.exports = { fxVine, fxThorn };
