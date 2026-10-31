'use strict';
// 炮击/地雷/炮台表现；只读事件，实际爆炸和攻击由Combat处理。
function createCannonFx({ drawImg }) {
function fxStrikeShell(ctx, f) {
      // v1.16.31 炮火支援：逐发弹道——0.3s 从塔口升空至高点 300px 后**消失**；发射 1.0s 后
      //   在目标头顶高 300px 处**出现**并 0.3s 垂直落下打击（第 1 发落地 1.3s，之后每发 +0.1s）
      const t1 = f.t - (f.offset || 0);
      if (t1 < 0 || t1 >= 1.3) return;   // 未发射或已落地
      if (t1 >= 0.3 && t1 < 1.0) return; // 高点至重现之间：炮弹不可见（不再悬停）
      let mx, my, ang;
      if (t1 < 0.3) {
        const k = t1 / 0.3;
        mx = f.sx; my = f.sy - 300 * k; ang = -Math.PI / 2;
      } else {
        // t1 ≥ 1.0：从目标头顶高 300px 处垂直出现并落下
        const k = (t1 - 1.0) / 0.3;
        mx = f.tx; my = (f.ty - 300) + 300 * k; ang = Math.PI / 2;
      }
      // 升空段出膛口焰
      if (t1 < 0.3) {
        ctx.globalAlpha = 0.9 * (1 - t1 / 0.3 * 1.25);
        ctx.fillStyle = '#ffd24a';
        ctx.beginPath(); ctx.arc(f.sx, f.sy, 6 + 10 * (t1 / 0.3), 0, Math.PI * 2); ctx.fill();
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

function fxStrike(ctx, f) {
      // v1.16.31 炮火支援：地面炮击圈——offset 偏移后于落地前 0.5s 出现，棕色描边标识 130px 受击范围，持续至落地爆炸
      const t1 = f.t - (f.offset || 0);
      if (t1 < 0.5 || t1 >= 1.3) return;   // 未到预警时刻或已爆炸
      const p = (t1 - 0.5) / 0.8;
      const a = 0.25 + 0.55 * p;   // 淡入
      ctx.globalAlpha = a * 0.30;
      ctx.fillStyle = '#8d5a2b';
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 0.62, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = a;
      // 棕色描边主圈（受击范围标识）
      ctx.strokeStyle = '#b0602a'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 0.62, 0, Math.PI * 2); ctx.stroke();
      // 内白圈 + 中心瞄准点
      ctx.globalAlpha = a * 0.8;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 0.34, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.2;
      const c = 7;
      ctx.beginPath();
      ctx.moveTo(f.x - c, f.y); ctx.lineTo(f.x + c, f.y);
      ctx.moveTo(f.x, f.y - c); ctx.lineTo(f.x, f.y + c);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(f.x, f.y, 2.4, 0, Math.PI * 2); ctx.fill();
      // 旋转刻度（8 根短线绕外圈，棕色）
      ctx.strokeStyle = '#c07a35'; ctx.lineWidth = 2;
      for (let k = 0; k < 8; k++) {
        const ang = k * 0.785 + (f.seed || 0) + f.t * 3;
        const r1 = f.r * 0.66, r2 = f.r * 0.72;
        ctx.beginPath();
        ctx.moveTo(f.x + Math.cos(ang) * r1, f.y + Math.sin(ang) * r1);
        ctx.lineTo(f.x + Math.cos(ang) * r2, f.y + Math.sin(ang) * r2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
  }

function fxMine(ctx, f) {
      // 炮·地雷（v1.16.22）：雷从塔口抛投（200px/s，飞行段为移动弹体+尾焰），落地后驻留闪烁（警示脉冲环+引信）
      const flyDur = f.fly ? f.fly.dur : 0;
      const flying = f.fly && f.t < flyDur;
      const mx = flying ? f.fly.sx + (f.fly.tx - f.fly.sx) * (f.t / flyDur) : f.x;
      const my = flying ? f.fly.sy + (f.fly.ty - f.fly.sy) * (f.t / flyDur) : f.y;
      if (flying) {
        // 飞行弹体：暗色雷弹 + 尾焰拖尾
        ctx.fillStyle = '#5d4a2f';
        ctx.beginPath(); ctx.arc(mx, my, 9, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#b5651d'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(mx, my, 9, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#f39c12';
        ctx.beginPath(); ctx.arc(mx, my, 3, 0, Math.PI * 2); ctx.fill();
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
        ctx.globalAlpha = blink;
        ctx.fillStyle = '#5d4a2f';
        ctx.beginPath(); ctx.arc(mx, my, 9, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#b5651d'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(mx, my, 9, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#f39c12';
        ctx.beginPath(); ctx.arc(mx, my, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#b5651d';
        ctx.fillRect(mx - 1, my - 14, 2, 6);
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(p * 30 + (f.seed || 0));
        ctx.fillStyle = '#ffd24a';
        ctx.beginPath(); ctx.arc(mx, my - 13, 2, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
  }

function fxTurret(ctx, f) {
      // 炮·炮台（v1.16.10）：帧动画贴图——1 落地 / 2 成型 / 3 瞄准 / 4 开火
      // 常态循环 1→2→3（1.2s 周期）；combat 开火时在 fx 上打 attackT（f.t 时刻），0.3s 内显示第 4 帧
      const p = Math.min(1, f.t / f.dur);
      const seed = f.seed || 0;
      // 底座光环（部署确认圈，保留淡显）
      ctx.globalAlpha = (0.22 + 0.14 * Math.sin(p * 6 + seed)) * Math.min(1, f.t / 0.4);
      ctx.strokeStyle = '#d89e63'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(f.x, f.y - 2, 16, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
      const atk = f.attackT !== undefined && f.t - f.attackT < 0.3;
      let frameIdx;
      if (atk) {
        frameIdx = 3;
      } else {
        const ph = (f.t / 1.2 + seed * 0.031) % 1;
        frameIdx = Math.floor(ph * 3);
      }
      const fw = 34, fh = 36;
      if (!drawImg(ctx, `assets/images/towers/fx/turret/turret${frameIdx + 1}.png`, f.x - fw / 2, f.y - 20, fw, fh)) {
        // 贴图未加载回退：简化几何炮台（底座 + 摆动炮管）
        const sway = Math.sin(p * 8 + seed) * 0.12;
        ctx.fillStyle = '#7a5a30';
        ctx.fillRect(f.x - 10, f.y - 8, 20, 16);
        ctx.fillStyle = '#a06020';
        ctx.beginPath(); ctx.arc(f.x, f.y - 8, 7, 0, Math.PI * 2); ctx.fill();
        ctx.save();
        ctx.translate(f.x, f.y - 8); ctx.rotate(sway);
        ctx.fillStyle = '#c0392b';
        ctx.fillRect(-2, -14, 5, 16);
        ctx.restore();
      }
      // 开火瞬间炮口高亮（贴图第 4 帧叠加）
      if (atk) {
        ctx.globalAlpha = (0.8 - (f.t - f.attackT) * 2.6);
        ctx.fillStyle = '#ffd24a';
        ctx.beginPath(); ctx.arc(f.x, f.y - 8, 5 + (f.t - f.attackT) * 30, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
  }
return { fxStrikeShell, fxStrike, fxMine, fxTurret };
}
module.exports = { createCannonFx };
