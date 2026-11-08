'use strict';

// 2026-11-03 定案卡表：R 纯数值 / SR 技能增强 / SSR 机制 / UR 圣庭天赋。
const towerCards = {};
const common = [];
const ur = [];
const rarity = {};
const values = {};

function add(list, tower, tier, id, name, icon, desc, star2, star3, nums, extra = {}) {
  const d = { id, name, icon, desc, star2, star3, ...extra };
  list.push(d);
  rarity[id] = tier;
  values[id] = { primary: [0, nums[0] || 0, nums[1] || 0, nums[2] == null ? (nums[1] || 0) : nums[2]], ...(extra.values || {}) };
  delete d.values;
  return d;
}
const set = (tower) => (towerCards[tower] = []);
const R = (t, id, name, icon, type, desc, nums) => add(towerCards[t], t, 'r', id, name, icon, desc,
  desc.replace(String(nums[0]), String(nums[1])), desc.replace(String(nums[0]), String(nums[2])), nums,
  { kind: type });
const SR = (t, id, name, icon, desc, star2, star3, nums, extraValues = {}) => add(towerCards[t], t, 'sr', id, name, icon, desc, star2, star3, nums, { kind: 'skill', values: extraValues });
const SSR = (t, id, name, icon, desc, star2, star3, nums, extraValues = {}) => add(towerCards[t], t, 'ssr', id, name, icon, desc, star2, star3, nums, { kind: 'mechanic', values: extraValues });

// R：全塔统一梯度，R 卡没有 3★额外质变。
for (const [t, label, icon] of [
  ['fire', '火', '🔥'], ['ice', '冰', '❄️'], ['poison', '毒', '☠️'],
  ['electric', '雷', '⚡'], ['boomerang', '镖', '🌀'], ['cannon', '炮', '💣'],
]) {
  set(t);
  R(t, `r_${t}_atk`, `${label}·强攻`, icon, 'attack', '塔攻击 +12%', [12, 18, 24]);
  R(t, `r_${t}_energy`, `${label}·充能`, icon, 'energy', '该色三消充能 +1', [1, 2, 3]);
  R(t, `r_${t}_cd`, `${label}·迅技`, icon, 'cooldown', '周期技冷却 -8%', [8, 12, 16]);
  R(t, `r_${t}_spd`, `${label}·速射`, icon, 'speed', '攻击间隔 -8%', [8, 12, 16]);
  R(t, `r_${t}_cap`, `${label}·蓄能`, icon, 'capacity', '能量上限 +5', [5, 8, 12]);
}

// SR：23 张，数值增强 + 独立 3★小质变。
SR('fire','s_sr_fire_rain','火雨·威能','🌧️','火雨伤害 +40%','火雨伤害 +60%','火雨伤害 +80%；火雨 +1 波（3→4）',[40,60,80],{waveAdd:[0,0,0,1]});
SR('fire','s_sr_fire_burn','灼烧·炽焰','🔥','灼烧伤害 +30%','灼烧伤害 +45%','灼烧伤害 +60%；灼烧可叠层 +1',[30,45,60],{stackAdd:[0,0,0,1]});
SR('fire','s_sr_fire_wall','火墙·延烧','🧱','火墙伤害 +25%','火墙伤害 +40%','火墙伤害 +55%；火墙 +1 道（同时 2 道）',[25,40,55],{wallAdd:[0,0,0,1]});
SR('ice','s_sr_ice_boom','冰花·霜力','💎','冰花伤害 +40%','冰花伤害 +60%','冰花伤害 +80%；冰花 +1 朵（1→2）',[40,60,80],{bloomAdd:[0,0,0,1]});
SR('ice','s_sr_ice_chill','冰缓·凝滞','❄️','冰缓减速 +10%','冰缓减速 +15%','冰缓减速 +20%；冰缓可叠 2 层',[10,15,20],{stackCap:[0,0,0,2]});
SR('ice','s_sr_ice_freeze','冰冻·久封','🧊','冰冻时长 +0.3 秒','冰冻时长 +0.5 秒','冰冻时长 +0.8 秒；冻结结束碎裂（60px，40%）',[0.3,0.5,0.8],{shatterRadius:[0,0,0,60],shatterDamage:[0,0,0,40]});
SR('poison','s_sr_poison_pool','毒池·浓毒','🧪','毒池伤害 +40%','毒池伤害 +60%','毒池伤害 +80%；毒池内敌人减速 20%',[40,60,80],{slow:[0,0,0,20]});
SR('poison','s_sr_poison_stick','毒棒·增殖','🪵','毒棒伤害 +30%','毒棒伤害 +45%','毒棒伤害 +60%；毒棒 +1 根（2→3）',[30,45,60],{stickAdd:[0,0,0,1]});
SR('poison','s_sr_poison_dot','中毒·蚀骨','☠️','中毒伤害 +30%','中毒伤害 +45%','中毒伤害 +60%；毒叠满 5 层引爆（60%，清层）',[30,45,60],{detonateStacks:[0,0,0,5],detonateDamage:[0,0,0,60]});
SR('electric','s_sr_elec_storm','雷暴·高压','⚡','雷暴伤害 +30%','雷暴伤害 +45%','雷暴伤害 +60%；雷暴 +1 目标（3→4）',[30,45,60],{targetAdd:[0,0,0,1]});
SR('electric','s_sr_elec_chain','连锁·传导','〰️','连锁伤害 +30%','连锁伤害 +45%','连锁伤害 +60%；连锁 +1 跳',[30,45,60],{hopAdd:[0,0,0,1]});
SR('electric','s_sr_elec_para','麻痹·强麻','⚡','麻痹概率 +10%','麻痹概率 +15%','麻痹概率 +20%；被麻痹敌人受雷伤 +20%',[10,15,20],{paralyzedDamage:[0,0,0,20]});
SR('boomerang','s_sr_boo_hunt','涡心','🌀','折返伤害 +20%','折返伤害 +30%','折返伤害 +40%；折返生成风眼（60px，40%）',[20,30,40],{vortexRadius:[0,0,0,60],vortexDamage:[0,0,0,40]});
SR('boomerang','s_sr_boo_multi','多重·弹道','📍','多重飞镖伤害 +15%','多重飞镖伤害 +25%','多重飞镖伤害 +35%；多重飞镖 +1 弹道（3→4）',[15,25,35],{projectileAdd:[0,0,0,1]});
SR('boomerang','s_sr_boo_bleed','流血·见血','🩸','流血伤害 +30%','流血伤害 +45%','流血伤害 +60%；流血可叠 2 层',[30,45,60],{stackCap:[0,0,0,2]});
SR('cannon','s_sr_can_powder','爆炸·威猛','💥','爆炸伤害 +30%','爆炸伤害 +45%','爆炸伤害 +60%；爆炸范围 +25%',[30,45,60],{radius:[0,0,0,25]});
SR('cannon','s_sr_can_splash','溅射·余震','🟠','爆炸/溅射范围 +20%','爆炸/溅射范围 +35%','爆炸/溅射范围 +50%；溅射命中减速 15%（1 秒）',[20,35,50],{slow:[0,0,0,15],slowDuration:[0,0,0,1]});
SR('cannon','s_sr_can_knock','击退·震退','🌪️','击退距离 +20%','击退距离 +35%','击退距离 +50%；击退撞敌造成 40% 伤害',[20,35,50],{collisionDamage:[0,0,0,40]});

// 通用 SR。
const C = (id,name,icon,desc,star2,star3,nums,extra={}) => add(common,'common','sr',id,name,icon,desc,star2,star3,nums,{kind:'common',values:extra});
C('s_sr_cm_wall','城墙·磐石','🏯','城墙血量 +20%','城墙血量 +30%','城墙血量 +40%；城墙 <30% 时每波回复 5%', [20,30,40],{lowHpRegen:[0,0,0,5]});
C('s_sr_cm_exp','击杀·历练','✨','击杀经验 +15%','击杀经验 +25%','击杀经验 +35%；经验球自动拾取',[15,25,35],{autoPickup:[0,0,0,1]});
C('s_sr_cm_triple','三消·领悟','🧩','三消经验 +20%','三消经验 +30%','三消经验 +40%；四消额外 +50% 经验',[20,30,40],{fourMatchExp:[0,0,0,50]});
C('s_sr_cm_bounty','宝箱·寻踪','🧭','宝箱掉率 +15%','宝箱掉率 +25%','宝箱掉率 +35%；宝箱奖励提升 1 档',[15,25,35],{tierUp:[0,0,0,1]});
C('s_sr_cm_regen','城墙·自愈','💚','城墙每波回复 2%','城墙每波回复 3%','城墙每波回复 4%；城墙回复量翻倍',[2,3,4],{regenMult:[0,0,0,2]});

// SSR：12 张机制型。
SSR('fire','s_fire_burn','灼烧','🔥','灼烧伤害 +40%','灼烧伤害 +70%，时长 +1 秒','灼烧目标死亡留火地 3 秒（50% 攻击/秒），地面内灼烧伤害 +15%',[40,70,70],{burnDuration:[0,0,1,1],groundDps:[0,0,0,50],groundDuration:[0,0,0,3],groundBurn:[0,0,0,15]});
SSR('fire','s_fire_rain','火雨·燎原','🌧️','火雨伤害 +40%','火雨伤害 +60%，间隔 -0.2 秒','火雨命中灼烧目标额外爆炸（50%，半径 80）',[40,60,60],{interval:[0,0,0.2,0.2],burnExplosion:[0,0,0,50],explosionRadius:[0,0,0,80]});
SSR('ice','s_ice_chill','深寒','❄️','冰缓减速 +10%','冰缓减速 +15%','同一敌人冰缓累计 3 秒→冻结 1 秒（重计时）',[10,15,15],{freezeAfter:[0,0,0,3],freezeDuration:[0,0,0,1]});
SSR('ice','s_ice_bloom','冰花·碎绽','💎','冰花伤害 +40%','冰花伤害 +60%','冰花爆炸分裂 6 枚小冰花，命中后再次碎裂（各 30%）',[40,60,60],{splitCount:[0,0,0,6],splitDamage:[0,0,0,30]});
SSR('electric','s_elec_field','雷暴·感电','⚡','雷暴目标 +1','雷暴目标 +2，伤害 +20%','雷暴落点留感电地面 3 秒（每秒 15% 伤害 +20% 麻痹）',[1,2,2],{damage:[0,0,20,20],groundDuration:[0,0,0,3],groundDps:[0,0,0,15],paralyze:[0,0,0,20]});
SSR('electric','s_elec_shock','触电','⚡','麻痹概率 +15%','麻痹概率 +20%','麻痹累计 2 次→范围触电（80px，60%，麻痹 1 秒）',[15,20,20],{shockStacks:[0,0,0,2],shockRadius:[0,0,0,80],shockDamage:[0,0,0,60],shockDuration:[0,0,0,1]});
SSR('poison','s_poison_nest','毒巢·溃散','🕸️','毒棒 +1 根','毒棒 +2 根','毒棒消失留毒液 2 秒（15% 攻击/秒 + 毒伤）',[1,2,2],{groundDuration:[0,0,0,2],groundDps:[0,0,0,15]});
SSR('poison','s_poison_curse','蚀命','☠️','每层毒每秒造成目标最大生命 0.5%','每层毒每秒造成目标最大生命 0.8%','每层毒每秒造成目标最大生命 1%；总伤上限=毒攻击×300%',[0.5,0.8,1],{damageCap:[0,0,0,300]});
SSR('boomerang','boo_cyclone','旋风','🌀','风暴镖每圈 +1 枚','风暴镖每圈 +2 枚','风暴镖持续翻倍，结束爆炸（150%，140px）',[1,2,2],{durationMult:[0,0,0,2],endDamage:[0,0,0,150],endRadius:[0,0,0,140]});
SSR('boomerang','boo_tip','镖尖','🔺','飞镖伤害 +15%','飞镖伤害 +20%','飞镖无视 20% 护甲',[15,20,20],{armorIgnore:[0,0,0,20]});
SSR('cannon','s_can_splash','溅射·重压','💥','炮火支援 +1 发；双管齐射率 +15%','炮火支援 +2 发；双管齐射率 +25%','炮弹落点留燃烧地面 3 秒（每秒 60% 攻击）',[1,2,2],{doubleChance:[0,0,15,25],groundDuration:[0,0,0,3],groundDps:[0,0,0,60]});
SSR('cannon','can_war','军火之王','👑','爆炸伤害 +20%','爆炸伤害 +30%','每次爆炸全塔攻击 +1%（本局叠加，上限 +30%）',[20,30,30],{attackPerExplosion:[0,0,0,1],attackCap:[0,0,0,30]});

// Legacy six field UR relics retired; talent UR cards register through config.js.
const relTower = Object.fromEntries(Object.entries(towerCards).map(([k, list]) => [k, list]));
const migration = {
  fire_seed:'s_fire_burn', fire_ember:'s_fire_burn', fire_chain:'s_fire_burn',
  fire_seal:'s_sr_fire_burn', fire_fuel:'s_sr_fire_burn', fire_inferno:'s_sr_fire_burn',
  fire_wall:'s_sr_fire_wall', fire_core:'s_sr_fire_wall', fire_tongue:'s_sr_fire_wall',
  fire_skyfire:'s_sr_fire_rain', fire_nuke:'s_sr_fire_rain', fire_hasten:'s_fire_rain',
  fire_rain:'r_fire_atk', fire_forge:'r_fire_spd', fire_bounce:'r_fire_energy', fire_burnall:'r_fire_cd',
  ice_spike:'s_sr_ice_chill', ice_glacier:'s_sr_ice_chill', ice_fog:'s_sr_ice_chill', ice_condense:'s_sr_ice_chill', ice_domain:'s_ice_chill',
  ice_forever:'s_sr_ice_freeze', ice_armor:'s_sr_ice_freeze', ice_crystal:'s_sr_ice_boom', ice_shard:'s_sr_ice_boom', ice_avalanche:'s_ice_bloom', ice_frostburst:'s_ice_bloom',
  ice_blizzard:'r_ice_atk', ice_pierce:'r_ice_atk', ice_marrow:'r_ice_energy', ice_wallshift:'r_ice_cap', ice_extreme:'r_ice_atk',
  poison_branch:'s_sr_poison_stick', poison_all:'s_sr_poison_dot', poison_nest:'s_poison_nest',
  poison_corrode:'s_poison_curse', poison_source:'s_poison_nest', poison_gland:'s_sr_poison_dot', poison_essence:'s_sr_poison_dot',
  poison_fen:'s_sr_poison_pool', poison_cloud:'s_sr_poison_pool', poison_slow:'s_sr_poison_pool', poison_quick:'s_poison_nest',
  poison_vine:'s_sr_poison_stick', poison_spread:'s_sr_poison_stick', poison_miasma:'s_sr_poison_dot', poison_fang:'r_poison_atk', poison_burst:'s_poison_curse',
  elec_storm:'s_sr_elec_storm', elec_boost:'s_sr_elec_chain', elec_strong:'s_sr_elec_para', elec_spread:'s_elec_shock',
  elec_super:'s_sr_elec_chain', elec_arc:'s_sr_elec_chain', elec_chain:'s_sr_elec_chain', elec_conduit:'s_sr_elec_chain',
  elec_overload:'s_sr_elec_storm', elec_domain:'s_sr_elec_storm', elec_magnet:'s_elec_field', elec_orb:'s_elec_field',
  elec_static:'s_elec_shock', elec_surge:'r_electric_atk', elec_fast:'r_electric_spd', elec_light:'r_electric_spd',
  boo_hunt:'s_sr_boo_hunt', boo_return:'s_sr_boo_hunt', boo_trail:'s_sr_boo_hunt',
  boo_multi:'s_sr_boo_multi', boo_blade:'s_sr_boo_multi',
  boo_blood:'s_sr_boo_bleed', boo_bleed:'s_sr_boo_bleed', boo_mark:'s_sr_boo_bleed', boo_wind:'s_sr_boo_bleed',
  boo_catch:'r_boomerang_spd', boo_spin:'r_boomerang_spd', boo_speed:'r_boomerang_spd',
  boo_eye:'boo_cyclone', boo_bounce:'r_boomerang_atk', boo_cyclone:'boo_cyclone', boo_tip:'boo_tip',
  cm_wall:'s_sr_cm_wall', cm_exp:'s_sr_cm_exp', cm_triple:'s_sr_cm_triple', cm_bounty:'s_sr_cm_bounty', cm_regen:'s_sr_cm_regen',
  can_heavy:'s_sr_can_splash', can_quake:'s_sr_can_knock', can_pierce:'s_sr_can_powder',
  can_double:'s_can_splash', can_airstrike:'s_can_splash', can_fireline:'s_can_splash', can_incend:'s_can_splash',
  can_minefield:'s_sr_can_powder', can_mine:'s_sr_can_powder', can_turret:'r_cannon_atk',
  can_armory:'r_cannon_cap', can_powder:'s_sr_can_powder', can_rapid:'r_cannon_spd', can_knock:'s_sr_can_knock',
  can_reinforce:'r_cannon_cap', can_war:'can_war',
};

module.exports = {
  RELIC_RARITY: rarity,
  RELIC_VALUES: values,
  RELIC_MIGRATION: migration,
  RELIC_RUN: { tower: relTower, common, ur },
};
