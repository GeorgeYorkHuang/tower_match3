'use strict';
const CONFIG=require('../config.js');
function sync(game){
 const run=game.run,bonus=game.meta.relicBonus(),oldMax=run.lineMaxHp||CONFIG.LINE.hp;
 const max=Math.round(CONFIG.LINE.hp*(1+.10*bonus.wall)*(1+run.relicNum('s_sr_cm_wall')/100));
 const delta=max-oldMax;
 run.lineMaxHp=max;
 // 新增的容量同步补入当前生命，保留已经承受的伤害；不复活已失守防线。
 run.lineHp=run.lineHp>0?Math.min(max,Math.max(0,run.lineHp+delta)):0;
 if(Number.isFinite(run._waveStartHp))run._waveStartHp=Math.max(0,run._waveStartHp+delta);
 return delta;
}
module.exports={sync};
