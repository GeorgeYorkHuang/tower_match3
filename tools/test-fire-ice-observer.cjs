/** 火/冰观察器回归：命中/终点地面分开归因，观察器不改变真实伤害和费用。 */
'use strict';
const assert=require('assert'),api=require('./tower-balance-fixture.cjs');
const {initEnemyState}=require('../js/combat.js'),{attach}=require('./fire-ice-observer.cjs');
const Aim=require('../js/combat/trajectory-aim.js');
const close=(a,b)=>assert(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function simulate(mode,observe) {
  const w=api.setup('fire',[['多重火球','C']],0,'dense',41,'finite');
  w.tower.pool.find(s=>s.name==='多重火球').branches.C=1;
  const m=w.combat.towerMuzzle('fire');
  const e=initEnemyState({id:1,x:m.x,y:m.y-350,hp:1e7,maxHp:1e7,speed:0,armor:0});
  w.game.enemies=[e];w.game.predictEnemyPosition=(enemy,t)=>Aim.prediction(w.combat,[enemy])(enemy,t);
  const observer=observe?attach(w.game):null;
  w.combat.attackOnce('fire');if(mode==='endpoint')e.hp=0;
  for(let f=0;f<90;f++)for(let j=w.combat.shots.length-1;j>=0;j--)if(!w.combat.stepShot(w.combat.shots[j],1/60))w.combat.shots.splice(j,1);
  const fields=w.combat.groundDots,first=fields[0];assert(first);
  const victim=initEnemyState({id:2,x:first.x,y:first.y,hp:1e7,maxHp:1e7,speed:0,armor:0});
  w.game.enemies=[victim];
  const expected=fields.reduce((sum,d)=>sum+(Math.hypot(d.x-victim.x,d.y-victim.y)<=d.r?d.dps*.25:0),0);
  w.combat.updateGroundDots(.25);const actual=1e7-victim.hp;close(actual,expected);
  const data=observer?observer.finish():null;
  if(data){const row=data.detail[0];close(row[mode==='endpoint'?'endpointGroundDamage':'hitGroundDamage'],expected);close(row[mode==='endpoint'?'hitGroundDamage':'endpointGroundDamage'],0);assert.equal(row.hitGrounds+row.endpointGrounds,fields.length);}
  return {actual,energy:w.tower.energy,fields:fields.map(d=>({x:d.x,y:d.y,dps:d.dps,ttl:d.ttl})),stat:w.run.dmgStat};
}
try {
  for(const mode of ['hit','endpoint'])assert.deepStrictEqual(simulate(mode,false),simulate(mode,true));
  console.log('PASS passive hit/endpoint damage, exact ground attribution, same energy/stats/field lifetime.');
}finally{api.restore();}
