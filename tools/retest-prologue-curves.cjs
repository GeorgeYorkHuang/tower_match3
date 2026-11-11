/** 独立曲线原生战斗抽样：已建满塔起步、2秒一消，无局外养成/商店/圣遗物/复活。 */
'use strict';
const fs=require('fs');
const path=require('path');
const fixture=require('./moving-battle-fixture.cjs');
const PLAN=require('../js/config/prologue.js');
const CONFIG=require('../js/config.js');
const cases=[
 [PLAN.order[0],['fire','ice'],41],
 [PLAN.order[0],['ice','poison'],73],
 [PLAN.order[0],['fire','poison'],101],
 [PLAN.order[1],['fire','ice','poison'],41],
 [PLAN.order[1],['fire','poison','cannon'],73],
 [PLAN.order[1],['ice','poison','cannon'],101],
];
const results=[];
try{
 for(let i=0;i<cases.length;i++){
  const [id,keys,seed]=cases[i],profile='prologue_curve_'+i;fixture.profiles[profile]=keys;
  const born=new WeakMap(),bossLifetimes=[];
  const result=fixture.collect({field:id,profile,seed,cadence:2,maxWave:PLAN.chapters[id].maxWave,maxSeconds:1200,relics:false,stopAtFirstBreach:true,
   afterSpawnEnemy(g,enemy){if(enemy.isBoss)born.set(enemy,Date.now());},
   configureGame(g){
    g.meta.prologue.tutorials[id]={done:[],skipped:true};require('../js/game/prologue-tutorial.js').cancel(g);
    g.run.lineHp=g.run.lineMaxHp=CONFIG.LINE.hp*g.run.chapter.enemyMultipliers.wallHp;
    const reward=g.onKillReward.bind(g);g.onKillReward=enemy=>{
      if(enemy.isBoss&&born.has(enemy))bossLifetimes.push({wave:enemy.waveNo,seconds:Math.round((Date.now()-born.get(enemy))/1000)});
      return reward(enemy);
    };
   }});
  const summary={id,keys,seed,terminal:result.terminal,wave:result.wave,seconds:Math.round(result.seconds),wallHp:Math.round(result.wallHp),wallMax:result.wallMax,levels:result.levels,
   firstFullSkillsWave:result.upgrades.find((upgrade,index)=>index===8)?.wave||null,
   bossLifetimes,bossWaveSeconds:result.waves.filter(w=>w.wave%5===0).map(w=>({wave:w.wave,seconds:Math.round(w.endAt-w.startAt)}))};
  results.push(summary);console.log(JSON.stringify(summary));
 }
 fs.writeFileSync(path.join(__dirname,'../docs/prologue-curve-samples.json'),JSON.stringify({assumptions:'preset full roster; native level1 start; 2s swap cadence; no talents/relics/shop/revive; fixed skill routes; not a player win-rate estimate',results},null,2));
}finally{fixture.restore();}
