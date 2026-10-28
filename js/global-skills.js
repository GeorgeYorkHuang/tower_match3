const POOL = [
 ['shuffle','全局洗牌','棋盘','打乱棋盘，并触发已学技能齐发。','#ffad58'],
 ['refill','能量补给','辅助','全场已激活塔补充8点能量。','#79e5a4'],
 ['forge','神兵铸就','输出','全塔攻击提升25%，持续12秒。','#ffd36b'],
 ['haste','急速风暴','输出','全塔攻速提升40%，持续10秒。','#72d9ff'],
 ['volley','弹幕齐射','输出','全塔下一次普攻变为三连发，总伤害150%。','#ff967c'],
 ['resonance','元素共鸣','输出','随机3座已激活塔各释放一次已学周期技能。','#bc9bff'],
 ['barrier','铁壁结界','防御','城墙获得1200点护盾，持续至波末。','#86caff'],
 ['heal','圣愈之光','防御','城墙立即回复40%最大血量。','#79e5a4'],
 ['reflect','爆裂反击','防御','8秒内城墙受击时，向攻击者反弹60%伤害。','#ff7d89'],
 ['freeze','时间冻结','控制','全场敌人定身4秒，Boss定身2秒。','#a6e8ff'],
 ['tide','霜寒潮汐','控制','全场敌人减速60%，持续6秒。','#7bbaff'],
 ['pull','虚空牵引','控制','将场上敌人推回出生方向240像素。','#bf91ff'],
 ['chainstorm','连锁风暴','三消','下次有效交换，第2组消除即可触发连消技。','#ffbd75'],
 ['twins','双子印记','三消','下次四消同时遗留两个同类特殊方块。','#e7a5ff'],
 ['charge','元素充能','三消','下次有效消除优先为对应颜色塔、再为另一座塔各补10能量。','#83e4dd'],
 ['gold','黄金浪潮','收益','6秒内击杀获得的局内金币翻倍。','#ffe17c'],
].map(([id,name,category,desc,color],i)=>({id,name,category,desc,color,glyph:i}));
function slots(value) {
 const raw=value&&value.slots || ['shuffle','refill'];
 const result=[];for(let i=0;i<2;i++){const id=raw[i];result.push(POOL.some(d=>d.id===id)&&!result.includes(id)?id:POOL.find(d=>!result.includes(d.id)).id);}return result;
}
function get(id){return POOL.find(d=>d.id===id);}
function tick(run,dt){const s=run.gsState;if(!s)return;for(const k of ['forge','haste','reflect','gold'])s[k]=Math.max(0,(s[k]||0)-dt);if(s.shieldWave!==run.wave){s.shield=0;s.shieldWave=run.wave;}}
function cast(combat,id){
 const g=combat.game,r=g.run,s=r.gsState||(r.gsState={}),def=get(id);if(!def)return false;
 const towers=r.slotOrder.filter(k=>{const t=r.effects.tower(k);return t&&t.level>0;});
 switch(id){
 case 'forge':s.forge=12;break;case 'haste':s.haste=10;break;
 case 'volley':s.volley=Object.fromEntries(towers.map(k=>[k,true]));break;
 case 'resonance':{const pool=towers.slice();for(let n=0;n<3&&pool.length;n++){const i=Math.floor((r.rng||Math.random)()*pool.length);combat.castPeriodicNow(pool.splice(i,1)[0]);}break;}
 case 'barrier':s.shield=1200;s.shieldWave=r.wave;break;
 case 'heal':r.lineHp=Math.min(r.lineMaxHp||require('./config.js').LINE.hp,r.lineHp+(r.lineMaxHp||require('./config.js').LINE.hp)*0.4);break;
 case 'reflect':s.reflect=8;break;
 case 'freeze':g.enemies.filter(e=>e.hp>0).forEach(e=>{ e.frozen=Math.max(e.frozen||0,e.isBoss?2:4); });break;
 case 'tide':g.enemies.filter(e=>e.hp>0).forEach(e=>combat.applySlow(e,0.6,6));break;
 case 'pull':g.enemies.filter(e=>e.hp>0).forEach(e=>{e.y=Math.max(g.ly.areaY||0,e.y-240);e.attackT=0;combat.fxRing(e.x,e.y,def.color,35,0.6,3);});break;
 case 'chainstorm':s.chainstorm=true;break;case 'twins':s.twins=true;break;case 'charge':s.charge=true;break;case 'gold':s.gold=6;break;
 default:return false;
 }
 combat.fxFlash(375,800,def.color,0.35);combat.fxRing(375,800,def.color,240,0.5,6);
 if(g.toast)g.toast(def.name+' · 已释放',def.color);return true;
}
module.exports={POOL,get,slots,tick,cast};
