/** 六塔普攻空耗比较：原路线/强化路线，两种子；冻结本进程源码，只写docs。 */
'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert');
const {performance}=require('perf_hooks');
const snapshotRoot=path.resolve(__dirname,'..');
const frozen=require('./freeze-runtime.cjs').freeze(snapshotRoot);
const api=require('./moving-battle-fixture.cjs');
const {attach}=require('./projectile-waste-observer.cjs');
const root=path.resolve(__dirname,'..'),start=performance.now();
const tag=process.argv[2] || 'after-range';
if(!/^[a-z0-9-]+$/.test(tag))throw Error('Invalid collection tag');
const nativeRoutes={...api.routes};
const primaryRoutes={fire:[['多重火球','A'],['大火球','B'],['灼烧','C']],ice:[['多重冰锥','C'],['冰穿刺','A'],['碎冰','B']],
  poison:[['剧毒','A'],['瘟疫','A'],['毒爆','A']],electric:nativeRoutes.electric,boomerang:nativeRoutes.boomerang,
  cannon:[['重炮','B'],['双管齐射','A'],['碎裂弹','C']]};
const sourceHashes=frozen.sourceHashes,runs=[];
try {
  // 首组做完整被动对照，确保观察器没有改变原生战斗结果。
  const test={field:'ancient',profile:'elements',seed:41,cadence:2,maxWave:20,windowEnd:20,maxSeconds:2400,stopAtFirstBreach:true};
  const plain=api.collect(test),{observations,...measured}=api.collect({...test,configureGame:g=>attach(g)});
  assert.deepEqual(plain,measured,'Projectile audit altered replay');
  for(const route of ['native','primary']) {
    Object.assign(api.routes,route==='native'?nativeRoutes:primaryRoutes);
    for(const seed of [41,123])for(const profile of Object.keys(api.profiles)) {
      const result=api.collect({...test,seed,profile,configureGame:g=>attach(g)});
      for(const r of result.observations.rows) {
        assert.equal(r.launched,r.finished+r.pending);
        assert.equal(r.finished,r.hit+r.deadTargetMiss+r.trajectoryMiss+r.otherMiss);
      }
      const {moves,upgrades,...summary}=result;
      runs.push({route,...summary,moves:moves.length,upgrades:upgrades.length});
      console.log(JSON.stringify({runs:runs.length,route,profile,seed,wave:result.wave,terminal:result.terminal,elapsed:(performance.now()-start)/1000}));
    }
  }
  const liveChanges=frozen.liveChanges();
  fs.writeFileSync(root+'/docs/projectile-waste-'+tag+'.json',JSON.stringify({date:'2026-11-10',version:require('../js/config/version.js').version,
    sourceHashes,loadedSources:frozen.loaded(),frozenRuntime:true,liveChanges,routes:{native:nativeRoutes,primary:primaryRoutes},passiveReplayChecked:true,
    method:'24 native moving battles, no relic/shop/talents, ordinary triple every2s, seeds41/123, six4towerprofiles×two route sets. First breach or W20clear. Only projectiles emitted by actual attackOnce; excludes periodic/free on-hit children/match shots. Finished miss means no effective HP/shield damage, pending excluded from rate.',
    elapsedSeconds:(performance.now()-start)/1000,runs},null,2));
} finally {Object.assign(api.routes,nativeRoutes);api.restore();frozen.restore();}
