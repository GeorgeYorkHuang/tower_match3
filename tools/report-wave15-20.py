"""生成W15–20火/炮专项诊断；数据来自真实移动战斗及仅W15起改变供能的配对实验。"""
from pathlib import Path
import csv
import gzip
import hashlib
import json
import statistics

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / 'docs'
data = json.loads((DOCS / 'wave15-20-diagnosis.json').read_text(encoding='utf-8'))
with gzip.open(DOCS / 'wave15-20-diagnosis-raw.json.gz', 'rt', encoding='utf-8') as f:
    raw = json.load(f)
assert len(data['runs']) == len(raw['runs']) == 28
assert data['pairedChecks'] == 20 and data['sourceHashes'] == raw['sourceHashes']
for name, digest in data['sourceHashes'].items():
    assert hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == digest
with gzip.open(DOCS / 'six-tower-energy-skill-factors-primary-raw.json.gz', 'rt', encoding='utf-8') as f:
    previous = json.load(f)
assert previous['sourceHashes'] == data['sourceHashes']
baseline_checks = 0
for run in raw['runs']:
    if run['condition'] != 'normal':
        continue
    prior = next(r for r in previous['runs'] if r['condition'] == 'skillFactors'
                 and r['profile'] == run['profile'] and r['seed'] == run['seed'])
    for a, b in zip(prior['moves'], run['moves']):
        assert a['board'] == b['board'] and a['move'] == b['move']
    # W20清场时的终止方式不同，但W1–19逐波记录必须完全一致。
    assert [w for w in prior['waves'] if w['wave'] < 20] == [w for w in run['waves'] if w['wave'] < 20]
    if run['terminal'] == 'wall_broken':
        assert run['wave'] == prior['wave'] and run['damage'] == prior['damage']
    baseline_checks += 1

NAMES = {'fire': '火塔', 'cannon': '炮塔'}
CONDITIONS = {'normal': '真实供能', 'fire60': '仅火塔60', 'cannon60': '仅炮塔60', 'both60': '火炮均60'}
PROFILES = {'elements': '火冰毒电', 'artillery_control': '火冰电炮', 'summon_control': '火冰毒炮', 'wind_artillery': '火冰镖炮'}


def table_csv(name, rows):
    with (DOCS / name).open('w', newline='', encoding='utf-8-sig') as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def group(condition, key, lo, hi):
    rows = [w['towers'][key] for r in data['runs'] if r['condition'] == condition and key in r['keys']
            for w in r['observations']['waves'] if lo <= w['wave'] <= hi and key in w['towers']]
    secs = sum(r['seconds'] for r in rows)
    sums = {k: sum(r[k] for r in rows) for k in rows[0] if isinstance(rows[0][k], (int, float))}
    return dict(condition=condition, key=key, waveLo=lo, waveHi=hi, seconds=secs,
                levels=sorted({lv for r in rows for lv in r['levels']}), **{k: v for k, v in sums.items() if k != 'seconds'},
                averageEnergy=sums['energySeconds']/secs, zeroFraction=sums['zeroSeconds']/secs,
                below40=sums['low40Seconds']/secs, rangeBlocked=sums['rangeBlockedSeconds']/secs,
                requestedPerSecond=sums['asked']/secs, paidPerSecond=sums['paid']/secs,
                requestPerLaunch=sums['asked']/max(1,sums['launches']),
                splashPerHit=sums['splashHits']/max(1,sums['directHits']),
                splashDamageShare=sums['splashDamage']/max(1,sums['splashDamage']+sums['directDamage']),
                hitFraction=sums['hitProjectiles']/max(1,sums['hitProjectiles']+sums['missedProjectiles']),
                damageState=sums['launchDamageState']/max(1,sums['launches']))


aggregates = [group(cond, key, lo, hi) for cond in CONDITIONS for key in NAMES
              for lo, hi in [(1, 10), (11, 14), (15, 19), (20, 20)]
              if any(r['condition'] == cond and key in r['keys'] for r in data['runs'])]
for a in aggregates:
    originals = [w for r in data['runs'] if r['condition'] == a['condition'] and a['key'] in r['keys']
                 for w in r['waves'] if a['waveLo'] <= w['wave'] <= a['waveHi']]
    for label, source in [('matchIncome','matchEnergy'), ('refillIncome','refillEnergy'),
                          ('allAttackAsked','requestedAttackEnergy'), ('allAttackPaid','actualAttackEnergy'),
                          ('skillAsked','requestedSkillEnergy'), ('skillPaid','actualSkillEnergy')]:
        a[label] = sum(w['towers'].get(a['key'],{}).get(source,0) for w in originals)
native_rows = []
boss_rows = []
for r in data['runs']:
    for w in r['observations']['waves']:
        if not 15 <= w['wave'] <= 20:
            continue
        original = next((v for v in r['waves'] if v['wave'] == w['wave']), None)
        assert original is not None
        for key, row in w['towers'].items():
            income = original['towers'].get(key, {})
            native_rows.append(dict(seed=r['seed'], profile=r['profile'], condition=r['condition'], wave=w['wave'], key=key,
                                    seconds=w['seconds'], wallStart=w['wallStart'], wallEnd=w['wallEnd'],
                                    matchIncome=income.get('matchEnergy',0), refillIncome=income.get('refillEnergy',0),
                                    totalAttackRequested=income.get('requestedAttackEnergy',0), totalAttackPaid=income.get('actualAttackEnergy',0),
                                    skillRequested=income.get('requestedSkillEnergy',0), skillPaid=income.get('actualSkillEnergy',0),
                                    **{k:v for k,v in row.items() if not isinstance(v,list) and k!='seconds'}, levels='/'.join(map(str,row['levels']))))
    w = next((w for w in r['observations']['waves'] if w['wave'] == 20), None)
    final = next((w for w in r['waves'] if w['wave'] == 20), None)
    assert w and final
    boss_rows.append(dict(profile=r['profile'], seed=r['seed'], condition=r['condition'],
                         cleared=r['terminal']=='window_complete', wallStart=w['wallStart'], wallEnd=r['wallHp'],
                         bossHp=max(0, final['boss']['hp'] or 0), phase=final['boss']['phase'],
                         fightSeconds=w['bossSeconds'], phase1Seconds=w['bossPhase1Seconds'],
                         phase2Seconds=w['bossPhase2Seconds'], shieldSeconds=w['bossShieldSeconds'], wallSeconds=w['bossWallSeconds'],
                         bossDamageByTower=w['bossDamage'], levels=final['levels']))

table_csv('wave15-20-diagnosis-towers.csv', native_rows)
table_csv('wave15-20-diagnosis-boss.csv', [{**r, 'bossDamageByTower':json.dumps(r['bossDamageByTower'],ensure_ascii=False),
                                         'levels':json.dumps(r['levels'])} for r in boss_rows])
table_csv('wave15-20-diagnosis-aggregate.csv', [{**r, 'levels':'/'.join(map(str,r['levels']))} for r in aggregates])
summary = dict(date=data['date'], counts=28, pairedChecks=data['pairedChecks'], pairedSteps=data['pairedSteps'],
               passiveBaselineChecks=baseline_checks, aggregates=aggregates, bosses=boss_rows,
               sourceHashes=data['sourceHashes'], dataHash=hashlib.sha256((DOCS/'wave15-20-diagnosis-raw.json.gz').read_bytes()).hexdigest(),
               fireRangeRepro=json.loads((DOCS/'wave15-20-fire-range-repro.json').read_text(encoding='utf-8')))
(DOCS / 'wave15-20-diagnosis-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')


def pct(v): return f'{100*v:.1f}%'


md = ['# W15–20专项诊断：火塔与炮塔强化普攻', '',
      '日期：2026-11-10。基于每技能独立能耗系数的当前工作区；本轮只新增tools/docs分析文件，不修改游戏源码、技能参数、Boss数值或存档。', '',
      '## 结论：先修多重火球射程快照，再试调费用', '',
      '**复现了比数值更优先的实现问题：多重火球按扣费前射程选中目标，随后按扣费后射程生成弹道，缺能扣到0时会把已锁定目标截在射程外。**', '',
      '单目标复现：目标距塔500，出手前能量1.0528、射程562.86，能耗2.1056；扣到0后3枚火球的弹道都只有400，实际伤害0。相同目标、60能量时弹道780，实际伤害104.74。此复现使用同一原生攻击/碰撞逻辑，无技能伤害或费用改动；证据为wave15-20-fire-range-repro.json，复跑tools/repro-fire-energy-range.cjs。', '',
      '在这28组自动测试里，正常供能只有2/8击败W20；仅从W15起把火塔保持60能量就8/8击败；仅炮塔60为3/6。供能确实是重要瓶颈，但不能把它直接解释为火塔基础攻击不足或Boss整体过强。', '',
      '正常供能W20每次直击仅额外带来约0.18次火塔溅射、0.19次炮塔溅射，而原计费仍按3个额外目标预估。炮塔W15–19已结算弹体命中率约46%，大量目标在炮弹到达前已死；这些是降低实际能效的独立因素。', '',
      '建议下一步顺序：①让多重火球弹道沿用出手前射程，验证修复不会让无目标攻击或其他技能多射；②对同一8组真实供能基线复测；③再按单体Boss与清怪分开试算火/炮独立系数，避免用持续降费掩盖落空。炮弹目标死亡后是否保留落点爆炸或转移目标属于行为设计，应另行确定，本轮只记录不改。', '',
      '## 方法与边界', '',
      '- 花园、无圣物/天赋/商店，普通三连每2秒一次，种子41/123；四个含火塔的四塔阵容，三组同时含炮塔。全部采用强化普攻路线；全局补能/锻造和升级按既有采集策略执行。',
      '- 前14波保持完全相同，从W15开始分别设置真实供能、仅火塔60、仅炮塔60、火炮均60。60是正常能量档参考，非100满能量；只在离线进程内补能，不是改游戏自动回能。',
      '- 8个真实供能基线＋20个供能干预，共28组；到W20全歼或首次破防终止。原先没有火/炮的组合以及W15之前就失守的组合不在此次专项范围，不代表全部阵容都能到W20。',
      f'- {data["pairedChecks"]}组共同操作前缀共{data["pairedSteps"]}步通过，干预前W1–14逐波记录完全一致。8个基线与上轮W1–19完全一致。观察器的独立测试验证不改变回放、伤害、血量、随机数和棋盘；弹体命中/落空/在途守恒。',
      '- 持续补能会连带改变射程、伤害、周期、击杀升级、全局补能触发及队友生存环境；这是供能干预，不能把净差异全部归为一项伤害系数。单塔60不等于只把该塔伤害调高。',
      '- 溅射统计针对真实普攻所发弹体，按实际伤害调用区分主目标直击与其他目标溅射；三消额外攻击、连消转弹和技能不混入。按命中发生波次计伤害，按发射波次记弹体结局；跨波弹体/终止时在途弹体不能当成落空。',
      '- Boss伤害含生命和护盾的实际损失，可能因护盾刷新超过其52000生命，不是纯生命伤害。Boss二阶段、护盾存在时间、抵墙时间分别记录。', '',
      '## W20结果', '',
      '| 阵容·种子 | 真实供能 | 仅火塔60 | 仅炮塔60 | 火炮均60 |',
      '| --- | --- | --- | --- | --- |']
for profile in PROFILES:
    for seed in [41,123]:
        cells=[]
        for cond in CONDITIONS:
            r=next((r for r in boss_rows if r['profile']==profile and r['seed']==seed and r['condition']==cond),None)
            cells.append('—' if r is None else f'击败，墙{r["wallEnd"]:.0f}' if r['cleared'] else f'失守，Boss剩{r["bossHp"]:.0f}')
        md.append(f'| {PROFILES[profile]}·{seed} | '+' | '.join(cells)+' |')

md.extend(['', '## 正常供能：逐段能耗和射程', '',
           '按该段实际在场时间加权；技能等级为真实成长，不锁满级。每次费用列只统计真实普攻，实际总支出另含三消额外攻击和周期技能。', '',
           '| 塔 | 波段 | 平均能量 | 零能量时间 | <40时间 | 射程受限时间 | 普攻请求/秒 | 实扣/秒 | 每次普攻请求 | 出手伤害档位均值 |',
           '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |'])
for a in aggregates:
    if a['condition']!='normal':continue
    md.append(f'| {NAMES[a["key"]]} | W{a["waveLo"]}–{a["waveHi"]} | {a["averageEnergy"]:.1f} | {pct(a["zeroFraction"])} | {pct(a["below40"])} | {pct(a["rangeBlocked"])} | {a["requestedPerSecond"]:.3f} | {a["paidPerSecond"]:.3f} | {a["requestPerLaunch"]:.3f} | {a["damageState"]:.2f} |')
md.extend(['', 'W15以后实际供能与请求：三消收入已按能量上限截断，补给收入单列；支出包括三消额外攻击，周期费用单列。不能把“请求/秒”当成满射程持续攻击的理论需求，缺能缩程已经减少了请求次数。', '',
           '| 塔 | 波段 | 三消收入/秒 | 补给收入/秒 | 普攻及三消额外攻击请求/秒 | 周期请求/秒 | 实扣合计/秒 |',
           '| --- | --- | ---: | ---: | ---: | ---: | ---: |'])
for a in aggregates:
    if a['condition']!='normal' or a['waveLo']<15:continue
    t=a['seconds']
    md.append(f'| {NAMES[a["key"]]} | W{a["waveLo"]}–{a["waveHi"]} | {a["matchIncome"]/t:.3f} | {a["refillIncome"]/t:.3f} | {a["allAttackAsked"]/t:.3f} | {a["skillAsked"]/t:.3f} | {(a["allAttackPaid"]+a["skillPaid"])/t:.3f} |')

md.extend(['', '## 正常供能：普攻实际命中与溅射收益', '',
           '| 塔 | 波段 | 已结算弹体命中率 | 直击次数 | 溅射伤害次数 | 每次直击额外溅射人数 | 溅射占普攻有效直伤 | 目标死亡落空弹体数 |',
           '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |'])
for a in aggregates:
    if a['condition']!='normal' or a['waveLo']<15:continue
    md.append(f'| {NAMES[a["key"]]} | W{a["waveLo"]}–{a["waveHi"]} | {pct(a["hitFraction"])} | {a["directHits"]} | {a["splashHits"]} | {a["splashPerHit"]:.2f} | {pct(a["splashDamageShare"])} | {a["deadTargetMisses"]} |')
md.extend(['', '火塔定价按每枚火球固定预估3个溅射对象；炮塔重炮按主目标外3个溅射对象定价。上表比较实际平均人数与这个预估，不意味着需要立即按本次人数收费。溅射命中同一敌人多次按多次结算，表内“人数”实际为每次直击的平均额外命中次数。', '',
           '## W20阶段与Boss抵墙', '',
           '| 阵容·种子（真实供能） | Boss阶段 | Boss战时长 | 二阶段时长 | 护盾存在时长 | Boss抵墙时长 | 入W20城墙 |',
           '| --- | ---: | ---: | ---: | ---: | ---: | ---: |'])
for r in boss_rows:
    if r['condition']!='normal':continue
    md.append(f'| {PROFILES[r["profile"]]}·{r["seed"]} | {r["phase"]} | {r["fightSeconds"]:.1f}s | {r["phase2Seconds"]:.1f}s | {r["shieldSeconds"]:.1f}s | {r["wallSeconds"]:.1f}s | {r["wallStart"]:.0f} |')
md.extend(['', '## 复核文件', '',
           '- 逐波供能和收费：wave15-20-diagnosis-towers.csv；包含三消收入、补给收入、周期技能费用、普攻实际命中与伤害。',
           '- Boss对照：wave15-20-diagnosis-boss.csv；汇总：wave15-20-diagnosis-summary.json；完整回放：wave15-20-diagnosis-raw.json.gz。',
           '- 复跑：`node tools/test-wave15-20-observer.cjs`、`node tools/collect-wave15-20.cjs`、`python tools/report-wave15-20.py`。',
           '- 未进行真人操作、真机帧率/温度、圣物构筑或大样本胜率测试。两个种子和四阵容用于定位机制，不能用于声称某一塔的全局强度或直接决定Boss削弱。', ''])
(DOCS/'wave15-20-diagnosis.md').write_text('\n'.join(md),encoding='utf-8')

# 可分享的静态图：明确分母不同，保留探索性试验口径。
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager
font=Path('C:/Windows/Fonts/msyh.ttc')
if font.exists():
    font_manager.fontManager.addfont(str(font))
    plt.rcParams['font.family']=font_manager.FontProperties(fname=str(font)).get_name()
fig,axes=plt.subplots(1,2,figsize=(13,5.7),gridspec_kw={'width_ratios':[1,1.15]})
fig.patch.set_facecolor('#f5f7fa')
labels=['正常供能','仅火塔60','仅炮塔60','火炮均60']
counts=[sum(r['cleared'] for r in boss_rows if r['condition']==cond) for cond in CONDITIONS]
totals=[sum(r['condition']==cond for r in boss_rows) for cond in CONDITIONS]
for i,(count,total,label) in enumerate(zip(counts,totals,labels)):
    axes[0].barh(i,count/total*100,color=['#a1abb9','#23877b','#bd8a47','#23877b'][i],height=.55)
    axes[0].text(count/total*100+2,i,f'{count}/{total}',va='center',fontsize=12)
axes[0].set_yticks(range(4),labels)
axes[0].invert_yaxis();axes[0].set_xlim(0,118)
axes[0].set_title('W20击败Boss的组数（仅本批样本）',pad=15)
axes[0].set_xlabel('通过比例（%）')
rows=[a for a in aggregates if a['condition']=='normal' and a['waveLo']>=15]
for i,a in enumerate(rows):
    axes[1].barh(i,a['splashPerHit'],color='#23877b',height=.55)
    axes[1].text(a['splashPerHit']+.04,i,f'{a["splashPerHit"]:.2f}',va='center')
axes[1].set_yticks(range(len(rows)),[NAMES[a['key']]+(' W15–19' if a['waveLo']==15 else ' W20') for a in rows])
axes[1].invert_yaxis();axes[1].set_xlim(0,3.6)
axes[1].axvline(3,color='#b25845',linestyle='--',label='收费预估3个溅射目标')
axes[1].set_title('每次普攻直击的实际额外溅射次数',pad=15)
axes[1].legend(frameon=False,loc='lower right',fontsize=9)
for ax in axes:
    ax.grid(axis='x',alpha=.14);ax.set_axisbelow(True)
    for edge in ['top','right','left']:ax.spines[edge].set_visible(False)
    ax.tick_params(axis='y',length=0)
fig.suptitle('W15–20诊断 · 供能与实际命中收益',fontsize=19,fontweight='bold',y=.98)
fig.text(.5,.04,'花园 · 2秒普通三连 · 无圣物 · 两种子、四阵容 · 28组\n前14波相同，W15起仅指定塔维持60能量；各组分母不同，不是真人胜率。',ha='center',fontsize=10,color='#4e5b6c')
fig.tight_layout(rect=(0,.15,1,.91),w_pad=2)
fig.savefig(DOCS/'wave15-20-diagnosis.png',dpi=140)
plt.close(fig)
print(json.dumps(dict(runs=28, pairedChecks=data['pairedChecks'], pairedSteps=data['pairedSteps'], baselineChecks=baseline_checks,
                      outcomes={cond:dict(clear=sum(r['cleared'] for r in boss_rows if r['condition']==cond),total=sum(r['condition']==cond for r in boss_rows)) for cond in CONDITIONS})))
