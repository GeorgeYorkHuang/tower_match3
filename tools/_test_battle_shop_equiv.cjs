'use strict';
// Fixed pre-extraction baseline, deliberately independent of the current Renderer wrappers.
const assert=require('assert'),vm=require('vm'),path=require('path');
const {createRequire}=require('module');
const {execFileSync}=require('child_process');
const root=path.resolve(__dirname,'..');
const {readFileSync}=require('fs');
const baseline=execFileSync('git',['show','a4c640a:js/game/render.js'],{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024});
function loadRenderer(source,ready){
 const wx=ready?{createImage:()=>({width:128,height:128})}:undefined;
 const sandbox={module:{exports:{}},require:createRequire(path.join(root,'js/game/render.js')),console,wx};
 vm.runInNewContext(source,sandbox,{filename:'battle-shop-render.js'});
 return sandbox.module.exports.Renderer;
}
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
 renderer.shopPanelRect={previous:true};renderer.shopItemRects=[{previous:true}];renderer.shopCloseRect={previous:true};
 renderer[method](ctx,state,(key,data,x,y,w,h)=>hits.push({key,data,x,y,w,h}));
 return JSON.stringify({log,hits,rects:{panel:renderer.shopPanelRect,items:renderer.shopItemRects,close:renderer.shopCloseRect}});
}
let cases=0;
for(const ready of [false,true]) {
 const Before=loadRenderer(baseline,ready);
 const After=loadRenderer(readFileSync(path.join(root,'js/game/render.js'),'utf8'),ready);
 for(const shopOpen of [false,true]) for(const gold of [0,1,100,10000,1000000]) for(const level of [undefined,0,1,999]) {
  const state={shopOpen,gold};
  if(level!==undefined) state.store=Object.fromEntries(config.STORE.items.map(it=>[it.id,level]));
  const snapshot=JSON.stringify(state);
  assert.strictEqual(record(Before,'battleShop',state),record(After,'battleShop',state),'shop '+JSON.stringify(state)+' images='+ready);
  assert.strictEqual(JSON.stringify(state),snapshot);cases++;
 }
}
console.log('PASS '+cases+' battle shop states: full drawing sequence, hit rectangles, closed-state retention and input immutability; images ready/fallback');
