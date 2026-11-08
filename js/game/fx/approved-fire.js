'use strict';
const DATA=require('./approved-fire-frames.js');
const random=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
function create(drawImg){
 function sprite(ctx,id,t,x,y,kx=1,ky=kx){const a=DATA[id];if(t<0||t>=a.duration)return false;const f=a.frames[Math.min(a.frames.length-1,Math.floor(t*a.fps))];return drawImg(ctx,'assets/images/towers/fx/fire-approved/'+a.src,x-a.pivot[0]*kx,y-a.pivot[1]*ky,f.w*kx,f.h*ky,f);}
 function ring(ctx,f){const scale=(f.r||120)/92;return sprite(ctx,'fire-ring',f.t-.2,f.x,f.y,scale,scale*5);}
 function rain(ctx,f){const r=f.r||140,seed=f.seed||0;for(let n=0;n<8;n++){const local=f.t-random(seed+n+11)*.3;if(local<0||local>2.3)continue;const angle=random(seed+n*7+1)*Math.PI*2,dist=r*Math.sqrt(random(seed+n*11+2))*.85;ctx.save();ctx.globalAlpha*=Math.min(1,(2.3-local)/.5);sprite(ctx,'meteor',local*1.24,f.x+Math.cos(angle)*dist,f.y+Math.sin(angle)*dist,.4,.4);ctx.restore();}}
 function ground(ctx,x,y,r,t,seed,fade){ctx.save();ctx.globalAlpha*=fade;const count=Math.round(Math.PI*r*r/100),sites=[];for(let i=0;i<count;i++){const a=random(seed+i*5+1)*Math.PI*2,d=r*Math.sqrt(random(seed+i*5+2));sites.push({x:Math.cos(a)*d,y:Math.sin(a)*d,phase:random(seed+i*5+3)*2,k:.65+random(seed+i*5+4)*.5});}sites.sort((a,b)=>a.y-b.y);let drawn=false;for(const s of sites)drawn=sprite(ctx,'ring-flame',(t+s.phase)%2,x+s.x,y+s.y,s.k,s.k)||drawn;ctx.restore();return drawn;}
 function wall(ctx,f){const w=f.w||220,h=f.h||45,a=DATA['torch-flame'],cols=Math.ceil(w/14);ctx.save();ctx.beginPath();ctx.rect(f.x-w/2,f.y-h/2,w,h);ctx.clip();for(let n=0;n<cols;n++){const local=(f.t+random(n+6)*2)%2,frame=a.frames[Math.floor(local*a.fps)%a.frames.length];drawImg(ctx,'assets/images/towers/fx/fire-approved/'+a.src,f.x-w/2+n*w/cols-3,f.y-h/2,w/cols+6,h,{x:frame.x+22,y:frame.y+18,w:28,h:57});}ctx.restore();}
 return{ring,rain,ground,wall};
}
module.exports={create};
