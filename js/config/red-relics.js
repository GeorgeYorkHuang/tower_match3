'use strict';
const talents=require('./talents.js');
const fieldByTower={fire:'ancient',poison:'ancient',cannon:'lava',electric:'lava',ice:'frost',boomerang:'frost'};
const legacy={ur_altar_rose:'ur_sanctum_fire',ur_altar_seed:'ur_sanctum_poison',ur_forge_heart:'ur_sanctum_cannon',ur_slag_hammer:'ur_sanctum_electric',ur_frost_eye:'ur_sanctum_ice',ur_wind_lantern:'ur_sanctum_boomerang'};
function cards(field){return talents.cards.filter(c=>!field||fieldByTower[c.tower]===field);}
function fieldOf(id){const card=talents.cards.find(c=>c.id===id);return card?fieldByTower[card.tower]:null;}
module.exports={cards,fieldOf,legacy,finalBossWave:60,fragments:[5,10]};
