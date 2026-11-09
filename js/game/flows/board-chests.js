// 掉落→入盘→相邻消除→原开箱，状态只在当前Game/Board，不写档案。
'use strict';
const UI = require('../../config/board-chests.js');
const Piece = require('../../board-chests.js');
function cellCenter(g,r,c){return{x:g.ly.boardX+(c+.5)*g.ly.cell,y:g.ly.boardY+(r+.5)*g.ly.cell};}
/** 每局首次构筑宝箱由波次发放，不依赖W2不存在的精英/Boss击杀。 */
function grantFirstReward(g) {
  if (g.menuStage === 'test' || g.state === 'testfield') return false;
  if (g.run.wave !== UI.firstRewardWave || g.run._firstWaveChestGranted) return false;
  g.fieldChests.push({
    x: g.ly.areaX + g.ly.areaW / 2,
    y: g.ly.areaY + g.ly.entryH + 60,
    t: 0,
    kind: 'firstWave',
    waveNo: g.run.wave,
  });
  // 标记留在当前Run，新对局自动重置；重复检查或进入下一波不会重复发放。
  g.run._firstWaveChestGranted = true;
  g.run._waveChestDropped = true;
  g.toast('首次圣物宝箱 · 消除棋盘相邻方块领取', '#f7c948');
  return true;
}
function land(g,c){
  const board=g.run.board,candidates=[];
  board.grid.forEach((row,r)=>row.forEach((v,col)=>{if(typeof v==='string')candidates.push([r,col]);}));
  if(!candidates.length)return false;
  const start=Math.floor((g.run.rng||Math.random)()*candidates.length);
  for(let i=0;i<candidates.length;i++){
    const [r,col]=candidates[(start+i)%candidates.length],old=board.grid[r][col];
    const id=(g._boardChestId=(g._boardChestId||0)+1);
    const piece={s:'chest',c:null,id,arriving:true,replaced:old,...(c.rarity ? {rarity:c.rarity} : {})};board.grid[r][col]=piece;
    if(!board.isSolvable()){board.grid[r][col]=old;continue;}
    Object.assign(c,{id,r,c:col,cellSize:g.ly.cell-4,stage:'toBoard',flightT:0,fromX:c.x,fromY:c.y,piece,...cellCenter(g,r,col)});
    return true;
  }
  return false;
}
function schedule(g,steps){
  for(const step of steps||[])for(const p of step.chestsCollected||[]){
    const chest=g.fieldChests.find(c=>c.id===p.id);
    if(!chest||chest.stage==='ready'||chest.animT!=null)continue;
    Object.assign(chest,{stage:'ready',hidden:true,...cellCenter(g,p.r,p.c)});
  }
}
function reveal(g,entries){for(const p of entries||[]){const c=g.fieldChests.find(c=>c.id===p.id);if(c)c.hidden=false;}}
function tick(g,dt){
  g.fieldChests=g.fieldChests.filter(c=>{
    if(!c.stage){c.stage='ground';c.groundT=0;}
    if(c.stage==='ground'){c.groundT+=dt;if(c.groundT>=UI.ground)c.stage='waiting';}
    c.retryT=Math.max(0,(c.retryT||0)-dt);
    if(c.stage==='toBoard'){
      c.flightT+=dt;
      if(c.flightT>=UI.flight){c.stage='board';c.piece.arriving=false;delete c.piece.replaced;delete c.piece;}
    }else if(c.animT!=null){
      if(c.stage==='fly'){c.flyT+=dt;if(c.flyT>=UI.rewardFly){g.spawnRelicPick(undefined,{rarity:c.rarity});return false;}}
      else{c.animT+=dt;if(c.animT>=UI.open){c.stage='fly';c.flyT=0;}}
    }
    return true;
  });
  const active=()=>g.fieldChests.some(c=>c.stage==='toBoard'||c.animT!=null);
  if(!active()&&!g.anim&&!(g.pendingRelicPicks||[]).length){
    const ready=g.fieldChests.find(c=>c.stage==='ready');
    if(ready){ready.hidden=false;ready.animT=0;ready.stage='open';}
    else for(const waiting of g.fieldChests.filter(c=>(!c.stage||c.stage==='waiting')&&!c.retryT)){waiting.stage='waiting';if(!land(g,waiting))waiting.retryT=UI.retry;}
  }
  g._chestBusy=active()||(g.pendingRelicPicks||[]).length>0;
}
module.exports={tick,schedule,reveal,cellCenter,grantFirstReward};
