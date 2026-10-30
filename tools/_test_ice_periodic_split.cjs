'use strict';
const assert=require('assert'),vm=require('vm'),path=require('path');
const {execFileSync}=require('child_process'),{createRequire}=require('module');
const {CombatSystem:After}=require('../js/combat.js'),B=require('../js/config/tower-skills.js').ice;
const root=path.resolve(__dirname,'..'),box={module:{exports:{}},require:createRequire(path.join(root,'js/combat.js')),console,Math,Date};
vm.runInNewContext(execFileSync('git',['show','6fa2759:js/combat.js'],{cwd:root,encoding:'utf8',maxBuffer:4e6}),box);
const Before=box.module.exports.CombatSystem,skillsAll=['冰花','冬珠','冰墙'];
function stable(x){return JSON.stringify(x,(k,v)=>typeof v==='function'?'[callback]':v);}
function fixture(C,skills,branch,relic,weak,mode,ready=true){
 const c=Object.create(C.prototype),events=[],tower={energy:weak?0:49};
 const enemies=mode==='empty'?[]:[{id:1,hp:100000,x:0,y:200,dots:[],frozen:0},{id:2,hp:100000,x:20,y:210,dots:[],frozen:0},{id:3,hp:100000,x:0,y:260,dots:[],frozen:0},{id:4,hp:0,x:0,y:200,dots:[],frozen:0}];
 if(mode==='out')enemies.forEach(e=>e.y+=1000);
 c.game={run:{relic3:()=>relic,lineHp:800,lineMaxHp:1000,_wallDmgAcc:250,armoryEnergyMax:()=>50},enemies,fx:[]};c.delayed=[];c.iceGrounds=[];
 c.timers={iceFlower:ready?B['冰花'].period*(weak?1.5:1)-0.01:0,frostOrb:ready?B['冬珠'].period*(weak?1.5:1)-0.01:0,iceWall:ready?B['冰墙'].period*(weak?1.5:1)-0.01:0};
 c.lv=(key,name)=>skills.includes(name)?branch+1:0;c.branchLv=()=>branch;c.tower=()=>tower;c._weakPeriod=()=>tower.energy<=0?1.5:1;c.ly=()=>({wallY:300,areaY:0});c.relicVal=id=>relic&&id==='ice_forever'?1.5:0;
 c.power=100;c.shotDmg=(...a)=>{events.push(['shotDmg',...a,c.power]);return c.power;};c.castEnergy=(...a)=>{events.push(['cast',...a]);tower.energy=Math.max(0,tower.energy-1);};c.inTowerRange=(key,x,y)=>y<=240;
 c.damage=(e,dmg,key)=>{events.push(['damage',e.id,dmg,key]);e.hp-=dmg;};c.explode=(...a)=>events.push(['explode',...a]);
 c.applySlow=(e,mult,ttl)=>{events.push(['slow',e.id,mult,ttl]);e.slow={mult:1-mult,ttl};};
 for(const name of ['fxFlash','fxParticle','fxRing'])c[name]=(...a)=>events.push([name,...a]);
 return {c,events,tower,snapshot:()=>({timers:c.timers,delayed:c.delayed,orbs:c.frostOrbs,wall:c.iceWall,ground:c.iceGrounds,run:c.game.run,enemies:c.game.enemies,fx:c.game.fx,events,tower})};
}
let cases=0;
for(const skills of [[],...skillsAll.map(x=>[x]),skillsAll])for(const branch of [0,1,2,3])for(const relic of [false,true])for(const weak of [false,true])for(const mode of ['alive','empty','out']){
 function go(C){const f=fixture(C,skills,branch,relic,weak,mode);for(const [i,dt] of [0.005,0.01,0.1,0.8,1,2,2,4,16].entries()){
  f.c.updateDelayed(dt);f.c.tickIce(dt);
  if(i===1){f.c.power=500;if(f.c.game.enemies[0])f.c.game.enemies[0].x+=15;}
 }return f.snapshot();}
 assert.equal(stable(go(After)),stable(go(Before)),JSON.stringify({skills,branch,relic,weak,mode}));cases++;
}
let queues=0;
for(const enabled of [false,true])for(const dt of [0.001,0.2,1,12])for(const relic of [false,true]){
 function go(C){const f=fixture(C,enabled?skillsAll:[],3,relic,false,'alive',false);
  f.c.iceWall={ttl:0.2,heal:150,absorb:0,reflect:0.9};
  f.c.frostOrbs=[{x:0,y:200,r:120,ttl:0.1,tickT:0,tickI:0.5,dmg:77,slowMult:0.3},{x:0,y:200,r:120,ttl:3,tickT:0,tickI:0.5,dmg:88,slowMult:0.3}];
  f.c.iceGrounds=[{x:0,y:200,r:120,ttl:0.1,slow:0.2},{x:0,y:200,r:120,ttl:3,fog:true}];
  f.c.updateDelayed(dt);f.c.tickIce(dt);return f.snapshot();}
 assert.equal(stable(go(After)),stable(go(Before)));queues++;
}
// Ice flower damage stays delayed and uses the cast damage; its callbacks follow the original target reference.
const bloom=fixture(After,['冰花'],0,true,false,'alive');bloom.c.tickIce(0.02);assert(bloom.c.delayed.length>0);assert(!bloom.events.some(e=>e[0]==='damage'));
const pending=bloom.c.delayed[0],snap=pending.dmg;bloom.c.power=1000;bloom.c.updateDelayed(0.8);assert(bloom.events.some(e=>e[0]==='damage'&&e[2]===snap));assert.equal(bloom.c.delayed.length,2);assert(bloom.c.delayed.every(d=>d.delay===2||d.delay===4));
const orb=fixture(After,['冬珠'],0,false,false,'alive');orb.c.tickIce(0.02);const dmg=orb.c.frostOrbs[0].dmg;orb.c.power=1000;orb.c.tickIce(1);assert(orb.events.some(e=>e[0]==='damage'&&e[2]===dmg));
const wall=fixture(After,['冰墙'],3,true,false,'alive');wall.c.tickIce(0.02);assert.equal(wall.c.iceWall.absorb,B['冰墙'].absorb);assert.equal(wall.tower.energy,50);assert.equal(wall.c.game.run._wallDmgAcc,50);
const ending=fixture(After,['冰墙'],0,false,false,'alive',false);ending.c.iceWall={ttl:0.1,heal:500,absorb:0};ending.c.tickIce(0.2);assert.equal(ending.c.game.run.lineHp,1000);assert.equal(ending.c.iceWall,null);
const a=fixture(After,skillsAll,3,true,false,'alive'),b=fixture(After,skillsAll,3,true,false,'alive'),before=stable(b.snapshot());a.c.tickIce(0.02);a.c.updateDelayed(1);assert.equal(stable(b.snapshot()),before);
console.log('PASS '+cases+' multi-frame ice periodic scenarios + '+queues+' existing-entity cases vs fixed 6fa2759: delayed callbacks/avalanche, snapshots, orb ticks, shield expiry/heal, energy cap and independent contexts');
