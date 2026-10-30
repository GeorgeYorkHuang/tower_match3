'use strict';
const assert=require('assert'),vm=require('vm'),path=require('path');
const {execFileSync}=require('child_process'),{createRequire}=require('module');
const root=path.resolve(__dirname,'..'),box={module:{exports:{}},require:createRequire(path.join(root,'js/run.js')),Math,Date,console};
vm.runInNewContext(execFileSync('git',['show','765f320:js/run.js'],{cwd:root,encoding:'utf8'}),box);
const OldRun=box.module.exports.Run,Run=require('../js/run.js').Run;
function prepare(Ctor,star,random,mode){
 const r=new Ctor({difficulty:6});let rngCalls=0;
 r.rng=()=>{rngCalls++;return random;};r.armory=()=>null;
 r.metaRef={starOf:()=>star};
 for(const id of ['cm_combo','cm_power','cm_triple','cm_ammobox','cm_charge'])r.runRelic[id]=star>0?1:0;
 r._triple3=star===3;r.cmPower3=14.5;r.energyBank=19;r.chargeSkillBoost=40;
 const owned=mode==='new'?[]:['fire','ice','poison','electric'];
 r.slotOrder=owned.slice();r._globalMap={purple:'shuffle',orange:'refill'};
 owned.forEach(k=>{const t=r.effects.tower(k);t.unlock();t.energy=49;});
 r.shuffleAmmo=89;r.refillAmmo=89;
 r.recordedExp=0;r.gainExp=v=>{r.recordedExp+=v;};r.notes=[];r.relicFx=(...args)=>r.notes.push(args);
 r.rngCalls=()=>rngCalls;
 return r;
}
function snapshot(r){return JSON.stringify({
 power:r.cmPower3,bank:r.energyBank,boost:r.chargeSkillBoost,exp:r.recordedExp,
 shuffle:r.shuffleAmmo,refill:r.refillAmmo,slots:r.slotOrder,notes:r.notes,rngCalls:r.rngCalls(),pending:r.pendingPeak,
 towers:Object.keys(r.effects.towers).map(k=>{const t=r.effects.tower(k);return [k,t.level,t.energy,t.pending];})
});}
let cases=0;
for(const star of [0,1,2,3])for(const random of [0.01,0.75])for(const mode of ['new','owned','global'])for(const [shape,size] of [['3',3],['4',4],['5',5]]){
 const a=prepare(OldRun,star,random,mode),b=prepare(Run,star,random,mode);
 const color=mode==='global'?'orange':'red';
 const left=a.applyMatch(color,shape,size),right=b.applyMatch(color,shape,size);
 assert.strictEqual(JSON.stringify(right),JSON.stringify(left));assert.strictEqual(snapshot(b),snapshot(a));
 for(let i=0;i<3;i++)assert.strictEqual(b._chargeAmmo('shuffle',10),a._chargeAmmo('shuffle',10));
 assert.strictEqual(snapshot(b),snapshot(a));assert(b.chargeSkillBoost<=50);assert(b.energyBank<=20);
 cases++;
}
const a=prepare(Run,3,0.01,'owned'),b=prepare(Run,3,0.01,'owned');
const before=snapshot(b);a.applyMatch('red','4',4);assert.strictEqual(snapshot(b),before);
console.log('PASS '+cases+' match/overflow cases equal baseline, including RNG order, exp rounding, caps and independent runs');
