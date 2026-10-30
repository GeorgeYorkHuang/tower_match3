'use strict';
const assert=require('assert'),vm=require('vm'),path=require('path');
const {execFileSync}=require('child_process'),{createRequire}=require('module');
const {CombatSystem:After}=require('../js/combat.js');
const root=path.resolve(__dirname,'..'),box={module:{exports:{}},require:createRequire(path.join(root,'js/combat.js')),console,Math,Date};
vm.runInNewContext(execFileSync('git',['show','c308d0c:js/combat.js'],{cwd:root,encoding:'utf8',maxBuffer:4e6}),box);
const Before=box.module.exports.CombatSystem,originalRandom=Math.random;
const names=['重炮','震击','贯穿弹','军火库'];
function fixture(C,mask,branch,relic,heat,energy,hp,synergy){
 const c=Object.create(C.prototype),events=[],tower={energy,_heat:heat,_ovCrit:4};
 const enemies=Array.from({length:14},(_,i)=>({id:i,hp:i===13?0:hp,maxHp:hp,x:i===12?1000:100+(i%3)*8,y:400-i*8,armor:i%3*0.1,dots:[]}));
 c.game={enemies,fx:[],run:{relic3:id=>relic===3&&id.startsWith('can_'),effects:{synergyDone:[false,synergy]},armoryEnergyMax:()=>50,_warAtk:0},dmgNumbers:{push:e=>events.push(['number',e])}};
 c.kills={};c.tower=()=>tower;c.lv=(k,n)=>k==='cannon'&&(mask&(1<<names.indexOf(n)))?branch+1:0;
 c.branchLv=(k,n)=>k==='cannon'&&c.lv(k,n)?branch:0;c.relicVal=id=>relic>0&&id.startsWith('can_')?relic*10:0;
 c.ly=()=>({areaY:0,entryH:20});c.shotDmg=(...a)=>{events.push(['shotDmg',...a]);return 100;};c.onKill=e=>events.push(['kill',e.id]);
 c.applyBurn=(e,d)=>{e.dots.push({type:'burn',dmg:d});events.push(['burn',e.id,d]);};c.applySlow=(e,v,t)=>{e.slow={v,ttl:t};events.push(['slow',e.id,v,t]);};
 for(const n of ['fxFlash','fxRing','fxParticle'])c[n]=(...a)=>events.push([n,...a]);
 return {c,tower,events,snapshot:()=>({enemies,tower,events,fx:c.game.fx,run:c.game.run,kills:c.kills,ground:c.groundDots})};
}
function run(C,args,seed){let rng=0;Math.random=()=>{rng++;seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};try{const f=fixture(C,...args);for(let i=0;i<3;i++)f.c.hitCannon(f.c.game.enemies[0],100);return JSON.stringify({state:f.snapshot(),rng});}finally{Math.random=originalRandom;}}
let count=0;
for(const mask of [0,1,2,4,8,15])for(const branch of [0,1,2,3])for(const relic of [0,1,2,3])for(const heat of [0,24])for(const energy of [0,50])for(const hp of [80,100000])for(const synergy of [false,true])for(const seed of [1,12345]){
 const args=[mask,branch,relic,heat,energy,hp,synergy];assert.equal(run(After,args,seed),run(Before,args,seed),JSON.stringify({args,seed}));count++;
}
// Explicit invariants supplement baseline comparisons, using the real damage/explode paths.
const f=fixture(After,0,0,0,0,50,100000,false);f.c.hitCannon(f.c.game.enemies[0],100);assert.equal(f.c.game.enemies[0].hp,99900,'main target is excluded from splash');
const hot=fixture(After,0,0,3,24,0,100000,false);hot.c.hitCannon(hot.c.game.enemies[0],100);assert.equal(hot.tower._heat,0);assert.equal(hot.c.game.enemies[0].hp,99800);
const pierce=fixture(After,4,3,3,0,0,100000,false);pierce.c.game.enemies.forEach((e,i)=>{if(i>0&&i<12)e.y=395-i*0.1;});pierce.c.damage=(e,d)=>pierce.events.push(['direct',e.id,d]);pierce.c.explode=()=>{};pierce.c.hitCannon(pierce.c.game.enemies[0],100);
const hits=pierce.events.filter(e=>e[0]==='direct').slice(1);assert(hits.length>7);assert.equal(hits.at(-1)[2],hits[0][2]*0.4,'unlimited pierce bottoms at 40%');
const isolated=fixture(After,15,3,3,24,50,100000,true),other=fixture(After,15,3,3,24,50,100000,true),snapshot=JSON.stringify(other.snapshot());isolated.c.hitCannon(isolated.c.game.enemies[0],100);assert.equal(JSON.stringify(other.snapshot()),snapshot);
console.log('PASS '+count+' cannon fixed-baseline multi-hit scenarios + main exclusion, heat rollover, pierce floor and context isolation');
