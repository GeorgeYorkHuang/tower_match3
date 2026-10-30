'use strict';
const assert=require('assert'),vm=require('vm'),path=require('path');
const {createRequire}=require('module'),{execFileSync}=require('child_process');
const root=path.resolve(__dirname,'..'),box={module:{exports:{}},require:createRequire(path.join(root,'js/run.js')),console,Math,Date};
vm.runInNewContext(execFileSync('git',['show','e24ab92:js/run.js'],{cwd:root,encoding:'utf8'}),box);
const OldRun=box.module.exports.Run,{Run}=require('../js/run.js'),{Match3Controller}=require('../js/match3.js'),CA=require('../js/skills/chain-attacks.js');
const grid=Array.from({length:6},()=>Array(8).fill('red'));
function group(color,cells,shape='3'){return {color,cells,shape,size:cells.length};}
function step(matches,extra=[]){const cells=matches.flatMap(m=>m.cells),details=matches.flatMap(m=>m.cells.map(([r,c])=>({r,c,color:m.color,rainbow:false}))).concat(extra);return {matches,clearedCells:details.map(d=>[d.r,d.c]),clearedDetails:details,gridAfter:grid.map(r=>r.slice())};}
const simple=()=>step([group('red',[[0,0],[0,1],[0,2]])]);
const last=()=>step([group('red',[[0,0],[0,1],[0,2],[0,3]],'4'),group('blue',[[1,0],[1,1],[1,2]])],[{r:2,c:0,color:'red',rainbow:false},{r:2,c:0,color:'red',rainbow:false},{r:2,c:1,color:'green',rainbow:false}]);
const steps=[simple(),simple(),simple(),last()];
function prepare(C,storm){let seed=11;const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};const r=new C({rng});r.slotOrder=['fire','poison','electric','boomerang'];r.slotOrder.forEach(k=>r.effects.tower(k).unlock());r.metaRef={starOf:()=>0};r.gsState.chainstorm=storm;r.boardY=1089;r.matchSkills.chain='attack';const calls=[];r.combatRef={spawnChainShots:v=>calls.push(v),castPeriodicNow:()=>{throw Error('old periodic reward must not run');}};r.board.trySwap=()=>({ok:true,resolved:{steps:steps.length,matches:steps.flatMap(s=>s.matches),stepList:JSON.parse(JSON.stringify(steps))}});return {r,calls};}
function stats(r){return JSON.stringify({exp:r.exp,level:r.expLevel,shuffle:r.shuffleAmmo,refill:r.refillAmmo,slots:r.slotOrder,towers:Object.values(r.effects.towers).map(t=>({key:t.key,energy:t.energy,level:t.level,pending:t.pending})),bank:r.energyBank,power:r.cmPower3});}
let cases=0;
for(const storm of [false,true]){
 const a=prepare(OldRun,storm),b=prepare(Run,storm);a.r.trySwap(0,0,0,1);const ret=b.r.trySwap(0,0,0,1);assert.equal(stats(b.r),stats(a.r));assert.equal(b.calls.length,0,'no synchronous old/new shots');assert.equal(ret.chainStart,storm?2:4);
 const planned=ret.chainShotsByStep[3];assert.equal(planned.length,6);assert.equal(new Set(planned.map(s=>s.row+','+s.col)).size,6);assert(planned.every(s=>s.towerKey==='fire'||s.towerKey==='poison'));
 const emitted=[],game={state:'fighting',fx:[],ly:{boardX:0,boardY:1089,cell:64},run:{board:{isSolvable:()=>true}},combat:{spawnChainShots:s=>emitted.push(s)},toast(){}};
 const controller=new Match3Controller(game);controller.cascadeToast=()=>{};controller._specialsFx=()=>{};controller._burst=()=>{};
 controller._assemble(ret,grid,0,0,0,1);assert.equal(emitted.length,0);game.state='picking';const phase=game.anim.phase;controller.update(99);assert.equal(game.anim.phase,phase);assert.equal(emitted.length,0);game.state='fighting';
 let guard=0;while(game.anim&&guard++<80){controller.update(1);if(game.anim)controller._fireChainStep(game.anim);}
 const expected=ret.chainShotsByStep.flat().length;assert.equal(emitted.length,expected);assert(!game.anim);cases++;
}
// Snapshot metadata distinguishes the actual colorless rainbow from its colored removal group.
const rainbow={matches:[{rainbow:true,color:'red',cells:[[0,0],[0,1],[0,2]]}],clearedDetails:[{r:0,c:0,color:'red',rainbow:true},{r:0,c:1,color:'red',rainbow:false},{r:0,c:2,color:'red',rainbow:false}]};
const plan=CA.plan({steps:[rainbow],startGroup:1,activeTowers:['fire']});assert.equal(plan.shots.length,2);assert.equal(plan.stats.skippedRainbow,1);
// Real Board resolution marks only the consumed rainbow tile, not every colored tile it clears.
const Board=require('../js/board.js'),board=new Board({rows:3,cols:4,difficulty:6});board.grid=[[{c:null,s:'rainbow'},'red','blue','green'],['blue','green','red','yellow'],['green','yellow','blue','red']];board.gravity=()=>{};const resolved=board.trySwap(0,0,0,1);const first=resolved.resolved.stepList[0];assert.equal(first.clearedDetails.filter(d=>d.rainbow).length,1);const actualPlan=CA.plan({steps:[first],startGroup:1,activeTowers:['fire','ice','poison','electric','cannon','boomerang']});assert.equal(actualPlan.shots.length,first.clearedDetails.length-1);
// Full damage waits for the projectile hit, independent of animation emission.
const {CombatSystem}=require('../js/combat.js'),target={hp:100,x:0,y:100},c=Object.create(CombatSystem.prototype);let hits=0;
c.game={run:{},enemies:[target],fx:[],playSfx(){}};c.shots=[];c.pickTarget=()=>target;c.pickAltTarget=()=>target;c.shotDmg=()=>10;c.tower=()=>({energy:1});c.fxFlash=()=>{};c.hit=()=>hits++;
c.spawnChainShots({key:'fire',x:0,y:1000});assert.equal(hits,0);assert.equal(c.shots.length,1);c.stepShot(c.shots[0],10);assert.equal(hits,1);
console.log('PASS real Run chain integration: '+cases+' thresholds, unchanged exp/charge, all-cell dedupe, per-stage single emission, pause, rainbow metadata and damage at hit');
