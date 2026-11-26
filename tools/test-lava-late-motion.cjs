'use strict';
const a=require('node:assert/strict'),M=require('../js/game/lava-late-motion.js');
a.deepEqual([0,160,320,480,640,800].map(t=>M.sample(14,t).frame),[0,1,2,1,3,0]);
for(const level of [12,14]){let depth=0,calls=0;const ctx={save(){depth++},restore(){depth--},translate(){},rotate(){},beginPath(){},ellipse(){},clip(){},drawImage(){calls++}};const e={genLv:level},snap=JSON.stringify(e);for(const t of [0,180,540,1000]){a.equal(M.draw(ctx,()=>({width:level===12?1536:1024,height:level===12?1024:256}),e,0,0,100,t),true);a.equal(depth,0);a.equal(JSON.stringify(e),snap)}a.equal(calls,4);a.equal(M.draw(ctx,()=>null,e,0,0,100,0),false)}
console.log('PASS frame order, pause-deterministic motion, balanced stack, read-only entity and missing image fallback');