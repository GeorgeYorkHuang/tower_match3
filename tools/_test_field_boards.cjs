'use strict';
const assert=require('assert'),{Run}=require('../js/run.js'),Board=require('../js/board.js'),Access=require('../js/field-access.js'),{Meta}=require('../js/meta.js');
for(const field of ['lava','frost']){
 const run=new Run({field}),b=run.board;assert.equal(b.obstacles.length,4);
 for(let trial=0;trial<60;trial++){
  b.regen();for(const [r,c] of b.obstacles){assert.equal(b.grid[r][c].s,'obstacle');assert(!b.trySwap(r,c,r,c+1).ok);}
  for(let r=0;r<b.rows;r++)for(let c=0;c<b.cols;c++)if(!b.obstacles.some(p=>p[0]===r&&p[1]===c)&&Math.random()<0.5)b.grid[r][c]=null;
  b.gravity();assert(b.grid.every(row=>row.every(v=>v!==null)));for(const [r,c]of b.obstacles)assert.equal(b.grid[r][c].s,'obstacle');
  for(let r=0;r<b.rows;r++)for(let c=0;c<b.cols-1;c++)b.trySwap(r,c,r,c+1);
  for(const [r,c]of b.obstacles)assert.equal(b.grid[r][c].s,'obstacle');
 }
}
// A block beneath an obstacle fills from a diagonal donor, never by moving the obstacle.
const b=new Board({rows:4,cols:4,obstacles:[[1,1]]}).init();b.grid[2][1]=null;b.gravity();assert(b.gravityOrigins[2][1].path.some((p,i,a)=>i&&p.c!==a[i-1].c));assert.equal(b.grid[1][1].s,'obstacle');
assert(Access.reason('lava',{ancientBestWave:39},false));assert.equal(Access.reason('frost',{ancientBestWave:40},false),'');assert(Access.reason('abyss',{bestWave:999},false));assert.equal(Access.reason('abyss',{normalFieldCleared:true},false),'');assert(!Access.visible(false).includes('test'));assert(Access.visible(true).includes('test'));
const game={};Access.prompt(game,'first');Access.prompt(game,'second');assert.equal(game.menuPanel.message,'first');
const m=new Meta();m.ancientBestWave=40;m.normalFieldCleared=true;const clone=Meta.fromJSON(m.toJSON());assert.equal(clone.ancientBestWave,40);assert.equal(clone.normalFieldCleared,true);
const {onMenuTap}=require('../js/game/input/menu-actions.js');
for(const key of ['enter','stage']){const g={menuHits:[{key,hit:()=>true}],meta:{},menuStage:'lava',testProfile:false,newRun:()=>{throw Error('locked entry');}};onMenuTap(g,{x:0,y:0});assert.equal(g.menuPanel.type,'fieldLocked');}
console.log('PASS 120 obstructed board fuzz cycles, immovable/unbreakable obstacles, diagonal refill/path, field gates, cooldown, save roundtrip and real menu locked routing');

// Switching to a locked field is silent; clicking its icon still explains the gate.
const switcher={menuHits:[{key:'stageNext',hit:()=>true}],meta:{},menuStage:'ancient',testProfile:false};onMenuTap(switcher,{x:0,y:0});assert.equal(switcher.menuStage,'lava');assert(!switcher.menuPanel);
const fs=require('fs'),vm=require('vm');
function method(file,name,scope){const src=fs.readFileSync(file,'utf8'),a=src.indexOf('  '+name+'('),b=src.indexOf('\n  }',a)+4;return vm.runInNewContext('({'+src.slice(a,b)+'}).'+name,scope);}
const tally=method('js/game/main.js','_tallyWaveDeaths',{});
for(const field of ['ancient','lava','frost','test','abyss']){const g={_waveAlive:{60:1},run:{wave:60,clearedWaves:0},wave:{plan:[]},menuStage:field,state:field==='test'?'testfield':'fighting',meta:{},save:{save(){}}};tally.call(g,[{waveNo:60}]);assert.equal(!!g.meta.normalFieldCleared,['ancient','lava','frost'].includes(field));}
// Render contract: icon-only full slot plus sequential partial yellow/full green beans.
const fills=[],labels=[],icons=[];const ctx=new Proxy({createLinearGradient:()=>({addColorStop(){}})},{get:(t,k)=>k in t?t[k]:()=>{}});
const globalBtn=method('js/game/render.js','_globalBtn',{GlobalSkills:{get:()=>({color:'#fff'})},roundRect(){},fillRoundRect:(...args)=>fills.push(args),strokeRoundRect(){},text:(ctx,label)=>labels.push(label)});
globalBtn.call({_skillIcon:(...args)=>icons.push(args)},ctx,'shuffle','','hidden name',0,0,100,100,1.5,'#ff8c42');assert.equal(icons[0][4],100);assert.equal(labels.length,0);assert(fills.some(a=>a.at(-1)==='#62df97'&&a[3]===24));assert(fills.some(a=>a.at(-1)==='#f4cd52'&&a[3]===12));
console.log('PASS silent locked switching, normal-field clear gates, icon-only 100px slot and fractional green/yellow charging beans');
