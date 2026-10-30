'use strict';
// Fixed pre-extraction baseline, deliberately independent of the current Renderer wrappers.
const assert=require('assert'),vm=require('vm'),path=require('path');
const {createRequire}=require('module');
const {execFileSync}=require('child_process');
const root=path.resolve(__dirname,'..');
const baseline=execFileSync('git',['show','1b72edb:js/game/render.js'],{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024});
const sandbox={module:{exports:{}},require:createRequire(path.join(root,'js/game/render.js')),console};
vm.runInNewContext(baseline,sandbox,{filename:'codex-before-split.js'});
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
for(const tower of Object.keys(config.TOWERS)){
 assert.strictEqual(record(Before,'menuCodex',{codexSel:tower}),record(After,'menuCodex',{codexSel:tower}),'codex '+tower);cases++;
 config.EFFECT_POOLS[tower].forEach((_,idx)=>{
  const s={codexSel:tower,panel:{tower,idx}};
  assert.strictEqual(record(Before,'codexSkillPanel',s),record(After,'codexSkillPanel',s),tower+' '+idx);cases++;
 });
}
console.log('PASS '+cases+' codex screens: complete canvas commands, styles, gradient stops, texts and hit rectangles equal baseline 1b72edb');
