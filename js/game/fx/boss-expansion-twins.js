'use strict';
const { text } = require('../ui.js');
function ring(ctx,x,y,r,color,alpha) {
  ctx.save(); ctx.globalAlpha *= alpha; ctx.strokeStyle=color; ctx.lineWidth=2;
  ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.stroke(); ctx.restore();
}
function draw(ctx, g) {
  const q = g.run.bossEncounter;
  if (!g.run.bossLock || !q || !['lava_twins', 'frost_twins'].includes(q.id) || q.finished) return;
  const members = q.members || [], alive = members.filter(e => e.hp > 0);
  if (!alive.length) return;
  const sprite = g.renderer && g.renderer.bossSkillSprite;
  const lava = q.id === 'lava_twins', color = lava ? '#ffbc62' : '#b5edff';
  const split = q.fissionVisual, age = split ? q.elapsed - split.at : Infinity;
  if (split && age >= 0 && age < split.duration) {
    const p = age / split.duration;
    ring(ctx, split.x, split.y, 20 + 75*p, color, 1-p);
    ctx.save(); ctx.globalAlpha *= 1-p; ctx.strokeStyle=color; ctx.lineWidth=4;
    ctx.beginPath();ctx.moveTo(split.x,split.y-60);ctx.lineTo(split.x-8,split.y);ctx.lineTo(split.x+5,split.y+55);ctx.stroke();ctx.restore();
    for (const e of alive) ring(ctx, e.x, e.y, 10 + 30*p, color, 1-p);
  }
  if (q.echoVisual) {
    const t=q.elapsed-q.echoVisual.at;
    if(t>=0&&t<.8)for(const e of alive)ring(ctx,e.x,e.y,25+80*t/.8,color,1-t/.8);
  }
  if(q.phase===2&&q.resonanceStacks>0)for(const e of alive){
    if(lava&&sprite)sprite.call(g.renderer,ctx,'carlos-resonance',q.resonanceStacks-1,e.x,e.y,115,.7);
    else for(let i=0;i<q.resonanceStacks;i++)ring(ctx,e.x,e.y,36+i*7,color,.6);
  }
  if(q.timeoutVisual&&lava&&sprite){
    const t=q.elapsed-q.timeoutVisual.at, target=alive.find(e=>e.id===q.timeoutVisual.id);
    if(target&&t>=0&&t<.6)sprite.call(g.renderer,ctx,'carlos-reignite',Math.floor(t/.2),target.x,target.y,125,1-t/.6);
  }
  const top = g.ly.areaY + g.ly.entryH;
  const boss = { ...alive[0], hp: members.reduce((n,e)=>n+Math.max(0,e.hp),0),
    maxHp: members.reduce((n,e)=>n+e.maxHp,0), phaseThresholds: q.phase === 1 ? [.6] : [],
    bossStatus: q.phase === 1 ? '完整形态' : '双体 · 共鸣 ' + q.resonanceStacks + '/3' };
  require('../screens/boss-health.js').draw(ctx, boss, top);
  if (q.phase === 2) for (const e of alive) text(ctx, '分身' + e.bossTwinIndex, e.x, e.y - 60, 16, '#f5dc9d', 'center');
  if (q.firstDeathAt != null && !q.syncExpired) text(ctx, '同步击破 ' + Math.max(0, 8 - (q.elapsed - q.firstDeathAt)).toFixed(1) + '秒', 375, top+96, 18, '#f5dc9d', 'center');
}
module.exports = { draw };
