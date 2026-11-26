'use strict';
const purple={
 sanctum:{fire:[['毒焰','火命中带毒目标，中毒时长 +0.5秒。']],cannon:[['震荡中毒','炮命中带毒目标，中毒层数 +1。']],boomerang:[['毒屑回旋','命中带毒目标，中毒剩余时长 +0.5秒，同目标限一次。']],electric:[['麻痹延展','麻痹时长 +0.4秒。']],ice:[['冻毒','冰减速或冻结目标，中毒跳速 +12%。']],poison:[['蚀骨增生','中毒层数上限 +2、时长 +0.6秒。']]},
 forge:{fire:[['烈燃','灼烧层数上限 +1、时长 +0.5秒。'],['火种','普攻命中附加一层灼烧，2秒、每秒8%攻击伤害。']],cannon:[['破甲弹','命中施加破甲：护甲降低10个百分点，持续3秒。'],['震荡','破甲目标受到炮塔伤害 +8%。']],electric:[['雷滞','麻痹时长 +0.4秒。'],['导电','麻痹期间额外降低8%移速。']]},
 gale:{boomerang:[['风痕延展','风痕时长 +1秒。']],ice:[['极寒','冰减速强度 +8%、时长 +0.6秒。']],poison:[['寒毒','中毒时长 +0.8秒。']]}
};
const gold={
 sanctum:{fire:['圣焰裁决 + 烬火溅射','普攻向60范围另一敌溅射30%；觉醒：100范围200%伤害，带毒目标伤害 +25%。','sanctum_fire','splash'],cannon:['轰鸣处决 + 连发装填','每3次普攻后，下次免能耗；觉醒：单体350%穿透伤害，带毒时向60范围溅射50%。','sanctum_cannon','freeShot'],boomerang:['回风绞杀 + 双程回旋','返程额外命中1名目标；觉醒：100范围三段90%伤害，带毒每段额外 +10%。','sanctum_boomerang','returnHit'],electric:['雷脉清算 + 过载链','普攻连锁目标 +1；觉醒：连锁3名目标、160%伤害，对麻痹目标伤害×1.5。','sanctum_electric','chain'],ice:['霜心封印 + 霜爆','冻结时对100范围施加30%减速3秒；觉醒：90范围120%伤害并冻结1秒，带毒冻结 +0.3秒。','sanctum_ice','freezeSplash'],poison:['毒源引爆 + 毒种扩散','普攻向60范围另一敌转移一层中毒，同目标3秒一次；觉醒：每层40%伤害，最多6层，引爆后清层。','sanctum_poison','poisonTransfer']},
 forge:{fire:['炉温','灼烧目标死亡时，向60范围另一敌转移一层灼烧。',null,'burnTransfer'],cannon:['膛压','能量不低于上限70%时，普攻伤害 +8%，与军火库过剩加算。',null,'pressure'],electric:['雷网','麻痹目标死亡时，向80范围敌人传导0.5秒麻痹。',null,'paralysisTransfer']},
 gale:{boomerang:['风暴回旋','两段120%伤害，返程留两段风痕；每次收割一层熔铸状态，额外伤害 +20%。','gale_boomerang',null],ice:['霜心清算','90范围120%伤害、冻结1秒；收割一层熔铸破甲时，冻结 +0.5秒、伤害×1.5。','gale_ice',null],poison:['毒源引爆','引爆全部熔铸状态，每层40%伤害、最多6层，命中后清层；无状态时造成40%基础伤害。','gale_poison',null]}
};
module.exports=function(config){
 const names={sanctum:{fire:'烬火圣印',cannon:'轰鸣核心',boomerang:'回风徽记',electric:'雷脉棱晶',ice:'霜心圣晶',poison:'蚀生之种'},forge:{fire:'炽核熔炉',cannon:'膛压炉心',boomerang:'矿渣回旋',electric:'电弧熔渣',ice:'淬火槽',poison:'硫磺脉'},gale:{fire:'融霜火线',cannon:'霜炮轰鸣',boomerang:'逆风回响',electric:'静电风眼',ice:'凝霜之心',poison:'霜蚀孢子'}};
 for(const c of config.cards){
  c.name=config.seriesNames[c.series]+'·'+names[c.series][c.tower];
  delete c.exclusive;
  const entries=(purple[c.series]||{})[c.tower]||[],g=(gold[c.series]||{})[c.tower];
  c.purpleList=entries.map(([name,desc],i)=>({key:c.series+'_'+c.tower+'_'+i,name,desc,tower:c.tower,series:c.series}));
  c.purple={...c.purple,key:c.series+'_'+c.tower,enabled:entries.length>0,name:entries.length?entries.map(p=>p[0]).join(' / '):'无紫天赋',desc:entries.length?entries.map(p=>p[1]).join(' '):'此卡仅提供节点覆盖属性。'};
  c.goldActive=g&&g[2]?{key:g[2],name:g[0].split(' + ')[0],first:10,cooldown:20,minCooldown:8}:null;
  c.goldPassive=g&&g[3]?{key:c.series+'_'+g[3],name:g[0].split(' + ').at(-1)}:null;
  c.gold={...c.gold,key:c.series+'_'+c.tower,enabled:!!g,name:g?g[0]:'无金天赋',mode:g?(c.series==='sanctum'?'混合':c.series==='forge'?'被动':'主动·收割'):'覆盖',desc:g?g[1]+(g[2]?' 首次10秒，基础冷却20秒，击杀减半至最低8秒。':''):'此卡仅提供节点覆盖属性。'};
  c.desc='1★覆盖4格，激活固定塔攻击点与绿色属性点。';
  c.star2='2★覆盖8格。'+c.purple.desc;
  c.star3='3★覆盖12格。金·'+c.gold.mode+'：'+c.gold.desc;
 }
 return config;
};
