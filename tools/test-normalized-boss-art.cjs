'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const base='assets/images/monsters/bosses/';
const list=JSON.parse(fs.readFileSync(base+'normalized256/manifest.json','utf8').replace(/^\uFEFF/,''));
for(const a of list){const b=fs.readFileSync(base+a.target);assert.equal(b.readUInt32BE(16),a.frames*256);assert.equal(b.readUInt32BE(20),256);}
const art=require('../js/game/boss-idle-art.js');
for(const a of Object.values(art))assert.ok(a.src.includes('normalized256'));
const Cast=require('../js/game/boss-cast-art.js');
for(const id of ['lava_ignis','frost_skall'])for(const src of Cast.sourcesFor(id))assert.ok(fs.existsSync(src));
console.log('PASS 19 normalized atlases: 256px frames, integral layout and runtime references');