'use strict';
const assert=require('assert'),vm=require('vm'),path=require('path');
const {execFileSync}=require('child_process');
const CONFIG=require('../js/config.js'),SKILL_NUM=require('../js/config/tower-skills.js'),GS_BALANCE=require('../js/config/global-balance.js');
const Combat=require('../js/combat.js').CombatSystem,Kill=require('../js/relics/kill-hooks.js');
const root=path.resolve(__dirname,'..');
function oldMethod(file,name){
 const s=execFileSync('git',['show','cddaffc:'+file],{cwd:root,encoding:'utf8',maxBuffer:4e6});
 const start=s.indexOf('  '+name+'(e) {'),end=s.indexOf('\n  }',start)+4;
 return vm.runInNewContext('({'+s.slice(start,end)+'}).'+name,{CONFIG,SKILL_NUM,GS_BALANCE,Math,RelicKill:Kill});
}
const oldKill=oldMethod('js/combat.js','onKill');
const keys=['fire','poison','ice','electric','boomerang','cannon'];
const ids=['fire_seed','fire_ember','fire_chain','poison_source','poison_essence','poison_spread','ice_frostburst','ice_spike','elec_static','boo_hunt','boo_blood','boo_mark','can_incend'];
function fixture(stars,skills,status,order,recursive){
 const c=Object.create(Combat.prototype),log=[],tower={energy:49};
 const e={id:0,x:0,y:0,hp:0,lastDmgKey:'fire',dots:status?[{type:'burn'},{type:'poison',stack:10,maxStack:10},{type:'bleed'}]:[],frozen:status?1:0,slow:status?{ttl:1}:null,paralyzed:status?1:0,_mark:status?100:0,_vineT:status?1:0};
 const enemies=[e,...[20,80,90,100,120,500].map((x,i)=>({id:i+1,x,y:0,hp:100,dots:[],_mark:0})),{id:99,x:1,y:1,hp:0}];
 const run={slotOrder:order.slice(),relic3:id=>(stars[id]||0)===3,relicNum:id=>stars[id]?stars[id]===3?40:25:0,armoryEnergyMax:()=>50};
 c.game={run,fx:[],playSfx:(...a)=>log.push(['sfx',...a]),onKillReward:e=>log.push(['reward',e.id])};
 c.enemies=()=>enemies;c.hasDot=(o,t)=>o.dots.some(d=>d.type===t);c.has=()=>skills>0;c.lv=()=>skills;c.branchLv=()=>skills;c.poisonStack=()=>10;c.tower=()=>tower;
 c.shotDmg=(...a)=>{log.push(['shotDmg',...a]);return 100;};
 for(const name of ['fxRing','fxBeam','fxFlash','fxParticle'])c[name]=(...a)=>log.push([name,...a]);
 c.applyBurn=(o,...a)=>{log.push(['burn',o.id,...a]);o.dots.push({type:'burn'});};
 c.applyPoison=(o,...a)=>{log.push(['poison',o.id,...a]);o.dots.push({type:'poison',stack:a[2]});};
 c.applyBleed=(o,...a)=>{log.push(['bleed',o.id,...a]);o.dots.push({type:'bleed'});};
 c.applySlow=(o,p,ttl)=>{log.push(['slow',o.id,p,ttl]);o.slow={p,ttl};};c.freezeE=(o,t)=>{log.push(['freeze',o.id,t]);o.frozen=t;};
 c.explode=(...a)=>{log.push(['explode',...a]);if(recursive&&!c.nested){c.nested=true;const next=enemies[1];next.hp=0;c.onKill(next);}};
 return {c,e,snapshot:()=>({log,run,enemies,tower,dots:c.groundDots,fx:c.game.fx})};
}
const orig=Math.random;
let initialSeed=12345;
function execute(fn){let seed=initialSeed,n=0;Math.random=()=>{n++;seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};try{return {value:fn(),randomCalls:n};}finally{Math.random=orig;}}
let cases=0;
const starSets=[{},Object.fromEntries(ids.map(id=>[id,3])),...ids.flatMap(id=>[1,2,3].map(star=>({[id]:star})))];
for(initialSeed of [12345,555,999])for(const stars of starSets)for(const skills of [0,1,2,3])for(const status of [false,true])for(const order of [keys,keys.slice().reverse(),[],['fire','poison','fire']]) {
 const a=fixture(stars,skills,status,order,false),b=fixture(stars,skills,status,order,false);
 a.c.onKill=oldKill;
 const av=execute(()=>{a.c.onKill(a.e);return a.snapshot();}),bv=execute(()=>{b.c.onKill(b.e);return b.snapshot();});
 assert.equal(JSON.stringify(bv),JSON.stringify(av),'kill '+JSON.stringify({stars,skills,status,order}));cases++;
}
// Reentrant explosion: nested enemy death and reward must remain in exactly the same order.
for(const order of [keys,keys.slice().reverse()]){
 const stars=Object.fromEntries(ids.map(id=>[id,3]));
 const a=fixture(stars,3,true,order,true),b=fixture(stars,3,true,order,true);a.c.onKill=oldKill;
 const av=execute(()=>{a.c.onKill(a.e);return a.snapshot();}),bv=execute(()=>{b.c.onKill(b.e);return b.snapshot();});assert.equal(JSON.stringify(bv),JSON.stringify(av));cases++;
}
// Empty active-tower snapshots still emit one death presentation and reward.
const empty=fixture({},0,false,[],false);empty.c.onKill(empty.e);assert.equal(empty.snapshot().log.filter(e=>e[0]==='reward').length,1);
// Runtime state remains isolated between separate Combat instances.
const isolatedA=fixture({fire_seed:3},0,true,['fire'],false),isolatedB=fixture({fire_seed:3},0,true,['fire'],false),snapshot=JSON.stringify(isolatedB.snapshot());isolatedA.c.onKill(isolatedA.e);assert.equal(JSON.stringify(isolatedB.snapshot()),snapshot);
// Mutating the live active-tower list during an explosion does not truncate its captured traversal.
function mutated(old){const f=fixture(Object.fromEntries(ids.map(id=>[id,3])),3,true,keys,false);if(old)f.c.onKill=oldKill;const explode=f.c.explode;f.c.explode=(...args)=>{f.c.game.run.slotOrder.length=0;explode(...args);};return execute(()=>{f.c.onKill(f.e);return f.snapshot();});}
assert.equal(JSON.stringify(mutated(false)),JSON.stringify(mutated(true)));
// Real damage -> explode -> nested death: each victim is rewarded once, with numbers before rewards.
function cascade(old){const f=fixture({fire_ember:3},0,false,['fire'],false),c=f.c,numbers=[],order=[];if(old)c.onKill=oldKill;c.kills={};c.game.run.effects={synergyDone:[]};c.ly=()=>({areaY:-100,entryH:0});c.explode=Combat.prototype.explode;c.game.dmgNumbers={push:n=>{numbers.push(n);order.push(['number',n.enemyId]);}};const reward=c.game.onKillReward;c.game.onKillReward=e=>{order.push(['reward',e.id]);reward(e);};
 const enemies=c.enemies();enemies.slice(1,7).forEach((e,i)=>{e.x=i*10;e.hp=20;e.dots=[{type:'burn',stack:1}];});
 const previous=Math.random;Math.random=()=>0;try{c.damage(enemies[1],100,'fire');c.damage(enemies[1],100,'fire');}finally{Math.random=previous;}
 const rewards=f.snapshot().log.filter(e=>e[0]==='reward');assert.equal(rewards.length,6);assert.equal(new Set(rewards.map(e=>e[1])).size,6);assert.equal(c.kills.fire,6);assert.equal(numbers.length,6);for(const n of numbers)assert(order.findIndex(e=>e[0]==='number'&&e[1]===n.enemyId)<order.findIndex(e=>e[0]==='reward'&&e[1]===n.enemyId));return {state:f.snapshot(),numbers,kills:c.kills};}
assert.equal(JSON.stringify(cascade(false)),JSON.stringify(cascade(true)));
console.log('PASS '+cases+' death coordination cases vs fixed cddaffc: active-order snapshots, skill levels, status propagation, nested death/reward order, RNG, energy and context isolation');
