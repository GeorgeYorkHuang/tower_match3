'use strict';
const assert=require('assert'),vm=require('vm'),path=require('path');
const {execFileSync}=require('child_process'),{createRequire}=require('module');
const root=path.resolve(__dirname,'..'),box={module:{exports:{}},require:createRequire(path.join(root,'js/global-skills.js')),Math};
vm.runInNewContext(execFileSync('git',['show','1b72edb:js/global-skills.js'],{cwd:root,encoding:'utf8'}),box);
const old=box.module.exports,current=require('../js/global-skills.js');
assert.strictEqual(current.POOL,require('../js/skills/global-catalog.js').POOL);
assert.strictEqual(current.get,require('../js/skills/global-catalog.js').get);
assert.strictEqual(current.slots,require('../js/skills/global-loadout.js').slots);
assert.strictEqual(JSON.stringify(current.POOL),JSON.stringify(old.POOL));
let cases=0;
for(const value of [undefined,null,{},[],{slots:[]},{slots:['heal']},{slots:['forge','forge']},{slots:['invalid','heal']},{slots:['gold','charge','freeze']}]){
 const result=current.slots(value);assert.strictEqual(JSON.stringify(result),JSON.stringify(old.slots(value)));
 assert.strictEqual(result.length,2);assert.notStrictEqual(result[0],result[1]);cases++;
}
function mock(){
 const calls=[];const run={wave:8,lineHp:900,lineMaxHp:2000,gsState:{forge:2,shield:100,shieldWave:7},slotOrder:['fire','ice','poison','electric','cannon','boomerang'],effects:{tower:()=>({level:1})},rng:()=>0.4};
 const game={run,ly:{areaY:100},enemies:[{x:20,y:300,hp:100,frozen:1},{x:40,y:400,hp:200,isBoss:true},{x:60,y:500,hp:0}],toast:(...args)=>calls.push(['toast',...args])};
 const c={game,castPeriodicNow:(...args)=>calls.push(['periodic',...args]),applySlow:(e,...args)=>calls.push(['slow',e.x,...args]),fxRing:(...args)=>calls.push(['ring',...args]),fxFlash:(...args)=>calls.push(['flash',...args])};
 return {c,calls};
}
for(const id of current.POOL.map(d=>d.id).concat(['invalid'])){
 const a=mock(),b=mock();assert.strictEqual(current.cast(b.c,id),old.cast(a.c,id),id);
 assert.strictEqual(JSON.stringify(b),JSON.stringify(a),id+' effects');cases++;
}
for(const dt of [0,0.5,3,99])for(const wave of [7,8]){
 const a=mock().c.game.run,b=mock().c.game.run;a.wave=b.wave=wave;
 old.tick(a,dt);current.tick(b,dt);assert.strictEqual(JSON.stringify(b),JSON.stringify(a));cases++;
}
const a=mock(),b=mock();current.cast(a.c,'forge');assert.strictEqual(b.c.game.run.gsState.forge,2);
const slots=current.slots({slots:['forge','heal']});slots[0]='gold';assert.strictEqual(current.get('forge').id,'forge');
const balance=require('../js/config/global-balance.js'),before=balance.forge.duration;
try{balance.forge.duration=23;assert(current.get('forge').desc.includes('23'));current.cast(a.c,'forge');assert.strictEqual(a.c.game.run.gsState.forge,23);}finally{balance.forge.duration=before;}
console.log('PASS '+cases+' catalog/loadout/runtime cases equal baseline; state and selected arrays isolated; descriptions and casts follow balance config');
