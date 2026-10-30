'use strict';
const assert=require('assert');
const storage={},handlers={};
const ops=[],styles={};
const ctx=new Proxy({}, {get(t,k){if(k in styles)return styles[k];if(k==='createLinearGradient'||k==='createRadialGradient')return ()=>({addColorStop(){}});if(k==='measureText')return s=>({width:String(s).length*10});return (...a)=>ops.push([k,...a]);},set(t,k,v){styles[k]=v;return true;}});
global.wx={createInnerAudioContext:()=>({play(){},stop(){},src:'',loop:false}),getStorageSync:k=>storage[k],setStorageSync:(k,v)=>{storage[k]=v;},getSystemInfoSync:()=>({windowWidth:375,windowHeight:667,pixelRatio:3}),onTouchStart:f=>handlers.start=f,onTouchMove:f=>handlers.move=f,onTouchEnd:f=>handlers.end=f,onTouchCancel:f=>handlers.cancel=f};
global.canvas={width:1125,height:2001,getContext:()=>ctx,addEventListener(){}};global.GameGlobal={};global.requestAnimationFrame=()=>{};
require('../js/game/main.js');
const game=global.GameGlobal.game,P=require('../js/config/combat-presentation.js');game.newRun(true);
let cases=0;
for(const key of ['fire','ice','poison','electric','cannon','boomerang',undefined]){
 game.dmgNumbers.clear();const e={id:cases+1,hp:100,maxHp:100,x:30,y:100,armor:0.5,dots:[]};game.combat.damage(e,20,key);
 assert.equal(e.hp,90);const view=game.dmgNumbers.visible();assert.equal(view.length,1);assert.equal(view[0].text,'10');assert.equal(view[0].color,P.colorOf(key));cases++;
}
game.dmgNumbers.clear();let deaths=0;const originalKill=game.combat.onKill;
game.combat.onKill=e=>{deaths++;assert.equal(game.dmgNumbers.stats().active,1);assert.equal(e._dying,true);};
const dying={id:20,hp:5,maxHp:100,x:30,y:100,dots:[]};game.combat.damage(dying,1000,'fire');game.combat.damage(dying,1000,'fire');assert.equal(game.dmgNumbers.visible()[0].text,'5');assert.equal(deaths,1);
game.dmgNumbers.clear();const living={id:21,hp:100,maxHp:100,x:30,y:100,dots:[]};game.combat.damage(living,0,'fire');game.combat.damage(living,-1,'fire');assert.equal(game.dmgNumbers.stats().active,0);
game.combat.damage(living,10,'poison','dot');game.combat.damage(living,10,'poison','dot');assert.equal(game.dmgNumbers.stats().active,1);assert.equal(game.dmgNumbers.visible()[0].text,'20');assert.equal(game.dmgNumbers.visible()[0].kind,'dot');
// Legacy burns lacking a source still display fire color without changing gameplay attribution.
game.dmgNumbers.clear();const legacyBurn={id:23,hp:100,maxHp:100,x:0,y:100,dots:[{type:'burn',ttl:4,tickT:0,dps:10,stack:1}]};game.combat.tickStatus(legacyBurn,0.1);assert.equal(game.dmgNumbers.visible()[0].color,P.colorOf('fire'));assert.equal(legacyBurn.lastDmgKey,undefined);
// True damage bypasses armor, emits once before death, then ordinary dead-target DoT cannot emit again.
game.dmgNumbers.clear();const originalRelic=game.run.relic3;game.run.relic3=id=>id==='poison_corrode';const corrode={id:22,hp:5,maxHp:1000,x:30,y:100,speed:60,armor:0.9,dots:[{type:'poison',ttl:4,tickT:0,stack:1,stackDps:2,src:'poison'}]};game.combat.tickStatus(corrode,1);assert.equal(game.dmgNumbers.stats().active,1);assert.equal(game.dmgNumbers.visible()[0].kind,'true');assert.equal(game.dmgNumbers.visible()[0].text,'5');game.run.relic3=originalRelic;game.combat.onKill=originalKill;
// Source whitelist and disabled switch affect visuals only.
game.dmgNumbers.clear();P.damageNumbers.enabled=false;const e={hp:100,x:0,y:0,dots:[]};game.combat.damage(e,10,'fire');assert.equal(e.hp,90);assert.equal(game.dmgNumbers.stats().active,0);P.damageNumbers.enabled=true;
P.damageNumbers.sources=['ice'];game.combat.damage(e,10,'fire');assert.equal(e.hp,80);assert.equal(game.dmgNumbers.stats().active,0);P.damageNumbers.sources=null;
// Monster bars are hidden; the wall health bar still draws.
ops.length=0;game.renderer.drawEnemyBar(ctx,{hp:50,maxHp:100},0,0,40);assert.equal(ops.length,0);game.renderer.wall(ctx,50,100,967);assert(ops.length>0);
// Queue draw is part of Renderer, and pauses preserve its animation age.
game.dmgNumbers.push({enemyId:1,x:30,y:50,sourceKey:'fire',amount:10});game.dmgNumbers.step(0.1);ops.length=0;game.renderer.damageNumbers(ctx,game.dmgNumbers);assert(ops.some(o=>o[0]==='fillText'&&o[1]==='10'));
game.state='picking';const before=JSON.stringify(game.dmgNumbers.visible());game.update(0.2);assert.equal(JSON.stringify(game.dmgNumbers.visible()),before);
game.anim={phase:'clear',progress:0};game.combat.shots.push({});game.goMenu();assert.equal(game.anim,null);assert.equal(game.combat.shots.length,0);assert.equal(game.dmgNumbers.stats().active,0);
game.newRun(true);assert.equal(game.dmgNumbers.stats().active,0);game.enterTestField();assert.equal(game.dmgNumbers.stats().active,0);
console.log('PASS real Main feedback integration: '+cases+' source colors, post-armor/overkill amounts, zero suppression, DoT merge, true-death event order, hidden bars/wall, render, pause and lifecycle cleanup');
