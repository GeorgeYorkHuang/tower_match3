/** 发射前的直线拦截与实弹轨迹评分；不改变伤害、射程、碰撞半径，不在飞行中转向。 */
'use strict';
const CONFIG=require('../config.js');
const SKILLS=require('../config/tower-skills.js');
const Collision=require('./collision.js');

// 一次选敌只读取一遍移速/控制状态；后续候选不逐条射线重复查询圣物效果。
function prediction(combat,enemies) {
  const g=combat.game,ly=combat.ly(),states=new Map();
  for(const e of enemies) {
    const line=Math.min(ly.wallY-Math.max(10,(e.size||40)*.5),e.bossStandoffY==null?Infinity:e.bossStandoffY);
    const stopped=e.frozen>0||e._vineT>0||e._bossStun>0||e.y>=line;
    let speed=0;
    if(!stopped)speed=g.enemyMoveSpeed?g.enemyMoveSpeed(e):(e.speed||0)*(e.slow&&e.slow.ttl>0?e.slow.mult:1);
    states.set(e,{x:e.x,y:e.y,speed,line});
  }
  return (e,seconds)=>{
    const s=states.get(e);
    if(!s)return {x:e.x,y:e.y};
    return {x:s.x,y:s.speed?Math.min(s.line,s.y+s.speed*Math.max(0,seconds)):s.y};
  };
}

function intercept(combat,key,enemy,range,fullRange=true,predict,muzzle) {
  const mz=muzzle||combat.towerMuzzle(key),dur=CONFIG.TOWERS[key].shot.dur;
  predict=predict||prediction(combat,[enemy]);
  let point={x:enemy.x,y:enemy.y};
  for(let i=0;i<3;i++) {
    const time=fullRange?dur*Math.min(1,Math.hypot(point.x-mz.x,point.y-mz.y)/Math.max(1,range)):dur;
    point=predict(enemy,time);
  }
  return point;
}

function fanOffsets(count,step) {
  const half=(count-2)*step,result=[];
  for(let i=0;i<count-1;i++)result.push(count>2?-half+i*2*half/(count-2):0);
  result.push(0); // 与现有实弹一致，包括偶数弹数时的中心重合。
  return result;
}

function scorer(combat,key,enemies,range,muzzle) {
  const predict=prediction(combat,enemies),dur=CONFIG.TOWERS[key].shot.dur;
  const multi=key==='fire'?'多重火球':'多重冰锥',bal=SKILLS[key][multi];
  const swarm=key==='ice'&&combat.branchLv('ice',multi,'C')>0;
  const piercing=key==='ice'&&combat.lv('ice','冰穿刺')>0;
  const count=combat.lv(key,multi)>0&&!swarm?bal.count+combat.branchLv(key,multi,'A')+(key==='ice'?combat.relicVal('ice_blizzard'):0):1;
  const rays=fanOffsets(count,bal.fanStep).map(angle=>({cos:Math.cos(angle),sin:Math.sin(angle)}));
  const hitR=swarm?bal.swarmHitRadius:bal.hitRadius;
  const maxHits=piercing?1+SKILLS.ice['冰穿刺'].baseTargets+combat.branchLv('ice','冰穿刺','A')+combat.relicVal('ice_pierce'):1;
  return enemy=>{
    const aim=intercept(combat,key,enemy,range,true,predict,muzzle);
    const dx=aim.x-muzzle.x,dy=aim.y-muzzle.y,len=Math.hypot(dx,dy)||1;
    let hits=0;
    for(const ray of rays) {
      const ux=(dx*ray.cos-dy*ray.sin)/len,uy=(dx*ray.sin+dy*ray.cos)/len;
      let covered=0;
      for(const other of enemies) {
        let point={x:other.x,y:other.y};
        for(let i=0;i<2;i++) {
          const along=Math.max(0,Math.min(range,(point.x-muzzle.x)*ux+(point.y-muzzle.y)*uy));
          point=predict(other,dur*along/Math.max(1,range));
        }
        const along=Math.max(0,Math.min(range,(point.x-muzzle.x)*ux+(point.y-muzzle.y)*uy));
        const px=point.x-muzzle.x-along*ux,py=point.y-muzzle.y-along*uy;
        const reach=Collision.reach(other,hitR);
        if(px*px+py*py<=reach*reach && ++covered>=maxHits)break;
      }
      hits+=covered;
    }
    return key==='fire'?hits/Math.max(1,count):Math.min(1,hits/4);
  };
}
module.exports={prediction,intercept,fanOffsets,scorer};
