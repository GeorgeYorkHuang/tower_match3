/** Canvas通用镂空遮罩：支持多个高亮区，不依赖离屏画布或even-odd裁剪。 */
'use strict';
const { strokeRoundRect, fillRoundRect, text } = require('./ui.js');
const CONFIG = require('../config.js');
function inside(point, box) { return !!box && point.x>=box.x && point.x<=box.x+box.w && point.y>=box.y && point.y<=box.y+box.h; }
function draw(ctx, targets, title, body, skipLabel = '跳过本章') {
  const width=CONFIG.DESIGN.W,height=CONFIG.DESIGN.H;
  const boxes=targets.map(b=>({x:Math.max(0,b.x-5),y:Math.max(0,b.y-5),w:Math.min(width,b.x+b.w+5)-Math.max(0,b.x-5),h:Math.min(height,b.y+b.h+5)-Math.max(0,b.y-5)})).filter(b=>b.w>0&&b.h>0);
  ctx.save();ctx.globalAlpha=1;ctx.fillStyle='rgba(3,10,8,0.80)';
  const rows=[...new Set([0,height,...boxes.flatMap(b=>[b.y,b.y+b.h])])].sort((a,b)=>a-b);
  for(let i=0;i<rows.length-1;i++){
    const top=rows[i],bottom=rows[i+1],spans=boxes.filter(b=>b.y<bottom&&b.y+b.h>top).sort((a,b)=>a.x-b.x);
    let x=0;for(const b of spans){if(b.x>x)ctx.fillRect(x,top,b.x-x,bottom-top);x=Math.max(x,b.x+b.w);}
    if(x<width)ctx.fillRect(x,top,width-x,bottom-top);
  }
  for(const b of boxes)strokeRoundRect(ctx,b.x,b.y,b.w,b.h,9,'#ffe29a',4);
  const maxBottom=boxes.reduce((n,b)=>Math.max(n,b.y+b.h),0);
  const y=maxBottom>180&&maxBottom<960?maxBottom+25:220;
  const lines=String(body).match(/.{1,28}/g)||[];
  const panel={x:30,y,w:690,h:70+lines.length*29};
  fillRoundRect(ctx,panel.x,panel.y,panel.w,panel.h,14,'#19382a');
  strokeRoundRect(ctx,panel.x,panel.y,panel.w,panel.h,14,'#bda66b',2);
  text(ctx,title,52,y+28,26,'#ffe4a1','left');
  if(skipLabel)text(ctx,skipLabel,648,y+28,19,'#d7dcc2','center');
  lines.forEach((line,i)=>text(ctx,line,52,y+65+i*29,22,'#f5edda','left'));
  ctx.restore();return {panel,skip:{x:580,y:y+6,w:126,h:44}};
}
module.exports={draw,inside};
