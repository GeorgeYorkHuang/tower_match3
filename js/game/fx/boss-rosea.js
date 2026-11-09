'use strict';
const F=require('./rosea-frames.js');
const ROOT='assets/images/monsters/bosses/altar_rosea/';const images={};
function image(src){if(images[src])return images[src];if(typeof wx==='undefined'||!wx.createImage)return null;const i=wx.createImage();images[src]=i;i.src=ROOT+src;return i;}
function sheet(ctx,n,t,x,y,scale,alpha){const i=image(n?'roots-v2.png':'shield-v2.png');if(!i||!i.width)return;const a=F[n],f=a[Math.min(a.length-1,Math.floor(t*30)%a.length)];ctx.save();ctx.globalAlpha*=alpha;ctx.drawImage(i,f.x,f.y,f.w,f.h,x-(n?64:44)*scale,y-(n?78:68)*scale,f.w*scale,f.h*scale);ctx.restore();}
function create(){let s=null,burst=-1,summons=[];return {sync(v){s={...v};},step(dt){if(burst>=0){burst+=dt;if(burst>3)burst=-1;}summons=summons.filter(v=>(v.age+=dt)<2.7);},triggerBurst(){burst=0;},triggerSummon(side,pos){if(pos)summons.push({x:pos.x,y:pos.y,age:0,size:pos.size||48});},reset(){s=null;burst=-1;summons=[];},drawTo(ctx){if(!s)return;const x=s.x,y=s.y+s.size*.5,k=s.size/330,t=s.elapsed;
if(s.shieldLayers>0){sheet(ctx,1,1.2,x,y,3.1*k,.8);sheet(ctx,0,t%2.4,x,y,4*k,.48);}
if(burst>=0){const p=burst/3;ctx.save();ctx.globalAlpha*=1-p;ctx.strokeStyle='#96e66e';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x,y,(60+p*250)*k,(18+p*75)*k,0,0,Math.PI*2);ctx.stroke();for(let i=0;i<26;i++){const a=i*2.399;ctx.save();ctx.translate(x+Math.cos(a)*(35+p*210)*k,y-140*k+Math.sin(a)*p*140*k-p*65*k);ctx.rotate(a+t);ctx.fillStyle=i%3?'#a84457':'#b19b60';ctx.fillRect(-4*k,-2*k,10*k,5*k);ctx.restore();}ctx.restore();}
for(const v of summons)sheet(ctx,1,v.age,v.x,v.y+v.size*.5,v.size/60,.65);
}};}
module.exports={create};
