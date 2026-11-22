'use strict';
function layers(rule,wave){return !rule||wave<rule.startWave?0:Math.min(rule.cap,Math.floor((wave-rule.startWave)/rule.every)+1);}
function update(run){const f=run.fieldCfg||{};run.heatStacks=layers(f.heatShell,run.wave);run.windStacks=layers(f.windPressure,run.wave);}
function speed(run){const rule=run.fieldCfg&&run.fieldCfg.windPressure;return rule?Math.pow(1+rule.speedPerStack,run.windStacks||0):1;}
function slowDuration(run){const rule=run.fieldCfg&&run.fieldCfg.windPressure;return rule?Math.pow(1-rule.controlDurationPerStack,run.windStacks||0):1;}
function armor(run,e){const rule=run.fieldCfg&&run.fieldCfg.heatShell;if(!rule||e.isBoss||e.isSummon||e.bossSummonId)return;e.armor=Math.min(.85,(e.armor||0)+(run.heatStacks||0)*(e.type==='elite'?rule.eliteArmorPerStack:rule.armorPerStack));}
module.exports={layers,update,speed,slowDuration,armor};
