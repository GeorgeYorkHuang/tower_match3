'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm'),CONFIG=require('../js/config.js');
function method(file,name,scope){const s=fs.readFileSync(file,'utf8'),a=s.indexOf('  '+name+'('),b=s.indexOf('\n  }',a)+4;return vm.runInNewContext('({'+s.slice(a,b)+'}).'+name,scope);}
const build=method('js/game/main.js','_buildRelicCards',{CONFIG});const ids=Object.keys(CONFIG.RELIC_RARITY||{});
// Use actual known relic definitions and deliberately mismatched whole-card inventory.
const detail={fire_seed:7,ice_spike:3,can_heavy:0};const host={battleRelics:[{id:'can_heavy'}],meta:{starOf:()=>1}};
const cards=build.call(host,detail);assert.equal(cards.length,2);assert.equal(cards.find(c=>c.id==='fire_seed').shards,7);assert(!cards.some(c=>c.shards===0));assert.equal(detail.fire_seed,7);
const texts=[],rects=[],icons=[];const loot=method('js/game/render.js','_goLoot',{CONFIG,text:(ctx,str,...args)=>texts.push([str,...args]),fillRoundRect:(ctx,...args)=>rects.push(args),strokeRoundRect:()=>{}});
const ctx={beginPath(){},moveTo(){},lineTo(){},stroke(){}};const renderer={_goPh:()=>1,_goIcon:(ctx,id,x,y,size)=>icons.push({id,x,y,size})};
const many=Object.fromEntries(Array.from({length:12},(_,i)=>['test_'+i,i+1]));loot.call(renderer,ctx,{shardDetail:many,relicCards:[{id:'wrong',shards:0}]},99999);
assert.equal(icons.length,12);assert.equal(rects.length,12);assert.equal(new Set(rects.slice(0,5).map(r=>r[1])).size,1);assert(rects[5][1]>rects[0][1]);assert(rects[10][1]>rects[5][1]);assert(texts.some(t=>t[0]==='收益 12 张'));assert(!texts.some(t=>t[0]==='收益 0 张'));assert(rects.every(r=>r[1]+r[3]+30<=960));
console.log('PASS fragment detail is authoritative, positive counts only, 5-column/3-row layout, quantity outside cards and bill-area clearance');
