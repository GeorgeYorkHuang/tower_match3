/** 第三章首通后的红卡镶嵌引导，只读取真实按钮与装配结果。 */
'use strict';
const Spotlight=require('./spotlight.js'),T=require('../talents/model.js'),Plan=require('../config/prologue.js');
const KEY='tutorial:red-card-v2',BONUS_KEY='tutorial:shared-first-bonus-v1';
function target(g){
 if(g.state!=='menu'||g.testProfile)return null;
 const p=g.meta.prologue;if(!p||!p.cleared.includes(Plan.order[2]))return null;
 const seen=g.meta.unlockGuideSeen||{};
 if(!seen[BONUS_KEY]&&!g.menuPanel)return{red:true,bonus:true,info:true,title:'正式战场共享首次奖励',body:'每天前2局正式战斗，深度金币收益×1.5。所有正式战场共享这2次机会，切换战场不会重置。第一至第三章教学关卡不享受、也不消耗次数；正式开局时消耗，每天重置。进入战斗按钮右上角的白色感叹号可查看剩余次数。'};
 if(seen[KEY]||!p.redGiftId)return null;
 const card=T.get(p.redGiftId);if(!card||T.owned(g.meta,card.id)<1)return null;
 const hits=g.menuHits||[],panel=g.menuPanel;let hit,title,body;
 if(T.normalize(g.meta).slots.includes(card.id))return{red:true,info:true,title:'红卡覆盖与星级',body:'红卡已镶嵌，覆盖的天赋点会在后续战斗中生效。★覆盖4格，★★覆盖8格，★★★覆盖12格；★★与★★★还可激活对应紫、金天赋。点击天赋点或红卡可查看实际加成。'};
 if(g.menuTab!=='talent'&&!panel){hit=hits.find(h=>h.key==='tab'&&h.data==='talent');title='领取首张红卡';body='第三章首通奖励「'+card.name+'」已放入背包。点击天赋入口，学习镶嵌红卡。';}
 else if(g.menuTab==='talent'&&!panel){hit=hits.find(h=>h.key==='talentSlot'&&h.data===card.nativeSlot);title='选择对应塔的红卡槽';body='每张红卡只能镶嵌在对应塔的原生槽位。点击高亮凹槽，选择刚获得的红卡。';}
 else if(panel&&panel.type==='talentPicker'&&panel.slot===card.nativeSlot){hit=hits.find(h=>h.key==='talentEquip'&&h.data.id===card.id);title='选择首通红卡';body='点击这张红卡的「预览替换」，查看镶嵌前后的覆盖与属性变化。';}
 else if(panel&&panel.type==='talentPreview'&&panel.id===card.id){hit=hits.find(h=>h.key==='talentConfirm');title='确认红卡镶嵌';body='确认预览中的覆盖范围与加成，再点击高亮按钮完成镶嵌。';}
 return hit&&hit.rect?{red:true,hit,title,body}:null;
}
function finish(g,active){const seen=g.meta.unlockGuideSeen||(g.meta.unlockGuideSeen={});if(active.bonus)seen[BONUS_KEY]=true;else{seen[KEY]=true;seen['feature:talent']=true;}g.save.save();}
function draw(ctx,g,active){g._redCardGuide=Spotlight.draw(ctx,active.hit?[active.hit.rect]:[],active.title,active.body,active.info?'我知道了':'结束引导');}
function tap(g,p,active){const overlay=g._redCardGuide;if(overlay&&Spotlight.inside(p,overlay.skip)){finish(g,active);g._redCardGuide=null;return true;}if(active.info)return true;return !Spotlight.inside(p,active.hit.rect);}
module.exports={KEY,BONUS_KEY,target,draw,tap};
