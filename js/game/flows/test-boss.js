'use strict';
const Bosses=require('../../bosses/index.js');
const defs={...require('../../config/bosses.js'),...require('../../config/boss-expansion.js')};
function clear(g){Bosses.clearTemporary(g);g.run.bossLock=false;g.run.bossEncounter=null;g.run.bossEnemy=null;g.wave.plan=[];g._testBossActive=false;}
function start(g,id){
 if(!g.testProfile||g.state!=='testfield'||!defs[id])return false;
 clear(g);g.enemies=[];g.fx.length=0;g.combat.reset();g.anim=null;
 const b=defs[id],previous=g.menuStage;
 g.run.wave=b.wave;g.menuStage=b.field;g.state='fighting';
 try{Bosses.setup(g.wave);}finally{g.state='testfield';g.menuStage=previous;}
 g.wave.timer=0;g.wave.planDoneAt=null;g.wave._freezeDone=false;
 g._testBossActive=true;g.testPanel=null;g.waveTime=0;
 g.renderer.bossEncounter=g.run.bossEncounter;
 if(g.renderer.preloadBoss)g.renderer.preloadBoss(id);
 g.toast('测试 Boss：'+b.name,'#ffcf70');return true;
}
module.exports={defs,clear,start};