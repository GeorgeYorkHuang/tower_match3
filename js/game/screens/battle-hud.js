'use strict';
const { fillRoundRect, text, progressBar } = require('../ui.js');
// 只绘制HUD；点击区域仍写入调用方Renderer，不持有Run/Meta。
function createBattleHud({ drawImg, IMG_SRC, fmtNum, relicIconSrc, AREA_X, AREA_Y, AREA_W, ENTRY_H }) {
  function status(ctx, s) {
    const goldIcon = 40;
    // v1.17.2 局内银币（左下安全区 18,70：整体避开灵动岛与右上小程序胶囊；局内银币跨波保留、局末折算为金币）
    if (!drawImg(ctx, IMG_SRC.silver, 18, 70, goldIcon, goldIcon)) {
      fillRoundRect(ctx, 18, 70, goldIcon, goldIcon, 10, '#c9d6e4');
      text(ctx, '¥', 38, 90, 20, '#5b6b7c', 'center');
    }
    text(ctx, fmtNum(s.gold), 72, 94, 26, '#c9d6e4');

  }

  function entryStatus(ctx,s) {
    // 等级圆与经验外环：12点起顺时针；进度条下沿高于圆心。
    const cx=AREA_X+30,cy=AREA_Y+32,radius=22,outer=28;
    const xp=Math.max(0,Math.min(1,Number(s.expRatio)||0));
    ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);ctx.fillStyle='#f7cf45';ctx.fill();
    text(ctx,String(s.expLevel||0),cx,cy,25,'#111111','center');
    ctx.beginPath();ctx.arc(cx,cy,outer,0,Math.PI*2);ctx.strokeStyle='rgba(247,207,69,0.22)';ctx.lineWidth=4;ctx.stroke();
    if(xp>0){ctx.beginPath();ctx.arc(cx,cy,outer,-Math.PI/2,-Math.PI/2+Math.PI*2*xp,false);ctx.strokeStyle='#f7cf45';ctx.lineWidth=4;ctx.lineCap='round';ctx.stroke();}
    const wx=AREA_X+74,wy=AREA_Y+20,ww=AREA_W-74,wh=10;
    const wave=Math.max(1,Math.min(60,Number(s.wave)||1));
    progressBar(ctx,wx,wy,ww,wh,(wave-1)/59,'#e8c76b','rgba(255,255,255,0.12)');
    for(let n=5;n<=60;n+=5){
      const mx=wx+(n-1)/59*ww;
      const major=n===20||n===40||n===60;
      ctx.beginPath();ctx.arc(mx,wy+wh/2,major?5:2.5,0,Math.PI*2);ctx.fillStyle=n<=wave?(n===60?'#ff826f':'#f8dd8a'):'#66717e';ctx.fill();
      if(major)text(ctx,n===60?'终极60':n+'波Boss',mx,AREA_Y+7,13,n===60?'#ffab95':'#e5d7aa',n===60?'right':'center');
    }
    text(ctx,'第 '+(s.wave||1)+' / 60 波',wx,AREA_Y+7,14,'#e9dfc4','left');
    // v1.17.2 本局圣遗物行：前 10 个图标 + 总数（图标 22px、间距 28，整行更紧凑；点击区域 relicBarHit 供 main.js 弹详情）
    const rels = s.battleRelics || [];
    if (rels.length) {
      const rx = wx, ry = AREA_Y + 42, rIcon = 22, rGap = 28, rMax = 10;
      const shown = rels.slice(0, rMax);
      shown.forEach((rc, i) => {
        const icx = rx + i * rGap + rIcon / 2;
        ctx.beginPath(); ctx.arc(icx, ry + rIcon / 2, 12, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(247,201,72,0.18)'; ctx.fill();
        ctx.strokeStyle = 'rgba(247,201,72,0.45)'; ctx.lineWidth = 1.2; ctx.stroke();
        const rSrc = relicIconSrc(rc.id);
        if (!(rSrc && drawImg(ctx, rSrc, rx + i * rGap + 1, ry + 1, rIcon - 2, rIcon - 2))) {
          text(ctx, rc.icon, icx, ry + rIcon / 2 + 2, 13, '#ffffff', 'center');
        }
        if (rc.star3) {   // v1.16.113 3★ 质变角标
          fillRoundRect(ctx, icx + 8, ry - 3, 17, 12, 6, '#ffb347');
          text(ctx, '★3', icx + 16, ry + 9, 9, '#5c3800', 'center');
        }
      });
      text(ctx, `圣物 ×${rels.length}`, rx + shown.length * rGap + 4, ry + rIcon / 2 + 3, 15, 'rgba(255,255,255,0.55)', 'left');
      this.relicBarHit = { x: rx, y: ry - 8, w: shown.length * rGap + 96, h: Math.min(rIcon + 16, AREA_Y + ENTRY_H - (ry - 8)) }; // 圣遗物行点击区
    } else {
      this.relicBarHit = null;
    }
  }

  return { status, entryStatus };
}
module.exports = { createBattleHud };
