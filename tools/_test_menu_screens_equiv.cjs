'use strict';
// Fixed pre-extraction baseline, deliberately independent of the current Renderer wrappers.
const assert=require('assert'),vm=require('vm'),path=require('path');
const {createRequire}=require('module');
const {execFileSync}=require('child_process');
const root=path.resolve(__dirname,'..');
const baseline=execFileSync('git',['show','7331c49:js/game/render.js'],{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024});
const sandbox={module:{exports:{}},require:createRequire(path.join(root,'js/game/render.js')),console,Date};
const header=baseline.slice(baseline.indexOf('    // Shared header:'),baseline.indexOf('    // v1.17.10d 游戏名'));
vm.runInNewContext(baseline+'\nmodule.exports.Renderer.prototype._menuHeader = function(ctx,s,push) {\n'+header+'\n};',sandbox,{filename:'menu-before-split.js'});
const Before=sandbox.module.exports.Renderer;
const After=require('../js/game/render.js').Renderer;
const config=require('../js/config.js');
function record(Renderer,method,state){
 const log=[],values={};let gradient=0;
 const ctx=new Proxy({}, {get(t,key){
   if(key in values)return values[key];
   if(key==='measureText')return str=>({width:String(str).length*(parseInt(values.font)||20)*0.65});
   if(key==='createLinearGradient'||key==='createRadialGradient')return (...args)=>{
     const id=++gradient;log.push([key,...args,id]);
     return {gradient:id,addColorStop:(...args)=>log.push(['stop',id,...args])};
   };
   return (...args)=>log.push([key,...args]);
 },set(t,key,val){values[key]=val;log.push(['set',key,val]);return true;}});
 const renderer=Object.create(Renderer.prototype),hits=[];
 renderer[method](ctx,state,(key,data,x,y,w,h)=>hits.push({key,data,x,y,w,h}));
 return JSON.stringify({log,hits});
}
let cases=0;
const realNow=Date.now;
Date.now=()=>1761735600000;
try {
 const globals=require('../js/global-skills.js');
 for(const stage of [...Object.keys(config.FIELDS),'unknown']) for(const bestWave of [0,999]) {
  const state={stage,bestWave,matchSkills:{match4:'random',match5:'rainbow',chain:'energy'},globalSkills:['shuffle','refill']};
  for(const custom of [false,true]) {
   const s=JSON.parse(JSON.stringify(state));
   if(custom) {s.globalSkills=['refill','shuffle'];s.matchSkills={};}
   const snapshot=JSON.stringify(s);
   assert.strictEqual(record(Before,'menuBattle',s),record(After,'menuBattle',s),'home '+stage+bestWave+custom);
   assert.strictEqual(JSON.stringify(s),snapshot);cases++;
  }
 }
 const relics=[...Object.values(config.RELIC_RUN.tower).flat(),...config.RELIC_RUN.common];
 for(const count of [0,1,3,4]) for(const remaining of [undefined,0,1]) for(const unlocked of [undefined,{},config.SKILL_UNLOCK.defaults]) {
  const s={daily:{picks:relics.slice(0,count).map((r,i)=>({relic:r.id,price:100+i,shards:i+1}))},shopLeft:remaining===undefined?undefined:{blue:remaining,purple:remaining,gold:remaining},skillUnlocks:unlocked};
  const snapshot=JSON.stringify(s);
  assert.strictEqual(record(Before,'menuShop',s),record(After,'menuShop',s),'shop '+count+remaining);
  assert.strictEqual(JSON.stringify(s),snapshot);cases++;
 }
 for(const gold of [0,999,123456789]) for(const testProfile of [false,true]) {
  const s={gold,diamond:gold,testProfile};
  assert.strictEqual(record(Before,'_menuHeader',s),record(After,'_menuHeader',s),'header');cases++;
 }
} finally {Date.now=realNow;}
console.log('PASS '+cases+' menu states: canvas commands, styles, gradients, texts and hit rectangles match fixed baseline 7331c49; input unchanged');
