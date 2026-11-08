'use strict';
const TowerBuffs = require('./tower-buff-sprites.js');
const ElectricBuff = require('./electric-blessing.js');
const LeafStorm = require('./leaf-storm.js');
const Catalog = require('../../skills/global-catalog.js');
const { text } = require('../ui.js');
const STYLE = {refill:'rays',forge:'blades',haste:'wind',volley:'arrows',resonance:'orbits',barrier:'shield',heal:'cross',reflect:'spikes',freeze:'snow',tide:'waves',pull:'vortex',chainstorm:'chain',twins:'twins',charge:'bolts',gold:'coins',shuffle:'shuffle'};
function now(g) { return (g.animClock || 0) / 1000; }
function emit(combat,id) {
 const g=combat.game,s=g.run.gsState||(g.run.gsState={});
 const events=s._castFx||(s._castFx=[]),t=now(g);
 s._castFx=events.filter(e=>t-e.at<1.4).concat({id,at:t}).slice(-4);
}
function activeBuffs(run,key) {
 const s=run.gsState||{},p=run.storeTimers||{},out=[];
 if(s.forge>0||p.atk>0)out.push({kind:'power',color:'#ffd36b'});
 if(s.haste>0||p.spd>0)out.push({kind:'speed',color:'#72e4cf'});
 if(s.volley&&s.volley[key])out.push({kind:'volley',color:'#ff967c'});
 return out;
}
function shake(g) {
 const events=g.run.gsState&&g.run.gsState._castFx||[],t=now(g);
 const age=events.length?t-events[events.length-1].at:99;
 if(age<0||age>=0.24)return {x:0,y:0};
 const a=5*(1-age/0.24);return {x:Math.sin(age*100)*a,y:Math.cos(age*123)*a*0.65};
}
function ring(ctx,x,y,r,color,width=2){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();}
function line(ctx,x,y,a,b){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(a,b);ctx.stroke();}
function motif(ctx,kind,x,y,r,t,color){
 ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=3;
 const n={rays:12,blades:6,wind:3,arrows:8,orbits:6,shield:6,cross:4,spikes:10,snow:6,waves:3,vortex:5,chain:8,twins:2,bolts:5,coins:7,shuffle:4}[kind]||6;
 for(let i=0;i<n;i++){
  const a=i*Math.PI*2/n+t*.6,xx=x+Math.cos(a)*r,yy=y+Math.sin(a)*r*.55;
  ctx.save();ctx.translate(xx,yy);ctx.rotate(a);
  if(kind==='cross'){line(ctx,-8,0,8,0);line(ctx,0,-8,0,8);}
  else if(kind==='blades'){ctx.beginPath();ctx.moveTo(0,-20);ctx.lineTo(6,0);ctx.lineTo(0,9);ctx.lineTo(-6,0);ctx.closePath();ctx.stroke();line(ctx,-10,8,10,8);}
  else if(kind==='bolts'){ctx.beginPath();ctx.moveTo(4,-16);ctx.lineTo(-6,0);ctx.lineTo(5,0);ctx.lineTo(-4,16);ctx.stroke();}
  else if(kind==='shield'){ctx.beginPath();ctx.moveTo(-9,-12);ctx.lineTo(9,-12);ctx.lineTo(9,3);ctx.lineTo(0,14);ctx.lineTo(-9,3);ctx.closePath();ctx.stroke();}
  else if(kind==='spikes'){line(ctx,0,0,0,-18);line(ctx,0,-18,-6,-10);line(ctx,0,-18,6,-10);}
  else if(['orbits','chain','coins','twins'].includes(kind))ring(ctx,0,0,kind==='coins'?9:6,color);
  else if(['wind','waves','vortex'].includes(kind)){ctx.beginPath();ctx.arc(0,0,18+i*3,t,t+Math.PI*.9);ctx.stroke();}
  else if(kind==='snow'){for(let k=0;k<3;k++){const b=k*Math.PI/3;line(ctx,-Math.cos(b)*12,-Math.sin(b)*12,Math.cos(b)*12,Math.sin(b)*12);}}
  else {ctx.beginPath();ctx.moveTo(-12,-5);ctx.lineTo(8,0);ctx.lineTo(-12,5);ctx.stroke();}
  ctx.restore();
 }
}
function draw(ctx,g) {
 const r=g.run,t=now(g),ly=g.ly||{},top=ly.areaY||140,bottom=ly.slotY||970;
 ctx.save();
 ctx.beginPath();ctx.rect(0,top,750,Math.max(0,bottom-top));ctx.clip();
 const events=r.gsState&&r.gsState._castFx||[];
 events.forEach((e,index)=>{
  const age=t-e.at;if(age<0||age>=1.4)return;
  const def=Catalog.get(e.id)||{name:'全局洗牌',color:'#ffad58'},k=age/1.4;
  const x=375,y=top+(bottom-top)*.43;
  ctx.globalAlpha=Math.min(1,age/.08+.15)*(1-k);
  ring(ctx,x,y,40+240*k,def.color,4*(1-k)+1);
  motif(ctx,STYLE[e.id],x,y,65+160*k,age,def.color);
  // Control skills project feedback onto actual enemy positions.
  if(e.id==='freeze'||e.id==='tide')for(const enemy of g.enemies||[])if(enemy.hp>0)motif(ctx,e.id==='freeze'?'snow':'waves',enemy.x,enemy.y,15,age,def.color);
  if(e.id==='heal'||e.id==='reflect'||e.id==='barrier')motif(ctx,STYLE[e.id],375,bottom-30,170,age,def.color);
  ctx.globalAlpha=Math.min(1,age/.08+.15)*Math.min(1,(1.4-age)/.3);
  const offset=(events.length-1-index)*44;
  ctx.shadowColor='#101a12';ctx.shadowBlur=8;
  text(ctx,def.name,x,y-65-offset-12*k,34,def.color,'center');ctx.shadowBlur=0;
 });
 ctx.restore();
 // Continuous feedback reads real timers; purchasing, expiration and refresh need no duplicate visual state.
 ctx.save();
 for(const key of [...new Set(r.slotOrder||[])]){
  const tower=r.effects.tower(key);if(!tower||tower.level<=0)continue;
  const p=g.combat.towerMuzzle(key),buffs=activeBuffs(r,key);
  if ((tower.pool||[]).some(e=>e.name==='电磁过载'&&e.level>0) || (r.effects.tower('electric') && (r.effects.tower('electric').pool||[]).some(e=>e.name==='电磁过载'&&e.level>0))) ElectricBuff.draw(ctx,p.x,p.y+32,t);
  buffs.forEach((b,i)=>{
   if(b.kind==='speed'){LeafStorm.draw(ctx,p.x,p.y+30,t,key);return;}
   TowerBuffs.draw(ctx,b.kind,p.x,p.y+30,t);
  });
 }
 ctx.restore();
}
module.exports={emit,draw,shake,activeBuffs,STYLE};
