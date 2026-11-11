/** 前置章节教学：按波次提示真实操作；不冻结战斗，各章进度独立，缺目标时也不会卡住。 */
'use strict';
const CONFIG = require('../config.js');
const PLAN = require('../config/prologue.js');
const Prologue = require('../prologue.js');
const Spotlight = require('./spotlight.js');

const lessons = {
  [PLAN.order[0]]: [
    { id: 'match', wave: 1, title: '完成三消', body: '交换相邻方块，连成三个同色方块，激活第一座塔。', event: 'match' },
    { id: 'tower', wave: 1, title: '防御塔会自动攻击', body: '点击高亮防御塔继续。塔攻击会消耗能量，需要消除对应颜色补能。' },
    { id: 'second', wave: 2, title: '选择第二座塔', body: '消除另一种颜色激活第二座塔，本章最多两座。', owned: 2 },
    { id: 'energy', wave: 3, title: '为塔补充能量', body: '再次消除已有塔的颜色，观察塔的能量条增长。', event: 'energy' },
    { id: 'special', wave: 4, title: '四消特殊方块', body: '一次连成四个同色方块，会留下一个特殊方块。', event: 'match4' },
  ],
  [PLAN.order[1]]: [
    { id: 'activate', wave: 1, title: '升级了，选择一项技能', body: '积累经验升级后，从技能卡中选一项，点击卡片下方确认。', event: 'skill' },
    { id: 'third', wave: 3, title: '补齐三座防御塔', body: '本章有三处塔位，消除尚未建塔的颜色补齐阵容。', owned: 3 },
    { id: 'global', wave: 5, title: '释放能量补给', body: '点击左侧能量补给，为已激活塔补能；本次已充能。', event: 'global' },
    { id: 'shop', wave: 8, title: '战地补给', body: '点击底部商店查看补给，购买消耗本局获得的银币。', event: 'shop' },
  ],
  [PLAN.order[2]]: [
    { id: 'branch', wave: 1, title: '本局只能选择一个分支', body: '每个技能的A／B／C分支，本次战斗只能选择其中一个。选定后只能继续升级该分支，另外两个本局不能再选。', event: 'branch' },
    { id: 'relic', wave: 5, title: '领取第一件圣遗物', body: '消除宝箱旁的方块打开宝箱，再从三件圣遗物中选一件。', event: 'relic' },
    { id: 'rarities', wave: 10, title: '圣遗物品质', body: '蓝色可以重复叠加，紫色和金色在本局各只能获得一次。' },
  ],
};

function isChapter(game) {
  return game.state === 'menu' ? !!Prologue.chapter(game.menuStage) : !!(game.run && game.run.chapter && game.run.chapter.isPrologue);
}
function persist(game) { if (game.save) game.save.save(); }
function begin(game) {
  cancel(game);
  if (!isChapter(game) || game.testProfile || !game.meta) return;
  const id = game.run.chapter.id;
  const progress = game.meta.prologue || (game.meta.prologue = Prologue.initialProgress());
  const tutorials = progress.tutorials || (progress.tutorials = {});
  const saved = tutorials[id] || (tutorials[id] = { done: [], skipped: false });
  if (saved.skipped) return;
  game._prologueTutorial = { id, run: game.run, saved, current: null };
}
function restoreGlobal(game, state) {
  if (state && state.previousGlobal != null) {
    (state.run || game.run).globalSlots[0] = state.previousGlobal;
    delete state.previousGlobal;
  }
}
function cancel(game) {
  const state = game._prologueTutorial;
  restoreGlobal(game, state);
  const run = state && state.run || game.run;
  if (run) delete run._tutorialChoiceType;
  game._prologueTutorial = null;
}
function complete(game) {
  const state = game._prologueTutorial;
  if (!state || !state.current) return;
  if (!state.saved.done.includes(state.current.id)) state.saved.done.push(state.current.id);
  restoreGlobal(game, state);
  delete game.run._tutorialChoiceType;
  state.current = null;state.move=null;state.spotlight=null;
  persist(game);
}
function tick(game) {
  const state = game._prologueTutorial;
  if (!state || !['fighting', 'picking', 'relicpick'].includes(game.state)) return false;
  const picking=game.state==='picking'&&game.pickQueue[game.pickIndex];
  const triggered=picking&&lessons[state.id].find(item=>['skill','branch'].includes(item.event)&&!state.saved.done.includes(item.id)&&picking.candidates.some(card=>card.type===item.event));
  if(triggered&&state.current!==triggered){restoreGlobal(game,state);state.current=triggered;state.move=null;}
  if (!state.current) {
    const group=game.state==='picking'&&game.pickQueue[game.pickIndex];
    const lesson = lessons[state.id].find(item => !state.saved.done.includes(item.id)&&game.run.wave>=item.wave&&
      (!['skill','branch'].includes(item.event)||(group&&group.candidates.some(card=>card.type===item.event))));
    if (!lesson || game.run.wave < lesson.wave) return false;
    state.current = lesson;
    if(state.id===PLAN.order[0]&&['match','energy'].includes(lesson.event)&&!game.anim){
      const previous=game._tutorial;game._tutorial={};require('./tutorial.js').prepare(game);state.move=game._tutorial.move;game._tutorial=previous;
    }else state.move=null;
  }
  const lesson = state.current, owned = game.run.slotOrder.length;
  if (lesson.owned && owned >= lesson.owned) { complete(game); return false; }
  if (lesson.event === 'global' && state.previousGlobal == null) {
    state.previousGlobal = game.run.globalSlots[0];
    game.run.globalSlots[0] = 'refill';
    game.run.shuffleAmmo = Math.max(game.run.shuffleAmmo, CONFIG.GLOBAL_SKILL.chargePerUse);
  }
  return false;
}
function action(game, event, value) {
  const state = game._prologueTutorial, lesson = state && state.current;
  if (!lesson) return;
  if (event === 'swap') {
    const matches = value && value.matches || [];
    if (lesson.event === 'match' && matches.length) complete(game);
    else if (lesson.event === 'energy' && (value.settled || []).some(match => !match.gotTower && match.ammoGain > 0)) complete(game);
    else if (lesson.event === 'match4' && matches.some(match => match.shape === '4')) complete(game);
  } else if (lesson.event === event) complete(game);
}
function targets(game) {
  const state=game._prologueTutorial,lesson=state&&state.current,l=game.ly;
  if(!lesson)return [];
  if(state.move){const m=state.move;return [{x:l.boardX+Math.min(m[1],m[3])*l.cell,y:l.boardY+Math.min(m[0],m[2])*l.cell,w:(Math.abs(m[1]-m[3])+1)*l.cell,h:(Math.abs(m[0]-m[2])+1)*l.cell}];}
  if(lesson.id==='tower'){const n=game.run.towerSlots;return [{x:(750-n*l.slotSize-(n-1)*l.slotGap)/2,y:l.slotY,w:l.slotSize,h:l.slotSize}];}
  if(['skill','branch'].includes(lesson.event)){
    if(game.state!=='picking')return [];
    const group=game.pickQueue[game.pickIndex];
    return group?group.candidates.flatMap((card,i)=>card.type===lesson.event&&game.pickHits[i]&&game.pickHits[i].cardRect?[game.pickHits[i].cardRect]:[]):[];
  }
  if(lesson.event==='global')return (game.renderer.globalBtns||[]).filter(b=>b.key==='shuffle');
  if(lesson.event==='shop')return (game.renderer.funcHits||[]).filter(b=>b.key==='shop');
  if(lesson.event==='relic'&&game.state==='relicpick')return [require('./screens/pick-layout.js').geometry('relic',{towerTop:l.slotY,towerBottom:l.slotY+l.slotSize})];
  if(lesson.owned||['energy','match','match4','relic'].includes(lesson.event))return [{x:l.boardX,y:l.boardY,w:l.boardCols*l.cell,h:l.boardRows*l.cell}];
  return [];
}
function tap(game, point) {
  if (!['fighting','picking','relicpick'].includes(game.state))return false;
  if(game.towerInfo||game.towerSkill||game.funcLayer||game.relicDetail||game.shopOpen)return false;
  const state=game._prologueTutorial,lesson=state&&state.current;
  if(!lesson||!state.spotlight)return false;
  if(Spotlight.inside(point,state.spotlight.skip)){state.saved.skipped=true;cancel(game);persist(game);return true;}
  const boxes=targets(game);
  if(lesson.id==='tower'&&boxes.some(b=>Spotlight.inside(point,b))){complete(game);return true;}
  if(!lesson.event&&!lesson.owned&&lesson.id!=='tower'&&Spotlight.inside(point,state.spotlight.panel)){complete(game);return true;}
  // 暗区不接受点击；高亮区交回原有操作路由处理。
  return !boxes.some(b=>Spotlight.inside(point,b));
}
function draw(ctx, game) {
  const state=game._prologueTutorial,lesson=state&&state.current;
  if(!lesson||!['fighting','picking','relicpick'].includes(game.state))return;
  if(game.towerInfo||game.towerSkill||game.funcLayer||game.relicDetail||game.shopOpen){state.spotlight=null;return;}
  const boxes=targets(game);
  if(!boxes.length&&(lesson.event||lesson.owned||lesson.id==='tower')){state.spotlight=null;return;}
  state.spotlight=Spotlight.draw(ctx,boxes,lesson.title,lesson.body);
  if(state.move){const l=game.ly,m=state.move,x=l.boardX+(m[1]+.5)*l.cell,y=l.boardY+(m[2]+.5)*l.cell;
    ctx.save();ctx.strokeStyle='#ffe291';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y-l.cell);ctx.lineTo(x-10,y-l.cell+16);ctx.moveTo(x,y-l.cell);ctx.lineTo(x+10,y-l.cell+16);ctx.stroke();ctx.restore();}
}
function restart(game) {
  if (!Prologue.chapter(game.menuStage)) return false;
  if (game.testProfile) return true;
  const tutorials = game.meta.prologue.tutorials || (game.meta.prologue.tutorials = {});
  tutorials[game.menuStage] = { done: [], skipped: false };
  cancel(game); game.menuPanel = null; game.newRun(false); persist(game);
  return true;
}
function allowSwap(g,a,b,c,d){
  const s=g._prologueTutorial;if(!s||!s.current)return true;
  if(s.move){const m=s.move;return (a===m[0]&&b===m[1]&&c===m[2]&&d===m[3])||(c===m[0]&&d===m[1]&&a===m[2]&&b===m[3]);}
  if(!s.spotlight)return true;
  const l=g.ly,from={x:l.boardX+(b+.5)*l.cell,y:l.boardY+(a+.5)*l.cell},to={x:l.boardX+(d+.5)*l.cell,y:l.boardY+(c+.5)*l.cell};
  return targets(g).some(box=>Spotlight.inside(from,box)&&Spotlight.inside(to,box));
}
module.exports = { targets,allowSwap,isChapter, begin, tick, action, tap, draw, cancel, restart };
