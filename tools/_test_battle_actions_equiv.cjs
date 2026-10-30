'use strict';
const assert=require('assert'),vm=require('vm'),path=require('path');
const {execFileSync}=require('child_process');
const CONFIG=require('../js/config.js');
const {dispatchTouch}=require('../js/game/input/battle-actions.js');
const source=execFileSync('git',['show','a4c640a:js/game/main.js'],{cwd:path.resolve(__dirname,'..'),encoding:'utf8'});
const start=source.indexOf('  dispatchTouch(p) {');
const end=source.indexOf('\n  }',start)+4;
const old=vm.runInNewContext('({'+source.slice(start,end)+'}).dispatchTouch',{CONFIG,GAME_VERSION:'test-version'});
const hit=()=>({hit:()=>true});
const rect={x:0,y:0,w:100,h:100};
function fixture(){
 const log=[];
 const game={state:'fighting',renderer:{branchName:()=> '分支'},battleRelics:new Array(17),relicDetailHits:{},towerSkillHits:{},towerInfoHits:{},funcLayerHits:{},funcHits:[],fieldChests:[],pickQueue:[],pickIndex:0,pickHits:[],relicPickHits:{},evacHits:{},meta:{soundOn:true},save:{save:()=>log.push(['save'])},sfx:{setEnabled:v=>log.push(['sound',v])},run:{applyChoice:(...a)=>{log.push(['apply',...a]);return {ok:true,activated:true};}},combat:{castGlobal:key=>log.push(['cast',key])}};
 for(const key of ['onMenuTap','goMenu','toast','buyStoreItem','cycleRunSpeed','nextPick','rerollRelicPick','relicPickChoice','restart','finishRun','waveClearNext'])game[key]=(...args)=>log.push([key,...args]);
 game.towerSlotAt=()=>-1;game.sceneState=()=>({towers:[]});
 game.onTestFieldTap=()=>{log.push(['testfield']);return false;};
 game.buildTowerSkillInfo=(...args)=>{log.push(['skillInfo',...args]);return {detail:true};};
 return {game,log};
}
const cases=[];
function add(name,setup,points=[{x:10,y:10}],check){cases.push({name,setup,points,check});}
add('menu',g=>g.state='menu',undefined,(g,l,r)=>{assert.equal(r[0],true);assert.equal(l[0][0],'onMenuTap');});
for(const control of ['close','bg','next','prev','blank'])add('relic '+control,g=>{g.relicDetail={page:1,from:'testfield'};if(control!=='blank')g.relicDetailHits[control]=hit();g.shopOpen=true;},undefined,(g,l)=>{assert.equal(l.length,0);if(['close','bg'].includes(control)){assert.equal(g.relicDetail,null);assert.equal(g.state,'testfield');}});
for(const control of ['back','bg','blank'])add('skill '+control,g=>{g.towerSkill={};if(control!=='blank')g.towerSkillHits[control]=hit();});
for(const control of ['close','bg','skill','blank'])add('tower '+control,g=>{g.towerInfo={key:'fire',skills:[{name:'火柱'}]};if(control==='skill')g.towerInfoHits.skill=[hit()];else if(control!=='blank')g.towerInfoHits[control]=hit();});
for(const type of ['setting','help'])for(const control of ['sound','confirm','close','bg','blank'])add(type+' '+control,g=>{g.funcLayer={type};if(control!=='blank')g.funcLayerHits[control]=hit();});
add('shop outside priority',g=>{g.shopOpen=true;g.renderer.shopPanelRect=rect;g.renderer.speedHit=hit();},[{x:101,y:10}],(g,l)=>{assert.equal(g.shopOpen,false);assert.equal(l.length,0);});
add('shop close',g=>{g.shopOpen=true;g.renderer.shopPanelRect=rect;g.renderer.shopCloseRect=rect;g.renderer.shopItemRects=[rect];},undefined,(g,l)=>{assert.equal(g.shopOpen,false);assert.equal(l.length,0);});
add('shop buy once',g=>{g.shopOpen=true;g.renderer.shopPanelRect=rect;g.renderer.shopItemRects=[rect,rect];},undefined,(g,l)=>assert.deepEqual(l,[['buyStoreItem',0]]));
add('shop blank',g=>{g.shopOpen=true;g.renderer.shopPanelRect=rect;g.renderer.speedHit=hit();},undefined,(g,l)=>assert.equal(l.length,0));
add('shop boundary',g=>{g.shopOpen=true;g.renderer.shopPanelRect=rect;g.renderer.shopItemRects=[rect];},[{x:100,y:100}]);
add('speed',g=>g.renderer.speedHit=hit());
for(const key of ['shop','setting','help'])add('function '+key,g=>g.funcHits=[{key,...hit()}]);
add('busy chest',g=>{g._chestBusy=true;g.renderer.globalBtns=[{key:'shuffle',...rect}];},undefined,(g,l)=>assert.equal(l.length,0));
add('relic bar',g=>g.renderer.relicBarHit=rect);
add('field chest priority',g=>{g.fieldChests=[{x:10,y:10},{x:10,y:10}];g.renderer.globalBtns=[{key:'shuffle',...rect}];},undefined,(g,l)=>{assert.equal(g.fieldChests[1].stage,'open');assert.equal(g.fieldChests[0].stage,undefined);assert.equal(l.length,0);});
add('animated chest skipped',g=>{g.fieldChests=[{x:10,y:10,animT:1}];g.renderer.globalBtns=[{key:'shuffle',...rect}];});
add('tower slot',g=>{g.towerSlotAt=()=>0;g.sceneState=()=>({towers:[{key:'fire'}]});});
for(const consumed of [false,true])add('testfield '+consumed,g=>{g.state='testfield';g.onTestFieldTap=()=>consumed;});
add('pick missing',g=>g.state='picking');
for(const type of ['effect','branch'])for(const ok of [true,false])add('pick '+type+ok,g=>{g.state='picking';g.pickQueue=[{tower:'fire',candidates:[{type,name:CONFIG.EFFECT_POOLS.fire[0].name,branch:'A',branchLv:0}]}];g.pickHits=[hit()];if(!ok)g.run.applyChoice=()=>({ok:false});},undefined,(g,l)=>assert.equal(l.filter(e=>e[0]==='nextPick').length,ok?1:0));
add('pick tower priority',g=>{g.state='picking';g.pickQueue=[{tower:'fire',candidates:[{name:'火柱'}]}];g.pickHits=[hit()];g.towerSlotAt=()=>0;g.sceneState=()=>({towers:[{key:'fire'}]});},undefined,(g,l)=>assert.equal(l.length,0));
for(const key of ['reroll','choice','blank'])add('relicpick '+key,g=>{g.state='relicpick';g.relicPick={candidates:[{}]};if(key==='reroll')g.relicPickHits.reroll=hit();if(key==='choice')g.relicPickHits[0]=hit();});
for(const shape of ['function','object'])for(const button of ['restart','menu'])add('gameover '+shape+button,g=>{g.state='gameover';g.restartBtn=button==='restart'?{hit:shape==='function'?()=>true:hit()}:{toMenu:shape==='function'?()=>true:hit()};},[{x:10,y:10},{x:10,y:10}],(g,l)=>assert.equal(l.length,1));
for(const control of ['evacGo','evacStay','blank'])add('evac '+control,g=>{g.state='evacuation';if(control!=='blank')g.evacHits[control]=hit();});
add('unconsumed',g=>g.state='unknown',undefined,(g,l,r)=>assert.equal(r[0],false));
for(const c of cases){
 const a=fixture(),b=fixture();c.setup(a.game);c.setup(b.game);
 const ar=c.points.map(p=>old.call(a.game,p));const br=c.points.map(p=>dispatchTouch(b.game,p,'test-version'));
 assert.equal(JSON.stringify({g:a.game,l:a.log,r:ar}),JSON.stringify({g:b.game,l:b.log,r:br}),c.name);
 if(c.check)c.check(b.game,b.log,br);
}
// State lives in the supplied game; dispatching one instance must not modify another.
const a=fixture(),b=fixture();a.game.shopOpen=true;a.game.renderer.shopPanelRect=rect;b.game.shopOpen=true;
dispatchTouch(a.game,{x:200,y:10},'test-version');assert.equal(b.game.shopOpen,true);
console.log('PASS '+cases.length+' battle action cases vs fixed a4c640a: routing, priority, modal consumption, mutations, calls and returns; independent games');
