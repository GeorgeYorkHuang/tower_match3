'use strict';
const assert=require('assert'),vm=require('vm'),path=require('path');
const {execFileSync}=require('child_process'),{createRequire}=require('module');
const {CombatSystem:After}=require('../js/combat.js'),CONFIG=require('../js/config.js');
const root=path.resolve(__dirname,'..'),box={module:{exports:{}},require:createRequire(path.join(root,'js/combat.js')),console,Math,Date};
vm.runInNewContext(execFileSync('git',['show','3b7e09b:js/combat.js'],{cwd:root,encoding:'utf8',maxBuffer:4e6}),box);
const Before=box.module.exports.CombatSystem,keys=Object.keys(CONFIG.TOWERS),originalRandom=Math.random;
function fixture(C,mode){
 const c=Object.create(C.prototype),events=[],energy={energy:mode?0:10};
 c.game={enemies:[],fx:[],ly:{areaY:0,entryH:10},meta:{relicBonus:()=>({dmg:mode?2:0})},run:{effects:{towerDps:()=>100,synergyDone:[false,mode>0]},gsState:mode?{forge:1}:{},storeBuff:()=>({atk:mode?2:0}),cmPower3:mode?15:0,wallAtkBonus:()=>mode?10:0,chargeSkillBoost:mode?50:0,_shuffleBuffTtl:mode?1:0,_warAtk:mode?30:0,relic3:()=>mode>0}};
 c.kills={};c.tower=()=>energy;c.branchLv=()=>mode?3:0;c.relicVal=()=>mode?15:0;c.relicTowerDmg=()=>mode?25:0;
 c.onKill=e=>events.push(['kill',e.id,e.hp,e._dying,{...c.kills}]);
 c.applySlow=(e,...args)=>{events.push(['slow',e.id,...args]);e.slow={mult:1-args[0],ttl:args[1]};};
 c.applyBurn=(e,...args)=>{events.push(['burn',e.id,...args]);e.dots.push({type:'burn',stack:1});};
 c.fxRing=(...a)=>events.push(['ring',...a]);c.fxParticle=(...a)=>events.push(['particle',...a]);
 return {c,events,energy,snapshot:()=>({enemies:c.game.enemies,events,kills:c.kills,fx:c.game.fx,war:c.game.run._warAtk})};
}
function enemy(mode,hp=10000){return {id:1,hp,x:0,y:30,armor:mode?0.4:0,dots:mode?[{type:'burn',stack:2},{type:'poison',stack:3}]:[],corrode:mode?{mult:1.2}:null,_mark:mode?2:0,overload:mode?{n:3}:null,_core:mode?{ttl:1,n:2}:null,_wallStay:mode?8:0,slow:mode?{ttl:1}:null,_fragile:!!mode,_elecBoost:mode?{ttl:1,n:3}:null};}
let shotCases=0;
for(const key of keys)for(const isSkill of [undefined,false,true])for(const mode of [0,1])for(const energy of [undefined,0,10]){
 const a=fixture(Before,mode),b=fixture(After,mode);a.energy.energy=energy;b.energy.energy=energy;
 assert.equal(b.c.shotDmg(key,isSkill),a.c.shotDmg(key,isSkill));shotCases++;
}
let damageCases=0;
for(const key of [...keys,undefined])for(const mode of [0,1])for(const armor of [0,0.5,0.85,1])for(const hp of [0,1,10000])for(const dmg of [0,12.345,100000]){
 const a=fixture(Before,mode),b=fixture(After,mode),e=enemy(mode,hp),f=enemy(mode,hp);e.armor=armor;f.armor=armor;
 a.c.game.enemies=[e];b.c.game.enemies=[f];
 a.c.damage(e,dmg,key);b.c.damage(f,dmg,key);
 a.c.damage(e,dmg,key);b.c.damage(f,dmg,key);
 assert.equal(JSON.stringify(b.snapshot()),JSON.stringify(a.snapshot()),'damage '+JSON.stringify({key,mode,armor,hp,dmg}));damageCases++;
}
// Each modifier alone, to avoid a combined multiplier hiding a missing factor.
const modifierCases=[
 c=>{c.branchLv=(k,n)=>n==='灼烧'?3:0;},
 c=>{c.branchLv=(k,n)=>n==='猎手标记'?3:0;},
 c=>{c.relicVal=id=>id==='boo_hunt'?15:0;},
 c=>{c.branchLv=(k,n)=>n==='过载'?3:0;},
 ...['fire_inferno','fire_wall','ice_condense','ice_forever','elec_boost','boo_tip','poison_all'].map(id=>c=>{c.game.run.relic3=k=>k===id;}),
 c=>{c.game.run._warAtk=30;},c=>{c.game.meta.relicBonus=()=>({dmg:3});}
];
let isolated=0;
for(const change of modifierCases)for(const key of keys){
 const a=fixture(Before,0),b=fixture(After,0),e=enemy(1),f=enemy(1);change(a.c);change(b.c);a.c.game.enemies=[e];b.c.game.enemies=[f];
 a.c.damage(e,10,key);b.c.damage(f,10,key);assert.equal(JSON.stringify(b.snapshot()),JSON.stringify(a.snapshot()));isolated++;
}
let explosions=0;
function randomRun(fn,seed){let n=0;Math.random=()=>{n++;seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};try{return {value:fn(),n};}finally{Math.random=originalRandom;}}
for(const key of keys)for(const mode of [0,1])for(const knock of [0,50])for(const slow of [0,1])for(const exclude of [false,true])for(const seed of [12345,999]){
 function go(C){const {c,events,snapshot}=fixture(C,mode);const list=[enemy(mode,50),{...enemy(mode,50),id:2,x:100,y:30},{...enemy(mode,50),id:3,x:101,y:30},{...enemy(mode,0),id:4}];c.game.enemies=list;c.explode(0,30,100,20,key,knock,slow,exclude?list[0]:undefined);return snapshot();}
 const a=randomRun(()=>go(Before),seed),b=randomRun(()=>go(After),seed);assert.equal(JSON.stringify(b),JSON.stringify(a),'explosion '+JSON.stringify({key,mode,knock,slow,exclude,seed}));explosions++;
}
// Reentrant death: mark dying/count kill before callback; nested explosion cannot reward the same corpse twice.
function recursive(C){
 const {c,snapshot,events}=fixture(C,0),a=enemy(0,5),b={...enemy(0,5),id:2,x:10};c.game.enemies=[a,b];
 c.onKill=e=>{events.push(['death',e.id,e._dying,{...c.kills}]);if(e.id===1)c.explode(0,30,100,10,'ice');};
 c.damage(a,10,'fire');c.damage(a,10,'fire');return snapshot();
}
assert.equal(JSON.stringify(recursive(After)),JSON.stringify(recursive(Before)));
const rec=recursive(After);assert.deepEqual(rec.kills,{fire:1,ice:1});assert.equal(rec.events.filter(x=>x[0]==='death').length,2);
// Explicit skill-only charge bonus and armor cap remain unchanged.
const skill=fixture(After,0);skill.c.game.run.chargeSkillBoost=50;assert.equal(skill.c.shotDmg('fire',true),skill.c.shotDmg('fire',false)*1.5);
const cap=fixture(After,0),victim=enemy(0);victim.armor=1;cap.c.damage(victim,100,'ice');assert.equal(victim.hp,9985);
const untouched=fixture(After,0),before=JSON.stringify(untouched.snapshot());fixture(After,1).c.damage(enemy(1),100,'fire');assert.equal(JSON.stringify(untouched.snapshot()),before);
console.log('PASS '+shotCases+' shot formulas + '+damageCases+' damage states + '+isolated+' individual modifiers + '+explosions+' explosions vs fixed 3b7e09b; RNG order, recursive deaths, armor cap, skill boost and independent contexts');
