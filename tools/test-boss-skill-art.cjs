'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const Atlas=require('../js/game/fx/boss-skill-atlas.js');
const Skall=require('../js/game/fx/boss-skall.js');
const Twins=require('../js/game/fx/boss-expansion-twins.js');
const calls=[];let depth=0;
const ctx=new Proxy({globalAlpha:1,save(){depth++},restore(){depth--},drawImage(...a){calls.push(a)},createLinearGradient(){return {addColorStop(){}}}}, {get:(o,k)=>k in o?o[k]:()=>{}});
for(const [name,n] of Object.entries(Atlas.FRAMES)){
 const p='assets/images/monsters/bosses/expansion/'+name+'-v1.png',b=fs.readFileSync(p);
 assert.equal(b.readUInt32BE(16),n*128);assert.equal(b.readUInt32BE(20),128);
 for(const f of [-1,0,n-1,n+1]){calls.length=0;Atlas.draw(ctx,()=>({width:n*128,height:128}),name,f,0,0,100);assert.equal(calls[0][3],128);assert.ok(calls[0][1]>=0&&calls[0][1]<=128*(n-1));assert.equal(depth,0);}
 assert.equal(Atlas.draw(ctx,()=>null,name,0,0,0,100),false);
}
const sprites=[];
const boss={hp:100,maxHp:100,bossName:'test',isFinalBoss:true};
const q={id:'frost_skall',elapsed:0,freezeTargets:['fire'],frozenUntil:{},windUntil:0};
const g={run:{bossEncounter:q,bossEnemy:boss,bossLock:true},ly:{areaY:72,entryH:68},combat:{towerMuzzle:()=>({x:300,y:1000})},renderer:{bossSkillSprite(...a){sprites.push(a);return true;}}};
function render(t){q.elapsed=t;const before=JSON.stringify(q);sprites.length=0;Skall.draw(ctx,g);assert.equal(JSON.stringify(q),before);assert.equal(depth,0);return sprites[0];}
assert.equal(render(0)[2],0);q.freezeTargets=[];q.frozenUntil.fire=5;
assert.equal(render(1.1)[2],1);assert.equal(render(2)[2],2);assert.equal(render(5.2)[1],'skar-shellbreak');assert.equal(render(5.6),undefined);
q.id='lava_twins';q.elapsed=10;q.phase=2;q.members=[{id:1,hp:100,maxHp:100,x:300,y:450,bossTwinIndex:1}];q.resonanceStacks=2;q.timeoutVisual={at:9.8,id:1};q.fissionVisual={at:9.8,duration:.5,x:375,y:450};
const before=JSON.stringify(q);Twins.draw(ctx,g);Twins.draw(ctx,g);assert.equal(JSON.stringify(q),before);assert.equal(depth,0);
console.log('PASS skill atlas bounds, missing-image fallback, freeze state sequence, repeated paused draw, read-only state, balanced canvas');
