'use strict';
const assert=require('node:assert/strict');
require('./balance/fixtures/moving-battle-fixture.cjs');
const Main=require('../js/game/main.js'),Test=require('../js/game/flows/test-boss.js');
for(const b of Object.values(Test.defs).filter(b=>b.id&&b.field&&b.wave)){
 const g=new Main();g.testProfile=true;g.save.save=()=>{};g.menuStage='test';g.enterTestField();
 assert.equal(Test.start(g,b.id),true);
 while(g.wave.plan.length&&!g.enemies.some(e=>e.bossId===b.id))g.wave.spawnOne();
 assert.ok(g.enemies.some(e=>e.bossId===b.id),b.id);
 assert.equal(g.state,'testfield');assert.equal(g.menuStage,'test');
 g.update(.1);assert.equal(g.state,'testfield');
 Test.clear(g);assert.equal(g.run.bossEncounter,null);assert.equal(g.wave.plan.length,0);
}
console.log('PASS all selectable Bosses spawn native forms and stay in testfield; clear removes encounter');