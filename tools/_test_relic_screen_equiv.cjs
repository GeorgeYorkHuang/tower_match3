'use strict';
const assert=require('assert'),vm=require('vm'),path=require('path'),fs=require('fs');
const {execFileSync}=require('child_process'),{createRequire}=require('module');
const root=path.resolve(__dirname,'..'),file=path.join(root,'js/game/render.js');
const baseline=execFileSync('git',['show','a4c4699:js/game/render.js'],{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024});
const current=fs.readFileSync(file,'utf8');
const config=require('../js/config.js');
const relics=Object.values(config.RELIC_RUN.tower).flat().concat(config.RELIC_RUN.common);
function renderer(source,ready){
 const box={module:{exports:{}},require:createRequire(file),console,
  wx:{createImage:()=>({width:ready?128:0,height:128,src:''})}};
 vm.runInNewContext(source,box);return box.module.exports.Renderer;
}
function record(Renderer,method,state,extra=[]){
 const log=[],values={};let gradient=0;
 const normalize=v=>v&&typeof v==='object'&&typeof v.src==='string'?{image:v.src}:v;
 const ctx=new Proxy({}, {get(t,key){
  if(key in values)return values[key];
  if(key==='measureText')return str=>({width:String(str).length*(parseInt(values.font)||20)*0.65});
  if(key==='createLinearGradient'||key==='createRadialGradient')return (...args)=>{
   const id=++gradient;log.push([key,...args,id]);return {gradient:id,addColorStop:(...args)=>log.push(['stop',id,...args])};
  };
  return (...args)=>log.push([key,...args.map(normalize)]);
 },set(t,key,value){values[key]=value;log.push(['set',key,value]);return true;}});
 const view=Object.create(Renderer.prototype),hits=[],before=JSON.stringify(state);
 const result=view[method](ctx,state,(key,data,x,y,w,h)=>hits.push({key,data,x,y,w,h}),...extra);
 assert.strictEqual(JSON.stringify(state),before,'Rendering must not mutate profile/view input');
 return JSON.stringify({log,hits,scroll:view._relicMaxScroll,result});
}
function state(mode){
 const s={gold:50000,diamond:20,chests:2,deepChests:[],relicStars:{},runCodex:{},shards:{},starStones:5,relicScroll:0,relicDexPage:0,panel:null};
 if(mode!=='empty')relics.forEach((r,i)=>{
  if(mode==='mixed'&&i%4===0){s.shards[r.id]=config.DUPLICATE_SHARDS[config.relicRarity(r.id)];return;}
  const star=i%3+1;s.relicStars[r.id]=star;s.runCodex[r.id]=1;
  s.shards[r.id]=i%2?999:0;
 });
 if(mode==='legacyOwned'){s.runCodex={[relics[0].id]:1};s.relicStars={};}
 s.deepChests=[{tier:'wood',name:'木质宝箱',ready:true,remainMin:0},{tier:'gold',name:'黄金宝箱',ready:false,remainMin:61}];
 return s;
}
let count=0;
for(const ready of [false,true]){
 const Before=renderer(baseline,ready),After=renderer(current,ready);
 function compare(method,s,extra=[]){
  assert.strictEqual(record(After,method,s,extra),record(Before,method,s,extra),method+' images='+ready+' panel='+JSON.stringify(s.panel));count++;
 }
 for(const mode of ['empty','mixed','all','legacyOwned']){
  for(const scroll of [0,224,1100,2632,5164,5264,99999]){
   const s=state(mode);s.relicScroll=scroll;compare('menuRelic',s);
  }
  const pages=Math.ceil(relics.length/16);
  for(let page=0;page<pages;page++){
   const s=state(mode);s.relicDexPage=page;s.panel={type:'relicDex'};
   compare('menuRelicDex',s);compare('_menuRelicGrid',s,['relicPage',true]);
  }
  const s=state(mode);s.panel={type:'starUp'};compare('menuStarUp',s);
 }
 for(const r of relics){
  const need=config.DUPLICATE_SHARDS[config.relicRarity(r.id)];
  for(const [star,shards,gold] of [[0,0,0],[0,need-1,50000],[0,need,50000],[1,0,0],[1,999,50000],[2,999,50000],[3,999,50000]]){
   const s=state('empty');s.panel={type:'relicInfo',id:r.id};s.shards[r.id]=shards;s.gold=gold;
   if(star){s.relicStars[r.id]=star;s.runCodex[r.id]=1;}
   compare('menuRelicInfo',s);
  }
 }
 const missing=state('empty');missing.panel={type:'relicInfo',id:'missing'};compare('menuRelicInfo',missing);
}
console.log('PASS '+count+' relic screen scenarios equal fixed baseline a4c4699: all canvas commands, styles, gradient stops, texts, hit rectangles, scroll bounds and input immutability; images ready/fallback');
