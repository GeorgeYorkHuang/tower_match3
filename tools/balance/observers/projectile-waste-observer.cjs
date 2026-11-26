/** 六塔真实普攻弹体审计：命中、原目标死亡落空、轨迹落空和在途；不改弹道/随机数。 */
'use strict';
function attach(g) {
  const c=g.combat, meta=new WeakMap(), all=[], rows={};
  let active=null;
  const row=(key,wave,kind)=>{
    const segment=wave<=14?'W1-14':wave<20?'W15-19':'W20';
    const id=key+'/'+segment+'/'+kind;
    return rows[id]||(rows[id]={key,segment,kind,launched:0,finished:0,hit:0,deadTargetMiss:0,trajectoryMiss:0,otherMiss:0,deadFocusFinished:0});
  };
  const attack=c.attackOnce.bind(c);
  c.attackOnce=key=>{
    const start=c.shots.length,result=attack(key);
    for(const s of c.shots.slice(start).filter(s=>s.key===key)) {
      const kind=s.scatter?'scatter':s.sweep?'sweep':s.chainFlight?'homing':'locked';
      const r=row(key,g.run.wave,kind),m={row:r,hit:false,finished:false};
      r.launched++;meta.set(s,m);all.push(m);
    }
    return result;
  };
  const damage=c.damage.bind(c);
  c.damage=(enemy,amount,key,kind,skill)=>{
    const before=(g.run.dmgStat[key]||{}).total||0;
    const result=damage(enemy,amount,key,kind,skill);
    const after=(g.run.dmgStat[key]||{}).total||0;
    if(active&&active.shot.key===key&&after>before)active.meta.hit=true;
    return result;
  };
  const step=c.stepShot.bind(c);
  c.stepShot=(s,dt)=>{
    const prev=active,m=meta.get(s);
    active=m?{shot:s,meta:m}:null;
    try {
      const result=step(s,dt);
      if(!result&&m&&!m.finished) {
        m.finished=true; const r=m.row;r.finished++;
        const dead=s.target&&(s.target.hp<=0||!g.enemies.includes(s.target));
        if(dead)r.deadFocusFinished++;
        if(m.hit)r.hit++;
        else if(r.kind==='locked'&&dead)r.deadTargetMiss++;
        else if(r.kind==='scatter'||r.kind==='sweep')r.trajectoryMiss++;
        else r.otherMiss++;
      }
      return result;
    } finally {active=prev;}
  };
  return { finish(){
    return {rows:Object.values(rows).map(r=>({...r,pending:r.launched-r.finished})),
      total:all.length,pending:all.filter(m=>!m.finished).length};
  } };
}
module.exports={attach};
