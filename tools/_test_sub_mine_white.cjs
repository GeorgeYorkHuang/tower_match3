'use strict';
const assert=require('assert'),vm=require('vm'),path=require('path'),fs=require('fs');
const {createRequire}=require('module');
const root=path.resolve(__dirname,'..'),file=path.join(root,'js/game/render.js'),source=fs.readFileSync(file,'utf8');
const {subBlockGlyph}=require('../js/game/icons/special-blocks.js');
function context(){const log=[],styles={};return {log,ctx:new Proxy({}, {get(t,k){if(k in styles)return styles[k];return (...a)=>log.push([k,...a.map(v=>v&&v.source?v.source:v)]);},set(t,k,v){styles[k]=v;log.push(['set',k,v]);return true;}})};}
const icon=context();subBlockGlyph(icon.ctx,0,0,28);assert(icon.log.some(x=>x[0]==='stroke'));assert(icon.log.filter(x=>x[0]==='set'&&['fillStyle','strokeStyle'].includes(x[1])).every(x=>x[2]==='#ffffff'));assert(!icon.log.some(x=>x[0]==='fillRect'));
let cases=0;
for(const mode of ['ready','oldBase','missing']){
 const box={module:{exports:{}},require:createRequire(file),console,wx:{createImage:()=>({width:0,height:128,set src(v){this.source=v;this.width=mode==='ready'||mode==='oldBase'&&v.includes('/board/')?128:0;}})}};
 vm.runInNewContext(source,box);const renderer=Object.create(box.module.exports.Renderer.prototype);
 for(const c of ['red','blue','green','yellow','purple','orange']){
  const {ctx,log}=context(),piece={s:'split',sub:true,c},original=JSON.stringify(piece);
  renderer.drawCell(ctx,10,20,60,piece,0,0,null);
  assert.equal(JSON.stringify(piece),original);assert(log.some(x=>x[0]==='set'&&x[1]==='strokeStyle'&&x[2]==='#ffffff'));
  assert(!log.some(x=>x[0]==='drawImage'&&typeof x[1]==='string'&&x[1].endsWith('/sub.png')));
  if(mode==='ready')assert(log.some(x=>x[0]==='drawImage'&&x[1]==='assets/images/board2/base_'+c+'.png'));
  assert(log.some(x=>x[0]==='scale'&&x[1]===(mode==='missing'?28:28)/36));cases++;
 }
}
console.log('PASS '+cases+' child-mine drawing cases: white glyph, source-colored base, half-cell centering and ready/old-base/missing-image paths');
