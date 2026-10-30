'use strict';
const assert=require('assert'),fs=require('fs'),C=require('../js/config.js'),{WaveDirector}=require('../js/wave.js');
let report='# 小怪1—60波实际投放与数值验算\n\n数量保留当前低增长公式；总血含常规Boss/精英，压力按计划每只hp×该代设计spd计算（非实际速度/有效护甲压力）。专属Boss锁关尚未接入，20/40/60仍为常规波，不能当作最终Boss战预算。\n\n|波|总数|普通|精英|Boss|普通代际数量|总血|压力|环比|\n|---|---|---|---|---|---|---|---|---|\n',previous=0;
for(let w=1;w<=60;w++){
 const director=new WaveDirector({run:{wave:w,curseStacks:0}},{});director.buildPlan();const p=director.plan,counts={};p.filter(e=>!e.isBoss&&e.type!=='elite').forEach(e=>counts[e.lv]=(counts[e.lv]||0)+1);
 assert.equal(p.length,C.ENEMY.countForWave(w));assert.equal(p.reduce((n,e)=>n+e.hp,0),C.ENEMY.waveTotalHp(w,1));assert(p.every(e=>e.lv>=1&&e.lv<=14));
 const pressure=p.reduce((n,e)=>n+e.hp*C.ENEMY.levelOf(e.lv).spd,0),hp=p.reduce((n,e)=>n+e.hp,0);
 report+=`|${w}|${p.length}|${Object.values(counts).reduce((a,b)=>a+b,0)}|${p.filter(e=>e.type==='elite').length}|${p.filter(e=>e.isBoss).length}|${Object.entries(counts).map(([lv,n])=>'Lv'+lv+'×'+n).join(' / ')}|${hp}|${pressure.toFixed(1)}|${previous?((pressure/previous-1)*100).toFixed(1)+'%':'—'}|\n`;previous=pressure;
 const curse=new WaveDirector({run:{wave:w,curseStacks:2}},{});curse.buildPlan();assert(Math.abs(curse.plan.reduce((n,e)=>n+e.hp,0)-C.ENEMY.waveTotalHp(w,1.15**2))<1e-5);
}
assert.equal(C.ENEMY.levelOf(14).hp,1560);assert.deepEqual(C.ENEMY.levelMix(41),[9,9,9,10,11]);assert.deepEqual(C.ENEMY.levelMix(60),[13,13,13,14,14]);
fs.writeFileSync('docs/小怪1-60波实际投放验算.md',report);console.log('PASS 60 actual wave plans, exact HP accounting, generation bounds and abyss curse totals; generated count/HP/pressure report');
