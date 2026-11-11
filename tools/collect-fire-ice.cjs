/** 固定源码的火/冰弹道专项；六种子、六阵容，可对照就近选敌/当前方案/候选方案，仅写离线报告。 */
'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert');
const {gzipSync}=require('zlib');
const root=path.resolve(__dirname,'..'),frozen=require('./freeze-runtime.cjs').freeze(root);
const api=require('./moving-battle-fixture.cjs'),{attach}=require('./fire-ice-observer.cjs');
const Targeting=require('../js/combat/targeting.js'),policy=require('../js/config/targeting.js');
const mode=process.argv[2]||'current',route=process.argv[3]||'primary';
assert(['nearest','current','candidate','fire','ice-aim'].includes(mode));assert(['primary','ground'].includes(route));
// current关闭本轮新增的预测/几何评分；不会修改配置文件或实际运行中的游戏。
for(const key of ['fire','ice']){
  policy[key].trajectoryAim=mode==='candidate'||mode===key||(mode==='ice-aim'&&key==='ice');
  policy[key].geometryScore=mode==='candidate'||mode===key;
}
const primary={fire:[['多重火球',route==='ground'?'C':'A'],['大火球','B'],['灼烧','C']],
  ice:[['多重冰锥','C'],['冰穿刺','A'],['碎冰','B']],poison:[['剧毒','A'],['瘟疫','A'],['毒爆','A']],
  cannon:[['重炮','B'],['双管齐射','A'],['碎裂弹','C']]};
Object.assign(api.routes,primary);
const oldRank=Targeting.rankTargets;
if(mode==='nearest')Targeting.rankTargets=(c,key,options={})=>{
  if(key!=='fire'&&key!=='ice')return oldRank(c,key,options);
  const mz=c.towerMuzzle(key),r=options.range==null?c.range(key):options.range;
  return c.enemies().filter(e=>e.hp>0&&Math.hypot(e.x-mz.x,e.y-mz.y)<=r)
    .sort((a,b)=>Math.hypot(a.x-mz.x,a.y-mz.y)-Math.hypot(b.x-mz.x,b.y-mz.y));
};
function configure(g,observe=true){
  if(mode==='nearest'){
    const original=g.combat.pickTarget.bind(g.combat);
    g.combat.pickTarget=key=>(key==='fire'||key==='ice')?Targeting.rankTargets(g.combat,key)[0]||null:original(key);
  }
  return observe?attach(g):null;
}
try {
  const test={field:'ancient',profile:'elements',seed:41,cadence:2,maxWave:20,windowEnd:20,maxSeconds:2400,stopAtFirstBreach:true};
  const plain=api.collect({...test,configureGame:g=>configure(g,false)});
  const {observations,...measured}=api.collect({...test,configureGame:configure});
  assert.deepStrictEqual(plain,measured,'Detailed observer changed combat');
  const runs=[];
  const seeds=process.argv[4]?process.argv[4].split(',').map(Number):route==='ground'?[41,123,307]:[41,123,307,911,2027,4093];
  assert(seeds.length>0&&seeds.every(Number.isSafeInteger));
  const profiles=route==='ground'?['elements','summon_control']:Object.keys(api.profiles);
  for(const seed of seeds)for(const profile of profiles){
    const result=api.collect({...test,profile,seed,configureGame:configure});
    for(const r of result.observations.detail){
      assert.equal(r.finished,r.hit+r.emptyRay+r.motionRisk+r.launchOpportunityLost+r.collisionNoDamage);
      assert.equal(r.launched,r.finished+r.pending);
    }
    const {moves,upgrades,...rest}=result;runs.push({...rest,moves:moves.length,upgrades:upgrades.length});
    console.log(JSON.stringify({mode,route,runs:runs.length,seed,profile,wave:result.wave,terminal:result.terminal}));
  }
  fs.writeFileSync(path.join(root,'docs',`fire-ice-${mode}-${route}.json.gz`),gzipSync(JSON.stringify({date:'2026-11-10',mode,route,
    method:'Same native replay, seeds and routes; only fire/ice selection differs. Detailed diagnostics are passive; geometric opportunities assume launch-time statuses and do not prove causation.',
    sourceHashes:frozen.sourceHashes,loadedSources:frozen.loaded(),liveChanges:frozen.liveChanges(),frozenRuntime:true,
    passiveReplayChecked:true,policy,routes:api.routes,seeds,runs},null,2)));
}finally{Targeting.rankTargets=oldRank;api.restore();frozen.restore();}
