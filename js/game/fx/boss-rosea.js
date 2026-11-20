'use strict';
function sheet(ctx,n,t,x,y,scale,alpha){
 ctx.save();try{ctx.globalAlpha*=alpha;ctx.strokeStyle=n?'#92ca70':'#d9eaa2';ctx.lineWidth=2*scale;
 if(n){for(let k=0;k<5;k++){const a=k*1.256+t*.3;ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+Math.cos(a)*30*scale,y-45*scale,x+Math.cos(a)*55*scale,y+Math.sin(a)*15*scale);ctx.stroke();}}
 else{ctx.beginPath();ctx.ellipse(x,y-30*scale,40*scale,58*scale,0,0,Math.PI*2);ctx.stroke();}
 }finally{ctx.restore();}
}function create(){let s=null,burst=-1,summons=[];return {sync(v){s={...v};},step(dt){if(burst>=0){burst+=dt;if(burst>3)burst=-1;}summons=summons.filter(v=>(v.age+=dt)<2.7);},triggerBurst(){burst=0;},triggerSummon(side,pos){if(pos)summons.push({x:pos.x,y:pos.y,age:0,size:pos.size||48});},reset(){s=null;burst=-1;summons=[];},drawTo(ctx){if(!s)return;const x=s.x,y=s.y+s.size*.5,k=s.size/330,t=s.elapsed;
if(s.shieldLayers>0){sheet(ctx,1,1.2,x,y,3.1*k,.8);sheet(ctx,0,t%2.4,x,y,4*k,.48);}
if(burst>=0){const p=burst/3;ctx.save();ctx.globalAlpha*=1-p;ctx.strokeStyle='#96e66e';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x,y,(60+p*250)*k,(18+p*75)*k,0,0,Math.PI*2);ctx.stroke();for(let i=0;i<26;i++){const a=i*2.399;ctx.save();ctx.translate(x+Math.cos(a)*(35+p*210)*k,y-140*k+Math.sin(a)*p*140*k-p*65*k);ctx.rotate(a+t);ctx.fillStyle=i%3?'#a84457':'#b19b60';ctx.fillRect(-4*k,-2*k,10*k,5*k);ctx.restore();}ctx.restore();}
for(const v of summons)sheet(ctx,1,v.age,v.x,v.y+v.size*.5,v.size/60,.65);
}};}
module.exports={create};
