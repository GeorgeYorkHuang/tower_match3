'use strict';
const PoisonStickFx = require('../fx/poison-stick.js');
const ToxicPoolFx = require('../fx/toxic-pool.js');
// 仅绘制地面持续区和召唤物，不修改实体/DoT或伤害计时。
function createGroundLayer({ drawImg, loadImg }) {
  const approved = require('../fx/approved-fire.js').create(drawImg);
  function groundFx(ctx, combat) {
    if (!combat) return;
    const tNow = Date.now();
    // 回旋镖·风痕：镖路径残留的旋转镖影（紫色渐淡圈），C 卷痕减速时带减速蓝光
    if (combat.windTrails && combat.windTrails.length) {
      combat.windTrails.forEach((w) => {
        if (w.ttl <= 0) return;
        const fade = Math.min(1, w.ttl / 1.6);
        const R = w.r || 34;
        const rot = tNow / 90;
        // 半透明地面涡痕（双圈呼吸）
        ctx.fillStyle = 'rgba(142,68,173,0.20)'; ctx.globalAlpha = 0.55 * fade;
        ctx.beginPath(); ctx.arc(w.x, w.y, R * (1 + 0.06 * Math.sin(tNow / 260 + w.x)), 0, Math.PI * 2); ctx.fill();
        // 旋转镖影（4 枚小回旋镖沿圈旋转，沿时间淡出）
        ctx.globalAlpha = 0.8 * fade;
        ctx.strokeStyle = w.slow ? '#7fb3d5' : '#c39bd3';
        ctx.lineCap = 'round'; ctx.lineWidth = 4;
        for (let k = 0; k < 4; k++) {
          const a = rot + k * Math.PI / 2;
          const px = w.x + Math.cos(a) * R * 0.7;
          const py = w.y + Math.sin(a) * R * 0.7;
          ctx.save();
          ctx.translate(px, py); ctx.rotate(a + rot);
          ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(0, 0); ctx.lineTo(-3, 5.2); ctx.stroke();
          ctx.restore();
        }
        ctx.lineCap = 'butt';
        // 中心涡眼
        ctx.globalAlpha = 0.5 * fade;
        ctx.fillStyle = w.slow ? '#aed6f1' : '#d2b4de';
        ctx.beginPath(); ctx.arc(w.x, w.y, 4, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      });
    }
    // 火系余烬/焦土与炮塔灼地统一使用新版燃烧地面。
    const drawBurnPatch = (x, y, R, fade, seed) => {
      const now = combat.game && typeof combat.game.animClock === 'number' ? combat.game.animClock / 1000 : 0;
      if (approved.ground(ctx, x, y, R, now, seed, fade)) return true;
      // 新图集未就绪时保留范围与少量火苗，不请求旧版图片。
      ctx.save();
      ctx.globalAlpha *= fade;
      ctx.fillStyle = 'rgba(120,45,12,0.22)';
      ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffad42';
      for (let i = 0; i < 9; i++) {
        const a = seed + i * 2.399963, d = R * Math.sqrt((i + 0.5) / 9) * 0.85;
        const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
        const height = 7 + 4 * Math.sin(now * 7 + i);
        ctx.beginPath(); ctx.moveTo(px - 3, py); ctx.lineTo(px, py - height); ctx.lineTo(px + 3, py); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      return true;
    };
    // 毒池（深绿毒液池）/ 毒沼（60px 暗褐绿泥沼，与毒池区分）——画在敌人下层
    if (combat.groundDots && combat.groundDots.length) {
      combat.groundDots.forEach((gd) => {
        if (gd.kind === 'cannonBurn' && gd.ttl > 0) {
          const seed = gd.seed || 0;
          const fade = Math.min(1, gd.ttl / 0.45);
          if (drawBurnPatch(gd.x, gd.y, gd.r || 80, fade, seed)) return;
          // 贴图未加载回退：原程序化橙黄火圈
          const R = gd.r || 80;
          const pulse = 1 + 0.035 * Math.sin(tNow / 120 + seed);
          ctx.globalAlpha = 0.18 * fade;
          const glow = ctx.createRadialGradient(gd.x, gd.y, R * 0.18, gd.x, gd.y, R * pulse);
          glow.addColorStop(0, '#ffd36a'); glow.addColorStop(0.58, '#f28c28'); glow.addColorStop(1, 'rgba(210,70,25,0)');
          ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(gd.x, gd.y, R * pulse, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 0.6 * fade; ctx.strokeStyle = '#ffad42'; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(gd.x, gd.y, R * (0.84 + 0.025 * Math.sin(tNow / 170 + seed)), 0, Math.PI * 2); ctx.stroke();
          for (let k = 0; k < 8; k++) {
            const a = tNow / 420 + seed + k * Math.PI / 4;
            const rr = R * (0.56 + 0.08 * Math.sin(tNow / 190 + k));
            const fx = gd.x + Math.cos(a) * rr, fy = gd.y + Math.sin(a) * rr;
            ctx.globalAlpha = (0.3 + 0.25 * Math.sin(tNow / 160 + k * 1.9)) * fade;
            ctx.fillStyle = k % 2 ? '#ffd36a' : '#ff6d2d';
            ctx.beginPath(); ctx.arc(fx, fy, 3 + 1.5 * Math.sin(tNow / 130 + k), 0, Math.PI * 2); ctx.fill();
          }
          ctx.globalAlpha = 1;
          return;
        }
        // 火系地面余烬/焦土（炮火支援C焦土、火柱余烬、火系击杀爆炸）：此前无视觉，补上共用帧动画
        if (gd.key === 'fire' && gd.ttl > 0) {
          drawBurnPatch(gd.x, gd.y, gd.r || 60, Math.min(1, gd.ttl / 0.5), gd.seed || 0);
          return;
        }
        if (gd.key !== 'poison' || gd.ttl <= 0) return;
        if (gd.skill === '毒池' && !gd.swamp) {
          ToxicPoolFx.draw(ctx, gd, drawImg, loadImg);
          return;
        }
        const seed = gd.seed || 0;
        const fade = Math.min(1, gd.ttl / 1.2); // 接近结束淡出
        const R = gd.r || 130;
        const breathe = 1 + 0.05 * Math.sin(tNow / 320 + seed);
        if (gd.swamp) {
          // 毒沼：小范围（60px）暗褐绿泥沼——泥浆底色 + 内圈 + 冒泡，与毒池（亮绿毒液池）区分
          ctx.fillStyle = '#4d3a1e'; ctx.globalAlpha = 0.5 * fade;
          ctx.beginPath(); ctx.ellipse(gd.x, gd.y, R * breathe, R * 0.7 * breathe, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#6b5325'; ctx.globalAlpha = 0.4 * fade;
          ctx.beginPath(); ctx.ellipse(gd.x, gd.y, R * 0.62 * breathe, R * 0.44 * breathe, 0, 0, Math.PI * 2); ctx.fill();
          // 泥浆高光斑
          ctx.fillStyle = '#7d6a2e'; ctx.globalAlpha = 0.25 * fade;
          ctx.beginPath(); ctx.ellipse(gd.x - R * 0.2, gd.y - R * 0.1, R * 0.3, R * 0.17, 0, 0, Math.PI * 2); ctx.fill();
          // 泥沼气泡（暗绿气泡上升）
          for (let k = 0; k < 5; k++) {
            const ph = ((tNow / 850 + k / 5 + seed * 0.013) % 1);
            const bx = gd.x + Math.sin((tNow / 620 + k * 2.1) * 2) * R * 0.35;
            const by = gd.y + R * 0.3 - ph * R * 0.7;
            ctx.fillStyle = '#8a9a5b'; ctx.globalAlpha = (0.5 - 0.3 * ph) * fade;
            ctx.beginPath(); ctx.arc(bx, by, 1.6 + ph * 2.2, 0, Math.PI * 2); ctx.fill();
          }
          ctx.globalAlpha = 1;
          return;
        }
        // 毒池：6 帧毒液池贴图循环（240ms/帧 ≈ 1.44s 一轮），带呼吸缩放与结束淡出
        const fi = Math.floor(((tNow / 240 + seed * 0.037) % 1) * 6) % 6;
        const S = R * 2.1 * breathe; // 贴图主体约占框宽 95%，映射后可见直径 ≈ 2R
        ctx.globalAlpha = fade;
        // Removed legacy poison-pool sheets: retain the existing procedural fallback.
        ctx.globalAlpha = 1;
        // 贴图未加载回退：程序化深绿液池（原 绘制）
        // 外圈深绿液池
        ctx.fillStyle = '#145a32'; ctx.globalAlpha = 0.45 * fade;
        ctx.beginPath(); ctx.ellipse(gd.x, gd.y, R * breathe, R * 0.62 * breathe, 0, 0, Math.PI * 2); ctx.fill();
        // 内圈稍亮毒液
        ctx.fillStyle = '#1e8449'; ctx.globalAlpha = 0.38 * fade;
        ctx.beginPath(); ctx.ellipse(gd.x, gd.y, R * 0.66 * breathe, R * 0.42 * breathe, 0, 0, Math.PI * 2); ctx.fill();
        // 高光毒斑
        ctx.fillStyle = '#28b463'; ctx.globalAlpha = 0.22 * fade;
        ctx.beginPath(); ctx.ellipse(gd.x - R * 0.18, gd.y - R * 0.08, R * 0.28, R * 0.16, 0, 0, Math.PI * 2); ctx.fill();
        // 边缘泡沫（绕池边抖动）
        ctx.fillStyle = '#58d68d'; ctx.globalAlpha = 0.5 * fade;
        for (let k = 0; k < 14; k++) {
          const ph = ((tNow / 700 + k / 14 + seed) % 1);
          const a = ph * Math.PI * 2;
          const rr = R * (0.94 + 0.04 * Math.sin(tNow / 220 + k * 1.7));
          const bx = gd.x + Math.cos(a) * rr;
          const by = gd.y + Math.sin(a) * rr * 0.62;
          const br = 2 + ph * 2;
          ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
        }
        // 气泡上升帧动画（池内随机点冒泡）
        for (let k = 0; k < 5; k++) {
          const ph = ((tNow / 900 + k / 5 + seed * 0.013) % 1);
          const bx = gd.x + Math.sin((tNow / 600 + k * 2.1) * 2) * R * 0.35;
          const by = gd.y + R * 0.3 - ph * R * 0.75;
          ctx.fillStyle = '#a9dfbf'; ctx.globalAlpha = (0.55 - 0.35 * ph) * fade;
          ctx.beginPath(); ctx.arc(bx, by, 1.6 + ph * 2.4, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      });
    }
    // 毒棒：常驻呼吸，实际攻击时挥击；动画进度由召唤物战斗时钟推进。
    if (combat.poisonSticks) {
      combat.poisonSticks.forEach(st => PoisonStickFx.draw(ctx, st, drawImg, loadImg));
    }
  }
  return { groundFx };
}
module.exports = { createGroundLayer };
