/** 后两地图逐波出生数值、生命预算、投放节奏和作用域隔离回归。 */
'use strict';
const assert=require('assert');
const fixture=require('./moving-battle-fixture.cjs');
const Main=require('../js/game/main.js');
const CONFIG=require('../js/config.js');
const Fields=require('../js/config/field-enemies.js');
const Rules=require('../js/field-enemies.js');
const snapshot=JSON.stringify(CONFIG),data=JSON.stringify(Fields);
const close=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function create(field,wave){
  const g=new Main();g.menuStage=field;g.saveData=null;g.save.save=()=>{};g.newRun(false);
  g.run.wave=wave-1;g.wave.start();return g;
}
try{
  let births=0,eliteBirths=0;
  for(const field of ['lava','frost'])for(let wave=1;wave<=60;wave++){
    const g=create(field,wave),p=Fields[field],plan=g.wave.plan.slice();
    assert.equal(plan.length,Rules.count(p,wave));
    close(g.wave.enemyTotalHp,plan.reduce((n,e)=>n+e.hp,0));
    close(g.run.fieldWaveHp,g.wave.enemyTotalHp);assert.equal(g.run.fieldWaveNo,wave);
    while(g.wave.plan.length)g.wave.spawnOne();
    close(g.enemies.reduce((n,e)=>n+e.maxHp,0),g.wave.enemyTotalHp);
    for(const e of g.enemies){
      if(e.isBoss)continue;
      const stat=Rules.stats(p,e.genLv,e.type);
      close(e.maxHp,stat.hp);close(e.armor,stat.armor);close(e.attack,stat.attack);
      close(e.attackInterval,stat.attackInterval);
      close(e.speed,(g.ly.wallY-g.ly.areaY-g.ly.entryH)/CONFIG.WAVE.seconds*stat.speed);
      births++;if(e.type==='elite')eliteBirths++;
    }
  }
  for(const field of ['lava','frost']){
    const g=create(field,50),p=Fields[field],b=p.batch;
    g.wave.tick(b.interval-.01);assert.equal(g.enemies.length,0);
    g.wave.tick(.01);assert(g.enemies.length>=b.min&&g.enemies.length<=b.max);
    const n=g.enemies.length;g.wave.tick(b.interval);assert(g.enemies.length>n);
    if(field==='frost')close(g.wave.interval,3);
    const remaining=g.wave.plan.length;
    g.enemies=Array.from({length:b.aliveLimit},()=>({hp:1}));g.wave.tick(20);
    assert.equal(g.wave.plan.length,remaining,'满场等待，不丢弃计划');
    g.enemies[0].hp=0;g.wave.tick(.01);
    assert.equal(g.enemies.filter(e=>e.hp>0).length,b.aliveLimit);
    assert.equal(g.wave.plan.length,remaining-1,'只填补空位');
  }
  for(const field of ['ancient','abyss','prologue_awakening','prologue_trial','prologue_gate']){
    const g=create(field,1);assert.equal(Rules.ofGame(g),null);
    assert.equal(g.run.fieldWaveHp,undefined);
  }
  assert.equal(JSON.stringify(CONFIG),snapshot);assert.equal(JSON.stringify(Fields),data);
  console.log(`PASS 120 map waves, ${births} ordinary/elite births (${eliteBirths} elite), exact HP budgets, batch/rest/cap without lost spawns, unchanged shared config and other fields.`);
}finally{fixture.restore();}
