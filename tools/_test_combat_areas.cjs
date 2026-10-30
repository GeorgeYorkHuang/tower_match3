'use strict';
const assert=require('assert'),vm=require('vm'),path=require('path');
const {execFileSync}=require('child_process'),{createRequire}=require('module');
const {CombatSystem:After}=require('../js/combat.js');
const root=path.resolve(__dirname,'..'),box={module:{exports:{}},require:createRequire(path.join(root,'js/combat.js')),console,Math,Date};
vm.runInNewContext(execFileSync('git',['show','7378c87:js/combat.js'],{cwd:root,encoding:'utf8',maxBuffer:4e6}),box);
const Before=box.module.exports.CombatSystem,originalRandom=Math.random;
function stable(v){return JSON.stringify(v,(k,v)=>typeof v==='function'?'[callback]':v);}
function fixture(C,key,relic,mode,field,delay){
 const c=Object.create(C.prototype),events=[];
 const enemies=mode==='empty'?[]:Array.from({length:5},(_,i)=>({id:i,x:[0,50,105,111,0][i],y:200,hp:i===4?0:mode==='low'?10:100000,maxHp:100000,armor:i*0.1,energy:5,isBoss:i===1,dots:[]}));
 c.game={enemies,fx:[],run:{effects:{synergyDone:[]},relic3:id=>relic&&(id==='can_airstrike'||id==='poison_cloud')},ly:{areaY:0,entryH:20},dmgNumbers:{push:e=>events.push(['number',e]),clear:()=>events.push(['clear'])}};
 c.kills={};c.lv=()=>0;c.branchLv=()=>0;c.relicVal=()=>0;c.onKill=e=>events.push(['death',e.id]);c.power=100;c.shotDmg=(...args)=>{events.push(['shotDmg',...args,c.power]);return c.power;};
 for(const n of ['fxParticle','fxRing','fxFlash'])c[n]=(...args)=>events.push([n,...args]);
 c.delayed=[{x:0,y:200,r:100,dmg:50,key,t:0,delay,ember:field==='ember'?2:0,knock:10,slowAfter:1},{t:0,delay:0.3,fn:host=>{assert.strictEqual(host,c);events.push(['callback',host.delayed.length]);host.delayed.push({t:0,delay:0,x:0,y:200,r:10,dmg:3,key:'ice'});}}];
 c.groundDots=field==='none'?[]:[{x:0,y:200,r:100,ttl:field==='expired'?0:4,dps:field==='swamp'?0:10,key,swamp:field==='swamp',slow:0.2,stackPerSec:2,ring:field==='ring',_t:0.9,_ft:0.9}];
 return {c,events,snapshot:()=>({enemies,events,delayed:c.delayed,ground:c.groundDots,kills:c.kills,fx:c.game.fx})};
}
function seeded(seed,fn){let rng=0;Math.random=()=>{rng++;seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};try{return stable({out:fn(),rng});}finally{Math.random=originalRandom;}}
let count=0;
for(const key of ['fire','poison','electric','cannon','ice',undefined])for(const relic of [false,true])for(const mode of ['alive','low','empty'])for(const field of ['none','plain','swamp','ring','ember','expired'])for(const delay of [0,0.3,2])for(const seed of [1,12345]){
 function go(C){const f=fixture(C,key,relic,mode,field,delay);for(const [i,dt] of [0.01,0.29,0.01,0.5,1,3].entries()){f.c.updateDelayed(dt);f.c.updateGroundDots(dt);if(i===1)f.c.power=500;}return f.snapshot();}
 assert.equal(seeded(seed,()=>go(After)),seeded(seed,()=>go(Before)),stable({key,relic,mode,field,delay,seed}));count++;
}
// Callback receives the original Combat, sees itself removed, and appended work waits for the next update.
const cb=fixture(After,'fire',false,'empty','none',10);cb.c.updateDelayed(0.3);assert.deepEqual(cb.events.filter(e=>e[0]==='callback'),[['callback',1]]);assert.equal(cb.c.delayed.length,2);cb.c.updateDelayed(0);assert.equal(cb.c.delayed.length,1);
// Expired fields do not deal a final tick. Poison cloud excludes bosses and never drains below zero.
const expired=fixture(After,'fire',false,'alive','expired',10),hp=expired.c.game.enemies[0].hp;expired.c.updateGroundDots(0.1);assert.equal(expired.c.game.enemies[0].hp,hp);assert.equal(expired.c.groundDots.length,0);
const cloud=fixture(After,'poison',true,'alive','plain',10);for(let i=0;i<8;i++)cloud.c.updateGroundDots(0.1);assert.equal(cloud.c.game.enemies[0].energy,0);assert.equal(cloud.c.game.enemies[1].energy,5);
const a=fixture(After,'cannon',true,'alive','ember',0),b=fixture(After,'cannon',true,'alive','ember',0),snapshot=stable(b.snapshot());a.c.updateDelayed(1);a.c.updateGroundDots(0.1);assert.equal(stable(b.snapshot()),snapshot);a.c.reset();assert.equal(a.c.delayed.length,0);assert.equal(a.c.groundDots.length,0);
console.log('PASS '+count+' delayed/ground-field multi-frame cases vs fixed 7378c87; callback identity/reentrancy, impacts, expiry, poison rings/stacks, boss energy, RNG/numbers and isolation');
