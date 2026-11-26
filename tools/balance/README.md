# 平衡测试与数值模拟（tools/balance）

本目录是**所有数值平衡相关脚本的唯一入口**。离线回放、能量/伤害采集、曲线推导、报告生成和对应的回归测试都放在这里，`tools/` 根目录不再存放平衡脚本。

脚本直接读取 `js/` 的真实战斗逻辑运行，不经过微信运行时；多数采集脚本会先把源码冻结在内存里再回放，避免研究中途被其他改动影响。它们统一只写 `docs/` 下的原始数据与报告，不改游戏配置、不写存档。

## 目录结构

```text
tools/balance/
  fixtures/    共享夹具：跑一局真实战斗所需的最小运行环境
  scenarios/   情景定义：六塔统一路线、能量候选等“测什么”的约定
  collectors/  采集脚本：跑模拟，产出 raw JSON / CSV
  observers/   运行期观察器：挂在夹具上记账，不改规则、不改随机数
  curves/      曲线、预算与只读测算脚本（含绘图）
  retests/     复测、重跑与报告写出
  reports/     报告脚本：读 raw 数据，生成 md / csv / png
  tests/       平衡相关的自动化回归
```

依赖顺序：`fixtures` → `scenarios` → `collectors`/`observers` → `reports`。报告脚本只吃采集产物，本身不跑模拟。

## 夹具与情景

| 文件 | 用途 |
| --- | --- |
| `fixtures/moving-battle-fixture.cjs` | 主力回放夹具：真实棋盘、动画、移动出怪、攻城与 Boss。`collect` 支持 `field`／`profile`／`seed`／`cadence`（2 秒一手）／`maxWave`／`windowEnd`／`maxSeconds`／`startWave`／`startLevel`／`fixedLevel`／`relics`／`selectRelic`／`talentStar`（1｜2｜3 圣庭红卡，按 `js/talents/testing.js:snapshot` 原生槽位装配，`newRun` 之后注入）／`talentOnly`（注入后只保留指定乘区，用于隔离攻击与绿点）／`configureGame`／`stopAtFirstBreach` |
| `fixtures/tower-balance-fixture.cjs` | 六塔固定靶夹具：按合法选择建塔，记录伤害与实扣能量，用于单塔/组合的定点对比 |
| `fixtures/freeze-runtime.cjs` | 把 `js/` 冻结为本进程内存快照，保证同一报告内源码一致 |
| `fixtures/relic-only-policy.cjs` | 只计局内一星圣遗物的构筑策略：只看当前候选，不预看后续随机数 |
| `fixtures/relic-replay-support.cjs` | 圣遗物回放共用范围检查与 W20/W40 观察器 |
| `fixtures/relic-interventions.cjs` | 单因素干预：只改当前 Game 实例，不动配置与存档 |
| `scenarios/six-tower-current-routes.cjs` | 六塔本轮统一路线（三技能 + 分支），保证跨测试不换构筑 |
| `scenarios/garden-energy-candidates.cjs` | 技能收费候选：只折算选定普攻技能，Boss/锁关保留原价 |

## 采集脚本（collectors/）

| 文件 | 测什么 |
| --- | --- |
| `collect-moving-battle.cjs` | 整局战役与中后期窗口的通用回放入口 |
| `collect-garden-entry-native.cjs` | 圣坛花园首版验收：不注入任何增伤/经验/Boss 参数，24 组从 W1 回放 |
| `collect-garden-entry-balance.cjs` | 入门难度候选：沿用伤害 +20% 的回放，仅放大 W40 本体/分身生命 |
| `collect-garden-attack-stats.cjs` | 攻击配置落地后的花园回放，无结算增伤注入 |
| `collect-garden-bottlenecks.cjs` | W25 起缺能诊断：逐次只给单塔/全队补能，仅作诊断 |
| `collect-garden-energy-skills.cjs` | 火/炮单技能收费对照与组合候选复测 |
| `collect-garden-full60.cjs` | 花园完整 60 波收尾：只重放已过 W40 的组，早期失败复用 |
| `collect-garden-late-rebalance.cjs` | 花园后半段单版验收：8 组完整回放 + 16 组失败复用 |
| `collect-six-tower-current.cjs` | 六塔当前版复测：固定 60 能量成长参考 + 三图真实三消供能 |
| `collect-six-tower-energy.cjs` | 六塔供能对照：固定投入靶场 + 三地图移动回放 |
| `collect-fire-ice.cjs` | 火/冰弹道专项：六种子六阵容，就近选敌/当前/候选三方案对照 |
| `collect-periodic-skill-audit.cjs` | 电/冰周期路线采集，附被动施法术与辅助统计 |
| `collect-wave15-20.cjs` | W15–20 专项：同棋盘前 14 波，随后只给火/炮 60 能量参考 |
| `collect-projectile-waste.cjs` | 六塔普攻空耗比较（原路线/强化路线） |
| `collect-relic-only.cjs` | 只计 1 星圣遗物的 W20/W40 压力测试，正常供能，无商店/天赋 |
| `collect-relic-interventions.cjs` | 一星圣遗物单因素对照：输出、经验入账、W40 本体血量 |
| `collect-primary-energy-retest.cjs` | 强化普攻移动补测，仅在本进程切换系数 |
| `collect-aurora-budget.cjs` | 极光电击收益候选（主弧 120% / 分叉 60%） |
| `collect-garden-relic-arms.cjs` | 圣坛花园圣遗物摸底：`A` 无圣物／`B` 局内圣物／`C1` 红卡 1★／`C3` 红卡 3★／`C1A` 1★ 仅攻击／`C1G` 1★ 仅绿点，参数 `node … <臂> <种子串>`，每臂写 `docs/garden-relic-arms-<臂>-<日期>.json.gz` |

## 观察器（observers/）

`fire-ice-observer`（火/冰散射几何机会与命中）、`periodic-skill-observer`（电/冰周期技施法与雷球空脉冲）、`projectile-waste-observer`（弹体命中/落空/在途守恒）、`tower-energy-observer`（耗能、未足额扣费、射程损失）、`wave15-20-observer`（W15–20 逐波供能与 Boss 阶段）。观察器只读：不允许改变伤害、费用、弹道或随机调用顺序。

## 曲线与测算（curves/）

`balance_curve.js` + `balance_curve_plot.py`（波次强度曲线）、`exp_curve_current.js` / `exp_curve_solver.js`（经验曲线现状与求解）、`onboarding_curve.js`（新手引导节奏）、`prologue_budget.js`（前三章预算）、`relic_pace_curve.js` + `relic_pace_plot.py`（圣遗物节奏）、`auto_match_value.js` + `auto_match_potion_plot.py`（自动消除价值）、`analyze-cannon-support.cjs`（炮火支援测算）、`audit-current-attack-budget.cjs`（普攻弹体与收费核对）、`benchmark-fire-ice-targeting.cjs`（选敌开销，桌面 Node 计时，不能换算真机帧率）。

## 复测与报告

`retests/`：`retest-six-towers.cjs`（六塔伤害复测入口）、`retest-prologue-curves.cjs`（前置章节曲线抽样）、`repro-fire-energy-range.cjs`（射程快照修复复核）、`write-six-tower-energy-report.cjs`（从采集结果写报告与 CSV）。

`reports/`：17 个 `report-*.py`，每个对应一或多个采集产物，输出 md / csv / png 到 `docs/`。报告脚本不覆盖历史结论，新结论另起文件名。`report-garden-relic-arms.py` 汇总四臂摸底，出总表、每 5 波存活、首破波次与逐局表。

## 平衡回归（tests/）

14 项，覆盖夹具与采集口径本身是否正确（不是数值结论）：

`test-entry-balance`、`test-combined-attack-budget`、`test-attack-range-snapshot`、`test-fire-ice-trajectory`、`test-fire-ice-observer`、`test-tower-energy-observer`、`test-wave15-20-observer`、`test-periodic-skill-audit`、`test-garden-energy-candidates`、`test-garden-late-rebalance`、`test-garden-relic-arms-fixture`、`test-moving-battle-collector`、`test-relic-only-policy`、`test-relic-interventions`。

## 怎么跑

在仓库根目录执行：

```powershell
# 平衡回归（快，几秒到几十秒）
node tools/balance/tests/test-entry-balance.cjs

# 采集（分钟级；各脚本参数写在文件头注释里，多数带默认值）
node tools/balance/collectors/collect-garden-entry-native.cjs

# 出报告（读上一步的 raw 数据）
python tools/balance/reports/report-garden-entry.py

# 圣遗物四臂摸底（每臂 12 局约 7–20 分钟，可四臂并行）
node tools/balance/collectors/collect-garden-relic-arms.cjs A 1,2,3,4,5,6,7,8,9,10,11,12
python tools/balance/reports/report-garden-relic-arms.py
```

环境：Node.js ≥ 18、Python 3（`matplotlib` 用于 `*_plot.py`）。无 npm 依赖、无 `package.json`。

## 约定

1. **不注入配置**：需要试参数时只在当前进程临时改 Game 实例或缩放数值，绝不写 `js/config/*`。
2. **口径写清楚**：报告必须注明是否带圣遗物（`relics`）、是否注入增伤、种子列表与操作节奏（默认 2 秒一手）。
3. **失败也要留**：回放失败、超时、首破点的局照样记录，不因结论不好看而重跑掩盖。
4. **只追加不覆盖**：新报告用新文件名，旧结论作为历史基线保留。
5. **离线不代表真机**：模拟只验证逻辑与数值边界，不能换算成真实通关率、帧率或温度表现。

## 设计与结论

口径与结果记录：`docs/balance-test-garden-arms-2026-11-17.md`（六臂 72 局的完整口径、指标定义、自证方式与局限）。
调整建议书：`docs/balance-adjustment-proposals-2026-11-17.md`（诊断、P0/P1/P2 建议、验收流程、执行边界）。

约定：本目录只放脚本与夹具；结论与建议一律写到 `docs/`，按日期新起文件，不覆盖历史基线。

## 与 tools/ 根目录的关系

`tools/` 根目录仍保留非平衡脚本（Boss、UI、棋盘、规则类回归，以及资源处理 PowerShell 脚本）。其中若干测试会借用本目录的夹具，引用已改为 `./balance/fixtures/...`，不要把它们搬回根目录，也不要移动夹具位置。

已知当前失败（与平衡无直接关系，记录于此避免误判）：`test-field-enemies`、`test-opening-relic-pick`、`test-prologue-features`、`test-prologue-foundation`。前三者在工作区未提交的 Boss/战场改动下失败；`test-opening-relic-pick`、`test-prologue-features`、`test-prologue-foundation` 在 V1.19.5 提交点（HEAD）上同样失败。

## 历史文档里的旧路径

迁移前脚本都平铺在 `tools/`，`docs/` 里的旧报告仍写着 `node tools/collect-xxx.cjs` 这类命令。对照关系是按用途换目录、文件名不变：

| 旧路径 | 现路径 |
| --- | --- |
| `tools/collect-*.cjs` | `tools/balance/collectors/collect-*.cjs` |
| `tools/report-*.py`、`tools/*_plot.py` | `tools/balance/reports/` |
| `tools/retest-*.cjs`、`tools/repro-*.cjs`、`tools/write-six-tower-energy-report.cjs` | `tools/balance/retests/` |
| `tools/*-observer.cjs` | `tools/balance/observers/` |
| `tools/moving-battle-fixture.cjs` 等夹具 | `tools/balance/fixtures/` |
| `tools/six-tower-current-routes.cjs` 等情景 | `tools/balance/scenarios/` |
| `tools/balance_curve.js`、`exp_curve_*.js`、`analyze-*.cjs` 等 | `tools/balance/curves/` |
| `tools/test-{entry-balance,combined-attack-budget,...}` | `tools/balance/tests/` |

旧报告的数字与结论不因目录调整而改变，但复跑时请改用上表的新路径。

