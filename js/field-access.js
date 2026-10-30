'use strict';
const CONFIG=require('./config.js');
function reason(id,meta,test){
 if(id==='test')return test?'':'仅测试账号可进入测试战场';
 if(id==='lava'||id==='frost')return (meta.ancientBestWave||0)>=40?'':'圣坛花园达到40波后解锁';
 if(id==='abyss')return meta.normalFieldCleared?'':'通关一次普通战场（完整清除第60波）后解锁';
 return '';
}
function visible(test){return CONFIG.FIELD_ORDER.filter(id=>id!=='test'||test);}
function prompt(game,message){const now=Date.now();if(now<(game._fieldPromptAt||0))return;game._fieldPromptAt=now+1500;game.menuPanel={type:'fieldLocked',message};}
module.exports={reason,visible,prompt};
