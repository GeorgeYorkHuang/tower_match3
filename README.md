# 圣坛裂痕（微信小游戏）

三消 × 塔防 × Roguelike 竖屏小游戏。通过三消激活六系防御塔、补充能量，搭配技能分支与圣遗物抵御敌人。

当前游戏版本：**V1.19.5**。版本唯一入口为 [`js/config/version.js`](js/config/version.js)。

## 本地运行

1. 克隆本仓库，在微信开发者工具中导入仓库根目录，项目类型选择「小游戏」。
2. 使用项目已有的 `project.config.json` 与 `game.json`，按自己的微信开发权限配置 AppID。
3. 编译运行；资源由启动流程加载 `assets` 分包。
4. 真机预览时重点检查资源加载、透明特效、特殊方块图标及长时间战斗性能。

运行时代码使用 CommonJS 与 Canvas，逻辑画布为 750 × 1626；无需先执行 npm 构建。离线回归脚本使用 Node.js，与微信运行环境分开。

## 章节与战场

| 阶段 | 名称 | 波数 | 颜色池 | 塔位 | 主要规则 |
| --- | --- | ---: | ---: | ---: | --- |
| 第一章 | 圣庭初醒 | 10 | 3 | 2 | 不开放技能、分支、全局技能、商店及圣遗物 |
| 第二章 | 圣庭之门 | 20 | 4 | 3 | 塔最高4级；开放技能激活，不开放分支及圣遗物 |
| 第三章 | 圣庭试炼 | 40 | 5 | 4 | 开放分支、圣遗物及完整教学流程 |
| 圣庭战场 | 圣坛花园 | 60 | 按正式战场配置 | 按正式战场配置 | 正式构筑与通关奖励 |
| 圣庭战场 | 熔岩矿场 | 60 | 按正式战场配置 | 按正式战场配置 | 通关圣坛花园后解锁 |
| 圣庭战场 | 霜风峡谷 | 60 | 按正式战场配置 | 按正式战场配置 | 通关熔岩矿场后解锁 |
| 后续挑战 | 深渊裂隙 | 无尽挑战 | 按战场配置 | 按战场配置 | 通关霜风峡谷后解锁，掉落节奏独立 |

章节规则集中在 `js/config/prologue.js`；战场准入在 `js/field-access.js`。主页只允许切换到已解锁战场和最近一个未解锁战场。测试档可绕过准入，不回写普通档通关记录。

第一、二章使用独立怪物成长曲线匹配塔的输出上限。章节显示名称调整保留原始 ID，以兼容已有存档。

## 核心玩法与当前规则

### 三消与防御塔

- 六系塔：火、冰、毒、电、炮、回旋镖。三消驱动塔激活、能量补给与成长。
- 四消生成特殊方块；连消从 Combo ×3 开始发射攻击，弹道允许落空。
- 每个技能在一局中只能选择一条分支；选定后不可转选另外两条。
- 普攻强化能耗按技能首次激活档计算，各技能独立配置折算倍率；分支升级不再额外增加能耗。
- 周期技能能量不足时仍可释放，扣光剩余能量；本次伤害按出手前能量计算。
- 塔图鉴展示六塔技能、分支与强化后的普攻能耗。

### 局内圣遗物

普通三地图采用固定12个宝箱节点：

| 节点 | 局内奖励 |
| --- | --- |
| 进入 W2 | 首次普通宝箱 |
| W5、10、15、25、30、35、45、50、55 Boss | 每波一个普通宝箱 |
| W20、40 Boss | 每波一个全金宝箱，三选一候选均为金色 SSR |
| W56–59 | 不新增局内宝箱 |
| W60 | 不新增局内选择，保留局外通关奖励与红卡碎片 |

宝箱落地后飞入棋盘，消除其上下左右相邻方块即可领取。普通三地图精英不再随机掉局内宝箱；深渊保留独立规则。局内紫、金圣遗物按 ID 去重，蓝色可叠加；金色限制在开箱与重掷时保留。

完整候选、补位与耗尽补偿规则见 [局内圣遗物发放说明](docs/battle-relic-schedule.md)。

### 局外成长与商店

- 圣遗物支持碎片解锁与升星，溢出碎片转化为通用圣物粉尘。
- 天赋盘通过红色圣遗物的覆盖形状激活天赋；一至三星覆盖4／8／12个天赋点，覆盖限定在槽位两格范围内。
- 商店分为每日精选、圣遗物宝箱和钻石商店；每日精选保底两项蓝卡，其余按蓝50%／紫35%／金15%刷新。
- 邮箱支持一键领取、删除已领取邮件和滚动查看。兑换码与奖励可在 `js/config/redeem-codes.js` 配置。
- 每日前两局的金币加成会在进入战斗处提示，具体计数与收益由经济模块处理。
- 已预留激励广告入口：复活、结算双倍、每日钻石与免费宝箱。未配置有效广告位时提示不可用，不模拟广告完成发奖；结算翻倍包含碎片，不包含通关宝箱。

## V1.19.5 更新

- 为熔岩矿场与霜风峡谷的1–60波普通怪、精英配置独立的生命、护甲、攻击、移速与攻城间隔。
- 两张地图分别使用独立数量曲线、分批出怪节奏和在场上限；达到上限时等待，不丢弃待生成敌人。
- 波次总生命预算与实际生成队列保持一致。
- 本轮未替换两张地图的 Boss 机制；新设计的 W20／40／60 Boss 尚待实装。

此前版本已接入前三章、教学遮罩、战场解锁、新版塔图鉴、圣遗物查看卡片，以及能耗、加载和结算文案调整。

## 代码导航

```text
game.js                         微信小游戏入口
game.json / project.config.json 小游戏与开发者工具配置
assets/                         图片、音频等运行资源分包
js/
  loading.js                    分包加载与进度显示
  config.js / config/           配置聚合及独立配置
  game/main.js                  游戏状态、主循环与流程协调
  game/input/                   触摸、点击与滚动路由
  game/screens/                 主页、商店、天赋、图鉴、战斗弹窗与结算
  game/layers/ / game/fx/        场景绘制与特效
  game/flows/                   圣遗物获取、结算等业务流程
  board.js / match3.js           棋盘规则与三消动画状态机
  run.js / effects.js            单局资源、成长与技能选择
  wave.js / field-enemies.js     波次生成与地图独立怪物规则
  combat/                       选敌、能耗、弹道、伤害与六塔技能
  bosses/                       已接入的 Boss 逻辑
  prologue.js / prologue/        前置三章规则与进度
  talents/ / relics/             天赋、圣遗物与碎片成长
  economy/ / ads/                商店、奖励与激励广告
  save.js / save/                存档读写、快照与迁移
docs/                           设计、分析与部分历史发布记录
tools/                          离线回归、采集与资源处理脚本
```

常用配置入口：

| 内容 | 文件 |
| --- | --- |
| 游戏版本 | `js/config/version.js` |
| 前三章规则 | `js/config/prologue.js` |
| 塔基础属性／技能行为 | `js/config/towers.js`、`js/config/tower-skills.js` |
| 技能候选与文案 | `js/config/skills.js` |
| 熔岩／霜风普通怪与精英 | `js/config/field-enemies.js` |
| 公共怪物／已接入 Boss | `js/config/monsters.js`、`js/config/bosses.js` |
| 局内圣遗物节点 | `js/config/battle-relic-drops.js` |
| 圣遗物／红卡／天赋 | `js/config/relic-catalog.js`、`js/config/red-relics.js`、`js/config/talents.js` |
| 商店与宝箱收益 | `js/config/shop.js`、`js/config/chest-rewards.js` |
| 兑换码／广告位 | `js/config/redeem-codes.js`、`js/config/rewarded-ads.js` |
| 性能预算 | `js/config/performance.js` |

## 离线验证

在仓库根目录使用 Node.js 运行，示例：

```powershell
node tools/test-field-enemies.cjs
node tools/test-prologue-acceptance.cjs
node tools/test-prologue-enemy-curve.cjs
node tools/test-battle-ui-refresh.cjs
node tools/test-first-wave-chest.cjs
node tools/test-boss-wall-boundary.cjs
node tools/test-wall-breach-settlement.cjs
node tools/test-guided-spotlight.cjs
node tools/test-targeting-and-landings.cjs
```

V1.19.5 发布时，上述9项回归与253个运行脚本的语法检查通过。离线模拟用于验证逻辑和数值边界，不代表真实玩家通关率，也不能替代真机画面、温度与帧率测试。

已知待核定项：第一章关闭全局技能，第三种颜色的充能收益口径尚待统一。

部分早期测试与分析保留历史假设，不应把所有旧脚本或旧报告直接视为当前版本验收标准。历史发布记录见 [V1.18.8](docs/releases/v1.18.8.md)、[V1.18.9](docs/releases/v1.18.9.md)；后续版本以代码及 Git 标签为准。

## 发布维护

更新游戏版本时，只修改 `js/config/version.js` 中的版本值，并在微信开发者工具上传时填写相同版本。Git 标签使用 `vX.Y.Z`，例如 `v1.19.5`。

README 与纯文档更新无需提升游戏版本。提交前核对工作区，保留并行开发中的其他改动；微信平台上传仍需单独通过开发者工具完成。
