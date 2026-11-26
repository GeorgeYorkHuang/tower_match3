'use strict';
const PLAN=require('../config/prologue.js'),Prologue=require('../prologue.js'),Spotlight=require('./spotlight.js'),Cards=require('../tower-cards.js');
const VERSION=2;
const lessons={
 [PLAN.order[0]]:[
  {id:'draw_cards',wave:1,title:'抽取塔卡',body:'点击抽卡，每次获得三张卡。前3次免费，之后每次消耗50银币；击杀怪物和完成波次可获得银币。',event:'cardDraw'},
  {id:'build_card',wave:1,title:'拖动卡片建塔',body:'把塔卡拖到上方防御区，建造对应的塔。塔会自动攻击，初始能量为50加上这张卡的能量。本章最多建造两种塔。',owned:1},
  {id:'card_energy',wave:1,title:'同类塔卡补充能量',body:'将同类塔卡拖到防御区，为已建塔充能。★／★★／★★★分别提供5／20／80能量。低能量会降低攻击效率。满塔位后，未建造塔的卡片会为缺能的已建塔分摊充能。',acknowledge:true,needsTowers:1},
  {id:'first_skill',wave:1,title:'升级选择塔技能',body:'击杀和波末奖励积累经验，升级后从实际候选中选择一项塔技能。本章可以学习技能，暂不开启技能分支。',event:'skill'},
  {id:'second_card',wave:2,title:'补齐两座防御塔',body:'继续抽卡，将另一种塔卡拖到防御区，补齐第二座塔。选定阵容后，同类卡用于充能，其余卡用于辅助供能。',owned:2},
  {id:'merge_cards',wave:3,title:'保留同类卡进行合成',body:'卡槽中三张相同的★卡自动合成★★，三张相同的★★卡自动合成★★★。能量充足时可以留卡合成，也可拖动卡片调整卡槽位置。',acknowledge:true},
  {id:'quality_boost',wave:5,title:'高星卡提升本局攻击',body:'★★卡用于对应塔，额外增加3%攻击；★★★卡增加10%攻击，并获得60秒双倍攻击。本局每塔累计攻击加成上限30%，重复使用★★★会刷新双倍攻击时间。',acknowledge:true}
 ],
 [PLAN.order[1]]:[
  {id:'branch_card',wave:1,title:'选择技能分支',body:'本章开启技能分支。每个技能在本局只能选择A／B／C中的一条路线；选定后，可继续升级这条分支。点击高亮候选完成选择。',event:'branch'},
  {id:'third_card',wave:3,title:'扩充到三座防御塔',body:'本章开放三处塔位。抽取本章允许的卡片，拖到防御区补齐阵容，再通过同类卡充能和合成增强输出。',owned:3},
  {id:'global_cards',wave:5,title:'全局技能与充能',body:'全局技能现已开放。满塔位后，未选中的塔卡会为对应的全局技能充能；已建塔的同类卡只给该塔充能。一张卡不会同时全额充入两个全局技能。充满后点击对应按钮释放。',acknowledge:true,target:'global'},
  {id:'silver_shop',wave:8,title:'银币与战地商店',body:'击杀和波末获得的银币可用于抽卡，也可在战地商店购买补给。先保证建塔和充能，再按需要购买强化。',acknowledge:true,target:'shop'}
 ],
 [PLAN.order[2]]:[
  {id:'fourth_card',wave:2,title:'四塔协同作战',body:'本章最多建造四种塔。结合已学会的技能分支与卡片合成，搭配输出和控制，留意各塔能量。',acknowledge:true},
  {id:'relic',wave:5,title:'点击宝箱选择圣遗物',body:'本章开启圣遗物。点击战场掉落的宝箱，从三项候选中选择一件；获得后会飞到战场左上角。先确认说明即可继续战斗，不要求立即开箱。',acknowledge:true,target:'relic'},
  {id:'rarities',wave:10,title:'按构筑选择圣遗物',body:'蓝色圣遗物可以重复获取叠加；紫色和金色在本局各件只能获取一次。优先选择适合当前塔和技能的效果，点击左上角图标可查看已获得效果。',acknowledge:true}
 ]
};
function isChapter(g){return g.state==='menu'?!!Prologue.chapter(g.menuStage):!!(g.run&&g.run.chapter&&g.run.chapter.isPrologue);}
function persist(g){if(g.save)g.save.save();}
function cancel(g){const s=g._prologueTutorial;if(s&&s.previousGlobal!=null)(s.run||g.run).globalSlots[0]=s.previousGlobal;if(g.run)delete g.run._tutorialChoiceType;g._prologueTutorial=null;}
function begin(g){cancel(g);if(!isChapter(g)||g.testProfile||!g.meta)return;const id=g.run.chapter.id,p=g.meta.prologue||(g.meta.prologue=Prologue.initialProgress()),all=p.tutorials||(p.tutorials={});let saved=all[id]||(all[id]={done:[],skipped:false});if(saved.version!==VERSION){saved=all[id]={version:VERSION,done:[],skipped:!!saved.skipped};persist(g);}if(!saved.skipped)g._prologueTutorial={id,run:g.run,saved,current:null,spotlight:null};}
function complete(g){const s=g._prologueTutorial;if(!s||!s.current)return;if(!s.saved.done.includes(s.current.id))s.saved.done.push(s.current.id);s.current=null;s.spotlight=null;persist(g);}
function tick(g){const s=g._prologueTutorial;if(!s||s.run!==g.run||!['fighting','picking','relicpick'].includes(g.state))return false;
 const list=lessons[s.id],group=g.state==='picking'&&g.pickQueue[g.pickIndex];
 const choice=group&&list.find(l=>['skill','branch'].includes(l.event)&&!s.saved.done.includes(l.id)&&group.candidates.some(c=>c.type===l.event));
 if(choice&&s.current!==choice){s.current=choice;s.spotlight=null;}
 if(s.current&&s.current.owned&&g.run.slotOrder.length>=s.current.owned)complete(g);
 if(s.current&&s.current.event==='cardDraw'&&Cards.state(g.run).draws>0)complete(g);
 if(!s.current&&g.state==='fighting'){
  const l=list.find(l=>!s.saved.done.includes(l.id)&&g.run.wave>=l.wave&&!['skill','branch'].includes(l.event)&&(!l.needsTowers||g.run.slotOrder.length>=l.needsTowers));
  if(l){s.current=l;s.spotlight=null;if(l.owned&&g.run.slotOrder.length>=l.owned||l.event==='cardDraw'&&Cards.state(g.run).draws>0)complete(g);}
 }
 return pausesBattle(g);
}
function action(g,event){const s=g._prologueTutorial;if(s&&s.current&&s.current.event===event)complete(g);}
function cardArea(g){const y=g.renderer.ly.boardY;return{x:14,y:y+26,w:722,h:195};}
function defense(g){const l=g.renderer.ly;return{x:14,y:l.slotY,w:722,h:l.slotSize+10};}
function targets(g){const s=g._prologueTutorial,l=s&&s.current;if(!l)return[];
 if(['skill','branch'].includes(l.event)){if(g.state!=='picking')return[];const group=g.pickQueue[g.pickIndex];return group?group.candidates.flatMap((c,i)=>c.type===l.event&&g.pickHits[i]&&g.pickHits[i].cardRect?[g.pickHits[i].cardRect]:[]):[];}
 if(l.event==='cardDraw')return g._cardDrawRect?[g._cardDrawRect]:[];
 if(l.owned)return[cardArea(g),defense(g),...(g._cardDrawRect?[g._cardDrawRect]:[])];
 if(l.target==='global')return g.renderer.globalBtns||[];
 if(l.target==='shop')return(g.renderer.funcHits||[]).filter(b=>b.key==='shop');
 if(l.target==='relic')return(g.fieldChests||[]).filter(c=>!c.hidden).map(c=>({x:c.x-44,y:c.y-44,w:88,h:88}));
 if(l.id==='card_energy')return[cardArea(g)];
 if(['merge_cards','quality_boost'].includes(l.id))return[cardArea(g)];return[];}
function blocked(g){return !!(g.towerInfo||g.towerSkill||g.funcLayer||g.relicDetail||g.shopOpen||g._cardFullPrompt);}
function pausesBattle(g){const s=g._prologueTutorial;return !!(s&&s.current&&g.state==='fighting'&&!blocked(g));}
function tap(g,p){const s=g._prologueTutorial,l=s&&s.current;if(!l||!['fighting','picking','relicpick'].includes(g.state)||blocked(g))return false;if(g.state!=='fighting'&&!['skill','branch'].includes(l.event))return false;
 if(!s.spotlight)return false;
 if(Spotlight.inside(p,s.spotlight.skip)){if(l.acknowledge)complete(g);else{s.saved.skipped=true;cancel(g);persist(g);}return true;}
 if(l.acknowledge)return true;
 return !targets(g).some(b=>Spotlight.inside(p,b));}
function allowCardDrag(g,p){const s=g._prologueTutorial,l=s&&s.current;if(!l||blocked(g))return true;if(l.acknowledge)return false;return targets(g).some(b=>Spotlight.inside(p,b));}
function draw(ctx,g){const s=g._prologueTutorial,l=s&&s.current;if(!l||!['fighting','picking','relicpick'].includes(g.state))return;if(blocked(g)||g.state!=='fighting'&&!['skill','branch'].includes(l.event)){s.spotlight=null;return;}const boxes=targets(g);if(!boxes.length&&!l.acknowledge){s.spotlight=null;return;}s.spotlight=Spotlight.draw(ctx,boxes,l.title,l.body,l.acknowledge?'确认继续':'跳过本章');}
function restart(g){if(!Prologue.chapter(g.menuStage))return false;if(g.testProfile)return true;const all=g.meta.prologue.tutorials||(g.meta.prologue.tutorials={});all[g.menuStage]={version:VERSION,done:[],skipped:false};cancel(g);g.menuPanel=null;g.newRun(false);persist(g);return true;}
function allowSwap(g){return !g._prologueTutorial;}
module.exports={VERSION,lessons,targets,allowSwap,allowCardDrag,isChapter,begin,tick,action,tap,draw,cancel,restart,pausesBattle};
