/**
 * v5.6.9 技能图标模块（D美工/工程师 · 图标与特效拆分 第一批）
 * 从 js/game/render.js Renderer#_skillIcon 机械提取，样式与调用签名完全一致。
 * render.js 原方法保留（Codex 集成时替换调用点，本模块不直接删除原方法）。
 * 覆盖：三消技能（row/col/cross/rainbow/scan/split/seed/recolor/attack/skill）
 *       全局技能（refill/shuffle）+ GlobalSkills 几何轮廓兜底。
 */
const { fillRoundRect, strokeRoundRect, text } = require('../ui.js');
const GlobalSkills = require('../../global-skills.js');

/** 技能图标绘制（64 基准坐标系，size 缩放）；签名与 render.js #_skillIcon 一致 */
function skillIcon(ctx, id, x, y, size, color) {
  ctx.save(); ctx.translate(x, y); ctx.scale(size / 64, size / 64);
  const grad = ctx.createLinearGradient(-30, -30, 30, 30);
  grad.addColorStop(0, color); grad.addColorStop(1, '#17253e');
  fillRoundRect(ctx, -30, -30, 60, 60, 15, grad);
  strokeRoundRect(ctx, -30, -30, 60, 60, 15, '#a9c7e8', 1);
  ctx.strokeStyle = '#ffffff'; ctx.fillStyle = '#ffffff'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  const line = (x1,y1,x2,y2) => { ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); };
  const dot = (dx,dy,r) => { ctx.beginPath(); ctx.arc(dx,dy,r,0,Math.PI*2); ctx.fill(); };
  if (id === 'row' || id === 'col' || id === 'cross') {
    if (id !== 'col') { line(-19,0,19,0); line(-19,0,-11,-7); line(19,0,11,7); }
    if (id !== 'row') { line(0,-19,0,19); line(0,-19,7,-11); line(0,19,-7,11); }
  } else if (id === 'rainbow') {
    ['#ff7d87','#ffd166','#82e6a2','#79caff','#ca9aff'].forEach((c,i)=>{ ctx.strokeStyle=c; ctx.beginPath(); ctx.arc(0,10,22-i*4,Math.PI,0); ctx.stroke(); });
  } else if (id === 'scan') {
    ctx.beginPath(); ctx.arc(0,0,19,0,Math.PI*2); ctx.stroke(); line(-23,0,23,0); line(0,-23,0,23); dot(0,0,4);
  } else if (id === 'split') {
    dot(0,0,6); [-1,1].forEach(dx=>[-1,1].forEach(dy=>{line(dx*7,dy*7,dx*17,dy*17);dot(dx*19,dy*19,4);}));
  } else if (id === 'seed') {
    line(0,20,0,-6); ctx.beginPath(); ctx.ellipse(-8,-3,7,13,-0.8,0,Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.ellipse(9,-11,7,13,0.8,0,Math.PI*2); ctx.fill();
  } else if (id === 'recolor') {
    ctx.beginPath(); ctx.moveTo(0,-22); ctx.bezierCurveTo(-30,9,-14,24,0,21); ctx.bezierCurveTo(23,20,21,4,0,-22); ctx.fill();
  } else if (id === 'attack') {
    [-12,0,12].forEach(yy=>{line(-18,yy,17,yy);line(17,yy,9,yy-5);});
  } else if (id === 'skill') {
    ctx.beginPath(); ctx.moveTo(5,-23); ctx.lineTo(-13,3); ctx.lineTo(0,3); ctx.lineTo(-5,23); ctx.lineTo(16,-5); ctx.lineTo(3,-5); ctx.closePath(); ctx.fill();
  } else if (id === 'refill') {
    strokeRoundRect(ctx,-15,-19,30,40,5,'#ffffff',3); line(-6,-23,6,-23); line(-8,0,8,0); line(0,-8,0,8);
  } else if (id === 'shuffle') {
    line(-20,-13,18,13); line(-20,13,18,-13); line(18,-13,8,-14); line(18,-13,17,-3); line(18,13,8,14); line(18,13,17,3);
  } else if (GlobalSkills.get(id)) {
    const glyphs={forge:'⚔',haste:'»',volley:'⋙',resonance:'✧',barrier:'⬡',heal:'+',reflect:'↶',freeze:'❄',tide:'≋',pull:'◎',chainstorm:'ϟ',twins:'Ⅱ',charge:'↟',gold:'$'};
    // Geometric category silhouettes plus distinct central marks.
    const def=GlobalSkills.get(id), n=3+(def.glyph%5);
    ctx.beginPath();for(let i=0;i<n;i++){const a=-Math.PI/2+i*Math.PI*2/n;const px=Math.cos(a)*24,py=Math.sin(a)*24;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();ctx.globalAlpha=0.35;ctx.stroke();ctx.globalAlpha=1;
    text(ctx,glyphs[id]||'✧',0,1,32,'#ffffff','center');
  } else {
    [[-12,-12],[12,-12],[0,0],[-12,12],[12,12]].forEach(([dx,dy])=>dot(dx,dy,4));
  }
  ctx.restore();
}

module.exports = { skillIcon };
