'use strict';
const {text}=require('../ui.js');
const Pick=require('../screens/pick-layout.js');
function emit(g,card,index){
 const ly=g.renderer.ly,box=Pick.geometry('relic',{towerTop:ly.slotY,towerBottom:ly.slotY+ly.slotSize});
 const from=((g.relicPickHits||[])[index]||{}).iconCenter||{x:55+index*218+102,y:box.y+220};
 const ids=[...new Set((g.battleRelics||[]).map(r=>r.id))],i=ids.indexOf(card.id);
 const to={x:ly.areaX+24,y:ly.areaY+ly.entryH+14+(i<8?Math.max(0,i)*44+18:8*44+5)};
 if(g._relicAcquireRun!==g.run){g._relicAcquireFx=[];g._relicAcquireRun=g.run;}
 const list=g._relicAcquireFx||(g._relicAcquireFx=[]);list.push({card:{...card},from,to,at:Date.now()});if(list.length>6)list.shift();
}
function draw(ctx,g,now=Date.now()){
 if(g._relicAcquireRun!==g.run){g._relicAcquireFx=[];return;}
 const list=g._relicAcquireFx||[];
 for(let i=list.length-1;i>=0;i--){const f=list[i],p=Math.max(0,(now-f.at)/760);if(p>=1){list.splice(i,1);continue;}
  const q=1-Math.pow(1-Math.min(1,p/.85),3),x=f.from.x+(f.to.x-f.from.x)*q-Math.sin(q*Math.PI)*60,y=f.from.y+(f.to.y-f.from.y)*q-50*Math.sin(q*Math.PI),size=90+(30-90)*q;
  ctx.save();ctx.globalAlpha=p>.85?(1-p)/.15:1;
  ctx.shadowColor='#ffe2a0';ctx.shadowBlur=14;
  ctx.fillStyle='rgba(245,210,121,.25)';ctx.beginPath();ctx.arc(x,y,size*.6,0,Math.PI*2);ctx.fill();
  if(!g.renderer.relicFlightIcon(ctx,f.card.id,x-size/2,y-size/2,size))text(ctx,f.card.icon||'◆',x,y,size*.65,'#fff0c2','center');
  ctx.shadowBlur=0;ctx.strokeStyle='#ffe2a0';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,size*.55,0,Math.PI*2);ctx.stroke();
  if(p>.72){ctx.globalAlpha=(1-p)/.28;ctx.beginPath();ctx.arc(f.to.x,f.to.y,18+(p-.72)*70,0,Math.PI*2);ctx.stroke();}
  ctx.restore();
 }
}
module.exports={emit,draw};
