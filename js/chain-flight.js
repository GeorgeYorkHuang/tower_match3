const STYLE = require('./config/chain-flight.js');
function drop(t) { const p=Math.max(0,Math.min(1,t/STYLE.dropDuration)); return STYLE.dropDistance*(2*p-p*p); }
function create(x,y,tx,ty,baseDuration) {
 const distance=Math.hypot(tx-x,ty-y), speed=Math.max(600,Math.min(1400,distance/Math.max(.01,baseDuration)));
 return {dropDuration:STYLE.dropDuration, speed};
}

// 积分速度：向下结束后，最多1秒匀加速至原弹道速度，之后保持恒速。
function travel(m, elapsed) {
 const t=Math.max(0,elapsed),a=STYLE.accelerationDuration;
 return t<a ? m.speed*t*t/(2*a) : m.speed*(t-a/2);
}
function finish(shot) {
 shot.finished=true;
 if(shot.visual)shot.visual.t=shot.visual.dur;
 return false;
}
function advance(combat, shot, dt) {
 const m=shot.chainFlight;
 if(shot.t<=m.dropDuration) { shot.x=shot.sx;shot.y=shot.sy+drop(shot.t);return true; }
 const previous=Math.max(0,shot.t-dt-m.dropDuration),elapsed=shot.t-m.dropDuration;
 const enemies=combat.enemies().filter(e=>e.hp>0);
 if(!shot._chainLaunched){
  shot.x=shot.sx;shot.y=shot.sy+STYLE.dropDistance;shot._chainLaunched=true;
  // 只在起飞时瞄准一次；之后沿直线飞行，敌人移开、死亡或场上无敌人均不停车。
  let target=null,best=Infinity;
  for(const enemy of enemies){const d=Math.hypot(enemy.x-shot.x,enemy.y-shot.y);if(d<best){best=d;target=enemy;}}
  const dx=target?target.x-shot.x:(shot.sx-375)*0.25,dy=target?target.y-shot.y:-600;
  shot.angle=Math.atan2(dy,dx);
  m.vx=Math.cos(shot.angle);m.vy=Math.sin(shot.angle);shot.target=null;
 }
 if(shot.t>=STYLE.maxFlightTime)return finish(shot);
 const amount=travel(m,elapsed)-travel(m,previous);
 const x=shot.x,y=shot.y,nx=x+m.vx*amount,ny=y+m.vy*amount;
 // 对整段路径做碰撞，低帧率也不会穿过敌人；可落空，不把失效目标重新绑定。
 let hit=null,first=Infinity;
 for(const enemy of enemies){
  const dx=nx-x,dy=ny-y,length2=dx*dx+dy*dy;
  const p=length2?Math.max(0,Math.min(1,((enemy.x-x)*dx+(enemy.y-y)*dy)/length2)):0;
  if(Math.hypot(enemy.x-x-dx*p,enemy.y-y-dy*p)<=Math.max(12,(enemy.size||40)*0.35)&&p<first){first=p;hit=enemy;}
 }
 if(hit){shot.x=x+(nx-x)*first;shot.y=y+(ny-y)*first;shot.target=hit;combat.resolveShot(shot);return finish(shot);}
 shot.x=nx;shot.y=ny;
 return nx>=-80&&nx<=830&&ny>=-80&&ny<=1800 ? true : finish(shot);
}
module.exports={drop,create,travel,advance};
