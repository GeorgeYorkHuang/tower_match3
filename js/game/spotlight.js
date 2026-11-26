/** Canvas通用镂空遮罩：支持多个高亮区，不依赖离屏画布或even-odd裁剪。 */
'use strict';
const { strokeRoundRect, fillRoundRect, text } = require('./ui.js');
const CONFIG = require('../config.js');
function inside(point, box) { return !!box && point.x>=box.x && point.x<=box.x+box.w && point.y>=box.y && point.y<=box.y+box.h; }

// Place beside the whole highlighted group, preserving a 14px gap and screen margins.
function place(ctx,boxes,body,width,height){
 const margin=16,gap=14,maxW=Math.min(690,width-margin*2);
 function measure(w){ctx.font='bold 22px sans-serif';const lines=[];let line='';for(const char of String(body)){if(char==='\n'){lines.push(line);line='';}else if(line&&ctx.measureText(line+char).width>w-44){lines.push(line);line=char;}else line+=char;}if(line)lines.push(line);return{lines,w,h:70+lines.length*29};}
 if(!boxes.length){const m=measure(maxW);return{panel:{x:(width-m.w)/2,y:Math.max(margin,(height-m.h)/2),w:m.w,h:m.h},lines:m.lines};}
 const b={x:Math.min(...boxes.map(b=>b.x)),y:Math.min(...boxes.map(b=>b.y))};b.right=Math.max(...boxes.map(b=>b.x+b.w));b.bottom=Math.max(...boxes.map(b=>b.y+b.h));
 const full=measure(maxW),cx=(b.x+b.right)/2,cy=(b.y+b.bottom)/2;
 const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
 const preferred=cy>=height/2?['above','below','right','left']:['below','above','right','left'];
 for(const side of preferred){
  const room=side==='left'?b.x-gap-margin:side==='right'?width-margin-b.right-gap:maxW;
  if(room<280)continue;const m=side==='left'||side==='right'?measure(Math.min(maxW,room)):full;
  const x=side==='left'?b.x-gap-m.w:side==='right'?b.right+gap:clamp(cx-m.w/2,margin,width-margin-m.w);
  const y=side==='above'?b.y-gap-m.h:side==='below'?b.bottom+gap:clamp(cy-m.h/2,margin,height-margin-m.h);
  if(x>=margin&&x+m.w<=width-margin&&y>=margin&&y+m.h<=height-margin)return{panel:{x,y,w:m.w,h:m.h},lines:m.lines};
 }
 // Dense groups: choose a free gap beside an individual target without covering another.
 for(const box of boxes){for(const y of [box.y-gap-full.h,box.y+box.h+gap]){const x=clamp(box.x+box.w/2-full.w/2,margin,width-margin-full.w);if(y<margin||y+full.h>height-margin)continue;const p={x,y,w:full.w,h:full.h};if(boxes.every(b=>p.x+p.w<=b.x||p.x>=b.x+b.w||p.y+p.h<=b.y||p.y>=b.y+b.h))return{panel:p,lines:full.lines};}}
 return{panel:{x:margin,y:margin,w:full.w,h:full.h},lines:full.lines};
}

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
  const placed=place(ctx,boxes,body,width,height),panel=placed.panel,lines=placed.lines;
  const y=panel.y;
  fillRoundRect(ctx,panel.x,panel.y,panel.w,panel.h,14,'#19382a');
  strokeRoundRect(ctx,panel.x,panel.y,panel.w,panel.h,14,'#bda66b',2);
  text(ctx,title,panel.x+22,y+28,Math.min(24,(panel.w-184)/Math.max(1,String(title).length)),'#ffe4a1','left');
  if(skipLabel)text(ctx,skipLabel,panel.x+panel.w-72,y+28,19,'#d7dcc2','center');
  lines.forEach((line,i)=>text(ctx,line,panel.x+22,y+65+i*29,22,'#f5edda','left'));
  ctx.restore();return {panel,skip:{x:panel.x+panel.w-140,y:y+6,w:126,h:44}};
}
module.exports={draw,inside,place};
