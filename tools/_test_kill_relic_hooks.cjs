'use strict';
const assert=require('assert'),vm=require('vm'),path=require('path');
const {execFileSync}=require('child_process');
const CONFIG=require('../js/config.js'),SKILL_NUM=require('../js/config/tower-skills.js'),GS_BALANCE=require('../js/config/global-balance.js');
const Combat=require('../js/combat.js').CombatSystem,Kill=require('../js/relics/kill-hooks.js');
const root=path.resolve(__dirname,'..');
function oldMethod(file,name){
 const s=execFileSync('git',['show','1b0274f:'+file],{cwd:root,encoding:'utf8',maxBuffer:4e6});
 const start=s.indexOf('  '+name+'(e) {'),end=s.indexOf('\n  }',start)+4;
 return vm.runInNewContext('({'+s.slice(start,end)+'}).'+name,{CONFIG,SKILL_NUM,GS_BALANCE,Math});
}
const oldKill=oldMethod('js/combat.js','onKill'),oldReward=oldMethod('js/game/main.js','onKillReward');
const currentSource=require('fs').readFileSync(path.join(root,'js/game/main.js'),'utf8');
const st=currentSource.indexOf('  onKillReward(e) {'),en=currentSource.indexOf('\n  }',st)+4;
const newReward=vm.runInNewContext('({'+currentSource.slice(st,en)+'}).onKillReward',{CONFIG,GS_BALANCE,Math,RelicKill:Kill});
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
for(initialSeed of [12345,555,999])for(const stars of starSets)for(const skills of [0,3])for(const status of [false,true])for(const order of [keys,keys.slice().reverse()]) {
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
function rewardFixture(star,guarantee,field,state){
 const log=[],g={state,field,fieldChests:[],runShardGained:0,runShardDetail:{},fx:[],meta:{chests:0,relicBonus:()=>({exp:2,chest:1})}};
 g.run={gold:0,gsState:{gold:1},relicNum:()=>star*10,gainExp:v=>log.push(['exp',v]),relicFx:(...a)=>log.push(['relicFx',...a]),bountyGuarantee:()=>{log.push(['guarantee']);return guarantee;}};
 g.toast=(...a)=>log.push(['toast',...a]);g.save={save:()=>log.push(['save'])};return {g,snapshot:()=>({g,log})};
}
let rewards=0;
for(initialSeed of [12345,555,999])for(const state of ['fighting','testfield'])for(const type of ['normal','elite','boss','unknown'])for(const isBoss of [false,true])for(const star of [0,3])for(const guarantee of [false,true])for(const field of [CONFIG.FIELDS.ancient,CONFIG.FIELDS.test]){
 const e={type,isBoss,x:20,y:30,genLv:4},a=rewardFixture(star,guarantee,field,state),b=rewardFixture(star,guarantee,field,state);
 const av=execute(()=>{oldReward.call(a.g,e);return a.snapshot();}),bv=execute(()=>{newReward.call(b.g,e);return b.snapshot();});assert.equal(JSON.stringify(bv),JSON.stringify(av),'reward '+JSON.stringify({state,type,isBoss,star,guarantee,field:field.name}));rewards++;
}
const a=fixture({fire_seed:3},0,true,['fire'],false),b=fixture({fire_seed:3},0,true,['fire'],false);const before=JSON.stringify(b.snapshot());a.c.onKill(a.e);assert.equal(JSON.stringify(b.snapshot()),before);
console.log('PASS '+cases+' kill/reentrant cases + '+rewards+' reward cases vs fixed 1b0274f: RNG calls/order, skill interaction, target boundaries, status, energy cap, rewards and isolated contexts');
