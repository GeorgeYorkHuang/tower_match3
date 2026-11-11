'use strict';
const CONFIG=require('./config.js');
const PROLOGUE=require('./config/prologue.js');
const Prologue=require('./prologue.js');
function reason(id,meta,test){
 if(test)return ''; // 测试档只绕过战场准入，不回写普通档通关记录。
 if(id==='test')return test?'':'仅测试账号可进入测试战场';
 if(Prologue.chapter(id))return PROLOGUE.releaseReady?Prologue.reason(id,meta):'前置章节开发中';
 if(PROLOGUE.releaseReady){const locked=Prologue.reason(id,meta);if(locked)return locked;}
 if(id==='lava')return (meta.fieldClears||{}).ancient?'':'通关圣坛花园后解锁';
 if(id==='frost')return (meta.fieldClears||{}).lava?'':'通关熔岩矿场后解锁';
 if(id==='abyss')return (meta.fieldClears||{}).frost?'':'通关霜风峡谷后解锁';
 return '';
}
function visible(test){const order=PROLOGUE.releaseReady?[...PROLOGUE.order,...CONFIG.FIELD_ORDER]:CONFIG.FIELD_ORDER;return order.filter(id=>id!=='test'||test);}
function prompt(game,message){const now=Date.now();if(now<(game._fieldPromptAt||0))return;game._fieldPromptAt=now+1500;game.menuPanel={type:'fieldLocked',message};}
function selectable(meta,test){const order=visible(test);const first=order.findIndex(id=>reason(id,meta,test));return first<0?order:order.slice(0,first+1);}
function markCleared(meta,id){if(!['ancient','lava','frost'].includes(id))return;meta.fieldClears=meta.fieldClears||{};meta.fieldClears[id]=true;}
module.exports={reason,visible,selectable,markCleared,prompt};
