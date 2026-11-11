/** 选敌开销参考：桌面Node计时，不能换算为真机帧率或温度；不设置性能通过阈值。 */
'use strict';
const {performance}=require('perf_hooks'),api=require('./tower-balance-fixture.cjs');
const {initEnemyState}=require('../js/combat.js'),policy=require('../js/config/targeting.js');
const original={fire:{...policy.fire},ice:{...policy.ice}};
try {
  const results=[];
  for(const key of ['fire','ice'])for(const enemies of [40,120]) {
    const w=api.setup(key,key==='fire'?[['多重火球','A']]:[['多重冰锥','C'],['冰穿刺','A']],1,'dense',41,'finite');
    w.game.enemies=Array.from({length:enemies},(_,i)=>initEnemyState({id:i,x:60+(i%12)*55,y:380+Math.floor(i/12)*35,hp:1000,maxHp:1000,speed:20,armor:0}));
    for(const enabled of [false,true]) {
      policy[key].trajectoryAim=enabled;policy[key].geometryScore=enabled;
      for(let i=0;i<30;i++)w.combat.pickTarget(key);
      const start=performance.now();for(let i=0;i<200;i++)w.combat.pickTarget(key);
      results.push({key,enemies,enabled,millisecondsPerSelection:(performance.now()-start)/200});
    }
  }
  console.log(JSON.stringify({environment:process.version,results},null,2));
}finally{Object.assign(policy.fire,original.fire);Object.assign(policy.ice,original.ice);api.restore();}
