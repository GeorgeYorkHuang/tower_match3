/** Boss塔区告警和入场震动。状态属于当局，绘制不影响索敌或伤害。 */
'use strict';
const CONFIG=require('../../config.js');
const BOSSES=require('../../config/bosses.js');
const {fillRoundRect,strokeRoundRect,text}=require('../ui.js');
function wave(game){
 const number=game.run.wave;
 if(number<5||number%5){game.bossHint=null;return;}
 const planned=(game.wave.plan||[]).find(enemy=>enemy.isBoss);
 const boss=planned&&BOSSES[planned.bossId];
 game.bossHint={wave:number,name:boss?boss.name:'圣坛蔓钟',major:number===20,until:Date.now()+4000};
}
function enter(game,enemy){
 if(game.run.wave!==20)return;
 const seen=game.run._bossEntranceSeen||(game.run._bossEntranceSeen={});
 const key=game.run.wave+':'+(enemy.bossId||'miniboss_bell');
 if(seen[key])return;
 seen[key]=true;
 game.bossHint={wave:20,name:enemy.bossName||'圣坛蔓钟',major:true,until:Date.now()+4500};
 game.run.bossEntranceShake={at:game.animClock||0,duration:650,amplitude:9};
}
function shake(game){
 const effect=game.run.bossEntranceShake;
 if(!effect)return {x:0,y:0};
 const elapsed=(game.animClock||0)-effect.at;
 if(elapsed<0||elapsed>=effect.duration)return {x:0,y:0};
 const amount=effect.amplitude*(1-elapsed/effect.duration);
 return {x:Math.sin(elapsed*.075)*amount,y:Math.cos(elapsed*.094)*amount*.65};
}
function draw(ctx,hint,rowY,now=Date.now()){
 if(!hint||now>=hint.until)return;
 const major=hint.major,w=major?500:360,h=major?88:62,x=(CONFIG.DESIGN.W-w)/2,y=rowY+6;
 ctx.save();
 fillRoundRect(ctx,x,y,w,h,12,major?'rgba(58,15,19,0.95)':'rgba(43,20,20,0.92)');
 strokeRoundRect(ctx,x,y,w,h,12,major?'#ffd681':'#e9aa7b',major?3:2);
 const pulse=.55+.35*Math.sin(now/130);
 fillRoundRect(ctx,x+8,y+12,5,h-24,2,major?'rgba(255,93,77,'+pulse+')':'#d87059');
 text(ctx,'第'+hint.wave+'波 · BOSS来袭',375,y+(major?23:18),major?20:17,'#ffbd99','center');
 text(ctx,hint.name||'BOSS',375,y+(major?59:43),major?29:23,'#fff0c2','center');
 ctx.restore();
}
module.exports={wave,enter,shake,draw};
