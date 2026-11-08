'use strict';
const TurretFx = require('./turret.js');
// 炮击/地雷/炮台表现；只读事件，实际爆炸和攻击由Combat处理。
function createCannonFx({ drawImg, loadImg }) {
const MINE_ICON = 'assets/images/towers/fx/mines/mine-sacred-v1.png';
if (loadImg) loadImg(MINE_ICON);
function fxStrikeShell(ctx, f) {
      // 升空 0.4s 后消失；经过 1s 瞄准阶段，再从目标上方 300px 处垂直落下 0.5s。
      const t1 = f.t - (f.offset || 0);
      if (t1 < 0 || t1 >= 1.9) return;
      if (t1 >= 0.4 && t1 < 1.4) return;
      let mx, my, ang;
      if (t1 < 0.4) {
        const k = t1 / 0.4;
        const eased = k * (2 - k);
        mx = f.sx; my = f.sy - 300 * eased; ang = -Math.PI / 2;
      } else {
        // t1 ≥ 1.4：从目标头顶高 300px 处出现并落下
        const k = (t1 - 1.4) / 0.5;
        mx = f.tx; my = (f.ty - 300) + 300 * k; ang = Math.PI / 2;
      }
      // 升空段出膛口焰
      if (t1 < 0.4) {
        ctx.globalAlpha = 0.9 * (1 - t1 / 0.4 * 1.25);
        ctx.fillStyle = '#ffd24a';
        ctx.beginPath(); ctx.arc(f.sx, f.sy, 6 + 10 * (t1 / 0.4), 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      // 炮弹弹体（沿飞行方向胶囊炮弹 + 尾部曳光焰，与 mortar 同款）
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(ang);
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#ff7043';
      ctx.beginPath(); ctx.ellipse(-13, 0, 13, 4.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd24a';
      ctx.beginPath(); ctx.ellipse(-17, 0, 7, 2.4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#3a2f22';
      ctx.beginPath(); ctx.ellipse(0, 0, 9, 4.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ff8c42'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(0, 0, 9, 4.6, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffd24a';
      ctx.beginPath(); ctx.arc(7, 0, 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
  }

function fxStrikeAim(ctx, f) {
      // 升空后闪烁两次：0.1s 淡入、0.2s 保持、0.2s 淡出，重复一次。
      const t = f.t - (f.offset || 0) - 0.4;
      if (t < 0 || t >= 1) return;
      let alpha;
      if (t < 0.1) alpha = t / 0.1;
      else if (t < 0.3) alpha = 1;
      else if (t < 0.5) alpha = 1 - (t - 0.3) / 0.2;
      else if (t < 0.6) alpha = (t - 0.5) / 0.1;
      else if (t < 0.8) alpha = 1;
      else alpha = 1 - (t - 0.8) / 0.2;
      const pulse = 1 + 0.08 * Math.sin(t * Math.PI * 4);
      ctx.save();
      ctx.translate(f.target ? f.target.x : f.x, f.target ? f.target.y : f.y);
      ctx.scale(pulse, pulse);
      ctx.globalAlpha = Math.max(0, alpha);
      const r = f.r || 40;
      ctx.strokeStyle = '#ffbd4a';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 2;
      const inner = r - 14, outer = r + 3;
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
        ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
        ctx.stroke();
      }
      ctx.fillStyle = '#fff1dc';
      ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
  }

function fxStrike(ctx, f) {
      // 只在炮弹 0.5s 下落阶段显示与伤害半径一致的地面预警圈。
      const t1 = f.t - (f.offset || 0);
      if (t1 < 1.4 || t1 >= 1.9) return;
      const p = (t1 - 1.4) / 0.5;
      const a = 0.45 + 0.4 * p;
      const r = f.r;
      ctx.globalAlpha = a * 0.18;
      ctx.fillStyle = '#ff5938';
      ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = a;
      ctx.strokeStyle = '#ff5938'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = a * 0.8;
      ctx.strokeStyle = '#fff1dc'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(f.x, f.y, r * 0.72, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.2;
      const c = 12;
      ctx.beginPath();
      ctx.moveTo(f.x - c, f.y); ctx.lineTo(f.x + c, f.y);
      ctx.moveTo(f.x, f.y - c); ctx.lineTo(f.x, f.y + c);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(f.x, f.y, 3, 0, Math.PI * 2); ctx.fill();
      // 旋转刻度（8 根短线绕外圈）
      ctx.strokeStyle = '#ffb071'; ctx.lineWidth = 2;
      for (let k = 0; k < 8; k++) {
        const ang = k * 0.785 + (f.seed || 0) + f.t * 3;
        const r1 = r * 0.92, r2 = r;
        ctx.beginPath();
        ctx.moveTo(f.x + Math.cos(ang) * r1, f.y + Math.sin(ang) * r1);
        ctx.lineTo(f.x + Math.cos(ang) * r2, f.y + Math.sin(ang) * r2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
  }

function fxMine(ctx, f) {
      // 炮·地雷（）：雷从塔口抛投（200px/s，飞行段为移动弹体+尾焰），落地后驻留闪烁（警示脉冲环+引信）
      const flyDur = f.fly ? f.fly.dur : 0;
      const flying = f.fly && f.t < flyDur;
      const mx = flying ? f.fly.sx + (f.fly.tx - f.fly.sx) * (f.t / flyDur) : f.x;
      const my = flying ? f.fly.sy + (f.fly.ty - f.fly.sy) * (f.t / flyDur) : f.y;
      if (flying) {
        // 飞行弹体：暗色雷弹 + 尾焰拖尾
        if (!drawImg(ctx,MINE_ICON,mx-16,my-16,32,32)) {
          ctx.fillStyle='#5d4a2f';ctx.beginPath();ctx.arc(mx,my,9,0,Math.PI*2);ctx.fill();
        }
        const dir = Math.atan2(my - f.fly.sy, mx - f.fly.sx);
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = '#f39c12';
        ctx.beginPath(); ctx.arc(mx - Math.cos(dir) * 10, my - Math.sin(dir) * 10, 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.45;
        ctx.beginPath(); ctx.arc(mx - Math.cos(dir) * 17, my - Math.sin(dir) * 17, 3, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      } else {
        // 驻留：警示脉冲环（外扩淡出，提示爆炸半径 100）+ 闪烁弹体 + 引信
        const p = Math.min(1, (f.t - flyDur) / 20);
        const blink = 0.6 + 0.4 * Math.sin(p * 22 + (f.seed || 0));
        const pulse = (p * 2.1 + (f.seed || 0) / 10) % 1;
        ctx.globalAlpha = (1 - pulse) * 0.35;
        ctx.strokeStyle = '#f39c12'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(mx, my, 10 + pulse * 42, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 0.8 + blink * 0.2;
        if (!drawImg(ctx,MINE_ICON,mx-16,my-16,32,32)) {
          ctx.fillStyle='#5d4a2f';ctx.beginPath();ctx.arc(mx,my,9,0,Math.PI*2);ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
  }

function fxTurret(ctx, f) {
  return TurretFx.draw(ctx, f.turret, drawImg, loadImg);
}
return { fxStrikeShell, fxStrikeAim, fxStrike, fxMine, fxTurret };
}
module.exports = { createCannonFx };
