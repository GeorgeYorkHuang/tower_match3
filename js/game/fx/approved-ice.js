'use strict';
function flake(c,x,y,r,angle,alpha){c.save();c.translate(x,y);c.rotate(angle);c.globalAlpha*=alpha;c.lineWidth=1.5;for(let k=0;k<6;k++){const a=k*Math.PI/3,X=Math.cos(a)*r,Y=Math.sin(a)*r;c.strokeStyle='#b2eaff';c.beginPath();c.moveTo(0,0);c.lineTo(X,Y);c.stroke();for(const s of [-1,1]){const b=a+s*Math.PI/3;c.beginPath();c.moveTo(X*.6,Y*.6);c.lineTo(X*.6+Math.cos(b)*r*.32,Y*.6+Math.sin(b)*r*.32);c.stroke();}}c.fillStyle='#f2fdff';c.fillRect(-1,-1,2,2);c.restore();}
function create(drawImg,tintAtlas){
 function flower(ctx,f){const progress=Math.max(0,Math.min(1,f.t/f.dur)),frame=Math.min(48,Math.floor(progress*48)),r=f.r||100,scale=r*2.6/140;
 ctx.save();tintAtlas(ctx,'assets/images/towers/fx/snowflake-burst/snowflake-burst-sheet.png','#28bfff',f.x-70*scale,f.y-58*scale,140*scale,120*scale,{x:frame%7*140,y:Math.floor(frame/7)*120,w:140,h:120});
 const travel=Math.sin(Math.min(1,progress/.7)*Math.PI/2),alpha=Math.min(1,progress*12)*Math.min(1,(1-progress)/.22);
 for(let i=0;i<12;i++){const a=i*Math.PI/6+.18,rr=(i%3===0?1:.58+.18*(i%3))*r*travel;flake(ctx,f.x+Math.cos(a)*rr,f.y+Math.sin(a)*rr,3+i%3*2,f.t*.7+i,alpha);}ctx.restore();
 }
 function orb(ctx,f){const r=f.r||110,t=Math.max(0,f.t);ctx.save();ctx.fillStyle='rgba(137,208,255,.16)';ctx.beginPath();ctx.arc(f.x,f.y,r,0,Math.PI*2);ctx.fill();ctx.strokeStyle='rgba(169,226,255,.45)';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(f.x,f.y,r,0,Math.PI*2);ctx.stroke();
 function particles(back){for(let i=0;i<32;i++){const a=t*(.45+(i%5)*.12)*(i%2?-1:1)+i*2.399,rr=r*(.22+(i%7)/7*.68),x=Math.cos(a)*rr,y=Math.sin(a)*rr*.82+Math.sin(t*1.4+i)*6;if((y<0)!==back)continue;ctx.save();ctx.globalAlpha*=.45+.35*Math.sin(t*1.3+i)**2;ctx.fillStyle=i%3?'#b6e9ff':'#f1fcff';const s=i%4===0?3:2;ctx.fillRect(Math.round(f.x+x),Math.round(f.y+y),s,s);ctx.strokeStyle='rgba(142,210,250,.35)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(f.x+x,f.y+y);ctx.lineTo(f.x+x-Math.sin(a)*5,f.y+y+Math.cos(a)*4);ctx.stroke();ctx.restore();}}
 particles(true);const frame=Math.floor(t*12)%36;
 if(!drawImg(ctx,'assets/images/towers/fx/ice-crystal/ice-crystal-sheet.png',f.x-72,f.y-87,144,150,{x:frame%7*96,y:Math.floor(frame/7)*100,w:96,h:100})){ctx.fillStyle='#b8e6ff';ctx.globalAlpha*=.5;ctx.beginPath();ctx.arc(f.x,f.y,19.5,0,Math.PI*2);ctx.fill();}
 particles(false);ctx.restore();
 }
 return{flower,orb};
}
module.exports={create};
