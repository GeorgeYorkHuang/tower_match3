# 施工单：红卡三系列 + 熔岩/霜风全局效果（2026-11-22）

> 本稿把两份设计稿（`red-cards-split-and-new-sets-2026-11-22.md`、`field-global-effects-lava-frost-2026-11-22.md`）合并成一份可执行的改动清单，供修改 agent 按批施工。
> 基线：**v1.19.7，HEAD `00859a2`**。文中行号按该提交，改前先按符号名定位，不要盲信行号。
> 本稿只定行为，不给完整实现；数值全部集中成常量，方便一处回退。

---

## 0 施工前需拍板（2 项，已给默认值，不阻塞施工）

| 编号 | 待定项 | 默认取值 | 备选 | 影响 |
|---|---|---|---|---|
| D1 | 熔壳每层护甲加成 | 普通 **4%** / 精英 **6%** | 3% / 5% | 只改 `FIELDS.lava.heatShell.armorPerStack` 与 `eliteArmorPerStack` 两个常量 |
| D2 | 风压抗控是否并入麻痹 | **不并入**，只压「减速类」 | 并入 `paralyzed` | 只改 `statuses.js` 抗控乘区的来源判定 |

两项都可按默认先落地，实测后再单点调参，**不要同时动其他数值**。

---

## 1 改动全景（7 批，按依赖排序）

| 批次 | 主题 | 主要文件 | 前置 | 可独立验证 |
|---|---|---|---|---|
| **A** | 掉落归口数据契约（按系列而非按塔） | `config/red-relics.js` | — | 三战场各跑一局看 `runShardDetail` 的 key |
| **B** | 12 张新卡配置（塔级 key 不变，靠 series 区分） | `config/talents.js` | A | 图鉴能出 18 张、槽位能装 |
| **C** | 战斗效果（按 series 分支 + 新标记 + 12 条金） | `talents/runtime.js`、`combat/statuses.js` | B | 单塔逐条触发验证 |
| **D** | 槽位绑定（一卡一槽、不可换位）+ 套装档位 + 盘面交互 | `talents/model.js`、`game/input/talent-actions.js`、`screens/talent-board.js`、`talent-header.js` | B | 槽 0 只收火卡；错位卡自动归位 |
| **E** | 熔岩「熔壳」/ 霜风「风压」 | `config.js`、`run.js`、`wave.js`、`game/main.js`、`combat/statuses.js` | —（可与 C 并行） | HUD 层数、护甲手算对齐 |
| **F** | 经济与卡池（三箱、首通、文案、战场详情布局） | `economy/diamond-shop.js`、`prologue/completion.js`、`game/flows/relic-acquisition.js`、`screens/stage-drops.js` | A | 三个箱子各只出本系列 |
| **G** | 图鉴与收尾（18 张分页、测试档、legacy 检查） | `screens/relics.js`、`talents/testing.js` | A、B | 图鉴三 tab 各 6 张 |

C 与 E 都改 `statuses.js`，**不要并行改同一文件**：先 C 后 E，或 E 先落地抗控乘区再让 C 叠加标记（推荐顺序：A → B → D → E → C → F → G）。

---

## 2 批次 A：掉落池按系列归口

### A-1 `js/config/red-relics.js:3-6`（核心，一处改完自动带动）

现状：`fieldByTower` 把「塔 → 战场」写死，`cards(field)` 与该映射强绑。

目标：
- 新增系列映射 `SERIES_FIELD = { sanctum:'ancient', forge:'lava', gale:'frost' }`；
- `fieldOfCard(card)` = `card.seriesField || SERIES_FIELD[card.series] || null`（卡级字段优先，方便以后单卡例外）；
- `cards(field)` 改为按 `fieldOfCard` 过滤，`cards()` 无参仍返回全部 18 张（`config.js:343` 建 `RELIC_RUN.ur` 依赖这一点）；
- `fieldOf(id)` 改走 `fieldOfCard`；
- **删掉 `fieldByTower`**，避免两套真相并存。

连带自动生效、不需要再改逻辑的位置（改完请复核）：
| 位置 | 原行为 | 改后 |
|---|---|---|
| `relics/red-boss-drop.js:4` | `pool = RED.cards(field)` | 各战场只掉本系列 6 张 |
| `config.js:346` | `field: fieldOf(card.id)` | 图鉴/战场详情的 `field` 归口正确 |
| `config/retired-relics.js:3` | `Object.keys(legacy)` | 不变（见 B-3 的 id 约束） |

### A-2 掉率：**一个数字都不动**

`red-relics.js:7-12` 的 `fragments:[3,6]`、`bossDrops{20/40/60}`、`finalBossWave:60` 全部保持原值（整局期望 7.5 片）。稀释靠 F 批的分池宝箱补偿，不靠上调掉率。

### A-3 必须跟着改、否则出错的 5 个卡池

见 **F 批**。A 批落地后这些位置会立刻表现为「跨系列串味」，属于同一次提交必须一起改完的范围，不能分批拖。

---

## 3 批次 B：12 张新卡配置

### B-1 圣庭 6 张：**不改卡内字段**

`series` 已是 `sanctum`，由 A-1 的映射表接管归口，无需逐卡加 `seriesField`（少 6 处 diff，也避免两套字段打架）。

### B-2 新增 12 张：字段规范

> ⚠️ **效果正文以 `docs/red-cards-codex-2026-11-22.md` 第二、三节为准**（含每张卡的名称、紫/金规则、数值、文案、实现要点）。本节只定**字段结构**，下方效果表仅作索引，冲突时按 codex 执行。

每张卡必须齐备以下字段，其余（`shape` / `nativeSlot` / `purpleNode` / `desc` / `star2` / `star3`）**原样复制同塔圣庭卡**（`config/talents.js:762/823/883/943/1003/1063` 六段）：

| 字段 | 熔铸（forge） | 霜风（gale） |
|---|---|---|
| `id` | `ur_forge_<tower>` | `ur_gale_<tower>` |
| `series` | `forge` | `gale` |
| `tower` | 同塔圣庭卡 | 同塔圣庭卡 |
| `purple.key` | **塔 key（`fire`/`cannon`/…），不带前缀** | 同左 |
| `gold.key` | **塔 key，不带前缀** | 同左 |
| `icon` | `assets/images/redcards/ur_forge_<tower>.png` | `assets/images/redcards/ur_gale_<tower>.png` |
| 紫图标 | `assets/images/talents/forge-v1/<tower>-purple.png`（+`-gray`） | `assets/images/talents/gale-v1/<tower>-purple.png`（+`-gray`） |
| 金图标 | `assets/images/talents/forge-v1/<tower>-gold.png` | `assets/images/talents/gale-v1/<tower>-gold.png` |
| `outlineColor` | `#e8603c` 系（赤橙→暗红） | `#5dade2` 系（青蓝→霜白） |

✅**`purple.key` / `gold.key` 保持塔级、不加系列前缀**（与圣庭现状一致）。原因：**每张卡只能插在自己的原生槽，一个槽一份卡**，同塔两张卡永远不可能同时装配，塔级 key 不会冲突，`runtime.js` 的 `gold.includes('fire')`、`attacks.js:53` 的 `consume('cannon')` 全部原样可用。
系列差异不靠 key 区分，靠开局快照：`runtime.initialize` 额外记一份 `byTower = { fire:{id,series,star}, … }`，`beforeDamage` 按 `byTower[key].series` 分支（`sanctum` / `forge` / `gale`）。
👉 这条直接删掉了施工单原先的「同塔双金轮流消费」问题（R1 作废）。

紫/金效果正文（写法照抄圣庭同塔卡的句式，便于 UI 直接显示）：

| 卡 | 紫（2★） | 金（3★，每消除 12 个对应色块） |
|---|---|---|
| 熔铸·炽核熔炉 fire | 对护甲 ≥15% 的敌人直接伤害 +15% | 下一次普攻无视 50% 护甲，并挂「熔穿」3 秒（护甲 −10%，可叠加至 1 层） |
| 熔铸·膛压炉心 cannon | 对「熔穿」敌人 +15% | 下一次击杀返还 2 点能量（未击杀 1 点，不超上限） |
| 熔铸·淬火槽 ice | 冰塔攻击「熔穿」敌人 +15% | 下一次普攻使目标「淬裂」3 秒：受到伤害 +8%（同目标不叠） |
| 熔铸·硫磺脉 poison | 毒 DOT 对护甲 ≥15% 敌人 +20% | 下一次普攻附加 4 秒硫毒（累计 45% 攻击），**无视护甲** |
| 熔铸·电弧熔渣 electric | 对「熔穿」敌人 +15% | 下一次普攻额外连锁 2 名 90 范围敌人（各 60%），命中「熔穿」目标 +50% |
| 熔铸·矿渣回旋 boomerang | 对「熔穿」敌人 +15% | 返程命中额外 30% 攻击碎渣伤害（穿透护甲） |
| 霜风·凝霜之心 ice | 对带「风痕」敌人 +15% | 下一次普攻使 90 范围敌人减速 35%（3 秒）；目标带「风痕」则改冻结 0.6 秒 |
| 霜风·逆风回响 boomerang | 对减速/冻结中敌人 +15% | 命中挂「风痕」3 秒（移速 −25%，冰/电伤害 +8%） |
| 霜风·静电风眼 electric | 对带「风痕」敌人 +15% | 额外连锁 2 名 100 范围敌人（各 50%，麻痹 0.4 秒） |
| 霜风·霜蚀孢子 poison | 毒 DOT 对减速/冻结中敌人 +15% | 附加 4 秒霜毒（累计 40%）；目标减速中再延 1 秒 |
| 霜风·融霜火线 fire | 对冻结中敌人 +20% | 对冻结目标 2 倍伤害并解冻，同时叠 1 层灼烧 |
| 霜风·霜炮轰鸣 cannon | 对带「风痕」敌人 +15% | 爆炸使 100 范围敌人减速 30%（2 秒）；命中「风痕」时半径 +30% |

数值全部为**初稿**，与圣庭同档（15% / 20%），未做平衡验证，E 批落地后用 `tools/balance` 统一收口。

**补充三条施工单原先漏掉的落点（来自 codex 第 1.3 与第 7 节）**：

1. `js/combat/attacks.js:53` 是金消费点（圣庭炮金「免能耗」在这里消费）。槽位绑定后不存在同塔两张金，**此处保持原样不用改**；C 批只需在 `runtime.initialize` 补 `byTower` 记录。
2. `js/combat/damage.js` 需新增 3 个乘区：`armorBreak`（护甲 −0.10）、`_quenchCrack`（受伤 +8%）、`_windMark` 的冰电易伤 +8%；顺序建议「护甲 → 来源易伤 → 淬裂 → 天赋 flat」，并在注释里锁定。
3. 圣庭电金「雷脉传导」实际还挂了 0.5 秒 / 50% 减速（`runtime.js:116` 的 `applySlow`），卡面没写——落地时补文案，别悄悄删掉（电紫条件依赖它）。

### B-3 id 禁用词（会踩 `retired` 名单）

`red-relics.js:4` 的 `legacy` 键会被 `config/retired-relics.js` 全量拉黑，以下 6 个 id **已被占用，禁止复用**：

`ur_altar_rose`、`ur_altar_seed`、`ur_forge_heart`、`ur_slag_hammer`、`ur_frost_eye`、`ur_wind_lantern`

按 B-2 的 `ur_forge_<tower>` / `ur_gale_<tower>` 命名不会撞车（`ur_forge_heart` 是单数词，`ur_forge_fire` 不冲突），但**改 `legacy` 表就等于改老玩家存档的迁移目标**，任何情况下都不要动它。

### B-4 系列名要变成多值

现状：`config/talents.js:10` 单值 `seriesName:'圣庭'`，`screens/talent-header.js:22/25/35` 三处写死「圣庭」。
目标：新增 `seriesNames = { sanctum:'圣庭', forge:'熔铸', gale:'霜风' }`，保留旧 `seriesName` 作为 `sanctum` 的兼容别名；header 的标题、羁绊名、`n/6` 分母按「当前主系列」取。

---

## 4 批次 C：战斗效果

### C-1 按「塔 + 系列」分支（key 结构不动）

一塔一卡，`purple`/`gold` 仍是塔级数组，现有消费链路全部保留：

| 位置 | 现状 | 目标 |
|---|---|---|
| `:26-29` `initialize` | `purple/gold` = 塔 key 列表 | 追加 `byTower`：`{ fire:{id:'ur_sanctum_fire', series:'sanctum', star:3}, … }`，作为效果分支的**唯一依据** |
| `:47-57` `gain` | `gold.includes(key)` 累计充能 | **不改**（一塔一卡，不存在两条金抢充能） |
| `:59-64` `consume` | 消费塔 key 的 `ready` | **不改**；`attacks.js:53` 的炮金通道也**不用改** |
| `:66-128` `beforeDamage` | 紫/金按 `key === 'fire'` 等塔分支 | 改为先取 `s = byTower[key].series`，`sanctum` 走原逻辑、`forge` 走熔铸 6 条、`gale` 走霜风 6 条；紫判定同样先看 series |
| `:159-166` `returnHit` | 无脑消费 `boomerang` 返 4 能量 | 按 `byTower.boomerang.series` 分支：圣庭返能量、熔铸给 30% 穿透碎渣、霜风挂风痕 |

下文 C-3 表里的 `forge_fire` / `gale_fire` 就是**实际的 prefix key 值**（`red-series.js:13` 生成，`card.purple.key = card.gold.key = series + '_' + tower`），`beforeDamage` 里直接按这些字符串分支；圣庭 6 张仍走 `'fire'` 等塔级 key，两套互不覆盖。

### C-2 需要新增的敌人标记

| 标记 | 来源 | 语义 | 到期 |
|---|---|---|---|
| `e.armorBreak` | 熔铸火金「熔穿」 | 护甲 −0.10（可叠 1 层） | 3 秒，`tick` 递减 |
| `e._windMark` | 霜风回旋金「风痕」 | 移速 −25%，冰/电伤害 +8% | 3 秒 |
| `e._quenchCrack` | 熔铸冰金「淬裂」 | 受到伤害 +8%，同目标不叠 | 3 秒 |
| `e._sulfurDot` / `_frostDot` | 熔铸毒金 / 霜风毒金 | 走现有 `_talentDots`，新增 `label` 与 `ignoreArmor` 字段 | 4 秒（霜毒可 +1） |
| `e._thawImmune` | 霜风火金「解冻」后置位 | **抗冻 1 秒**：期间不可被任何来源重新冻结（只挡冻结，不挡减速/麻痹） | 1 秒（常量 `THAW_IMMUNE`） |

护甲减益的落点：`damage.js:89-93` 读 `e.armor`，**不要把 `armorBreak` 直接改写到 `e.armor`**（会与熔壳加成打架且难回退），改为在减伤计算处 读 `e.armor - (e.armorBreak?0.10:0)`，下限 0。

**抗冻的两处必改点（漏一个就会刷出无限冰冻）**：
1. `combat/statuses.js:166-179` `freezeE` 开头：`if (e._thawImmune > 0) return;`；
2. `combat/statuses.js:183-215` 的 `tickBaseStatus`：每帧 `if (e._thawImmune > 0) e.frozen = 0;` —— 防"同一帧已排队的冰弹"把冻补回来，这是唯一容易漏的路径（`wave.js:202-209` 与 `runtime.js:115` 都直接写 `e.frozen`，绕过了 `freezeE`）。

### C-3 12 条金的挂点

> **熔铸 6 张的数值/叠加/边界已定稿**：`docs\forge-six-cards-final-spec-2026-11-22.md`（2026-11-22）。下表熔铸行与它冲突时以定稿文为准，尤其：电弧是「被连锁目标各自 ×1.5（=90%）」不是主目标判定、矿渣碎渣基数取该次普攻减甲前伤害、炮返能需"预判 ready 再结算"。霜风 6 行仍为初稿，待下一轮定稿。

| key | 挂点 | 行为 |
|---|---|---|
| `forge_fire` | `beforeDamage` 命中前 | 设 `armorBreak` 3 秒 + 本次无视 50% 护甲（走 `armorIgnore` 通道，不写死到 `e.armor`） |
| `forge_cannon` | 击杀回调（`onKill`/现有击杀处） | 返 2 能量，未击杀返 1，夹 `armoryEnergyMax`；一次强化普攻多目标击杀只返一次 |
| `forge_ice` | `beforeDamage` | 挂 `_quenchCrack` 3 秒 |
| `forge_poison` | `beforeDamage`（dot 例外规则同圣庭：仅普通命中消费） | 推 `_talentDots` 一条 `ignoreArmor:true`、45% 累计、4 秒 |
| `forge_electric` | `beforeDamage` | 连锁 2 名 90 范围，各 60%，命中有 `armorBreak` 的 +50% |
| `forge_boomerang` | `returnHit` | 返程额外 30% 碎渣（穿透护甲），不返能量 |
| `gale_ice` | `beforeDamage` | 90 范围减速 35%/3 秒；目标有 `_windMark` → `freezeE(0.6)` |
| `gale_boomerang` | `beforeDamage` 命中 | 挂 `_windMark` 3 秒 |
| `gale_electric` | `beforeDamage` | 连锁 2 名 100 范围，各 50%，`paralyzed 0.4` |
| `gale_poison` | `beforeDamage` | 推霜毒 40%/4 秒，目标减速中 ttl +1 |
| `gale_fire` | `beforeDamage` | **仅当目标冻结时消费**：2 倍伤害 → `e.frozen = 0` → 设 `e._thawImmune = 1.0` → 叠 1 层灼烧；目标未冻结则**不消费 `ready`** |
| `gale_cannon` | `beforeDamage`（爆炸命中） | 100 范围减速 30%/2 秒；目标有 `_windMark` 半径 ×1.3 |

统一约束：**金效果只在 `kind === 'hit' && !skill` 时消费**（沿用 `:93` 的既有判断），dot 与技能命中不重复消费；**需要条件的金在条件不满足时不消费 `ready`**。

### C-3b 圣庭电金文案补齐（R4）

`config/talents.js` 里 `ur_sanctum_electric` 的 `gold.desc`：把「……麻痹0.5秒。」改为「……麻痹0.5秒，并附加短暂减速。」——**不写秒数**，因为这段走 `applySlow` 公共入口，霜风会被风压压到约 0.33 秒。`runtime.js:116` 的 `applySlow(o,0.5,0.5)` 保留不动。

### C-4 dot 文案不能写死

`talents/runtime.js:139` 写死 `'圣印灼烧' / '圣种毒素'`。改为建 dot 时带 `label`，`tick` 读 `d.label`，否则熔岩会飘「圣印灼烧」、霜风会飘「圣种毒素」。

### C-5 死亡转移

`:145-156` 的转移只对 `transfer:true` 生效。新卡的硫毒/霜毒**默认 `transfer:false`**（圣庭灼烧的连锁转移是其专属卖点，不外溢）。

---

## 5 批次 D：槽位绑定（一卡一槽，不可换位）

> 规则由用户拍定：**每张卡只能插在自己的 `nativeSlot`，一个槽只能放一张同塔卡。**
> 这一条把「同塔叠卡」「换槽掉攻」「同塔双金」三个问题一次性消掉——不是靠闸门，而是靠装配入口本身。

### D-1 装配校验（`talents/model.js:105-113`）

现状：`equip(meta, slot, id)` 只校验槽位范围与持有状态，任意卡可进任意槽。

目标：在 `equip` 开头加一条硬校验 —— `def.nativeSlot !== slot` 直接返回「该卡只能镶嵌在 X 号槽」（用槽位名/塔名，别返回数字给玩家看）。

- `normalize`（`:17-30`）同样要按 `nativeSlot` 校验，防止脏存档进对局；
- 三套同塔卡的 `nativeSlot` 相同，所以「一槽一卡」天然等价于「一塔一卡」，`bonuses` 里每塔只会有一份攻击加成，**白点闸门（原 D-1/D-2/D-3）整段作废，不需要实现**；
- 紫点判定（`:67-69`）保持原样（仍按「坐标被任一卡覆盖 + 该卡 2★」，与槽位无关）。

### D-2 老存档迁移（必须做，否则丢卡）

现有玩家的卡是**能换槽**的，存档里可能存在 `slots[3] = ur_sanctum_fire` 这类错位。

迁移规则（按顺序执行，一次幂等）：
1. 逐槽读取 `card.nativeSlot`；
2. 若 `slot !== nativeSlot`，尝试放回 `nativeSlot`；
3. 目标槽已被别的卡占用 → 该卡**卸下**（回到未装配状态，卡与星级/碎片全部保留，不销毁）；
4. 写回存档时打一个 `talents.version = 2` 标记，避免重复迁移。

验收：拿一份「故意错位」的存档读一次，卡要么回位、要么进背包，**不能消失**。

### D-3 槽位交互（只列本槽卡）

- `talents/model.js:candidates(meta)` → 增加 `slot` 参数，按 `nativeSlot` 过滤候选；
- `game/input/talent-actions.js` 的槽位选卡面板：点开槽 0 只出现火系卡（圣庭火 / 熔铸火 / 霜风火三选一），空槽时给「该槽只接受火塔红卡」的提示，别给一排不能用的卡；
- `screens/talent-board.js:117-130` 槽位节点点击沿用现有逻辑，只换候选池；
- 形状与朝向：`shapeOffsets`（`:41-49`）用 `shapeRotation`/`nativeSlot` 决定，卡永远在原生槽 → 行为不变，不用改；
- `talents/preview.js` 的装配预览：不再需要「换槽前后对比」，只保留「换卡前后」对比（同槽内换另一张卡）。

### D-4 套装档位按主系列（`talents/model.js:91-94`）

现状：`const n = series.sanctum || 0` —— 只认圣庭。
目标：取装配中数量最多的系列（并列时按「最近装备优先」或按 series 顺序，任选一种并写注释），`rank` 由该系列数量算（6→ssr / 4→sr / 2→r），并在返回值里带 `seriesTrack`，供 header 显示系列名。
注意：一塔一卡 = 最多 6 张卡，6 张全同系列才能吃到 SSR，混搭最高 4–5 张 → 档位天然有取舍。

### D-5 header 文案（`screens/talent-header.js:22/25/35`）

`series.sanctum` → `series[seriesTrack]`；「圣庭天赋」「圣庭羁绊」→ 按 `seriesNames[seriesTrack]` 拼接；`:37` 的三档说明文案保持通用。

---

## 6 批次 E：熔岩「熔壳」/ 霜风「风压」

### E-1 配置（`js/config.js:238` 与 `:243`）

- `FIELDS.lava` 新增 `heatShell: { startWave:10, every:10, cap:5, armorPerStack:0.04, eliteArmorPerStack:0.06 }`；
- `FIELDS.frost`：删除 `windEvery:15`，改为 `windPressure: { startWave:10, every:10, cap:5, speedPerStack:0.08, controlDurationPerStack:0.08 }`；
- `subtitle` 同步改文案（`:238` 「弹药上限 -30% · 攻击类碎片」补「熔壳叠层」；`:243` 「每15波风场增速」改「风压叠层」）；
- `FIELDS.abyss` 的 `curseEvery` **不动**。

### E-2 层数计数（`js/run.js:91-92`、`:607-611`）

- 新增 `this.heatStacks = 0`；
- 统一成「`startWave <= wave` 且 `(wave - startWave) % every === 0` 时 +1，并夹 `cap`」；风压由 `windEvery` 改读 `windPressure`；
- 顺手把 `curseStacks` 也夹上 `cap`（现在没有上限，属既有隐患，不在本次改动范围内，可留 TODO）。

### E-3 护甲落点（`js/wave.js:185-189`，**唯一正确落点**）

```js
const fieldStats = ...;             // 现有
if (fieldStats) { e.armor = fieldStats.armor; ... }   // 现有
// 熔壳在表外叠加，不改等级表
if (run.fieldCfg.heatShell && !e.isBoss) e.armor = Math.min(0.85, e.armor + heatBonus(e.type));
```

- `heatBonus` = `heatStacks * (type==='elite' ? eliteArmorPerStack : armorPerStack)`；
- **Boss 不吃熔壳**：W20/40/60 的 Boss 护甲由脚本（`config/bosses.js`）控制，再叠熔壳会变成双重惩罚；
- `0.85` 是 `damage.js:89-93` 的总减伤上限，在这里夹一次保证「表内 + 熔壳」不越界；
- 小 Boss 召唤物走 `wave.js:140` 的同一入口，按 `meta` 类型处理（普通 → 吃，Boss 召唤 → 不吃）。

### E-4 实战移速与提示（`js/game/main.js:565`、`:671-676`）

- `:565` `Math.pow(1.10, windStacks)` → `1.08`，且读 `windPressure.speedPerStack`（别写死 0.08）；
- `:671` 升层 toast 改配置驱动：熔岩「熔壳加深，敌人护甲 +4%（累计 +X%）」、霜风「风压增强，移速 +8%（累计 ×X.XX），减速时长 −8%」；
- 首波进入时的战场提示改为「每 10 波叠加一次熔壳/风压」，替代只在 W15/W30 弹一次。

### E-5 抗控乘区（`js/combat/statuses.js:125-154`、`:166-179`）

- **减速**：在 `ttl = TalentRuntime.statusDuration(...)` **之后**、任何圣遗物延长**之前**乘一次 `0.92^n`（n = windStacks）。这样「天赋时长 + 基础时长」被压，而 `ice_condense`（+1s）、`s_sr_ice_freeze` 这类**圣遗物延长不被削减**——圣遗物是玩家花资源换的抗压手段，压掉会让风压变成单项死局。
- **冻结**：`freezeE`（`:166-179`）**完全不乘**，这是控制流唯一出口。
- **麻痹**：按 D2 默认**不压**。
- 顺序务必写注释锁定，后续调参的人容易在这里改成「先乘后加」导致数值漂移。

### E-6 离线口径（`js/run.js:643-651`）

- `windMul` 由 `1.10^n` 改 `1.08^n`；
- 熔岩需要把护甲压力折进有效伤害：`dealt = totalDps * WAVE.seconds / windMul * (1 - heatArmorFactor)`，其中 `heatArmorFactor` 用普通怪加成（精英占比小，忽略），并在注释标明「与 `damage.js` 同口径的近似」。
- 说明：实战路径 `endWave(true)` 不吃 leak，此处只影响纯模拟/离线推算，但**平衡测试的离线对照要用同一口径**，否则报告里的「模拟=实战」会失真。

### E-7 HUD

- 常驻徽标：熔岩「熔壳 ×n」暖红盾形、霜风「风压 ×n」青蓝风纹，满层描金边；
- 徽标位置与现有战场状态条同区，不新增浮层；
- 战场详情页（`stage-drops`）「战场说明」加一行机制，由 `FIELDS` 生成，不写死。

---

## 7 批次 F：经济与卡池

| # | 位置 | 现状 | 目标 |
|---|---|---|---|
| F-1 | `economy/diamond-shop.js:6`、`:11-15` | 单 `scarlet`，池 = `cards()` 全池 | 拆 `scarletSanctum` / `scarletForge` / `scarletGale`，各 20 钻、1–3 片、池 = `cards(field)`；`OFFERS` 增加 `unlockField` 字段 |
| F-2 | 同上（上架） | 全部可见 | 按第 16 节第 1 条：解锁判定**复用 `field-access.reason`**（看前一战场通关记录，不用 `unlockWave`）；显示与购买接口双重拦截，测试档隔离 |
| F-3 | `prologue/completion.js:17` | `Cards.filter(...)` 全池 | 加 `card.series === 'sanctum'`，首通只送圣庭 |
| F-4 | `game/flows/relic-acquisition.js:32` | 写死「圣庭红卡碎片」 | 按卡所属系列取 `seriesNames[series] + '红卡碎片'` |
| F-5 | `game/screens/stage-drops.js:27`、`:93` | `ic=129`、`cw=290`、2 张并排 | 6 张改 **2 行 × 3 列**：`cw≈190`、`ic≈96`、行距按 `cardH` 重算；`panelH`（`:56-57`）随行数自适应 |
| F-6 | `game/screens/stage-drops.js:90` | 写死「W20概率1–2 · W40 1–3 · W60 3–6片」 | 掉率文案由 `RED.bossDrops` + `fragments` 生成，三套共用一张表时不写死 |
| F-7 | `screens/relics.js:15-17`、`:344`、`:356` | `urFieldName` 用 `field`、来源文案写死「猩红宝箱」 | 来源文案带系列名（「猩红宝箱·熔铸 / 熔岩矿场 Boss」） |

---

## 8 批次 G：图鉴与收尾

- `screens/relics.js:30-32`：18 张仍在 UR 段最前，分页 `PAGE` 需复核（一页是否装得下 18 张的排布，必要时 UR 段单独分页）；
- 图鉴加**系列筛选 tab**（圣庭 / 熔铸 / 霜风），未解锁战场的系列显示剪影与「熔岩矿场解锁」；
- `talents/testing.js:18`：`c.series === 'sanctum'` → 接受系列参数，默认 `sanctum`，测试档仍只装 6 张；
- `economy/redeem-codes.js`、`economy/mail-rewards.js`、`relics/red-migration.js`：只依赖 `legacy`，新增 id **不应**进 `retired`；改完跑一次「老存档读取 + 迁移」用例。

---

## 9 明确不改（防止顺手扩散）

1. Boss 掉率表（`red-relics.js:7-12`）与整局 7.5 片的期望；
2. 养成门槛（解锁 10 片 / 2★ 10 片 + 500 金 / 3★ 30 片 + 2000 金）；
3. 猩红宝箱单价 20 钻，不做阶梯；
4. `field-enemies.js` 的等级表（护甲/血量/攻击/数量一行都不动；若熔岩实测过重，只允许「整体下调 2pp 护甲」这一种对冲，且改表不改熔壳）；
5. 圣坛花园的 `lateEnemyHp`、`abyss` 的 `curseEvery`；
6. 天赋盘节点坐标、6 个槽位、紫点坐标（新卡全部复用）；
7. **槽位绑定（一卡一槽）**：按用户拍定执行，卡只能插 `nativeSlot`。等价于「同塔最多一张」，因此不需要额外护栏，也不再有「换槽掉攻 / 同塔双金」这些分支。

---

## 10 执行顺序与检查点

| 步骤 | 动作 | 检查 |
|---|---|---|
| 1 | A 批落地 | 三战场各 1 局到 W60，`runShardDetail` 只出现本系列 id |
| 2 | B 批落地 | 图鉴出 18 张；`config.js:343` 的 `RELIC_RUN.ur.length` = 18 |
| 3 | D 批落地 | 槽 0 拒收非火卡（提示「该卡只能镶嵌在 X 号槽」）；错位老存档读一次后卡仍在（回位或进背包） |
| 5 | C 批落地 | 12 条金逐条触发；同一塔换另一系列卡后，金效果随之整套切换（不留旧系列残留） |
| 4 | E 批落地 | 熔岩 W50 HUD ×5、普通护甲 +20%；霜风 W50 移速 ×1.47、减速 ×0.66、冻结时长不变 |
| 5 | C 批落地 | 12 条金逐条触发；同一塔换另一系列卡后，金效果整套切换，不留旧系列残留 |
| 6 | F 批落地 | 三箱各只出本系列；未解锁不显示；首通只出圣庭 |
| 7 | G 批落地 | 图鉴三 tab 各 6 张；老存档迁移正常 |

每批完成即：`node -c` 语法检查（或等价静态检查）→ 启动一次主界面 → 打完一局圣坛（回归基线）。**不要连续改两批再一起测。**

---

## 11 风险与回滚

| 风险 | 表现 | 回滚点 |
|---|---|---|
| 老存档错位卡被当脏数据处理 | 玩家红卡消失（最严重） | D-2 的迁移必须「回位或进背包」，绝不允许删除；先在测试档上验一份错位存档 |
| `byTower` 漏记某塔 | 该塔金效果不触发或触发成圣庭逻辑 | `initialize` 的 `byTower` 单独一个 commit，单塔逐条验 |
| 熔壳过重 | 熔岩 W40 后断崖 | `armorPerStack` 4%→3%，层数上限不动 |
| 抗控压到冻结 | 霜风变成无解 | `freezeE` 入口本身就是豁免点，检查是否被误乘 |
| 抗冻只挡了 `freezeE` 一层 | 冰塔连打时「解冻→立刻再冻」，融霜火线变成每发 2 倍 | `tickBaseStatus` 里的 `e.frozen = 0` 必须一起做；`wave.js:202-209`、`runtime.js:115` 是绕过 `freezeE` 的两条直写路径 |
| 6 张卡溢出面板 | 战场详情卡片压住按钮 | `cw`/`ic`/`panelH` 三个常量集中，便于回退 |
| 经济审计偏差 | 三战场都掉 + 三箱，感知上「红卡变多」 | 上线后跑「三战场各 30 局碎片产出」审计，总量应仍为 7.5/局 |

---

## 12 验收清单

- [ ] 三战场 Boss 掉落只出现本系列 id
- [ ] 图鉴三系列共 18 张，碎片进度/星级/套装档位正确
- [ ] 套装档位按主系列计算，混搭时显示主系列名
- [ ] 熔岩/霜风战场详情 6 张卡 2×3 不溢出
- [ ] 首通只赠圣庭；三箱池隔离、未解锁不上架
- [ ] **槽位绑定**：每张卡只能进自己的原生槽，6 个槽各只接收本品类卡；错位老存档读一次后卡仍在
- [ ] 新系列金触发频率 12 格一次；换掉同槽卡后旧系列效果完全消失
- [ ] 熔岩 W50：普通护甲 +20%、精英 +30%，Boss 不吃熔壳
- [ ] 霜风 W50：移速 ×1.47、减速时长 ×0.66、**冻结时长不变**
- [ ] 波末 toast 只在升层波弹一次，数值与 HUD 一致
- [ ] **抗冻生效**：融霜火线解冻后 1 秒内无法被任何来源重新冻结（拿冰塔连续命中验证），2 倍伤害 ≤1 次/秒；减速/麻痹不受影响
- [ ] **电金文案**：卡面写「并附加短暂减速」且不带秒数，实战仍施加 0.5 秒 50% 减速

---

## 13 平衡验证（E 批后必须跑）

口径沿用 11-21 复测：`field` 分别取 `ancient|lava|frost`、`profile:'elements'`、4 塔、2 秒一手、W1–60、首破即停、12 局同种子。
工具：`tools/balance/`（fixture `moving-battle-fixture.cjs`，collector 传 `field`）。

| 臂 | 圣坛实测 | 熔岩目标 | 霜风目标 |
|---|---|---|---|
| 纯塔无圣物 | 到 W20 100%、中位 25.5 | 到 W20 100%、中位 22–24 | 到 W20 100%、中位 20–23 |
| 局内圣物 | 通 W60 58% | **33–40%** | **25–33%** |
| 本系列 6 张 1★ | 83% | **45–55%** | **40–50%** |
| 本系列 6 张 3★ | 100% | **70–85%** | **65–80%** |

偏差超目标带 10 个百分点：只调 `armorPerStack`（熔岩）或 `speedPerStack`（霜风），**一次只动一边**。

---

## 14 美术与占位（不阻塞逻辑）

12 张卡 × 4 文件 = 48 张（卡图 12 / 紫彩 12 / 紫灰 12 / 金 12）。目录与命名见 B-2。
第一版可只出「12 卡图 + 12 金图标」，紫图标先复用同塔圣庭紫图并染色（靠 `outlineColor` 区分），**但 `icon` 路径必须按最终文件名写**，避免上线后再改配置。

---

## 15 本稿不包含的既有待办（别混进这次提交）

- `balance-retest-garden-arms-2026-11-21.md` 的 P0/P1 建议（B 臂降温、charge ×3 复核）——需单独拍板；
- 根 `README.md` 里 V1.19.5「W20/40/60 Boss 尚待实装」的过时条目；
- 约 28 篇旧报告里的 `node tools/collect-xxx.cjs` 路径；
- `enemy-width-adjust-2026-11-19.csv` 未落到 `enemy-visuals.js`；
- 后两战场 28 条怪物提示词尚未生成样图。


## 16 审阅补充规则（2026-11-22，实施时优先于冲突条款）

1. 战场宝箱解锁统一复用 field-access.reason，按前一战场通关记录判定，不使用 unlockWave；显示与购买接口一致，测试档隔离。
2. 三系列可复制同塔形状、nativeSlot、purpleNode；名称、描述、星级文案按本系列真实效果生成，禁止复制圣庭专属效果文案。
3. 同一紫节点允许多个已装配效果。点亮表示至少一项已激活；详情逐项列出已激活/需2星/未覆盖。无卡则显示未装配。不可仅展示find得到的第一张。
4. 单次伤害上下文承载armorIgnore/ignoreArmor/derived；所有衍生连锁、碎渣和天赋DOT标记derived，禁止再消费金效果或递归派生。减甲不写回基础armor；新标记到期自然消失。
5. 熔铸炮按一次强化普攻出手结算：任一命中击杀返2能量，否则返1；多目标仅返一次，未命中不返。霜风火只在冻结目标上消费ready；不满足条件则保留，已有其他ready按装配槽顺序寻找可触发项。
6. 熔壳/风压在W10、20、30、40、50开始时生效，上限5层；同波重复进入不重复叠层。出生怪保留出生时护甲快照，存活跨波怪不追加护甲。Boss及带isSummon/bossSummonId的Boss召唤物不吃熔壳。层数提示与HUD同一来源。
7. 护甲+4%/+6%解释为+4/+6个百分点；减速时长按0.92^层数，冻结和麻痹豁免。专属标记的减速同样经过公共入口，不能绕过风压。
8. 主系列同数量时固定sanctum、forge、gale顺序优先，不依赖装备时间，不新增存档字段。中央自选继续按主系列件数品质校验。
9. 12种子仅做摸底，不按10个百分点差异自动调参；正式对比需扩样并配对。模拟伤害折算仅作近似，不称为与实战等价。
10. 保留当前未提交包体精简、图鉴修复；新增美术须有实际可加载占位文件，且重新核对进包预算。未验证不得宣称真机通过。
11. 分批按可验收依赖安排：先 D 槽位绑定（可沿用现有 6 卡独立验证），再 A+B+C+F+G 作为系列功能闭环；A 不得单独发布。E 独立验证，最终再做三地图平衡采样。


## 17 用户规则修正：固定塔攻击点（优先于D-1及第16节默认槽闸门）
白色节点在配置中固定tower归属，任意红卡覆盖均激活，仅给节点所属塔+2攻击；同节点多卡覆盖只加一次。换槽不直接使白点失效，按覆盖变化重新计算。激活颜色取节点所属塔，取消默认槽限制、换槽失效文案与lostAttack惩罚。绿、紫、金规则保持原方案。节点归属按现有六原生槽最近分区固定写入配置，距离并列按原槽顺序。

---

## 18 用户规则修正：槽位绑定（优先于 D 批全部条款与第 17 节的白点讨论）

**规则原话：每种卡只能插一个，只能插在对应位置。**

落地为：

1. `talents/model.js` 的 `equip` / `normalize` 增加 `def.nativeSlot === slot` 硬校验，槽 0 只收火卡，槽 1 只收炮卡，依此类推；三套同塔卡共享同一个原生槽 ⇒ **一塔一卡，不可换位**。
2. 由此**白点问题整体消失**：卡恒在原生槽，白点恒生效，不做闸门、不做灰显、不做 `lostAttack`、不做「换槽失效」文案。第 17 节的白点归属规则（按节点固定 tower、同节点只加一次）照旧生效，只是「换槽」这个前提不再存在。
3. 由此**同塔双金问题整体消失**：`consume(tower)` 与 `attacks.js:53` 原样可用。
   **口径以现有实现为准（2026-11-22 核对 `/js/config/red-series.js:13`）**：新系列已用**前缀 key**（`forge_<tower>` / `gale_<tower>`）并带 `enabled:false`，`model.js:68-70` 已按 `enabled` 过滤。因此 C 批**不需要 `byTower`**——直接在 `beforeDamage` 按前缀 key 分支（`'fire'` 走圣庭、`'forge_fire'` 走熔铸、`'gale_fire'` 走霜风），把 12 张卡的 `enabled` 置 true/删掉即可。原先写的 byTower 方案作废，不要按它实现。
4. 老存档迁移必须做：错位的卡**回位**，回不去（目标槽已占）则**卸下进背包**，卡、星级、碎片一律不销毁；存档打 `talents.version = 2` 标记保证幂等。
5. 槽位选卡面板只列本槽可用的卡，并给「该槽只接受 X 塔红卡」的空槽提示。
6. 套装档位仍按主系列计算（一塔一卡 ⇒ 最多 6 张，6 张同系列才 SSR），并列时按 `sanctum → forge → gale` 顺序取，不新增存档字段（沿用第 16 节第 8 条）。
7. 你先前否决的「同塔最多 N 张」护栏仍然不加——槽位绑定已经天然实现，不需要第二套规则。


## 19 当前实施汇总（2026-11-22）

本节按代码核对；“已完成”指代码实现及所列离线检查，不代表真机验收或已发布。

### 已完成
- 红卡：圣庭/熔铸/霜风各6张，共18张；按系列归属花园/熔岩/霜风。
- 获取：W20 50%×1–2、W40 1–3、W60 3–6（加权），完整通关期望7.5；每波奖励防重。
- 宝箱：三种猩红宝箱各20钻、各自系列1–3片，按真实战场通关记录解锁；教学首通仅圣庭。
- 天赋：白点固定tower，任意红卡覆盖，同节点仅加一次+2；颜色跟随节点所属塔；主系列按件数、并列按sanctum/forge/gale。
- 新卡升星扩大覆盖；熔铸/霜风紫金enabled=false，文案设计中，不接入原稿12条效果；圣庭原效果保留。
- UI：三系列图鉴筛选、战场2x3卡布局、动态掉率说明、详情来源、替换收益预览和紧凑底部按钮、撤销。
- 美术：18张256px透明六边形图标v3；统一细红边，圣庭绿底/熔铸熔岩底/霜风冰霜底。卡片矩形背景、天赋槽位恢复原样。
- 地图：熔壳/风压W10起每10波升层，最多5层；熔壳普通+4pp/精英+6pp、Boss和Boss召唤豁免；风压移速1.08^n、减速时长0.92^n，冻结麻痹不压，HUD及提示已接。
- 既有修复保留：正式战场建塔解锁图鉴；失败银币折算与深度收益各保留30%；每日商店/限购宝箱售罄变灰；花园W1–14实例尺寸覆盖；包体排除历史素材与无损压缩。

### 已验证
- tools/test-red-series-integration.cjs：18卡解锁升星/效果开关/图片、3系列掉落及宝箱、Boss去重、6旧ID迁移幂等、54组固定白点构筑。
- Boss调用链、暂停/倍速/复活/撤离回归通过；防线结算96场景通过。
- 全量274个JS语法检查通过（新增修改后需再跑）；三系列图鉴各6卡绘制检查通过。
- 最近静态估算：主包1.904MiB、资源26.645MiB、合计28.549MiB；最终以开发者工具实际打包为准。

### 待确认/待完成
- 第18节固定槽位为文档新增条款，尚未实施；等待用户确认，不能把文档中的“规则原话”当作本次聊天的新指令。
- 新系列紫金继续设计中，原稿技能表为待设计资料，非当前可用效果。
- 真机视觉验收、实际打包复核、三地图平衡扩样尚未完成。
- 当前改动尚未提交Git；远程最近已知版本v1.19.7/00859a2，发布前需重新核对。
- COS/远程资源仅讨论，尚无域名、存储桶和加载层接入，不计入已完成。


## 20 本批收尾与基线（2026-11-22）
- 图鉴补齐未解锁系列剪影与真实解锁条件；持有旧卡保留查看资格。
- tools/test-red-series-visibility.cjs、固定槽位、三系列链路回归通过；全量275个JS语法检查通过。
- A/B无红卡三地图72局已跑完，六组运行源码哈希一致，按相同种子配对。
- 结果见field-baselines-2026-11-22.md/.csv及6份baseline-*.json.gz。B通关：花园7/12、熔岩1/12、霜风6/12。样本仅用于摸底，不直接等于真人通关率，不自动调参。
- 采集入口曾遗漏seed，已停止并修正重跑；废弃记录以invalid-seed命名保留，不纳入结果。
- 紫金效果仍设计中，真机及实际包体验收仍待完成；本批未提交或推送。
