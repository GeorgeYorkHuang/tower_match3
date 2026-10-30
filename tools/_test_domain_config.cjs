'use strict';
const assert = require('assert');
const config = require('../js/config.js');
const modules = ['monsters','towers','skills','relics'].map(name=>require('../js/config/'+name+'.js'));
const queries = require('../js/relics/queries.js');
const keys = new Set();
for(const domain of modules.concat([queries])) {
  for(const key of Object.keys(domain)) {
    assert(!keys.has(key),'Duplicate domain export: '+key);keys.add(key);
    assert.strictEqual(config[key],domain[key],'Facade must keep one definition reference: '+key);
  }
}
assert.deepStrictEqual(Object.keys(config.TOWERS).sort(),Object.keys(config.EFFECT_POOLS).sort());
const relics=Object.values(config.RELIC_RUN.tower).flat().concat(config.RELIC_RUN.common);
assert.strictEqual(new Set(relics.map(r=>r.id)).size,relics.length,'Relic IDs must be unique');
for(const r of relics) {
  assert.strictEqual(config.relicDef(r.id),r);
  assert.strictEqual(config.relicRunDef(r.id),r);
  assert(['r','sr','ssr'].includes(config.relicRarity(r.id)));
  assert(Number.isFinite(config.relicNum(r.id,1)));
}
for(const [tower,skills] of Object.entries(config.EFFECT_POOLS)) {
  assert.strictEqual(new Set(skills.map(s=>s.name)).size,skills.length,tower);
}
for(const wave of [1,5,10,40,84,100]) {
  assert(config.ENEMY.waveTotalHp(wave,1)>0);
  assert(config.ENEMY.mainLevel(wave)>0);
}
const {Meta}=require('../js/meta.js');
const {Run}=require('../js/run.js');
const ma=new Meta(),mb=new Meta();
ma.relicStars[relics[0].id]=3; assert.strictEqual(mb.relicStars[relics[0].id],undefined);
ma.matchSkills.match4='cross';assert.notStrictEqual(mb.matchSkills.match4,'cross');
const ra=new Run({difficulty:4}),rb=new Run({difficulty:4});
assert.notStrictEqual(ra.board.grid,rb.board.grid);
ra.board.grid[0][0]='private';assert.notStrictEqual(rb.board.grid[0][0],'private');
const sharedBefore=JSON.stringify(config.TOWERS);
const ta=ra.effects.tower('fire'),tb=rb.effects.tower('fire');
ta.energy=123;assert.notStrictEqual(tb.energy,123);
assert.strictEqual(JSON.stringify(config.TOWERS),sharedBefore);
for(const name of ['monsters','towers','skills','relics']) {
 const module=require.cache[require.resolve('../js/config/'+name+'.js')];
 assert(!module.children.some(c=>c.filename===require.resolve('../js/config.js')),'Circular config import: '+name);
}
console.log('PASS domain exports, shared definition references, relic queries, wave rules, independent profile/run state and no reverse config imports');
