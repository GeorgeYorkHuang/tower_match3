'use strict';
const talents=require('./talents.js');
const SERIES_FIELD={sanctum:'ancient',forge:'lava',gale:'frost'};
function fieldOfCard(card){return card.seriesField||SERIES_FIELD[card.series]||null;}
const legacy={ur_altar_rose:'ur_sanctum_fire',ur_altar_seed:'ur_sanctum_poison',ur_forge_heart:'ur_sanctum_cannon',ur_slag_hammer:'ur_sanctum_electric',ur_frost_eye:'ur_sanctum_ice',ur_wind_lantern:'ur_sanctum_boomerang'};
function cards(field){return talents.cards.filter(c=>!field||fieldOfCard(c)===field);}
function fieldOf(id){const card=talents.cards.find(c=>c.id===id);return card?fieldOfCard(card):null;}
module.exports={cards,fieldOf,legacy,finalBossWave:60,fragments:[3,6],bossDrops:{
  20:{chance:0.5,amounts:[1,2]},
  40:{chance:1,amounts:[1,2,3]},
  // 权重1:2:3:2，均值4.75；整局期望0.75+2+4.75=7.5，与原5–10均匀掉落持平。
  60:{chance:1,amounts:[3,4,4,5,5,5,6,6]}
}};
