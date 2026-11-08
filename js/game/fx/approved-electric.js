'use strict';
const DATA=require('./approved-electric-frames.js');
function create(drawImg){
 function sprite(ctx,id,t,x,y,k=1){const a=DATA[id];if(t<0)return false;const local=a.loop?t%a.duration:Math.min(t,a.duration-.001),f=a.frames[Math.min(a.frames.length-1,Math.floor(local*a.fps))];return drawImg(ctx,'assets/images/towers/fx/electric-approved/'+a.src,x-a.pivot[0]*k,y-a.pivot[1]*k,f.w*k,f.h*k,f);}
 function plasma(ctx,t,x,y){const a=DATA['plasma-ball'],f=a.frames[Math.floor(t*a.fps)%a.frames.length];return drawImg(ctx,'assets/images/towers/fx/electric-approved/'+a.src,x-28,y-26,56,52,{x:f.x+28,y:f.y+15,w:56,h:52});}
 function shot(ctx,f){
  if(f.kind==='orb'){const o=f.ref||f;if(!(o.x!=null&&o.y!=null))return true;if(o.ballLightning||f.ballLightning){plasma(ctx,Math.max(0,f.t),o.x,o.y);return true;}
   // Keep the visual ball at the real projectile position, not at its atlas's built-in wandering offset.
   const t=Math.max(0,f.t),a=t/4*Math.PI*2;
   const bx=38*Math.sin(a)+9*Math.sin(2*a+1),by=-42+13*Math.sin(2*a+.4)+6*Math.sin(3*a+.5);
   sprite(ctx,'ball-lightning',t,o.x-bx*.65,o.y-by*.65,.65);return true;
  }
  if(f.kind==='storm'){sprite(ctx,'lightning-strike',.76+Math.max(0,f.t)*2.24/.55,f.x,f.y,.85);return true;}
  if(f.kind==='auroraZap'){sprite(ctx,'zap-hit',f.t,f.x,f.y,1.3);return true;}
  if(f.kind==='miasma'){const a=DATA['poison-cloud'],frame=a.frames[Math.floor(Math.max(0,f.t)*a.fps)%a.frames.length],height=(f.half||20)*5,width=f.w||750,x=(f.x==null?375:f.x)-width/2,y=f.y;
   drawImg(ctx,'assets/images/towers/fx/electric-approved/'+a.src,x,y-height/2,width,height,frame);return true;
  }return false;
 }
 return{shot,sprite};
}
module.exports={create};
