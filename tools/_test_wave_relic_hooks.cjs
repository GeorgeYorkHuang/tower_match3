'use strict';
const assert=require('assert'),vm=require('vm'),path=require('path');
const {execFileSync}=require('child_process'),{createRequire}=require('module');
const CONFIG=require('../js/config.js'),{Run}=require('../js/run.js');
const root=path.resolve(__dirname,'..');
const box={module:{exports:{}},require:createRequire(path.join(root,'js/run.js')),console,Math,Date};
vm.runInNewContext(execFileSync('git',['show','070ab53:js/run.js'],{cwd:root,encoding:'utf8'}),box);
const Before=box.module.exports.Run;
const ids=['cm_shuffle','cm_bounty','cm_vault','cm_regen'];
function prepare(Ctor,stars,maxHp,shield,drop,dps,field,wave){
 const r=Object.create(Ctor.prototype),events=[];
 Object.assign(r,{wave,lineHp:maxHp||CONFIG.LINE.hp,lineMaxHp:maxHp,freeShuffle:2,gold:7,gsState:{shield:50,shieldWave:wave},fieldCfg:field,windStacks:0,curseStacks:0,_waveStartHp:0,_waveGold:0,_waveChestDropped:drop,_bountyStreak:2,wallShield:shield,firstSynergyWave:null,broken:false,_wallDmgAcc:0,runRelic:Object.fromEntries(Object.keys(stars).map(id=>[id,1])),metaRef:{starOf:id=>stars[id]||0}});
 r.relicFx=(...a)=>events.push(['relicFx',...a]);r.rng=()=>{throw Error('wave relic hooks must not add RNG');};
 r.effects={synergyDone:[false],totalDps:()=>{events.push(['dps',r.gold,r.lineHp,r.wallShield]);return dps;},updateSynergies:()=>{events.push(['synergy',r.lineHp]);r.effects.synergyDone[0]=true;}};
 return {r,events,snapshot:()=>({r,events})};
}
let cases=0;
const starSets=[{},...ids.flatMap(id=>[1,2,3].map(star=>({[id]:star}))),Object.fromEntries(ids.map(id=>[id,3]))];
for(const stars of starSets)for(const damage of [0,0.0005,0.002,100])for(const skipLeak of [false,true])for(const drop of [false,true])for(const dps of [0,1e9]){
 const a=prepare(Before,stars,1000,95,drop,dps,CONFIG.FIELDS.frost,14),b=prepare(Run,stars,1000,95,drop,dps,CONFIG.FIELDS.frost,14);
 const ar=[],br=[];
 for(let step=0;step<3;step++){
  ar.push(a.r.startWave());br.push(b.r.startWave());
  a.r.lineHp-=damage;b.r.lineHp-=damage;
  ar.push(a.r.endWave(skipLeak));br.push(b.r.endWave(skipLeak));
  ar.push(a.r.bountyGuarantee());br.push(b.r.bountyGuarantee());
  a.r._waveChestDropped=step===1;b.r._waveChestDropped=step===1;
 }
 assert.equal(JSON.stringify({s:b.snapshot(),result:br}),JSON.stringify({s:a.snapshot(),result:ar}),'sequence '+JSON.stringify({stars,damage,skipLeak,drop,dps}));cases++;
}
let boundaries=0;
for(const maxHp of [undefined,0,1000])for(const hp of [0,900,990,1000,1001])for(const shield of [0,95,100])for(const wave of [0,29]){
 const stars=Object.fromEntries(ids.map(id=>[id,3]));
 const a=prepare(Before,stars,maxHp,shield,false,1e9,CONFIG.FIELDS.abyss,wave),b=prepare(Run,stars,maxHp,shield,false,1e9,CONFIG.FIELDS.abyss,wave);
 a.r.lineHp=hp;b.r.lineHp=hp;a.r.startWave();b.r.startWave();
 assert.equal(JSON.stringify(b.r.endWave(true)),JSON.stringify(a.r.endWave(true)));
 assert.equal(JSON.stringify(b.snapshot()),JSON.stringify(a.snapshot()));boundaries++;
}
for(const star of [0,1,2,3])for(const streak of [0,2,3,4]){
 const make=C=>{const v=prepare(C,{cm_bounty:star},1000,0,false,0,null,0);v.r._bountyStreak=streak;return v;};
 const a=make(Before),b=make(Run);
 for(let i=0;i<2;i++)assert.equal(b.r.bountyGuarantee(),a.r.bountyGuarantee());
 assert.equal(b.r._bountyStreak,a.r._bountyStreak);boundaries++;
}
// Explicit order: no-damage bonus is tested before regen and simulated leak; regen shield caps at 10%.
const originalMaxWave=CONFIG.WAVE.maxWave;
try {
 CONFIG.WAVE.maxWave=30;
 const stop=prepare(Run,{},1000,0,false,1e9,null,29);stop.r.startWave();assert.equal(stop.r.endWave(true).broken,true);
} finally {CONFIG.WAVE.maxWave=originalMaxWave;}
const stars=Object.fromEntries(ids.map(id=>[id,3]));
const a=prepare(Run,stars,1000,99,false,1e9,null,0),b=prepare(Run,stars,1000,99,false,1e9,null,0);
const untouched=JSON.stringify(b.snapshot());a.r.startWave();a.r.endWave(true);
assert(a.events.find(e=>e[0]==='relicFx'&&e[1]==='cm_vault'));
assert.equal(a.r.wallShield,100);assert.equal(JSON.stringify(b.snapshot()),untouched);
const hurt=prepare(Run,stars,1000,0,false,1e9,null,0);hurt.r.startWave();hurt.r.lineHp-=1;hurt.r.endWave(true);
assert(!hurt.events.some(e=>e[0]==='relicFx'&&e[1]==='cm_vault'));assert.equal(hurt.r.lineHp,1000);
console.log('PASS '+cases+' multi-wave sequences + '+boundaries+' boundary cases vs fixed 070ab53: shuffle, chest streak/consumption, vault rounding, regen/shield, leak ordering, field stacks, max-wave and Run isolation');
