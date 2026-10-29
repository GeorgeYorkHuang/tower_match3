const assert=require('assert');
const balance=require('../js/config/global-balance.js');
const skills=require('../js/global-skills.js');
const {CombatSystem}=require('../js/combat.js');
const c=Object.create(CombatSystem.prototype);
c.game={run:{gsState:{forge:1},effects:{towerDps:()=>100},storeBuff:()=>({atk:0}),wallAtkBonus:()=>0},enemies:[]};
c.relicVal=()=>0;c.relicTowerDmg=()=>0;c.tower=()=>({energy:10});
const original=balance.forge.damageMultiplier;
try { balance.forge.damageMultiplier=2;const changed=c.shotDmg('fire');balance.forge.damageMultiplier=1;const baseline=c.shotDmg('fire');assert.equal(changed,baseline*2);assert(skills.get('forge').desc.includes('0%'));balance.forge.damageMultiplier=2;assert(skills.get('forge').desc.includes('100%')); } finally {balance.forge.damageMultiplier=original;}
assert(require('../js/config/tower-skills.js').fire);
console.log('PASS: changing balance config changes real damage and description together; tower table loads.');
