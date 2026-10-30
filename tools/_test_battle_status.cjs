'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync('js/game/render.js','utf8');
for(const wave of [1,20,40,60])for(const xp of [0,0.5,1]){
 const texts=[],arcs=[],bars=[],images=[];
 const ctx=new Proxy({arc:(...a)=>arcs.push(a)},{get:(o,k)=>o[k]||(()=>{})});
 const scope={drawImg:(ctx,path,...args)=>{images.push(args);return true;},IMG_SRC:{silver:'coin'},fmtNum:String,text:(ctx,...args)=>texts.push(args),progressBar:(ctx,...args)=>bars.push(args),STATUS_H:140,AREA_X:25,AREA_Y:140,AREA_W:700,ENTRY_H:68,fillRoundRect(){},strokeRoundRect(){},relicIconSrc:()=>null};
 function get(name){const a=src.indexOf('  '+name+'('),b=src.indexOf('\n  }',a)+4;return vm.runInNewContext('({'+src.slice(a,b)+'}).'+name,scope);}
 const host={},state={gold:123,wave,expLevel:7,expRatio:xp,battleRelics:[{id:'test',icon:'R'}]};
 get('status').call(host,ctx,state);assert.equal(bars.length,0);assert.equal(texts.filter(a=>a[0]==='7').length,0);
 get('entryStatus').call(host,ctx,state);
 assert(images.some(a=>a[0]===18&&a[1]===70));assert(texts.some(a=>a[0]==='7'&&a[4]==='#111111'));
 const circle=arcs.find(a=>a[2]===28),bar=bars[0];assert.equal(bar[4],(wave-1)/59);assert(bar[1]+bar[3]<circle[1]);assert.equal(circle[0]-30,25);assert.equal(bar[0]+bar[2],725);assert.equal((2*30)+(bar[0]-(circle[0]+30))+bar[2],700);
 assert(host.relicBarHit.y>=140);assert(host.relicBarHit.y+host.relicBarHit.h<=208);
 assert(texts.some(a=>a[0]==='20波Boss'));assert(texts.some(a=>a[0]==='40波Boss'));assert(texts.some(a=>a[0]==='终极60'));assert(!texts.some(a=>/协同|整体经验|敌人/.test(a[0])));
 if(xp){const ring=arcs.find(a=>a[2]===28&&a[3]===-Math.PI/2);assert.equal(ring[4],-Math.PI/2+Math.PI*2*xp);assert.equal(ring[5],false);}
}
const action=src.slice(src.indexOf('  actionArea('),src.indexOf('  wall('));assert(!action.includes('s.enemyCount'));assert(!action.includes('s.enemyHpRatio'));assert(!action.includes('s.hasBoss'));
console.log('PASS 12 entrance HUD layouts: full 700px width, clockwise XP, wave markers, coin unchanged, relocated relic hit area, no enemy counter/group bar/BOSS warning');
