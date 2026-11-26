'use strict';
const {todayStr}=require('./calendar.js');
const fields=['ancient','lava','frost','abyss'];
function used(data,now){if(!data||data.date!==todayStr(now))return 0;const n=Number(data.used);if(Number.isFinite(n)&&n>=0)return Math.min(2,Math.floor(n));return Math.min(2,fields.reduce((sum,key)=>{const v=Number((data.counts||{})[key]);return sum+(Number.isFinite(v)&&v>0?Math.floor(v):0);},0));}
function status(meta,field,now){const remaining=fields.includes(field)?2-used(meta.dailyFirst,now):0;return{remaining,multiplier:remaining>0?1.5:1};}
function consume(meta,field,now){if(!fields.includes(field))return 1;const n=used(meta.dailyFirst,now);meta.dailyFirst={date:todayStr(now),used:Math.min(2,n+1)};return n<2?1.5:1;}
module.exports={fields,used,status,consume};
