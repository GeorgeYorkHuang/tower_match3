/** 火/冰散射离线观察器：记录几何机会、实际命中、原目标状态与火球C地面收益，不改变随机数。 */
'use strict';
const Basic=require('./projectile-waste-observer.cjs');
const Collision=require('../js/combat/collision.js');

function rayOpportunity(g,s,e,predict) {
  const dx=s.tx-s.sx,dy=s.ty-s.sy,len2=dx*dx+dy*dy;
  if(!len2)return false;
  let point=e;
  for(let i=0;i<(predict?3:1);i++) {
    const u=Math.max(0,Math.min(1,((point.x-s.sx)*dx+(point.y-s.sy)*dy)/len2));
    point=predict?g.predictEnemyPosition(e,Math.max(0,s.dur-s.t)*u):e;
  }
  const u=Math.max(0,Math.min(1,((point.x-s.sx)*dx+(point.y-s.sy)*dy)/len2));
  return Math.hypot(point.x-s.sx-u*dx,point.y-s.sy-u*dy)<=Collision.reach(e,s.hitR||45);
}
function attach(g) {
  const c=g.combat,basic=Basic.attach(g),meta=new WeakMap(),rows={},grounds=new WeakMap();
  let active=null,groundPhase=false,ground=null;
  const row=(key,wave)=>{
    const segment=wave<15?'W1-14':wave<20?'W15-19':'W20',id=key+'/'+segment;
    return rows[id]||(rows[id]={key,segment,launched:0,finished:0,hit:0,emptyRay:0,motionRisk:0,
      launchOpportunityLost:0,collisionNoDamage:0,focusGone:0,staticOpportunity:0,movingOpportunity:0,
      effectiveDamage:0,hitGrounds:0,endpointGrounds:0,hitGroundDamage:0,endpointGroundDamage:0,peakGrounds:0});
  };
  const attack=c.attackOnce.bind(c);
  c.attackOnce=key=>{
    const start=c.shots.length,result=attack(key);
    if(key!=='fire'&&key!=='ice')return result;
    for(const s of c.shots.slice(start).filter(s=>s.key===key&&s.scatter)) {
      const r=row(key,g.run.wave),alive=g.enemies.filter(e=>e.hp>0);
      const staticHit=alive.some(e=>rayOpportunity(g,s,e,false));
      const movingHit=alive.some(e=>rayOpportunity(g,s,e,true));
      r.launched++;r.staticOpportunity+=Number(staticHit);r.movingOpportunity+=Number(movingHit);
      meta.set(s,{r,focus:s.aimTarget||s.target,staticHit,movingHit,collision:false,hit:false,done:false});
    }
    return result;
  };
  const check=c.scatterCheck.bind(c);
  c.scatterCheck=s=>{const hit=check(s),m=meta.get(s);if(hit&&m)m.collision=true;return hit;};
  const damage=c.damage.bind(c);
  c.damage=(e,amount,key,kind,skill)=>{
    const before=Math.max(0,e.hp)+(e.shield||0),result=damage(e,amount,key,kind,skill);
    const effective=Math.max(0,before-Math.max(0,e.hp)-(e.shield||0));
    if(active&&active.shot.key===key&&effective>0){active.m.hit=true;active.m.r.effectiveDamage+=effective;}
    if(groundPhase&&key==='fire'&&skill==='多重火球'&&ground&&grounds.has(ground)) {
      const m=grounds.get(ground);m.r[m.endpoint?'endpointGroundDamage':'hitGroundDamage']+=effective;
    }
    return result;
  };
  // 数组访问仍原样返回；只在原地面循环读取索引时记录当前区域，归因实际的damage调用。
  const fields=c.groundDots;
  c.groundDots=new Proxy(fields,{get(array,key,receiver){
    const value=Reflect.get(array,key,receiver);
    if(groundPhase&&typeof key==='string'&&/^\d+$/.test(key))ground=value;
    return value;
  }});
  const update=c.updateGroundDots.bind(c);
  c.updateGroundDots=dt=>{
    groundPhase=true;ground=null;
    try{return update(dt);}finally{groundPhase=false;ground=null;}
  };
  const step=c.stepShot.bind(c);
  c.stepShot=(s,dt)=>{
    const m=meta.get(s),previous=active,start=c.groundDots.length;
    active=m?{shot:s,m}:null;
    try {
      const result=step(s,dt);
      if(m) {
        for(const gd of c.groundDots.slice(start))if(gd.key==='fire'&&gd.skill==='多重火球'){
          const endpoint=!m.collision;grounds.set(gd,{r:m.r,endpoint});m.r[endpoint?'endpointGrounds':'hitGrounds']++;
        }
        m.r.peakGrounds=Math.max(m.r.peakGrounds,c.groundDots.filter(gd=>gd.skill==='多重火球').length);
        if(!result&&!m.done) {
          m.done=true;const r=m.r;r.finished++;r.focusGone+=Number(!m.focus||m.focus.hp<=0||!g.enemies.includes(m.focus));
          if(m.hit)r.hit++;
          else if(m.collision)r.collisionNoDamage++;
          else if(!m.staticHit&&!m.movingHit)r.emptyRay++;
          else if(m.staticHit&&!m.movingHit)r.motionRisk++;
          else r.launchOpportunityLost++;
        }
      }
      return result;
    }finally{active=previous;}
  };
  return {finish(){return {basic:basic.finish(),detail:Object.values(rows).map(r=>({...r,pending:r.launched-r.finished}))};}};
}
module.exports={attach,rayOpportunity};
