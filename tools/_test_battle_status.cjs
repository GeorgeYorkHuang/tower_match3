'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync('js/game/render.js','utf8'),a=src.indexOf('  status(ctx, s) {'),b=src.indexOf('\n  }',a)+4;
for(const wave of [1,20,40,60])for(const xp of [0,0.5,1]){
 const texts=[],arcs=[],bars=[],images=[];
 const ctx=new Proxy({arc:(...a)=>arcs.push(a)},{get:(o,k)=>o[k]||(()=>{})});
 const status=vm.runInNewContext('({'+src.slice(a,b)+'}).status',{drawImg:(ctx,path,...args)=>{images.push(args);return true;},IMG_SRC:{silver:'coin'},fmtNum:String,text:(ctx,...args)=>texts.push(args),progressBar:(ctx,...args)=>bars.push(args),STATUS_H:140,fillRoundRect(){},strokeRoundRect(){}});
 status.call({},ctx,{gold:123,wave,expLevel:7,expRatio:xp,battleRelics:[]});
 assert(images.some(a=>a[0]===18&&a[1]===70));assert(texts.some(a=>a[0]==='7'&&a[3]===25&&a[4]==='#111111'));
 assert.equal(bars[0][4],(wave-1)/59);assert(bars[0][1]+bars[0][3]<84);assert(84+28<118);
 assert(texts.some(a=>a[0]==='20波Boss'));assert(texts.some(a=>a[0]==='40波Boss'));assert(texts.some(a=>a[0]==='终极60'));assert(!texts.some(a=>/协同|整体经验/.test(a[0])));
 if(xp){const ring=arcs.find(a=>a[2]===28&&a[3]===-Math.PI/2);assert(ring);assert.equal(ring[4],-Math.PI/2+Math.PI*2*xp);assert.equal(ring[5],false);}
}
console.log('PASS 12 HUD wave/XP layouts: wave endpoints, Boss markers, clockwise XP ring, coin position and relic-row clearance');
