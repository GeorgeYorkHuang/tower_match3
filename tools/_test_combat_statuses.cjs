'use strict';
const assert=require('assert'),vm=require('vm'),path=require('path');
const {execFileSync}=require('child_process'),{createRequire}=require('module');
const {CombatSystem:After}=require('../js/combat.js'),B=require('../js/config/tower-skills.js');
const root=path.resolve(__dirname,'..'),box={module:{exports:{}},require:createRequire(path.join(root,'js/combat.js')),console,Math,Date};
vm.runInNewContext(execFileSync('git',['show','be9d1ac:js/combat.js'],{cwd:root,encoding:'utf8',maxBuffer:4e6}),box);
const Before=box.module.exports.CombatSystem,oldRandom=Math.random;
function fixture(C,level,relic,mode,hp=100){
 const c=Object.create(C.prototype),events=[],ice={energy:49};
 const e={id:1,hp,maxHp:100,speed:80,x:0,y:100,isBoss:mode===2,dots:[],frozen:mode?2:0,paralyzed:mode?0.5:0,slow:mode?{mult:0.6,ttl:0.5}:null,corrode:mode?{mult:1.2,ttl:0.5}:null,overload:mode?{n:3,ttl:0.5}:null,_vineT:mode?1:0,_vineAcc:0.9,_markT:0.5,_mark:2,_corrodeD:59,_core:{n:2,ttl:0.5},_wallStay:1,_domainCd:0.5,_elecBoost:{n:2,ttl:0.5},_frozenLongT:1.4,_poisonChain:2,_plagueT:2,_miaT:1.9,_miaLayers:3};
 if(mode)e.dots=[{type:'burn',dps:12,stack:2,maxStack:3,ttl:mode===2?0.1:5,tickT:0,totalDealt:20,src:'fire'},{type:'poison',stackDps:5,stack:2,maxStack:5,ttl:4,tickT:0,freq:1,src:'poison'}];
 const near={id:2,hp:100,x:20,y:100,dots:[]};
 c.game={run:{relic3:()=>relic,lineHp:990,lineMaxHp:1000,armoryEnergyMax:()=>50,_fuelBoost:relic?25:0},enemies:[e,near],fx:[],ly:{wallY:150}};
 c.kills={};c.lv=()=>level;c.branchLv=()=>level;c.relicVal=id=>relic?(['ice_condense','ice_forever'].includes(id)?1.5:20):0;c.tower=()=>ice;c.shotDmg=()=>100;
 c.damage=(o,dmg,key)=>{events.push(['damage',o.id,dmg,key]);if(o.hp<=0)return;o.hp-=dmg;if(o.hp<=0&&!o._dying){o._dying=true;c.kills[key]=(c.kills[key]||0)+1;c.onKill(o);}};
 c.onKill=o=>events.push(['kill',o.id,o._dying,{...c.kills}]);c.explode=(...a)=>events.push(['explode',...a]);
 for(const key of ['fxFlash','fxRing','fxBeam','fxParticle'])c[key]=(...a)=>events.push([key,...a]);
 return {c,e,ice,events,snapshot:()=>({enemies:c.game.enemies,run:c.game.run,fx:c.game.fx,ice,events,kills:c.kills})};
}
function rng(seed,fn){let n=0;Math.random=()=>{n++;seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};try{return {out:fn(),n};}finally{Math.random=oldRandom;}}
let applications=0;
for(const level of [0,1,2,3])for(const relic of [false,true])for(const mode of [0,1,2])for(const dmg of [10,100]){
 const a=fixture(Before,level,relic,mode),b=fixture(After,level,relic,mode);
 function go(f){const {c,e}=f;
  const boost=c.dotBoost();
  c.applyBurn(e,dmg,'fire');c.applyBurn(e,dmg/2,'cannon');
  c.applyPoison(e,dmg,'poison',2);c.applyPoison(e,dmg/2,'other',100);
  c.applyBleed(e,dmg);c.applySlow(e,0.3,2);c.applySlow(e,0.1,0.5);
  c.freezeE(e,1);c.freezeE(e,3);c.freezeE(e,0.1);
  return {boost,poison:c.poisonStack(e),burn:c.hasDot(e,'burn'),absent:c.hasDot(e,'absent'),state:f.snapshot()};}
 assert.equal(JSON.stringify(go(b)),JSON.stringify(go(a)),'apply '+JSON.stringify({level,relic,mode,dmg}));applications++;
}
let ticks=0;
for(const level of [0,1,2,3])for(const relic of [false,true])for(const mode of [0,1,2])for(const hp of [1,100])for(const dt of [0.016,0.5,1.2,3])for(const seed of [12345,999]){
 function go(C){const f=fixture(C,level,relic,mode,hp),{c,e}=f;c.applyBleed(e,100);e.y+=101;
  for(let i=0;i<3;i++){c.tickStatus(e,dt);e.y+=40;}
  return f.snapshot();}
 assert.equal(JSON.stringify(rng(seed,()=>go(After))),JSON.stringify(rng(seed,()=>go(Before))),'tick '+JSON.stringify({level,relic,mode,hp,dt,seed}));ticks++;
}
// Explicit snapshots/caps: weaker poison reapplies cannot lower stored per-stack damage or duration.
const p=fixture(After,0,false,0);p.c.applyPoison(p.e,100,'poison',1);const poison=p.e.dots[0],dps=poison.stackDps,ttl=poison.ttl;p.c.applyPoison(p.e,1,'poison',100);
assert.equal(poison.stackDps,dps);assert.equal(poison.ttl,ttl);assert.equal(poison.stack,poison.maxStack);
p.c.applyBleed(p.e,50);assert.equal(p.e._bleedLastY,p.e.y);assert.equal(p.e._bleedDist,0);
const f=fixture(After,0,true,0);f.c.freezeE(f.e,2);assert.equal(f.ice.energy,50);f.ice.energy=40;f.c.freezeE(f.e,0.1);assert.equal(f.ice.energy,40);
const dead=fixture(After,0,true,1,1);dead.c.tickStatus(dead.e,1);assert.equal(dead.c.kills.poison,1);assert.equal(dead.events.filter(e=>e[0]==='kill').length,1);
const a=fixture(After,0,false,0),b=fixture(After,0,false,0),snapshot=JSON.stringify(b.snapshot());a.c.applyBurn(a.e,100,'fire');a.c.tickStatus(a.e,0.5);assert.equal(JSON.stringify(b.snapshot()),snapshot);
console.log('PASS '+applications+' status applications + '+ticks+' multi-frame tick scenarios vs fixed be9d1ac: stacks, snapshots, expiry, controls, movement bleed, true-damage deaths, poison skill interaction and RNG order');
