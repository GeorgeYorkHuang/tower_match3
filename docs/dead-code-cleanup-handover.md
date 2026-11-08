# 旧代码与无用资源清理 · 工程交接单

| 项目 | 内容 |
|---|---|
| 文档版本 | v1.0 |
| 编制日期 | 2026-11-08 |
| 适用项目 | `tower_match3`（微信小游戏 / 原生 Canvas / 三消 × 塔防 × Roguelike） |
| 处理对象 | 工程侧（主程 / 客户端） |
| 文档状态 | **待评审，未执行** |
| 本次已完成动作 | 仅静态审计；**未删除、未修改任何代码或资源文件** |
| 关联产物 | `docs/version-cleanup-audit.json`（v1.18.5 注释标签清理记录）、`assets_bk/resource-cleanup-20261105-*/manifest.json`（历史资源迁移记录） |

---

## 一、背景与目标

项目历经 v1.4 → v1.18.5 多轮迭代，存在三类历史残留：

1. 拆分重构时「提取完但从未接入」的模块；
2. 玩法下架后仍保留的配置、绘制分支与旧版资源；
3. 旧版资源目录被新版目录取代后未清理。

**本单目标**：给出可核对、可分批、可回滚的清理清单，供工程侧评估与派工；不追求一次性删净，优先保证不影响线上表现与老存档兼容。

**不在本单范围**：包体压包 / 分包策略与远程资源 CDN 方案。现行微信小游戏代码包限制为「主包 ≤ 4 MB、主包 + 所有分包合计 ≤ 30 MB、单个普通分包不限制大小」（官方文档 2026-04-09 版）。本项目按 `game.json` 的 `packOptions.ignore` 精确统计：**进包合计 23.52 MB = 主包 1.65 MB + `assets` 分包 21.87 MB**，30 MB 额度下余 6.48 MB。注意 2023-10 官方公告把 20 MB→30 MB 的扩容限定于「已开通虚拟支付」的小游戏，本项目为 IAA 广告变现，若账号未开通虚拟支付，实际额度可能仍是 20 MB（即超 3.52 MB），**额度须在 MP 后台 / 开发者工具上传时确认**。压包、远程 CDN 与缓存扩容需另立任务。AI 素材商用授权、美术定稿评审亦不在本单范围。

---

## 二、结论摘要

审计口径：扫描 `js/**/*.js` + `game.js` 共 **217 个 JS 文件、513 条 require/import 引用边**，并做导出符号外部提及统计、资源 basename 引用统计。

| 类别 | 实测规模 | 体积 | 优先级 | 本轮建议动作 |
|---|---|---|---|---|
| A. 零入边孤立模块（整文件无引用） | 5 个 JS | 约 15 KB | **P0** | 确认后删除 |
| B. 模块内死分支（已下架技能绘制） | 3 处 | — | P1 | 随 A 一并清理 |
| C. 导出符号「外部零提及」候选 | 52 个（17 个文件） | — | P2 | **仅登记，本轮不动** |
| D. 旧版资源目录 | 112 + 19 + 6 = 137 张 | 约 0.5 MB | P1 | 确认后归档删除 |
| E. 仓库内备份目录 | `art/` 34 MB、`assets_bk/` 58 MB | 92 MB | P3 | 仅归档，不物理删除 |
| F. 误报 / 动态拼接路径 | 340 张零命中中 174 张属拼接误报 | — | **红线** | **禁止删除** |

> 关键提示：D 类体积收益很小（约 0.5 MB），E 类 92 MB 已被 `packOptions.ignore` 排除、不进包。本单主要价值是**降低维护噪声与误改风险**，不是解决包体上限。

---

## 三、扫描口径与可复现方法

1. **模块引用图**：遍历全部 `.js`，正则提取 `require('…')` / `import … from '…'`，按 Node 解析规则（补 `.js`、补 `/index.js`）还原为绝对路径，统计每个文件的入度；入度 0 且非入口（`game.js`、`js/loading.js`）判为孤立模块。
2. **导出符号**：解析 `module.exports = { … }` 与 `exports.xxx =`，严格口径为「该标识符在其余 216 个文件中一次都未出现」。排除 `js/game/fx/pixelfx-debuff-runtime.js`（内部打包模块表）。
3. **资源**：在全部 JS / `game.json` / `project.config.json` 文本中检索资源文件名；**未命中不等于无引用**，需结合模板字符串拼接规则二次确认（见第六节红线）。
4. 复核命令见附录 C。

---

## 四、待处理清单（按批次派工）

### 批次 1 · P0：5 个零入边孤立模块（建议本轮处理）

| # | 文件 | 规模 | 导出 | 判定依据 | 建议动作 |
|---|---|---|---|---|---|
| 1 | `js/game/enemy-size.js` | 88 B / 2 行 | 转发 `../enemy-size.js` | 全文仅 `module.exports = require('../enemy-size.js')`；业务侧 6 处均直接 require 根目录 `js/enemy-size.js`，无人经过此壳 | 直接删除 |
| 2 | `js/game/fx/firepillar.js` | 4,740 B / 111 行 | 10 个符号（附录 A） | 文件头注释自述为「从 render.js 机械提取的数据与选帧层」；导出符号全项目零提及；现役火柱绘制仍走 `render.js` 内联 / `js/game/fx/fire.js` | 删除；若后续要做火柱表现数据化，以本文件为参考另起接入 |
| 3 | `js/game/fx/firewall.js` | 2,059 B / 50 行 | `ASSETS, N, FPS, AR, frameIndex, layout, fade, sparkSpec` | 文件头注释明确「render.js 原方法保留（Codex 接入时把内联常量替换为本模块调用即可）」；`render.js:643 / :645` 仍委托 `_getFireFx()`，从未指向本模块 | 删除 |
| 4 | `js/game/icons/special-chip.js` | 5,665 B / 131 行 | `configure, preload, specialChip, cachedKeys, TINT, RES` | 旧「双层染色 + 离屏合成 37 张缓存位图」方案；现役为 `js/game/icons/chip-skin.js` 的 `garden-v2/` + `special-garden-v3/` 静态查表。取代关系为**推断**，请工程确认后删 | 确认后删除 |
| 5 | `js/game/screens/talent-purple-frame.js` | 2,638 B / 74 行 | `draw` | 紫色天赋六边形装饰框；零引用。现役绘制由 `talent-socket.js`（凹槽）、`talent-art.js`、`talent-node-icons.js` 承担。是否为废弃方案**需工程确认** | 确认后删除 |

> 共同证据：这 5 个文件在 `js/` 下无任何 `require` 入边，也未出现在 `js/loading.js`、`js/game/main.js`、`js/game/render.js` 入口链中；其中 3 个仅被 `docs/version-cleanup-audit.json` 与历史资源迁移 manifest 以文件名形式记录过。

### 批次 2 · P1：模块内死分支（建议随批次 1 处理）

`js/game/icons/skills.js` 的 `motifs` 表（第 94 行起）定义了 16 个全局技能绘制分支，但 `js/global-skills.js:3` 引入的 `POOL`（来自 `js/skills/global-catalog.js`）只有 13 个技能，以下 3 段永不进入：

| 分支 | 行号 | 对应已下架技能 | 建议动作 |
|---|---|---|---|
| `shuffle` | `:95` | 全局洗牌 | 删除该分支 |
| `barrier` | `:101` | 护盾类 | 删除该分支 |
| `pull` | `:106` | 牵引类 | 删除该分支 |

> 注意：`CONFIG.GLOBAL_SKILL.shuffleSkill`（`js/config/skills.js`）仍有 2 处引用，属战斗内洗牌按钮配置，**不在本批删除范围**。

### 批次 3 · P2：导出符号候选（本轮只登记，不删）

严格口径下 52 个导出符号在其它文件中完全未出现，涉及 17 个文件，明细见附录 A。

**风险说明**：静态扫描覆盖不到字符串拼接调用、测试/预览工具入口、以及未来接入位。`createPanelScroller`、`createShopScroller`、`createService`、`createShopService` 等工厂函数命名上像现役组件，很可能通过间接方式使用。**本批仅作为后续重构的排查索引，禁止据此批量删除。**

### 批次 4 · P1：旧版资源目录（确认后归档删除）

| 目录 | 数量 | 判定依据 | 建议动作 |
|---|---|---|---|
| `assets/images/relics/**` | 112 张 / 480 KB | `render.js:178` 的 `loadImg` 会把 `assets/images/relics/` 前缀强制替换为 `assets/images/relics_hd/`；全项目无第二条读取该目录的路径。现役 `relics_hd/` 为 3.2 MB / 112 张 | 归档后删除旧目录 |
| `assets/images/interface/chips/` 根目录 | 19 张 | `chip-skin.js` 的 `BASE_DIR` / `GLYPH_DIR` / `SPECIAL_DIR` 分别指向 `garden-v2/`、`garden-v2/`、`special-garden-v3/`；根目录仅 `glyph_rainbow.png` 仍由 `specialSrc()` 拼接引用。零引用名单见附录 B | 归档后删除 19 张 |
| `assets/images/interface/chips/special-garden-v2/` | 6 张 | 已被 `special-garden-v3/` 取代，`js/` 中 0 次提及 | 归档后删除 |

> `rainbow.png` 的 basename 是 `glyph_rainbow.png` 的子串，按文件名包含匹配会产生歧义；本次按拼接规则人工核正为「`glyph_rainbow.png` 活跃、其余 19 张零引用」。删除前请再以路径级检索复核一次。

### 批次 5 · P3：仓库污染（不进包，仅归档）

- `art/`（34 MB）：各版技能图标备份、程序化旧图、底板源图；
- `assets_bk/`（58 MB）：2026-11-05 资源清理迁移备份及 manifest；
- `docs/version-cleanup-audit.json`：历史注释标签清理记录，非死代码清单。

三者均已被 `game.json` 的 `packOptions.ignore` 排除，**不进包、不影响线上**；建议移出仓库到归档存储，但**在新版本稳定前不要物理删除**（当前唯一回滚依据）。

---

## 五、红线：禁止删除项

| 对象 | 原因 |
|---|---|
| `js/game/fx/pixelfx-debuff-runtime.js` 及其 `core/*.js` 引用 | 该文件把 pixelfx 运行时打包成单文件内部 `modules` 表 + 自实现 `load()`；`require('core/math.js')` 等是内部模块 id，**不是断链**，且被 `approved-debuffs.js:2` 引用 |
| `js/config/retired-relics.js` | 老存档兼容逻辑，被 `js/meta.js:118`、`js/relics/progression.js:4`、`js/run.js:132` 引用；删除会导致旧档圣遗物判定异常 |
| `assets/images/relics_hd/**`、`assets/images/towers/skills/**`、`interface/chips/garden-v2/**`、`interface/chips/special-garden-v3/**` | 全部由模板字符串动态拼接路径，完整文件名不会出现在源码文本中。全量 basename 扫描共 340 张「零命中」，其中这 4 个目录占 **174 张**（`relics_hd` 112、`towers/skills` 44、`garden-v2` 12、`special-garden-v3` 6），**均为误报**；其余 166 张才是 D 类真死资源与其它待核目录。禁止按「零引用」名单批量删除 |
| `assets/images/interface/chips/glyph_rainbow.png` | 仍由 `chip-skin.js:73` 的 `specialSrc()` 拼接引用 |
| `js/config/skills.js` 的 `MATCH_SKILL.chain` / `chainStart` / `chainEnergy` | 连消配置槽虽已下架，但连锁三消的战斗逻辑仍活跃：`MATCH_SKILL.chain` 6 处、`chainStart` 8 处、`chainEnergy` 3 处引用，需单独评估 |

---

## 六、执行顺序与回滚

1. **先备份**：将批次 1、2、4 涉及的文件整体复制到仓库外归档目录（保留原相对路径），确认归档可读。
2. **小批推进**：每批 ≤10 个文件，删除后立刻编译验证；任一步失败立即从归档还原并停止。
3. **顺序建议**：批次 1 → 批次 2 → 批次 4 →（观察一个版本）→ 批次 3 复核 → 批次 5 归档。
4. **不建议合并提交**：代码删除与资源删除分开 commit，便于二分定位。
5. **回滚**：`git` 工作区当前已有大量未提交的资源改动，删除前请确认基线；必要时先打 tag 或建立清理分支。

---

## 七、回归验证清单

| # | 验证项 | 通过标准 |
|---|---|---|
| 1 | 全量语法检查 | `js/` 下 216 个 JS 文件 `node --check` 全部通过（`game.js` 为 ESM 入口，交给开发者工具编译校验） |
| 2 | 引用图复核 | 重跑引用图，除已知 `pixelfx-debuff-runtime.js` 内部 `core/*` 模块 id 外断链数 = 0，且无新增零入边模块 |
| 3 | 微信开发者工具编译 | 无 `module not found`、无白屏、控制台无图片加载失败 |
| 4 | 火系特效 | 战斗内触发火柱、火墙、火雨，帧动画与伤害时点无变化 |
| 5 | 特殊方块 | 四消 / 五消生成行爆、列爆、十字、分裂、乱数、彩虹方块，图案与染色正常 |
| 6 | 技能图标 | 主页技能卡、图鉴、三选一升级、塔详情共 48 张 v6 图标全部走图片，未回退 emoji / 名首字 |
| 7 | 圣遗物 | 图鉴、局内圣物栏、红卡、碎片商店图标正常（确认 `relics_hd/` 路径未受影响） |
| 8 | 天赋树 | 六边形凹槽、紫 / 金 / 红卡槽绘制正常，无缺框 |
| 9 | 老存档 | 用旧档进入，圣遗物持有判定与 `retired-relics` 兼容逻辑无异常 |
| 10 | 包体 | `game.json` 的 `subpackages` 与 `packOptions.ignore` 未被改动，编译产物体积变化符合预期 |

---

## 八、验收标准

- 批次 1、2、4 全部完成，第七节 10 项回归全部通过；
- 引用图复核无断链、无新增孤立模块；
- `git diff` 中代码删除与资源删除可分别定位、可一键回滚；
- 归档目录完整保留被删文件，并附本交接单与归档清单；
- 批次 3、5 的处理结论书面记录（可「本轮不处理」），不悬空。

---

## 九、风险与未决事项

1. **静态扫描局限**：无法覆盖字符串拼接调用、反射、测试工具入口。批次 1 的判定较硬（零入边 + 无入口链），批次 3 误报率高，务必区别对待。
2. **取代关系待确认**：批次 1 中 `special-chip.js`、`talent-purple-frame.js` 的「被现役模块取代」为职责推断，需工程确认是否存在尚未合入的接入计划。
3. **包体收益有限**：D 类旧资源仅约 0.5 MB，且主包实测只有 1.65 MB（距 4 MB 上限余量充足），本次清理对 30 MB（或 20 MB）整包上限几乎无帮助；压包、远程 CDN 与「空间提升」缓存扩容需另立任务。
4. **基线未提交**：当前工作区存在大量未提交资源改动，清理前请先确认 git 基线，避免与图标重制工作互相覆盖。
5. **数据口径**：本文所有数量、体积均为 2026-11-08 本次静态扫描实测值；若期间有代码合入，需重跑附录 C 命令后更新。

---

## 附录 A · 52 个「导出但外部零提及」符号（P2，仅登记）

| 文件 | 符号 |
|---|---|
| `js/ads/rewarded-video.js` | `createService` |
| `js/combat/collision.js` | `bodyRadius` |
| `js/config/chain-flight.js` | `orbRadius` |
| `js/config/combat-presentation.js` | `keepLogic`, `UNKNOWN_TINT` |
| `js/config/mail-ui.js` | `rowHeight` |
| `js/config/redeem-codes.js` | `vip666` |
| `js/config/relic-catalog.js` | `relTower` |
| `js/config/skills.js` | `weakPeriod` |
| `js/economy/shop.js` | `createShopService` |
| `js/effects.js` | `TowerBuild`, `TARGET_OF` |
| `js/game/account.js` | `switchProfile` |
| `js/game/fx/boss-rosea.js` | `DEFAULT_CONF` |
| `js/game/fx/damage-numbers.js` | `formatAmount` |
| `js/game/fx/firepillar.js` | `ASSETS_BASE`, `N_BASE`, `AR_BASE`, `RISE_T`, `RISE_WINDOW`, `FALL_WINDOW`, `pillarShape`, `baseShape`, `layoutBase`, `warnRing` |
| `js/game/icons/chip-skin.js` | `NORMALS` |
| `js/game/icons/shop-items.js` | `ICON_SRC` |
| `js/game/icons/special-chip.js` | `specialChip`, `cachedKeys` |
| `js/game/input/panel-scroll.js` | `createPanelScroller` |
| `js/game/input/relic-scroll.js` | `createRelicScroller` |
| `js/game/input/shop-scroll.js` | `createShopScroller` |
| `js/game/input/talent-actions.js` | `persist` |
| `js/game/screens/chest-rewards.js` | `rewardsFor` |
| `js/game/screens/relic-card.js` | `rarityColor` |
| `js/game/screens/skill-loadout.js` | `fallbackSkillIcon`, `fallbackWrapText` |
| `js/game/screens/talent-layout.js` | `towerNames` |
| `js/game/screens/talent-socket.js` | `palettes` |
| `js/relics/kill-hooks.js` | `fireExplosionSpread` |
| `js/relics/progression.js` | `shardCapacity` |
| `js/run.js` | `simulateSession`, `expOfShape`, `mulberry32` |
| `js/skills/chain-attacks.js` | `collectRecords`, `TOWER_KEYS`, `DEFAULT_START_GROUP`, `DEFAULT_LAYOUT`, `DEFAULT_POLICY` |
| `js/talents/outline.js` | `boundary` |
| `js/talents/view.js` | `defaultZoom` |
| `js/tower-activation.js` | `revealAt` |

> 已排除 `pixelfx-debuff-runtime.js`（内部打包模块表）。宽松口径（只查 `.name` / 解构调用）会得到 166 个，误报更多，不采信。

## 附录 B · `interface/chips/` 根目录 19 张零引用名单

```
base_blue.png      base_green.png     base_orange.png    base_purple.png
base_red.png       base_yellow.png    glyph_blade.png    glyph_bolt.png
glyph_bomb.png     glyph_col.png      glyph_cross.png    glyph_flame.png
glyph_flask.png    glyph_rand.png     glyph_row.png      glyph_snow.png
glyph_split.png    glyph_sub.png      rainbow.png
```

`special-garden-v2/` 6 张：`glyph_col.png`、`glyph_cross.png`、`glyph_rand.png`、`glyph_row.png`、`glyph_split.png`、`glyph_sub.png`。

**保留**：`glyph_rainbow.png`（`chip-skin.js:73` 拼接引用）。

## 附录 C · 复核命令

在项目根目录 `D:\workspace\tower_match3` 执行：

```bash
# 1) 找出零入边模块（Node，粘贴执行）
#    注意：js/loading.js 是 ESM 入口（game.js 用 import 加载），必须显式排除，否则会被误报。
node -e "const fs=require('fs'),p=require('path');const w=(d,o=[])=>{for(const f of fs.readdirSync(d)){const q=p.join(d,f);fs.statSync(q).isDirectory()?w(q,o):f.endsWith('.js')&&o.push(q)}return o};const F=w('js').concat(['game.js']);const I={};F.forEach(f=>I[p.resolve(f)]=0);for(const f of F){const t=fs.readFileSync(f,'utf8');for(const m of t.matchAll(/require\(\s*['\"]([^'\"]+)['\"]\s*\)/g)){if(!m[1].startsWith('.'))continue;const b=p.resolve(p.dirname(f),m[1]);for(const c of [b,b+'.js',p.join(b,'index.js')])if(fs.existsSync(c)&&fs.statSync(c).isFile()&&I[p.resolve(c)]!==undefined){I[p.resolve(c)]++;break}}}console.log(F.filter(f=>I[p.resolve(f)]===0&&!['game.js','loading.js'].includes(p.basename(f))).join('\n'))"

# 2) 语法全量检查
find js -name '*.js' -exec node --check {} \;

# 3) 确认旧目录无第二条读取路径
grep -rIn "images/relics/" js/ --include=*.js | grep -v relics_hd

# 4) 确认历史排除规则仍在
grep -n "art\|assets_bk\|docs" game.json
```

**命令 1 的预期输出（清理前）**——应恰好是这 5 行；若多出其它文件，说明期间有代码合入，需重新评估：

```
js\game\enemy-size.js
js\game\fx\firepillar.js
js\game\fx\firewall.js
js\game\icons\special-chip.js
js\game\screens\talent-purple-frame.js
```

（Windows 下路径分隔符显示为反斜杠属正常。）清理完成后重跑，预期输出为空。

---

**免责说明**：本清单为静态审计草稿，所有「可删除」结论均为静态证据推断，正式落地前需经工程复核、团队评审与回归验证；批次 3 与红线项不得据此直接删改。
