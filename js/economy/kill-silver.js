'use strict';
const CONFIG=require('../config.js');
function multiplier(run,wave){
 if(run.chapter&&run.chapter.isPrologue)return 1;
 const curve=CONFIG.FIELDS[(run.chapter&&run.chapter.id)||'ancient']?.killSilverCurve;
 if(!curve)return 1;
 const t=Math.max(0,Math.min(1,(wave-curve.startWave)/(curve.endWave-curve.startWave)));
 return 1+(curve.endMultiplier-1)*t;
}
function scale(run,enemy,amount){
 const wave=enemy.waveNo||run.wave||1,mul=multiplier(run,wave);
 if(mul===1)return amount;
 // 按出生波次累计小数，避免每只怪取整放大削减；后续击杀不改变原波收益档位。
 const carry=run._killSilverCarry||(run._killSilverCarry={}),total=(carry[wave]||0)+amount*mul;
 const result=Math.floor(total+1e-9);carry[wave]=total-result;return result;
}
module.exports={multiplier,scale};
