'use strict';
// 只读战斗表现，不缓存敌人、技能或弹道实例。
function fxCyclone(ctx, f) {
      // v1.16.21 风暴镖重做：三同心圈（不可见）沿圈旋转的十字飞镖，引用 combat 实时 darts（命中消失同步）
      // v1.16.42 小镖改为十字飞镖：两片菱形刀刃交叉成十字，绕中心旋转
      const darts = f.darts || [];
      for (const d of darts) {
        const px = f.x + Math.cos(d.a) * d.r;
        const py = f.y + Math.sin(d.a) * d.r;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(d.a);
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = '#8e44ad';
        ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        // 十字镖：两片菱形刀刃交叉（横/竖），紫底 + 白刃高光
        const blade = (ang) => {
          ctx.save(); ctx.rotate(ang);
          ctx.fillStyle = '#c39bd3';
          ctx.beginPath(); ctx.moveTo(0, -8.5); ctx.lineTo(3.2, 0); ctx.lineTo(0, 8.5); ctx.lineTo(-3.2, 0); ctx.closePath(); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.beginPath(); ctx.moveTo(0, -8.5); ctx.lineTo(1.2, 0); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
          ctx.restore();
        };
        blade(0); blade(Math.PI / 2);
        ctx.restore();
      }
  }
module.exports = { fxCyclone };
