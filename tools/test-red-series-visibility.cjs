'use strict';
const assert=require('assert/strict'),T=require('../js/config/talents.js'),Plan=require('../js/config/prologue.js'),Screen=require('../js/game/screens/relics.js');
const ctx=new Proxy({measureText:s=>({width:String(s).length*10}),createLinearGradient:()=>({addColorStop(){}})},{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)});
const screen=Screen.createRelicScreen({drawImg:()=>true,relicIconSrc:()=>'',fmtNum:String,panelShell(){},wrapText:(_,s)=>[s]});
const s={relicSeries:'gale',relicStars:{},runCodex:{},shards:{},fieldClears:{ancient:true},prologue:{cleared:Plan.order.slice()}};
function draw(){const h=[];screen._menuRelicGrid(ctx,s,(key,data)=>h.push({key,data}),'relicPage',false);return h;}
assert.equal(draw().filter(h=>h.key==='relicFieldLocked').length,6);
const id=T.cards.find(c=>c.series==='gale').id;s.relicStars[id]=1;
assert.equal(draw().filter(h=>h.key==='relicFieldLocked').length,5);assert(draw().some(h=>h.key==='relicInfo'&&h.data===id));
s.fieldClears.lava=true;assert.equal(draw().filter(h=>h.key==='relicFieldLocked').length,0);
s.testProfile=true;s.fieldClears={};assert.equal(draw().filter(h=>h.key==='relicFieldLocked').length,0);
console.log('PASS locked-series display, owned exemption, clear unlock and test preview');
