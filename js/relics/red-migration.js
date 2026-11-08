'use strict';
const {legacy}=require('../config/red-relics.js');
function migrate(meta){for(const [oldId,id]of Object.entries(legacy)){const oldStar=Number(meta.relicStars[oldId])||0,owned=oldStar>0||meta.runCodex[oldId]||meta.relics[oldId]||meta.relicLevels[oldId];if(owned){meta.relicStars[id]=Math.max(meta.relicStars[id]||0,Math.min(3,oldStar||1));meta.runCodex[id]=1;}if(meta.shards[oldId])meta.shards[id]=(meta.shards[id]||0)+Math.max(0,Number(meta.shards[oldId])||0);if(meta.relics[oldId])meta.relics[id]=(meta.relics[id]||0)+meta.relics[oldId];if(meta.relicLevels[oldId])meta.relicLevels[id]=Math.max(meta.relicLevels[id]||0,meta.relicLevels[oldId]);for(const table of ['relicStars','runCodex','shards','relics','relicLevels'])delete meta[table][oldId];}
 if(meta.talents&&Array.isArray(meta.talents.slots))meta.talents.slots=meta.talents.slots.map(id=>legacy[id]||id);return meta;}
module.exports={migrate};
