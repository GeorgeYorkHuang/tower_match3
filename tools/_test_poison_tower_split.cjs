'use strict';
const assert=require('assert'),vm=require('vm'),path=require('path');
const {execFileSync}=require('child_process'),{createRequire}=require('module');
const {CombatSystem:After}=require('../js/combat.js'),CONFIG=require('../js/config.js'),B=require('../js/config/tower-skills.js').poison;
const root=path.resolve(__dirname,'..'),box={module:{exports:{}},require:createRequire(path.join(root,'js/combat.js')),console,Math,Date};
vm.runInNewContext(execFileSync('git',['show','e4b64c0:js/combat.js'],{cwd:root,encoding:'utf8',maxBuffer:4e6}),box);
const Before=box.module.exports.CombatSystem,originalRandom=Math.random;
const skillNames=['剧毒','毒性强化','毒池','毒棒','毒藤','瘟疫','瘴气'];
function fixture(C,mask,branch,relic,weak,mode,ready=true){
 const c=Object.create(C.prototype),events=[],tower={energy:weak?0:50};
 const enemies=mode==='empty'?[]:[{id:1,hp:100000,maxHp:100000,x:0,y:200,dots:[],speed:20,energy:10,frozen:0,_vineT:1,_vineAcc:0.9,_miaT:1.9,_miaLayers:3,_plagueT:2,hitCount:0},{id:2,hp:100000,maxHp:100000,x:30,y:210,dots:[],speed:20,energy:10,frozen:0,hitCount:0},{id:3,hp:100000,maxHp:100000,x:1000,y:300,dots:[],speed:20,energy:10,frozen:0,hitCount:0},{id:99,hp:0,x:1,y:200,dots:[],speed:0}];
 if(mode==='out')enemies.forEach(e=>e.y+=2000);
 c.game={run:{relic3:id=>relic&&id.startsWith('poison_'),lineHp:800,lineMaxHp:1000,gsState:{},armoryEnergyMax:()=>50},enemies,fx:[],ly:{wallY:250,areaY:0,entryH:20}};c.shots=[];c.kills={};
 const factor=weak?1.5:1;
 c.timers={pool:ready?B['毒池'].period*factor-0.01:0,stick:ready?Math.max(B['毒棒'].minPeriod,B['毒棒'].period-B['毒棒'].periodReduction*branch)*factor-0.01:0,vine:ready?B['毒藤'].period*factor-0.01:0};
 c.lv=(key,name)=>key==='poison'&&skillNames.some((n,i)=>name===n&&(mask&(1<<i)))?branch+1:0;c.branchLv=(key,name)=>c.lv(key,name)>0?branch:0;
 c.relicVal=id=>relic&&id==='poison_fang'?30:0;c.tower=()=>tower;c._weakPeriod=()=>tower.energy<=0?1.5:1;c.ly=()=>c.game.ly;c.towerMuzzle=()=>({x:0,y:500});c.inTowerRange=(key,x,y)=>Math.abs(500-y)<=300;
 c.power=100;c.shotDmg=(...a)=>{events.push(['shotDmg',...a,c.power]);return c.power;};c.castEnergy=(...a)=>{events.push(['cast',...a]);tower.energy=Math.max(0,tower.energy-1);};
 c.damage=(e,dmg,key)=>{events.push(['damage',e.id,dmg,key]);if(e.hp<=0)return;e.hp-=dmg;if(e.hp<=0&&!e._dying){e._dying=true;c.kills[key]=(c.kills[key]||0)+1;events.push(['death',e.id]);}};
 c.onKill=e=>events.push(['onKill',e.id]);c.explode=(...a)=>events.push(['explode',...a]);
 for(const name of ['fxFlash','fxParticle','fxRing','fxBeam'])c[name]=(...a)=>events.push([name,...a]);
 return {c,events,tower,snapshot:()=>({timers:c.timers,run:c.game.run,enemies:c.game.enemies,sticks:c.poisonSticks,ground:c.groundDots,fx:c.game.fx,events,kills:c.kills,tower})};
}
function seeded(seed,fn){let n=0;Math.random=()=>{n++;seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};try{return {out:fn(),n};}finally{Math.random=originalRandom;}}
let cases=0;
for(const mask of [0,1,3,4,8,16,32,64,127])for(const branch of [0,1,2,3])for(const relic of [false,true])for(const weak of [false,true])for(const mode of ['alive','empty','out'])for(const seed of [12345,999]){
 function go(C){const f=fixture(C,mask,branch,relic,weak,mode),{c}=f;
  if(c.game.enemies[0])c.hitPoison(c.game.enemies[0],100);
  for(const [i,dt] of [0.005,0.01,0.3,0.8,1,2,4].entries()){
   c.game.enemies.forEach(e=>c.tickStatus(e,dt));c.updateGroundDots(dt);c.updatePoisonSticks(dt);c.tickPoison(dt);
   if(i===1)c.power=500;
  }return f.snapshot();}
 assert.equal(JSON.stringify(seeded(seed,()=>go(After))),JSON.stringify(seeded(seed,()=>go(Before))),JSON.stringify({mask,branch,relic,weak,mode,seed}));cases++;
}
let queues=0;
for(const relic of [false,true])for(const dt of [0.001,0.5,1.1,5])for(const active of [0,127]){
 function go(C){const f=fixture(C,active,3,relic,false,'alive',false);f.c.poisonSticks=[{x:0,y:200,ttl:0.1,atkT:0,atkI:1,r:200,dmg:77,targets:2},{x:0,y:200,ttl:3,atkT:0.9,atkI:1,r:200,dmg:88,targets:2}];f.c.updatePoisonSticks(dt);return f.snapshot();}
 assert.equal(JSON.stringify(go(After)),JSON.stringify(go(Before)));queues++;
}
// Hit order remains poison application before direct damage, not after.
const hit=fixture(After,1,3,true,false,'alive');const e=hit.c.game.enemies[0];let hadPoison=false;hit.c.damage=enemy=>{hadPoison=hit.c.hasDot(enemy,'poison');};hit.c.hitPoison(e,100);assert(hadPoison);
// An empty pool cast still returns from the whole poison periodic function, skipping later skills this frame.
const empty=fixture(After,127,3,false,false,'empty');empty.c.tickPoison(0.02);assert.deepEqual(empty.events.filter(e=>e[0]==='cast').map(e=>e[2]),['毒池']);
// Summoned stick direct damage uses its stored snapshot while added poison reads current damage.
const stick=fixture(After,0,0,false,false,'alive',false);stick.c.poisonSticks=[{x:0,y:200,ttl:3,atkT:0.9,atkI:1,r:200,dmg:77,targets:1}];stick.c.power=1000;stick.c.updatePoisonSticks(0.2);assert(stick.events.some(e=>e[0]==='damage'&&e[2]===77));assert(stick.events.some(e=>e[0]==='shotDmg'&&e[3]===1000));
const expired=fixture(After,0,0,true,false,'alive',false);expired.c.poisonSticks=[{x:0,y:200,ttl:0.1,atkT:0,atkI:1,r:200,dmg:77,targets:1}];expired.c.updatePoisonSticks(0.2);assert.equal(expired.c.poisonSticks.length,0);assert.equal(expired.c.groundDots[0].ttl,2);
const a=fixture(After,127,3,true,false,'alive'),b=fixture(After,127,3,true,false,'alive'),before=JSON.stringify(b.snapshot());a.c.hitPoison(a.c.game.enemies[0],100);a.c.tickPoison(0.02);assert.equal(JSON.stringify(b.snapshot()),before);
console.log('PASS '+cases+' poison multi-frame scenarios + '+queues+' stick lifecycle cases vs fixed e4b64c0: hit/debuff, plague/vine/miasma, pool/stick timers, snapshots, RNG/effects and isolated contexts');
