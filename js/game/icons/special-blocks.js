/**
 * v5.6.9 特殊块类型符号模块（D美工/工程师 · 图标与特效拆分 第一批）
 * 从 js/game/render.js Renderer#_specialBlockMark 机械提取，样式与调用签名完全一致。
 * render.js 原方法保留（Codex 集成时替换调用点，本模块不直接删除原方法）。
 * 覆盖：六类方块（row/col/cross/split(父/子)/rand/rainbow）类型符号，
 *       五类六色来源色角标、子雷标识与固定彩虹配色。
 * COLOR_FILL 为 render.js 同名常量副本（六色），避免与 render.js 循环依赖。
 */
const { fillRoundRect, strokeRoundRect } = require('../ui.js');

/** 棋盘 6 色（与 render.js COLOR_FILL 一致） */
const COLOR_FILL = {
  red: '#e74c3c', blue: '#3498db', green: '#2ecc71',
  yellow: '#f1c40f', purple: '#9b59b6', orange: '#b5651d', // 橙=焦糖棕橙（与红黄区分）
};

/** 特殊块类型符号绘制（56 基准坐标系，size 缩放）；签名与 render.js #_specialBlockMark 一致 */
function specialBlockMark(ctx, x, y, size, piece) {
  ctx.save(); ctx.translate(x + size / 2, y + size / 2); ctx.scale(size / 56, size / 56);
  if (piece.s !== 'rainbow') {
  strokeRoundRect(ctx,-26,-26,52,52,9,'#172035',4);
  strokeRoundRect(ctx,-24,-24,48,48,8,piece.s==='rainbow'?'#ffe8a5':(piece.s==='split'&&piece.sub?'#ff4d5e':'#ffffff'),2);
  fillRoundRect(ctx,-20,-20,40,40,10,'rgba(9,18,35,0.87)');
  }
  const glyphColor = piece.s === 'rainbow' ? '#ffffff' : ({ red: '#ff6578', blue: '#69caff', green: '#74ed9c', yellow: '#ffe36a', purple: '#c69aff', orange: '#ffad58' })[piece.c || piece.tint] || '#ffffff';
  ctx.strokeStyle=glyphColor; ctx.fillStyle=glyphColor; ctx.lineWidth=3.5; ctx.lineCap='round'; ctx.lineJoin='round';
  const line=(a,b,c,d)=>{ctx.beginPath();ctx.moveTo(a,b);ctx.lineTo(c,d);ctx.stroke();};
  const dot=(a,b,r)=>{ctx.beginPath();ctx.arc(a,b,r,0,Math.PI*2);ctx.fill();};
  const arrow=(vertical)=>{
    ctx.save(); if(vertical)ctx.rotate(Math.PI/2);
    line(-15,0,15,0);line(-15,0,-9,-6);line(-15,0,-9,6);line(15,0,9,-6);line(15,0,9,6);ctx.restore();
  };
  if(piece.s==='row') { arrow(false);line(-10,-12,10,-12);line(-10,12,10,12); }
  else if(piece.s==='col') { arrow(true);line(-12,-10,-12,10);line(12,-10,12,10); }
  else if(piece.s==='cross') { arrow(false);arrow(true);dot(0,0,4); }
  else if(piece.s==='split') {
    if(piece.sub){
      ctx.save(); ctx.scale(0.5, 0.5);
      // 子分裂雷：红警风格（红框红底 + 三角警示 + 爆炸对角标），一眼区分父雷；爆炸效果与父一致
      fillRoundRect(ctx,-18,-18,36,36,8,'rgba(58,8,14,0.92)');
      ctx.strokeStyle='#ff9aa5'; ctx.lineWidth=2.5;
      ctx.beginPath(); ctx.moveTo(0,-9); ctx.lineTo(9,6); ctx.lineTo(-9,6); ctx.closePath(); ctx.stroke();
      dot(0,1,2.6);
      ctx.strokeStyle='#ff4d5e'; ctx.lineWidth=3;
      line(-11,-11,11,11); line(11,-11,-11,11);
      ctx.restore();
    } else {
      // 父分裂雷：金色中心十字 + 四角连线大圆点
      ctx.strokeStyle='#ffd24a'; ctx.lineWidth=3;
      dot(0,0,6);
      line(-10,0,10,0); line(0,-10,0,10);
      [-1,1].forEach(dx=>[-1,1].forEach(dy=>{line(dx*7,dy*7,dx*14,dy*14);dot(dx*16,dy*16,4);}));
    }
  } else if(piece.s==='rand') {
    ctx.save();ctx.rotate(Math.PI/4);strokeRoundRect(ctx,-13,-13,26,26,4,glyphColor,2);ctx.restore();
    [[-7,-7],[7,-7],[0,0],[-7,7],[7,7]].forEach(([a,b])=>dot(a,b,2.6));
  } else if(piece.s==='rainbow') {
    const colors=['#ff6174','#ffad54','#ffe36a','#7ee4a1','#78c8ff','#c09aff'];
    colors.forEach((col,i)=>{ctx.strokeStyle=col;ctx.lineWidth=5;ctx.beginPath();ctx.arc(0,0,15,i*Math.PI/3+0.04,(i+1)*Math.PI/3-0.04);ctx.stroke();});
    ctx.fillStyle=glyphColor;ctx.beginPath();ctx.moveTo(0,-9);ctx.lineTo(3,-3);ctx.lineTo(9,0);ctx.lineTo(3,3);ctx.lineTo(0,9);ctx.lineTo(-3,3);ctx.lineTo(-9,0);ctx.lineTo(-3,-3);ctx.closePath();ctx.fill();
  }
  // Keep the piece's source hue visible even when the center emblem covers its artwork.
  const hue=piece.s === 'rainbow' ? null : COLOR_FILL[piece.c || piece.tint];
  if(hue){ctx.fillStyle=hue;ctx.strokeStyle='#ffffff';ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(18,18,5,0,Math.PI*2);ctx.fill();ctx.stroke();}
  if(piece.sub){ctx.fillStyle='#ffe08a';ctx.beginPath();ctx.moveTo(-25,-25);ctx.lineTo(-12,-25);ctx.lineTo(-25,-12);ctx.closePath();ctx.fill();}
  ctx.restore();
}

module.exports = { specialBlockMark, COLOR_FILL };
