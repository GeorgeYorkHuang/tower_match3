'use strict';
const { fillRoundRect, strokeRoundRect, text } = require('../ui.js');
const Prologue = require('../../prologue.js');
// 只绘制HUD；点击区域仍写入调用方Renderer，不持有Run/Meta。
function createBattleHud({ drawImg, IMG_SRC, fmtNum, relicIconSrc, AREA_X, AREA_Y, AREA_W, ENTRY_H }) {
  function status(ctx, s) {
    const goldIcon = 40;
    // 局内银币（左下安全区 18,70：整体避开灵动岛与右上小程序胶囊；局内银币跨波保留、局末折算为金币）
    if (!drawImg(ctx, IMG_SRC.silver, 18, 70, goldIcon, goldIcon)) {
      fillRoundRect(ctx, 18, 70, goldIcon, goldIcon, 10, '#c9d6e4');
      text(ctx, '¥', 38, 90, 20, '#5b6b7c', 'center');
    }
    text(ctx, fmtNum(s.gold), 72, 94, 26, '#c9d6e4');

  }

  function entryStatus(ctx,s) {
    ctx.save();
    const cx=AREA_X+34,cy=AREA_Y+35,radius=25,outer=30;
    const xp=Math.max(0,Math.min(1,Number(s.expRatio)||0));
    // 下沿厚度、内凹底盘与高光金属圈构成等级徽章。
    ctx.shadowColor='rgba(0,0,0,.55)';ctx.shadowBlur=6;ctx.shadowOffsetY=3;
    ctx.beginPath();ctx.arc(cx,cy+3,outer+2,0,Math.PI*2);ctx.fillStyle='#4a381e';ctx.fill();
    ctx.shadowBlur=0;ctx.shadowOffsetY=0;
    const metal=ctx.createLinearGradient(cx,cy-radius,cx,cy+radius);
    metal.addColorStop(0,'#f5df9a');metal.addColorStop(.46,'#a88643');metal.addColorStop(1,'#654b27');
    ctx.beginPath();ctx.arc(cx,cy,radius+2,0,Math.PI*2);ctx.fillStyle=metal;ctx.fill();
    const inset=ctx.createLinearGradient(cx,cy-radius,cx,cy+radius);inset.addColorStop(0,'#344f42');inset.addColorStop(1,'#10271e');
    ctx.beginPath();ctx.arc(cx,cy,radius-2,0,Math.PI*2);ctx.fillStyle=inset;ctx.fill();
    ctx.strokeStyle='#e2c87d';ctx.lineWidth=.8;ctx.stroke();
    text(ctx,'Lv.',cx,cy-10,11,'#c8bd94','center');
    text(ctx,String(s.expLevel||0),cx,cy+8,26,'#fff0ba','center');
    ctx.beginPath();ctx.arc(cx,cy,outer,-Math.PI/2,Math.PI*1.5);ctx.strokeStyle='#1a3028';ctx.lineWidth=4;ctx.stroke();
    if(xp>0){ctx.beginPath();ctx.arc(cx,cy,outer,-Math.PI/2,-Math.PI/2+Math.PI*2*xp);ctx.strokeStyle='#a4e7b1';ctx.lineWidth=3;ctx.lineCap='round';ctx.stroke();}
    const wx=AREA_X+82,wy=AREA_Y+40,ww=AREA_W-92,wh=16;
    const chapter=Prologue.chapter(s.stage),maxWave=chapter?chapter.maxWave:60;
    const wave=Math.max(1,Math.min(maxWave,Number(s.wave)||1)),ratio=(wave-1)/Math.max(1,maxWave-1);
    // 胶囊轨道下沿厚度、暗槽、渐变填充和顶部反光。
    fillRoundRect(ctx,wx-3,wy-3,ww+6,wh+9,12,'#594b31');
    fillRoundRect(ctx,wx-3,wy-5,ww+6,wh+8,12,'#c4ad72');
    fillRoundRect(ctx,wx-1,wy-3,ww+2,wh+5,10,'#0c1c18');
    const track=ctx.createLinearGradient(0,wy,0,wy+wh);track.addColorStop(0,'#091410');track.addColorStop(1,'#314538');
    fillRoundRect(ctx,wx,wy,ww,wh,8,track);
    if(ratio>0){const width=Math.max(8,ww*ratio),gold=ctx.createLinearGradient(0,wy,0,wy+wh);gold.addColorStop(0,'#fff2b7');gold.addColorStop(.38,'#e8c76b');gold.addColorStop(1,'#a67b31');fillRoundRect(ctx,wx,wy,width,wh,8,gold);fillRoundRect(ctx,wx+3,wy+2,Math.max(1,width-6),3,2,'rgba(255,255,255,.45)');}
    text(ctx,'第 '+wave+' / '+maxWave+' 波',wx,AREA_Y+17,16,'#f3e8c9','left');
    for(let n=5;n<=maxWave;n+=5){const mx=wx+(n-1)/Math.max(1,maxWave-1)*ww,major=n===maxWave||n===20||n===40;
      ctx.beginPath();ctx.arc(mx,wy+wh/2,major?4:2,0,Math.PI*2);ctx.fillStyle=n<=wave?'#fff1bd':'#657264';ctx.fill();
      if(major)text(ctx,n===maxWave?'终点 '+maxWave:n+'波Boss',mx,AREA_Y+17,12,n<=wave?'#f6df9b':'#c5c3a9',n===maxWave?'right':'center');
    }
    // 左侧窄竖列按种类合并重复圣遗物；整列可点击打开完整列表。
    const rels=s.battleRelics||[],groups=Object.values(rels.reduce((m,r)=>{if(!m[r.id])m[r.id]={...r,count:0};m[r.id].count++;return m;},{}));
    if(groups.length){const rx=AREA_X+6,ry=AREA_Y+ENTRY_H+14,size=36,gap=44,shown=groups.slice(0,8),height=shown.length*gap+25;
      fillRoundRect(ctx,rx-4,ry-7,size+12,height,12,'rgba(7,22,16,.75)');
      strokeRoundRect(ctx,rx-4,ry-7,size+12,height,12,'rgba(201,177,113,.38)',1);
      shown.forEach((rc,i)=>{const yy=ry+i*gap,color={ur:'#ef8778',ssr:'#e9c86b',sr:'#bd9beb',r:'#86bddd'}[require('../../config.js').relicRarity(rc.id)]||'#d2bf8b';
        fillRoundRect(ctx,rx,yy+2,size,size,9,'#060f0b');fillRoundRect(ctx,rx,yy,size,size,9,'#294032');strokeRoundRect(ctx,rx,yy,size,size,9,color,1.3);
        const src=relicIconSrc(rc.id);if(!(src&&drawImg(ctx,src,rx+3,yy+3,size-6,size-6)))text(ctx,rc.icon||'◆',rx+size/2,yy+size/2,19,color,'center');
        if(rc.count>1){fillRoundRect(ctx,rx+22,yy+25,19,14,6,'#10271e');text(ctx,'×'+rc.count,rx+31,yy+32,10,'#fff0bf','center');}
        if(rc.star3)text(ctx,'★',rx+31,yy+6,10,'#ffd784','center');
      });
      text(ctx,groups.length>shown.length?'+'+(groups.length-shown.length):'×'+rels.length,rx+size/2,ry+shown.length*gap+5,13,'#e7d9b1','center');
      this.relicBarHit={x:rx-4,y:ry-7,w:size+12,h:height};
    }else this.relicBarHit=null;
    ctx.restore();
  }

  return { status, entryStatus };
}
module.exports = { createBattleHud };
