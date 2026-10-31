const STYLE = require('./config/chain-flight.js');
function drop(t) { const p=Math.max(0,Math.min(1,t/STYLE.dropDuration)); return STYLE.dropDistance*(2*p-p*p); }
function create(x,y,tx,ty,baseDuration) {
 const distance=Math.hypot(tx-x,ty-y), speed=distance/Math.max(.01,baseDuration);
 return {dropDuration:STYLE.dropDuration, speed};
}

// 积分速度：向下结束后，最多1秒匀加速至原弹道速度，之后保持恒速。
function travel(m, elapsed) {
 const t=Math.max(0,elapsed),a=STYLE.accelerationDuration;
 return t<a ? m.speed*t*t/(2*a) : m.speed*(t-a/2);
}
function advance(combat, shot, dt) {
 const m=shot.chainFlight;
 if(shot.t<=m.dropDuration) { shot.x=shot.sx;shot.y=shot.sy+drop(shot.t);return true; }
 const previous=Math.max(0,shot.t-dt-m.dropDuration),elapsed=shot.t-m.dropDuration;
 if(!shot._chainLaunched){shot.x=shot.sx;shot.y=shot.sy+STYLE.dropDistance;shot._chainLaunched=true;}
 const enemies=combat.enemies();
 if(!shot.target || shot.target.hp<=0 || !enemies.includes(shot.target)) {
  shot.target=enemies.filter(e=>e.hp>0).sort((a,b)=>Math.hypot(a.x-shot.x,a.y-shot.y)-Math.hypot(b.x-shot.x,b.y-shot.y))[0];
 }
 if(shot.t>=STYLE.maxFlightTime)return false;
 if(!shot.target)return true;
 const dx=shot.target.x-shot.x,dy=shot.target.y-shot.y,distance=Math.hypot(dx,dy);
 const amount=travel(m,elapsed)-travel(m,previous);
 shot.angle=Math.atan2(dy,dx);
 if(distance<=amount) {shot.x=shot.target.x;shot.y=shot.target.y;combat.resolveShot(shot);return false;}
 if(distance>0){shot.x+=dx/distance*amount;shot.y+=dy/distance*amount;}
 return true;
}
module.exports={drop,create,travel,advance};
