const STYLE = require('../config/match-feedback.js');
function colorAt(count) {
  const p = Math.max(0, Math.min(1, (count - STYLE.firstCombo) / (STYLE.redAt - STYLE.firstCombo))) * (STYLE.colors.length - 1);
  const i = Math.min(Math.floor(p), STYLE.colors.length - 2), t = p - i;
  const a = STYLE.colors[i], b = STYLE.colors[i + 1];
  return '#' + [1,3,5].map(n => Math.round(parseInt(a.slice(n,n+2),16)*(1-t) + parseInt(b.slice(n,n+2),16)*t).toString(16).padStart(2,'0')).join('');
}
function show(game, step, count) {
  if (count < STYLE.firstCombo || !game.fx || !step.clearedCells || !step.clearedCells.length) return;
  const cells=step.clearedCells, ly=game.ly;
  const r=cells.reduce((n,p)=>n+p[0],0)/cells.length, c=cells.reduce((n,p)=>n+p[1],0)/cells.length;
  game.fx.push({type:'floatText', text:'combo x'+count, x:ly.boardX+(c+0.5)*ly.cell, y:ly.boardY+(r+0.5)*ly.cell, t:0, dur:STYLE.duration, size:STYLE.fontSize, color:colorAt(count), outlineColor:STYLE.outlineColor, outlineWidth:STYLE.outlineWidth});
  if(game.vibrate) game.vibrate(STYLE.shakeLevel);
}
module.exports = { show, colorAt };
