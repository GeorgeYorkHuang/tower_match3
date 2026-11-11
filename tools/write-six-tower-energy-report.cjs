/** 从已完成的真实采集生成六塔能耗报告与可复核CSV，不读写游戏配置。 */
'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert'), zlib = require('zlib');
const dir = path.resolve(__dirname, '../docs');
const fixed = JSON.parse(fs.readFileSync(dir + '/six-tower-energy-fixed.json'));
const moving = JSON.parse(fs.readFileSync(dir + '/six-tower-energy-moving.json'));
assert.equal(fixed.runs.length, 336); assert.equal(moving.runs.length, 90);
assert.deepEqual(fixed.sourceHashes, moving.sourceHashes);
const names = { fire:'火塔', ice:'冰塔', poison:'毒塔', electric:'电塔', boomerang:'回旋镖', cannon:'炮塔' };
const routes = {
  fire:['多重火球／大火球／灼烧','火柱／火雨／烈焰墙'],
  ice:['小冰锥／冰穿刺／碎冰','冰花／冬珠／冰墙'],
  poison:['毒棒／毒池／毒性强化','剧毒／瘟疫／毒爆'],
  electric:['连锁／活电／麻痹','雷球／雷暴／极光'],
  boomerang:['多镖／接镖／风痕','弹力镖／风暴镖／风眼'],
  cannon:['炮台／支援／地雷','重炮／双管／碎裂弹'],
};
const mean = a => a.reduce((s,v)=>s+v,0)/a.length;
const num = (v,n=1) => Number(v).toFixed(n);
const pct = v => num(v*100)+'%';
function fixedCase(key, route, stage, scenario, supply) {
  const xs=fixed.runs.filter(r=>r.key===key&&r.route===route&&r.stage===stage&&r.scenario===scenario&&r.supply===supply);
  assert.equal(xs.length,2);
  return { dps:mean(xs.map(r=>r.dps)), requested:mean(xs.map(r=>r.requestedEnergyPerSecond)),
    low:mean(xs.map(r=>(r.observations.towers[key].lowSeconds+r.observations.towers[key].zeroSeconds)/r.seconds)) };
}
const full=[];
for(const key of Object.keys(names)) for(const route of ['steady','alternate']) {
  const n=fixedCase(key,route,3,'boss','neutral'), a=fixedCase(key,route,3,'boss',0.7), slow=fixedCase(key,route,3,'boss',0.35);
  const crowd=fixedCase(key,route,3,'dense','neutral'), crowdA=fixedCase(key,route,3,'dense',0.7);
  full.push({key,route,name:routes[key][route==='steady'?0:1],neutralDps:n.dps,supplyDps:a.dps,
    retained:a.dps/n.dps,slowDps:slow.dps,requested:n.requested,low:a.low,
    denseNeutralDps:crowd.dps,denseSupplyDps:crowdA.dps,denseRetained:crowdA.dps/crowd.dps});
}
const agg=[];
for(const field of ['ancient','lava','frost']) for(const condition of ['normal','neutral','relics']) for(const key of Object.keys(names)) {
  const xs=moving.runs.filter(r=>r.field===field&&r.condition===condition&&r.cadence===2&&r.observations.towers[key]);
  const seconds=xs.reduce((s,r)=>s+r.observations.seconds,0), sums={};
  for(const r of xs)for(const [k,v] of Object.entries(r.observations.towers[key]))if(typeof v==='number')sums[k]=(sums[k]||0)+v;
  agg.push({field,condition,key,runs:xs.length,seconds,...sums,
    averageEnergy:sums.energySeconds/seconds,below40:(sums.rampSeconds+sums.lowSeconds+sums.zeroSeconds)/seconds,
    below20:(sums.lowSeconds+sums.zeroSeconds)/seconds,zero:sums.zeroSeconds/seconds,
    damageState:sums.damageStateSeconds/seconds,cooldownState:sums.cooldownStateSeconds/seconds,
    shortPrimary:sums.shortAttackLaunches/Math.max(1,sums.attackLaunches),rangeBlocked:sums.rangeBlockedSeconds/seconds});
}
const fieldNames={ancient:'圣坛花园',lava:'熔岩矿场',frost:'霜风峡谷'};
const profileNames=Object.fromEntries(Object.entries(moving.profiles).map(([k,v])=>[k,v.map(x=>({fire:'火',ice:'冰',poison:'毒',electric:'电',boomerang:'镖',cannon:'炮'}[x])).join('／')]));
const md=[];
md.push('# 六塔供能与攻击检查（V1.18.9）\n',
'日期：2026-11-10。完成336组固定投入测试与90组移动对照。只新增/更新tools与docs下的采集资料，未修改js、能耗、攻击、怪物或掉落数值。',
'\n## 结论\n',
'优先检查路线能耗与能量惩罚，再决定基础攻击。火塔多重火球、电塔连锁、炮塔重炮双管均存在明显供能瓶颈；冰塔与毒塔应按路线区分；回旋镖供能相对宽松。不能仅按总伤害给六塔统一增伤或削弱。',
'\n## 1. 实际代码口径\n',
'- 能量为0：伤害×0.3，射程缩至400，周期技冷却×2；0<能量<20：伤害×0.6、周期技冷却×1.5；20–40线性恢复，40–90正常，90以上最多额外30%伤害。',
'- 普攻没有因缺能直接停火；不足费用会扣到0后照常发射弱化攻击。射程缩短可能让原来可攻击的远怪暂时无法锁定。',
'- castEnergy在能量不足时仅跳过扣费，调用它的周期技仍继续执行后续效果。统计中的“未足额扣费请求”不能解释成未释放技能。',
'- 能量配置中的interval倍率目前没有进入普通攻击调度；周期冷却读取cooldown倍率。本文不把未接入的攻速惩罚算入损失。',
'- 普攻强化按预期多目标伤害增加费用。多重火球、重炮、连锁即使只打单体，也可能仍按其群体潜力收费。',
'\n## 2. 同等投入：满路线供能对照\n',
'每塔两条路线；Lv4/7/13分别对应3/6/12次合法选择。60Hz、预热120秒后计量120秒、种子41/123；无圣遗物、天赋、商店、协同与全局技能。固定靶不移动、不死亡、零护甲。Boss靶是大体型单目标，不带专属Boss脚本；密集靶为12只。',
'“60能量”每帧维持在正常档，不是100点满能增伤；0.7与0.35能量/秒是诊断用均匀输入，不能冒充每个玩家的真实供能。两种输入都从60能量开始，预热后再测。',
'下表为Lv13两个种子均值，DPS按原生run.dmgStat实际生命/护盾损失统计；保留率=均匀供能DPS÷60能量参考DPS。供能富余时可超过90能量，保留率因此可能>100%。\n',
'| 塔 | 路线 | 60能量单体DPS | 0.7供能单体DPS | 保留率 | 0.35供能DPS | 60能量请求耗能/秒 |',
'| --- | --- | ---: | ---: | ---: | ---: | ---: |');
for(const r of full)md.push(`| ${names[r.key]} | ${r.name} | ${num(r.neutralDps,0)} | ${num(r.supplyDps,0)} | ${pct(r.retained)} | ${num(r.slowDps,0)} | ${num(r.requested,2)} |`);
md.push('\n密集12目标总DPS，目标数不同，不能与单体列直接比较：\n',
'| 塔 | 路线 | 60能量群体DPS | 0.7供能群体DPS | 保留率 |','| --- | --- | ---: | ---: | ---: |');
for(const r of full)md.push(`| ${names[r.key]} | ${r.name} | ${num(r.denseNeutralDps,0)} | ${num(r.denseSupplyDps,0)} | ${pct(r.denseRetained)} |`);
md.push('\n## 3. 真实移动回放中的能量状态\n',
'三图×六组合×三条件，花园2秒操作额外一个种子；另跑花园4秒操作。共90组。三条件为无圣物正常供能、无圣物60能量参考、正常供能且接入新版宝箱。随机棋盘/操作由独立随机流维持，正常与60能量组共同操作前缀已校验。',
`配对检查${moving.pairedChecks}组，共${moving.pairedSteps}步。不同输出会改变击杀、经验、等级、波次节奏和战斗长度，不能把整局差异当成单个伤害倍率的净效应。`,
'新版宝箱按真实掉落、飞入棋盘、相邻消除和开箱流程领取；固定选第一项，获得即图鉴1星，无额外永久升星或红卡天赋，不代表优化构筑。基础12个发放节点不等于每局实际领满12件。',
'以下是花园每2秒操作的无圣物正常组，按实际在场秒数加权。每塔出现的组合/时长不同，这是混合实战暴露率，不是公平单塔排名。伤害档位均值只是状态均值，不等于总DPS保留率。\n',
'| 塔 | 平均能量 | <40占比 | <20占比 | 0能量占比 | 伤害档位均值 | 普攻发射不足费比例 | 周期请求未扣足费 | 射程损失暴露 |',
'| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
for(const r of agg.filter(x=>x.field==='ancient'&&x.condition==='normal'))md.push(`| ${names[r.key]} | ${num(r.averageEnergy,1)} | ${pct(r.below40)} | ${pct(r.below20)} | ${pct(r.zero)} | ${num(r.damageState,2)} | ${pct(r.shortPrimary)} | ${r.unpaidPeriodicRequests}/${r.periodicRequests} | ${pct(r.rangeBlocked)} |`);
md.push('\n射程损失暴露：当时正常射程内有活怪、实际缩短射程内没有活怪的在场时间占比，不等于错过的攻击次数。周期请求包括无目标时仍触发的扣费请求，不等于成功命中的次数。\n',
'三图<40能量时长占比；新版奖励可能改变构筑、成长和生存时长，不能直接视为单纯充能收益：\n',
'| 地图 | 塔 | 无圣物正常 | 60能量参考 | 新版宝箱 |','| --- | --- | ---: | ---: | ---: |');
for(const field of Object.keys(fieldNames))for(const key of Object.keys(names)){
const r=c=>agg.find(x=>x.field===field&&x.key===key&&x.condition===c);
md.push(`| ${fieldNames[field]} | ${names[key]} | ${pct(r('normal').below40)} | ${pct(r('neutral').below40)} | ${pct(r('relics').below40)} |`);
}
md.push('\n花园每2秒操作失守波次（种子41/123）：\n','| 组合 | 无圣物正常 | 60能量参考 | 新版宝箱 |','| --- | --- | --- | --- |');
const end = r => r.terminal==='wall_broken' ? String(r.wave) : r.terminal==='victory' ? '胜利' : r.terminal==='wave_cap' ? '采样上限' : '时间截止';
for(const profile of Object.keys(profileNames)){
const values=condition=>moving.runs.filter(r=>r.field==='ancient'&&r.cadence===2&&r.profile===profile&&r.condition===condition).sort((a,b)=>a.seed-b.seed).map(end).join('／');
md.push(`| ${profileNames[profile]} | ${values('normal')} | ${values('neutral')} | ${values('relics')} |`);
}
md.push('\n“失守第N波”不代表清空了第N波。矿场/峡谷的专属20/40/60 Boss尚未像花园一样接入；“采样上限”只表示推进超过60波，不是全歼60波或通关。不能横跨地图直接排名Boss强度。',
'\n## 4. 六塔下一步\n',
'1. 火：优先重估多重火球＋大火球的额外普攻收费，尤其假定多名溅射目标的费用；不先统一抬高火塔攻击，否则区域技和高能组合会同时变强。',
'2. 冰：冰锥碎冰路线供能相对够用，冰花冬珠路线有周期消耗压力；应保留冰冻、冰墙价值，不能凭DPS偏低直接判弱。',
'3. 毒：毒棒毒池路线较吃供能，剧毒传染的固定靶伤害还受不死靶缺少击杀收益影响；先维持攻击与驻场预算，补真实传染/击杀收益观测。',
'4. 电：连锁路线优先检查按预期跳数收费与实际命中目标数不匹配的问题；雷球雷暴也有供能压力，不建议仅靠提升攻击补偿。',
'5. 镖：供能相对宽裕；暂不增加攻击或充能，后续再比单位能量收益和风痕实际覆盖，不凭本批组合表现立即削弱。',
'6. 炮：重炮双管的耗能增长尤其陡；驻场支援也会掉入低能档，但高密度总伤仍高。分别检查强化普攻费用和周期费用，不统一增伤；地雷伤害本轮保持。',
'\n## 5. 阻碍最终平衡判断的实现问题\n',
'- 城墙归零后，Main.waveEnd先调用Run.endWave；后者先执行波末回血再重新计算broken。拥有“城墙·自愈”等回血后可能复活城墙并跳过尚存Boss。原生试跑曾在Boss仍存活、记录破防的情况下继续进入后续波次。',
'- 本批移动对照通过工具层在首次0血、波末回血之前停止，避免把异常续局算成圣遗物强度。这是分析口径修正，没有修改js中的实际游戏行为；该问题仍需单独修复。',
'- castEnergy不足费仍继续施放，以及能量攻速倍率未进入普攻调度，是必须先明确设计意图的两个机制。本文未擅自把它们改成停火/禁放。',
'- 扣费先于伤害取值：周期技费用刚好足够时可能扣到0、伤害落到30%档；略低于费用时却不扣费，仍可按60%低能档施放。应先明确这一临界行为，再根据请求耗能调整费用，避免用攻击力掩盖扣费顺序问题。',
'\n## 6. 数据与复跑\n',
'- six-tower-energy-fixed.json / fixed.csv：336组固定投入数据，两种子、两条路线、三级投入与单体/密集靶。',
'- six-tower-energy-moving.json / moving.csv：90组完整移动对照与逐塔观察指标。',
'- six-tower-energy-moving-raw.json.gz：完整逐波、升级、操作与选择记录。',
'- six-tower-energy-summary.json：汇总结果。',
'- tools/collect-six-tower-energy.cjs fixed / moving：复跑两个矩阵；tools/write-six-tower-energy-report.cjs生成本报告。',
`- 工具层已验证不改变原生回放、正常/60能量组操作前缀一致、W2无圣物对照不被开箱卡住，以及第一破防终止。两批${Object.keys(moving.sourceHashes).length}个js运行时来源哈希一致；结果不是手机帧率/温度测试，也不是真人胜率。`);
fs.writeFileSync(dir+'/six-tower-energy-analysis.md',md.join('\n')+'\n');
function csv(file,rows){const cols=Object.keys(rows[0]);const cell=v=>JSON.stringify(v??'');fs.writeFileSync(dir+'/'+file,'\ufeff'+[cols.map(cell).join(','),...rows.map(r=>cols.map(k=>cell(r[k])).join(','))].join('\n'))}
csv('six-tower-energy-fixed.csv',fixed.runs.map(r=>({key:r.key,route:r.route,level:r.level,scenario:r.scenario,supply:r.supply,seed:r.seed,dps:r.dps,requestedEnergyPerSecond:r.requestedEnergyPerSecond,actualEnergyPerSecond:r.actualEnergyPerSecond,hardControlFraction:r.hardControlFraction,...Object.fromEntries(Object.entries(r.observations.towers[r.key]).filter(([k,v])=>typeof v==='number'))})));
csv('six-tower-energy-moving.csv',moving.runs.flatMap(r=>Object.entries(r.observations.towers).map(([key,v])=>({field:r.field,profile:r.profile,condition:r.condition,cadence:r.cadence,seed:r.seed,key,seconds:r.observations.seconds,terminal:r.terminal,wave:r.wave,relicChoices:r.relicChoices?.length||0,...Object.fromEntries(Object.entries(v).filter(([k,v])=>typeof v==='number'))}))));
fs.writeFileSync(dir+'/six-tower-energy-summary.json',JSON.stringify({version:moving.version,date:moving.date,counts:{fixed:fixed.runs.length,moving:moving.runs.length},fixedFull:full,moving:agg,pairedChecks:moving.pairedChecks,pairedSteps:moving.pairedSteps},null,2));
const raw=JSON.parse(zlib.gunzipSync(fs.readFileSync(dir+'/six-tower-energy-moving-raw.json.gz')));
assert.equal(raw.runs.length,90);assert(raw.runs.every(r=>r.waves.length>0));
console.log(JSON.stringify({report:'docs/six-tower-energy-analysis.md',fixed:fixed.runs.length,moving:moving.runs.length,pairedChecks:moving.pairedChecks,pairedSteps:moving.pairedSteps,runtimeSources:Object.keys(moving.sourceHashes).length}));
