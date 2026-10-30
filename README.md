# 深窟远征（微信小游戏）

三消 × 塔防 × roguelike 小游戏。逻辑画布 750×1626 竖屏，CommonJS 模块。

## 设计文档

```
├── SKILLS.md                                  // 技能系统规格（6 塔 × 8 特效 × 3 分支）
├── 深窟远征-动画与特效规格.md                  // 动画/VFX 规格
└── docs
    ├── 圣遗物星级与战场合约设计方案.md        // 圣遗物星级/玩法合约战场/撤离点/深度宝箱/账号绑定设计
    └── 撤离曲线数值设计稿.md                  // 撤离点经济曲线/难度超车/里程碑跳变设计（待评审）
```

## 源码目录介绍

```text
game.js → js/loading.js → js/game/main.js
assets/                         图片、音频、动画帧素材分包
js/
  config.js                     兼容聚合入口；布局、战场和部分经济配置
  config/
    monsters.js                 怪物等级、波次、精英与 Boss
    towers.js                   塔基础属性、塔位、经验成长
    skills.js                   技能池、说明、消耗、选择与解锁规则
    tower-skills.js             六塔分支行为数值
    global-balance.js           全局技能行为数值
    combat-common.js            通用战斗数值
    relics.js                   圣遗物定义、稀有度、升星规则
    test-access.js              本地测试入口开关与口令
  board.js / match3.js           棋盘算法 / 交换与连锁动画控制
  run.js / combat.js             单局状态与结算 / 攻击、弹道、伤害
  effects.js / wave.js           塔技能构筑与分支 / 敌人生成
  meta.js / save.js              玩家档案、兼容委托 / 本地存档
  save/snapshot.js              存档深层快照，恢复/导出不共享嵌套对象
  save/migrations.js            旧版存档与技能改名迁移
  global-skills.js               全局技能兼容出口
  economy/
    calendar.js / shop.js        每日日期 / 精选与宝箱购买、限购
  skills/
    unlocks.js                  技能解锁与扣费
    global-catalog.js           全局技能目录与动态说明
    global-loadout.js           双槽归一化和旧配置兼容
    global-runtime.js           全局技能施放、计时和波次清理
  relics/
    queries.js                  定义查询、分类与随机抽取
    progression.js              碎片、手动解锁、升星
    deep-chests.js               深度宝箱、等待、速开及奖励入账
  game/
    main.js / render.js          主循环与协调 / 渲染兼容入口
    canvas.js / audio.js / ui.js  画布适配 / 声音 / 基础绘制
    account.js                  本地测试档切换、机型信息
    input/
      touch.js / coordinates.js  手势生命周期 / 坐标换算
      relic-scroll.js            圣遗物惯性滚动（参数见config/relic-scroll.js）
      menu-actions.js           菜单动作、弹窗、购买操作分发
      battle-actions.js         战斗弹层优先级、点击消费与战斗动作分发
    screens/
      home.js / menu-header.js  战场主页 / 顶部功能与货币栏
      menu-shop.js              局外商店绘制（不执行购买）
      battle-shop.js            局内商店绘制与点击矩形（不执行购买）
      skill-loadout.js          技能配置卡片与选择面板
      account-menu.js           功能菜单和我的信息
      codex.js                  塔图鉴主页和技能详情
      relics.js                 圣遗物滚动页、图鉴、详情与升星
    icons/ / fx/                图标及部分特效播放参数
tools/                          Node 测试、HTML 预览与构建工具
docs/                           设计、数值字典和重构记录
```

## 数据隔离与重构进度（2026-10-30）

领域配置是共享定义；玩家的金币、碎片、星级属于 `Meta`，棋盘、塔能量、技能分支和冷却属于当前 `Run`/战斗实例。业务状态不得写回配置表。 `Meta.fromJSON/toJSON` 与存储读取边界均复制嵌套数据；读取失败或未知版本存档不会被自动空档覆盖，详见 [R08验收说明](docs/存档隔离-R08验收说明.md)。兼容入口保留同一配置对象引用，不复制第二套数值。

已分离：四类领域数据、触摸与菜单路由、主页/顶部栏/局外商店绘制、塔图鉴与圣遗物页面绘制、圣遗物成长、深度宝箱、局外商店、技能解锁和全局技能目录/槽位/运行逻辑。定义模块不反向依赖 `config.js`；查询函数通过聚合配置上下文调用。服务显式接收档案或对局，不缓存玩家引用；绘制模块只返回点击区域，扣款、发奖归业务模块。

仍待分离：`combat.js` 中各塔攻击与圣遗物触发、`run.js` 中消除收益挂点、其余界面和战斗弹窗、旧版圣物成长与宝箱。尚未完成全部硬编码数值迁移，P2/P3 平衡提案也不属于本轮机械重构。

完整范围、依赖和下一批顺序见 [领域数据隔离与代码分离](docs/领域数据隔离与代码分离-第二阶段.md)。 剩余排期见 [后续重构计划](docs/后续重构计划-2026-10-30.md)。 具体领取范围与验收见 [下一批任务单](docs/下一批可领取任务单-2026-10-30.md)。共享入口由集成人员修改，各成员优先在独立模块工作；不得将他人未提交的素材或数值改动混入自己的提交。

## 本地测试档

主页左上角三横菜单提供：口令、音乐开关、登出、我的信息（含机型/屏幕信息）。输入 `js/config/test-access.js` 中配置的口令后，可继续独立测试档；首次继续创建满配档，也可重置为新手档。

- 正常存档键：`xxfx_save_v1`；测试存档键：`xxfx_test_save_v1`。
- 登出测试档恢复正常档，测试进度保留；重启默认进入正常档。
- 测试状态显示“测试档案”，屏幕中部日志只在测试档显示。
- 当前为本地口令入口，未绑定真实微信身份，不支持跨设备同步。正式发布前将测试入口配置 `enabled` 设为 `false`。

## 重构回归与验收

在项目根目录用 Node.js 运行：

```powershell
node tools/_test_save_isolation.cjs
node tools/_test_domain_config.cjs
node tools/_test_touch_channels.cjs
node tools/_test_canvas_adaptation.cjs
node tools/test_touch_wx.mjs
node tools/_test_codex_split.cjs
node tools/_test_relic_screen_equiv.cjs
node tools/_test_relic_inertia.cjs
node tools/_test_relic_progression.cjs
node tools/_test_deep_chests.cjs
node tools/_test_shop_unlocks.cjs
node tools/_test_global_skills_split.cjs
node tools/_test_skill_cfg_v11728.mjs
node tools/_test_shard_settle_v11720.mjs
node tools/_test_shard_unlock_ui_v11720.mjs
node tools/_test_multi_replacement.cjs
node tools/_test_rainbow_charge.cjs
```

其中 `codex_split / relic_progression / deep_chests / shop_unlocks / global_skills_split` 使用本地 Git 中固定提交 `1b72edb` 作为重构前基线，逐项比较旧新返回值、状态或绘制指令；需保留该提交历史，源码ZIP不能直接运行这些历史对比测试。`_test_relic_screen_equiv.cjs`另用固定提交`a4c4699`作为圣遗物页面基线，覆盖1746个输入组合（含图片加载与缺图回退），详见[接入说明](docs/圣遗物页面拆分-接入说明.md)。这些测试证明迁移等价，不代表原规则没有缺陷。

预览重新构建与校验：

```powershell
node tools/_build_skill_preview.mjs
node tools/_verify_skill_preview.cjs
node tools/_build_menu_audit.mjs
node tools/_build_special_preview.mjs
```

预览会内联当前工作区模块，构建前应检查并行未提交改动。真机由项目 owner 测试，重点复核：菜单连续点击、单次滑动一次交换、弹窗外关闭、机型适配、正常档/测试档切换、购买/升星/开箱入账。

已登记且未在重构中修改的经济口径：深度宝箱 `gain.shards` 摘要尚未分配到具体圣遗物；速开沿用约4钻/小时公式，未使用档位 `speedDiamond`。详见重构记录。


## 资源与分包约定（新增素材前必读）

本项目采用**分包上传机制**：`assets/` 是唯一的功能分包（`game.json → subpackages`），素材一律放分包，主包只放代码与配置。

| 项 | 规则 |
|---|---|
| 图片 / 音频 / 动画帧 | 全部放 `assets/` 下，代码里写 `assets/images/...`、`assets/audio/...` |
| 禁止 | 在根目录新建 `images/`、`audio/` 等素材目录（会直接进主包） |
| 分包加载 | `js/loading.js` 启动时 `wx.loadSubpackage('assets')`，带进度条与失败重试；加载成功后才 `new Game()`，故所有素材引用都发生在分包就绪之后 |
| 包体校验 | 以开发者工具当前编译、上传结果及平台规则为准，历史体积不作为当前测量 |
| 上传前自检 | `python tools/_check_pack.py` —— 模拟打包，报主包/分包体积与残留文件 |
| 忽略规则 | `game.json`（后台上传用）与 `project.config.json`（工具本地编译用）的 `packOptions.ignore` **必须两边同步**，否则工具显示体积与后台上传结果不一致 |

> 已排除出包：`tools art docs .workbuddy .creative-design`、工具临时目录（`_doc_draft` / `doc-fetch-resources` / `draft_*`）、根目录文档与测试脚本。
> 新增一类「不该上传」的目录时，同时改 `game.json` 与 `project.config.json` 两处 ignore。

## 开发设计未完成清单（每次开发前请先核对本清单）

> 由产品 owner 维护，记录已确认要做但尚未完成的点；完成一项就划掉一项。

1. **不同战场的怪物要不同**：熔岩矿场 / 霜风峡谷 / 废墟回廊 / 深渊裂隙各自应有专属怪物池与外观。
2. **怪物强度分层随关卡演进**：随波次/关卡提升，弱怪逐步移出随机怪物池，新怪（更强）加入随机池。
3. **主界面四个分页（战场 / 商店 / 圣遗物图鉴 / 塔图鉴）持续优化**，各详情弹层页面也需持续优化。
4. **战斗界面商店**：购买选项后期需要优化（选项内容 + UI）。
5. **主界面商店**：每日碎片精选、圣遗物宝箱、技能解锁已实装；继续优化内容、数值与 UI。
6. **开宝箱收益弹窗**：深度宝箱与倒计时宝箱收益弹窗已实装；商店宝箱收益呈现、摘要与实际碎片入账的一致性仍需完善。
7. **【待排期】撤离点经济曲线收敛**：当前撤离点产出随波次增长，但里程碑所需生存率 p* = 0.7/(r−0.3) 在高波次不可达（曲线约 84 波后交叉），需按「难度超车」模型重新收敛数值（详见 docs/撤离曲线数值设计稿.md）。
8. **【待排期】圣遗物 meta 成长节奏**：碎片产出与升星消耗的长期曲线需要通盘设计，避免毕业过快或碎片囤积无意义。
9. **【待排期】三消盘与波次咬合**：棋盘消除节奏与怪物刷新/波次时长的耦合度需调优（消除是唯一出伤来源时，盘面手感直接等于战斗强度）。
10. **【待排期】双货币产消模型**：金币与撤离点的产出/消耗需建立总账表，保证各波段的通胀/通缩可控。
11. **【待排期】留存钩子**：每日任务、好友排行榜等轻社交/日常目标，支撑长期留存。
12. **【待排期】新手交互式引导**：首局前 3 波的分步引导（消除→出塔→撤离点概念），替代当前纯文案提示。
13. **【待排期】失败挫败感缓冲**：距离里程碑只差一点时给针对性提示/补偿，降低高波次团灭的流失风险。
14. **【待排期】塔间平衡数据**：6 塔 × 3 分支的出场率/胜率数据采集与平衡迭代机制。
15. **【待排期】最简埋点**：wx.reportEvent 4 个核心事件（局开始/撤离/团灭波次/商店购买），支撑上述数值与平衡决策。
16. **【待排期】合规预留**：宝箱概率公示、付费分层（若有内购）所需的界面与文案预留。

R12已完成主页、顶部栏与局外商店绘制提取，66组状态与固定基线逐绘制指令/命中区对比通过；见[接入说明](docs/主页商店页面拆分-接入说明.md)。

R13已完成战斗点击路由与局内商店绘制提取，保留三选一、塔详情、撤离和结算点击顺序；56组路由对比、80组商店绘制对比与15项真实main购买链路验证通过，见[接入说明](docs/战斗路由与局内商店拆分-接入说明.md)。
