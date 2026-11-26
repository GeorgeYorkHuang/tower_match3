let pressPoint = null;
function setPressPoint(point) { pressPoint = point; }
/**
 * ui.js —— 绘制原语（逻辑坐标 750×1334 画布内使用）CommonJS
 */
function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fillRoundRect(ctx, x, y, w, h, r, color) {
  ctx.fillStyle = color;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  if (pressPoint && h >= 24 && w >= h * 1.5 && r >= h * 0.25 && pressPoint.x >= x && pressPoint.x <= x+w && pressPoint.y >= y && pressPoint.y <= y+h) {
    ctx.save();
    roundRect(ctx,x,y,w,h,r);ctx.fillStyle='rgba(0,0,0,0.25)';ctx.fill();
    roundRect(ctx,x+2,y+2,w-4,h-4,Math.max(0,r-2));ctx.strokeStyle='rgba(255,255,255,0.35)';ctx.lineWidth=2;ctx.stroke();
    ctx.restore();
  }
}

function strokeRoundRect(ctx, x, y, w, h, r, color, lw) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw || 2;
  roundRect(ctx, x, y, w, h, r);
  ctx.stroke();
}

function text(ctx, str, x, y, size, color, align) {
  ctx.fillStyle = color || '#ffffff';
  ctx.font = `bold ${size}px sans-serif`;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
}

/** 进度条：x,y,w,h 区域，ratio 0~1 */
function progressBar(ctx, x, y, w, h, ratio, fg, bg) {
  fillRoundRect(ctx, x, y, w, h, h / 2, bg || 'rgba(0,0,0,0.45)');
  if (ratio > 0) fillRoundRect(ctx, x, y, Math.max(h, w * Math.min(1, ratio)), h, h / 2, fg);
}

/** 按钮：返回命中检测函数 */
function button(ctx, x, y, w, h, label, opts) {
  opts = opts || {};
  const hit=(px,py)=>px>=x&&px<=x+w&&py>=y&&py<=y+h;
  if(opts.raised){
    const pressed=pressPoint&&hit(pressPoint.x,pressPoint.y),depth=opts.depth==null?6:opts.depth,offset=pressed?Math.min(4,Math.max(0,depth-1)):0;
    const base=opts.bg||'#3a3f4b';
    const tint=(amount)=>{const rgb=parseInt(base.slice(1),16);return '#'+[rgb>>16&255,rgb>>8&255,rgb&255].map(v=>Math.max(0,Math.min(255,v+amount)).toString(16).padStart(2,'0')).join('');};
    ctx.save();
    // 厚度与投影保持在原命中范围内，触摸不会因下沉而漂移。
    ctx.shadowColor=opts.shadowColor||'rgba(0,0,0,.40)';ctx.shadowBlur=pressed?2:(opts.shadowBlur==null?9:opts.shadowBlur);ctx.shadowOffsetY=pressed?1:(opts.shadowOffsetY==null?5:opts.shadowOffsetY);
    const oldPress=pressPoint;pressPoint=null;
    try{
      fillRoundRect(ctx,x,y+depth,w,h-depth,(h-depth)/2,opts.baseColor||tint(-38));
      ctx.shadowBlur=0;ctx.shadowOffsetY=0;
      const faceH=h-depth,faceY=y+offset,g=ctx.createLinearGradient(0,faceY,0,faceY+faceH);
      g.addColorStop(0,tint(opts.gloss===false?(pressed?0:8):(pressed?6:32)));g.addColorStop(.48,base);g.addColorStop(1,tint(-15));
      fillRoundRect(ctx,x,faceY,w,faceH,faceH/2,g);
      strokeRoundRect(ctx,x+1,faceY+1,w-2,faceH-2,(faceH-2)/2,opts.gloss===false?tint(12):'rgba(255,231,180,.55)',1.5);
      ctx.beginPath();roundRect(ctx,x+3,faceY+3,w-6,faceH-6,(faceH-6)/2);ctx.clip();
      if(opts.gloss!==false){
      const shine=ctx.createLinearGradient(0,faceY,0,faceY+faceH*.55);
      shine.addColorStop(0,'rgba(255,255,255,'+(pressed?'.12':'.30')+')');shine.addColorStop(1,'rgba(255,255,255,0)');
      fillRoundRect(ctx,x+9,faceY+4,w-18,faceH*.46,faceH*.23,shine);
      }
      ctx.shadowColor='rgba(0,0,0,.55)';ctx.shadowBlur=1;ctx.shadowOffsetY=1;
      text(ctx,label,x+w/2,faceY+faceH/2,opts.fontSize||28,opts.color||'#fff5df','center');
    }finally{pressPoint=oldPress;ctx.restore();}
    return {hit};
  }
  const radius=opts.capsule?h/2:12;
  fillRoundRect(ctx, x, y, w, h, radius, opts.bg || '#3a3f4b');
  if (opts.stroke) strokeRoundRect(ctx, x, y, w, h, radius, opts.stroke, 2);
  text(ctx, label, x + w / 2, y + h / 2, opts.fontSize || 28, opts.color || '#ffffff', 'center');
  return { hit: (px, py) => px >= x && px <= x + w && py >= y && py <= y + h };
}

module.exports = { getPressPoint:()=>pressPoint, setPressPoint, roundRect, fillRoundRect, strokeRoundRect, text, progressBar, button };

function cardDepth(ctx,x,y,w,h,overlay=false){
 const pressed=pressPoint&&pressPoint.x>=x&&pressPoint.x<=x+w&&pressPoint.y>=y&&pressPoint.y<=y+h;
 ctx.save();
 if(!overlay){ctx.shadowColor='rgba(0,0,0,.45)';ctx.shadowBlur=pressed?2:8;ctx.shadowOffsetY=pressed?1:6;
 fillRoundRect(ctx,x,y+(pressed?1:5),w,h,14,'#09140f');}
 else{if(pressed)fillRoundRect(ctx,x+2,y+2,w-4,h-4,12,'rgba(0,0,0,.22)');
 strokeRoundRect(ctx,x+2,y+2,w-4,h-4,12,pressed?'#ead49b':'rgba(255,243,204,.3)',pressed?2:1);
 ctx.strokeStyle=pressed?'rgba(0,0,0,.4)':'rgba(255,255,255,.25)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+15,y+4);ctx.lineTo(x+w-15,y+4);ctx.stroke();}
 ctx.restore();
}
module.exports.cardDepth=cardDepth;
