/** Canvas 矢量技能图标：用于主页技能槽、技能选择卡和其他技能展示。 */
'use strict';
const { fillRoundRect, strokeRoundRect, text } = require('../ui.js');
const GlobalSkills = require('../../global-skills.js');

function skillIcon(ctx, id, x, y, size, color) {
  const c = color || '#b896ff';
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 64, size / 64);

  // 宝石外框：暗底、彩色侧缘、内高光与底部阴影，缩小时仍保留清楚轮廓。
  ctx.shadowColor = c;
  ctx.shadowBlur = 10;
  const bg = ctx.createLinearGradient(-28, -29, 27, 30);
  bg.addColorStop(0, c);
  bg.addColorStop(0.42, '#31425e');
  bg.addColorStop(1, '#101a2b');
  fillRoundRect(ctx, -29, -29, 58, 58, 16, bg);
  ctx.shadowBlur = 0;
  strokeRoundRect(ctx, -28.5, -28.5, 57, 57, 15, 'rgba(255,255,255,0.78)', 1.25);
  strokeRoundRect(ctx, -25.5, -25.5, 51, 51, 12, 'rgba(255,255,255,0.18)', 1);
  const gloss = ctx.createLinearGradient(0, -27, 0, 1);
  gloss.addColorStop(0, 'rgba(255,255,255,0.30)');
  gloss.addColorStop(1, 'rgba(255,255,255,0)');
  fillRoundRect(ctx, -25, -25, 50, 26, 12, gloss);

  const line = (x1, y1, x2, y2, width = 3.2) => {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineWidth = width; ctx.stroke();
  };
  const circle = (cx, cy, r, fill = false) => {
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    if (fill) ctx.fill(); else ctx.stroke();
  };
  const polygon = (points, fill = false) => {
    ctx.beginPath(); points.forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py));
    ctx.closePath(); if (fill) ctx.fill(); else ctx.stroke();
  };
  const path = (fn, fill = false) => { ctx.beginPath(); fn(); if (fill) ctx.fill(); else ctx.stroke(); };
  const star = (cx, cy, outer, inner, points = 4) => {
    const v = [];
    for (let i = 0; i < points * 2; i++) {
      const a = -Math.PI / 2 + i * Math.PI / points, r = i % 2 ? inner : outer;
      v.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    polygon(v, true);
  };
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = '#f6fbff'; ctx.fillStyle = '#f6fbff'; ctx.lineWidth = 3.2;
  ctx.shadowColor = 'rgba(4,10,20,0.75)'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1;

  // 三消：每种方块使用独立、易辨识的符号。
  if (id === 'row' || id === 'col' || id === 'cross') {
    ctx.strokeStyle = '#fff5cc'; ctx.lineWidth = 4;
    if (id !== 'col') { line(-19, 0, 19, 0, 4); polygon([[-19,0],[-10,-7],[-10,7]], true); polygon([[19,0],[10,-7],[10,7]], true); }
    if (id !== 'row') { line(0, -19, 0, 19, 4); polygon([[0,-19],[-7,-10],[7,-10]], true); polygon([[0,19],[-7,10],[7,10]], true); }
    circle(0, 0, 4.5, true);
  } else if (id === 'split') {
    ctx.fillStyle = '#fff0b5'; star(0, 0, 9, 4, 4);
    ctx.strokeStyle = '#fff5cc'; ctx.lineWidth = 2.5;
    for (const [dx, dy] of [[-1,-1],[1,-1],[-1,1],[1,1]]) {
      line(dx * 7, dy * 7, dx * 16, dy * 16, 2.5);
      ctx.fillStyle = '#ffdc78'; circle(dx * 18, dy * 18, 3.2, true);
    }
  } else if (id === 'rand') {
    ctx.fillStyle = '#fff0ba';
    polygon([[-17,-11],[0,-19],[17,-11],[17,11],[0,19],[-17,11]], true);
    ctx.fillStyle = '#7253b8';
    for (const [dx,dy] of [[-8,-5],[0,0],[8,5]]) circle(dx,dy,2.4,true);
    ctx.strokeStyle = '#fff5cc'; line(-22,-17,-17,-13,2); line(21,15,16,11,2);
  } else if (id === 'rainbow') {
    const rainbow = ['#ff5b67','#ffb84d','#f6e66b','#56dc9d','#60bbff','#be85ff'];
    rainbow.forEach((tone, i) => {
      ctx.beginPath(); ctx.strokeStyle = tone; ctx.lineWidth = 4.2;
      ctx.arc(0, 10, 23 - i * 3.5, Math.PI, 0); ctx.stroke();
    });
    ctx.fillStyle = '#fff7d1'; star(0, 8, 5, 2.3, 4);
  } else if (id === 'scan') {
    ctx.strokeStyle = '#dff7ff'; ctx.lineWidth = 3;
    circle(0, 0, 16); line(11, 12, 22, 23, 4);
    ctx.strokeStyle = '#80e9ff'; line(-22, -7, 13, -7, 2.5);
    ctx.fillStyle = '#fff4be'; circle(0, 0, 4, true);
  } else if (id === 'recolor') {
    ctx.fillStyle = '#fff5d0';
    path(() => { ctx.moveTo(0,-22); ctx.bezierCurveTo(-25,-1,-21,17,-8,20); ctx.bezierCurveTo(6,25,22,16,20,4); ctx.bezierCurveTo(19,-4,9,-14,0,-22); }, true);
    ctx.fillStyle = '#f55d74'; circle(-8, 0, 3, true); ctx.fillStyle = '#58d9aa'; circle(4, -8, 3, true); ctx.fillStyle = '#70baff'; circle(9, 6, 3, true);
  } else if (id === 'seed') {
    ctx.strokeStyle = '#e9ffd2'; line(0, 20, 0, -2, 3.5);
    ctx.fillStyle = '#8af0a3';
    path(() => { ctx.moveTo(0,4); ctx.bezierCurveTo(-21,0,-22,-15,-7,-16); ctx.bezierCurveTo(2,-14,2,-4,0,4); }, true);
    path(() => { ctx.moveTo(0,-3); ctx.bezierCurveTo(3,-20,18,-22,19,-12); ctx.bezierCurveTo(17,-4,8,0,0,-3); }, true);
    ctx.strokeStyle = '#efffce'; line(-2, 0, -12, -10, 1.6); line(2, -3, 12, -14, 1.6);
  } else if (GlobalSkills.get(id)) {
    const motifs = {
      shuffle: () => { ctx.strokeStyle='#fff4cb'; line(-19,-12,18,12,3.4); line(-19,12,18,-12,3.4); polygon([[18,-12],[8,-15],[12,-5]],true); polygon([[18,12],[8,15],[12,5]],true); },
      refill: () => { ctx.strokeStyle='#eafff2'; strokeRoundRect(ctx,-13,-19,26,39,5,'#eafff2',3); ctx.fillStyle='#73efad'; fillRoundRect(ctx,-9,4,18,11,2,'#73efad'); line(-6,-23,6,-23,3); line(0,-9,0,1,2.5); line(-5,-4,5,-4,2.5); },
      forge: () => { ctx.fillStyle='#ffe29a'; polygon([[-18,-13],[-8,-21],[2,-12],[-6,-3]],true); line(-7,-5,15,17,5); polygon([[10,14],[21,12],[18,22],[7,22]],true); star(-17,15,4,2,4); },
      haste: () => { ctx.fillStyle='#b9f4ff'; polygon([[2,-23],[-13,3],[-2,3],[-7,22],[15,-7],[4,-7]],true); line(-21,-12,-12,-12,2); line(15,17,22,17,2); },
      volley: () => { ctx.fillStyle='#ffe1c1'; for(let i=-1;i<=1;i++) { const yy=i*9; polygon([[-19,yy-3],[10,yy-3],[18,yy],[10,yy+3],[-19,yy+3]],true); } },
      resonance: () => { ctx.strokeStyle='#f2eaff'; ctx.lineWidth=2.6; circle(0,0,7); circle(0,0,15); circle(0,0,22); ctx.fillStyle='#fff0a6'; star(0,0,5,2,4); },
      barrier: () => { ctx.fillStyle='#caefff'; polygon([[0,-22],[18,-15],[16,5],[0,21],[-16,5],[-18,-15]],true); ctx.fillStyle='#315676'; polygon([[0,-15],[11,-10],[10,3],[0,14],[-10,3],[-11,-10]],true); ctx.strokeStyle='#effaff'; polygon([[0,-15],[11,-10],[10,3],[0,14],[-10,3],[-11,-10]]); },
      heal: () => { ctx.fillStyle='#eaffef'; fillRoundRect(ctx,-5,-20,10,40,3,'#eaffef'); fillRoundRect(ctx,-20,-5,40,10,3,'#eaffef'); ctx.fillStyle='#73e6a2'; circle(0,0,4,true); },
      reflect: () => { ctx.strokeStyle='#ffe4ed'; ctx.lineWidth=3.2; path(()=>{ctx.moveTo(0,-21);ctx.lineTo(17,-14);ctx.lineTo(15,4);ctx.quadraticCurveTo(10,16,0,21);ctx.quadraticCurveTo(-10,16,-15,4);ctx.lineTo(-17,-14);ctx.closePath();}); path(()=>{ctx.arc(0,0,9,Math.PI*0.15,Math.PI*1.55);}); polygon([[-11,-7],[-4,-10],[-8,-2]],true); },
      freeze: () => { ctx.strokeStyle='#e2f8ff'; ctx.lineWidth=3; for(let i=0;i<6;i++){const a=i*Math.PI/3;line(Math.cos(a)*20,Math.sin(a)*20,-Math.cos(a)*20,-Math.sin(a)*20,3);line(Math.cos(a)*13,Math.sin(a)*13,Math.cos(a+0.35)*17,Math.sin(a+0.35)*17,2);} circle(0,0,4,true); },
      tide: () => { ctx.strokeStyle='#d9f7ff'; ctx.lineWidth=3; for(let i=-1;i<=1;i++){const yy=i*10;path(()=>{ctx.moveTo(-21,yy);ctx.bezierCurveTo(-11,yy-9,-3,yy+9,7,yy);ctx.bezierCurveTo(13,yy-5,17,yy-4,21,yy-1);});} },
      pull: () => { ctx.strokeStyle='#f3e6ff'; ctx.lineWidth=3; path(()=>{ctx.moveTo(19,-16);ctx.bezierCurveTo(-13,-25,-25,7,-5,16);ctx.bezierCurveTo(12,23,17,4,5,0);ctx.bezierCurveTo(-3,-3,-8,5,-2,9);}); ctx.fillStyle='#fff2c2'; circle(0,0,3.5,true); },
      chainstorm: () => { ctx.strokeStyle='#ffe2a8'; ctx.lineWidth=3.4; for(let i=-1;i<=1;i++){path(()=>{ctx.moveTo(-20,i*10);ctx.lineTo(-7,i*10-5);ctx.lineTo(4,i*10+5);ctx.lineTo(19,i*10-3);});} star(0,0,5,2,4); },
      twins: () => { ctx.fillStyle='#f3e6ff'; polygon([[-15,-18],[-3,-6],[-15,6],[-27,-6]],true); polygon([[15,-18],[27,-6],[15,6],[3,-6]],true); line(-15,8,-15,19,2); line(15,8,15,19,2); star(0,12,5,2,4); },
      charge: () => { ctx.strokeStyle='#eafff9'; ctx.lineWidth=3; circle(0,0,19); ctx.fillStyle='#a7fff0'; polygon([[2,-17],[-11,3],[-2,3],[-6,17],[12,-6],[3,-6]],true); },
      gold: () => { ctx.strokeStyle='#fff1bd'; ctx.lineWidth=3; circle(0,-7,13); circle(0,10,13); ctx.fillStyle='#ffe07a'; circle(0,-7,5,true); circle(0,10,5,true); star(19,-18,4,2,4); },
    };
    const draw = motifs[id];
    if (draw) draw(); else { ctx.fillStyle='#ffffff'; star(0,0,17,8,5); }
  } else {
    // 未覆盖的塔技能沿用原通用点阵徽记。
    ctx.fillStyle = '#ffffff';
    [[-12,-12],[12,-12],[0,0],[-12,12],[12,12]].forEach(([dx,dy])=>circle(dx,dy,4,true));
  }

  ctx.restore();
}

module.exports = { skillIcon };
