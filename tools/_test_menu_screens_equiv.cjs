'use strict';
// Fixed pre-extraction baseline, deliberately independent of the current Renderer wrappers.
// v1.17.45: owner-directed shop UI change (连消技解锁组下架) invalidated the frozen 7331c49 shop
// baseline — the shop section is now pinned by content hashes of the current implementation.
// Regenerate after an intentional shop change: node tools/_test_menu_screens_equiv.cjs --update-shop
const assert=require('assert'),vm=require('vm'),path=require('path'),crypto=require('crypto'),fs=require('fs');
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
// —— 商店段：内容哈希钉扎（有意 UI 变更后用 --update-shop 再生；哈希变化=商店渲染被改动） ——
const SHOP_BASELINE = /* SHOP_HASHES_START */ {
   "0|undefined|none": "0b1c8661cde5237f",
   "0|undefined|empty": "0b1c8661cde5237f",
   "0|undefined|defaults": "0b1c8661cde5237f",
   "0|0|none": "eccbbbce479d1112",
   "0|0|empty": "eccbbbce479d1112",
   "0|0|defaults": "eccbbbce479d1112",
   "0|1|none": "dd7955280da75042",
   "0|1|empty": "dd7955280da75042",
   "0|1|defaults": "dd7955280da75042",
   "1|undefined|none": "48e19c0a8083e4a6",
   "1|undefined|empty": "48e19c0a8083e4a6",
   "1|undefined|defaults": "48e19c0a8083e4a6",
   "1|0|none": "fe6eaa05fe88f0be",
   "1|0|empty": "fe6eaa05fe88f0be",
   "1|0|defaults": "fe6eaa05fe88f0be",
   "1|1|none": "f2a22f2e7800a8b3",
   "1|1|empty": "f2a22f2e7800a8b3",
   "1|1|defaults": "f2a22f2e7800a8b3",
   "3|undefined|none": "b3d6d4c251bafa3e",
   "3|undefined|empty": "b3d6d4c251bafa3e",
   "3|undefined|defaults": "b3d6d4c251bafa3e",
   "3|0|none": "f133594d88c5e922",
   "3|0|empty": "f133594d88c5e922",
   "3|0|defaults": "f133594d88c5e922",
   "3|1|none": "db71e7d3b13da85a",
   "3|1|empty": "db71e7d3b13da85a",
   "3|1|defaults": "db71e7d3b13da85a",
   "4|undefined|none": "b3d6d4c251bafa3e",
   "4|undefined|empty": "b3d6d4c251bafa3e",
   "4|undefined|defaults": "b3d6d4c251bafa3e",
   "4|0|none": "f133594d88c5e922",
   "4|0|empty": "f133594d88c5e922",
   "4|0|defaults": "f133594d88c5e922",
   "4|1|none": "db71e7d3b13da85a",
   "4|1|empty": "db71e7d3b13da85a",
   "4|1|defaults": "db71e7d3b13da85a"
 } /* SHOP_HASHES_END */;
const sha=(s)=>crypto.createHash('sha256').update(s).digest('hex').slice(0,16);
const updateShop=process.argv.includes('--update-shop');
let shopUpdated=false;
for(const count of [0,1,3,4]) for(const remaining of [undefined,0,1]) for(const unlocked of ['none','empty','defaults']) {
  const s={daily:{picks:relics.slice(0,count).map((r,i)=>({relic:r.id,price:100+i,shards:i+1}))},shopLeft:remaining===undefined?undefined:{blue:remaining,purple:remaining,gold:remaining},skillUnlocks:unlocked==='none'?undefined:(unlocked==='empty'?{}:config.SKILL_UNLOCK.defaults)};
  const key=`${count}|${String(remaining)}|${unlocked}`;
  const h=sha(record(After,'menuShop',s));
  if (updateShop) { SHOP_BASELINE[key]=h; shopUpdated=true; continue; }
  assert.strictEqual(h, SHOP_BASELINE[key], 'shop '+key+'（商店渲染被改动？有意变更请跑 --update-shop 再生基线）');cases++;
}
if (updateShop) {
  const file=path.join(__dirname,'_test_menu_screens_equiv.cjs');
  const src=fs.readFileSync(file,'utf8');
  const body=JSON.stringify(SHOP_BASELINE,null,2).split('\n').map((l,i)=>i?' '+l:l).join('\n');
  fs.writeFileSync(file,src.replace(/\/\* SHOP_HASHES_START \*\/[\s\S]*?\/\* SHOP_HASHES_END \*\//,'/* SHOP_HASHES_START */ '+body+' /* SHOP_HASHES_END */'));
  console.log('shop baseline updated: '+Object.keys(SHOP_BASELINE).length+' cases');
}
 for(const gold of [0,999,123456789]) for(const testProfile of [false,true]) {
  const s={gold,diamond:gold,testProfile};
  assert.strictEqual(record(Before,'_menuHeader',s),record(After,'_menuHeader',s),'header');cases++;
 }
} finally {Date.now=realNow;}
console.log('PASS '+cases+' menu states: canvas commands, styles, gradients, texts and hit rectangles match fixed baseline 7331c49; input unchanged');
