'use strict';
const assert=require('node:assert/strict'),Auto=require('../js/game/auto-battle.js');
let chosen=0;
const g={testProfile:true,autoBattle:true,state:'relicpick',run:{},relicPick:{candidates:[{}]},relicPickChoice(i){assert.equal(i,0);chosen++;}};
Auto.tick(g,.3);assert.equal(chosen,0);Auto.tick(g,.3);assert.equal(chosen,1);
for(const key of ['funcLayer','shopOpen','dmgStat','towerInfo','towerSkill','relicDetail','_chestBusy','_adBusy']){g[key]=true;Auto.tick(g,1);assert.equal(chosen,1);g[key]=false;}
g.autoBattle=false;Auto.tick(g,1);assert.equal(chosen,1);
g.autoBattle=true;g.testProfile=false;Auto.tick(g,1);assert.equal(g.autoBattle,false);assert.equal(chosen,1);
g.testProfile=true;g.state='fighting';g.autoBattleHit={hit:()=>true};assert.equal(Auto.tap(g,{x:0,y:0}),true);assert.equal(Auto.active(g),true);Auto.tap(g,{x:0,y:0});assert.equal(Auto.active(g),false);
g.state='gameover';assert.equal(Auto.tap(g,{x:0,y:0}),false);
g.state='picking';g.autoBattle=true;let applied=0;g.pickQueue=[{tower:'fire',candidates:[{}]}];g.pickIndex=0;g.run.applyChoice=()=>{applied++;return {ok:false};};Auto.tick(g,1);assert.equal(applied,1);
console.log('PASS profile gate, toggle, selection delay, modal blocking, disabled/terminal states and invalid skill handling');