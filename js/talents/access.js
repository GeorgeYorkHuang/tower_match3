'use strict';
const Cards=require('../config/talents.js').cards;
const Model=require('./model.js');
function unlocked(meta){return !!meta && Cards.some(card=>Model.owned(meta,card.id)>0);}
module.exports={unlocked,message:'解锁至少1件红色圣遗物后开启天赋'};
