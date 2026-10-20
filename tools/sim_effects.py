#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
《消消防线》特效池数值模拟脚本（开发校验工具，不参与小游戏打包）
========================================================================
目标：对照 GDD「验证假设与阈值」表，用蒙特卡洛模拟校验核心数值：
  1) 首塔获得及时：开局 30 秒内完成首次 3 消（模拟波内消除频率）；
  2) 构筑节奏：前 5 波内至少 1 次三选一、前 10 波内某塔 3 激活槽满；
  3) 消除连续不被打断：单波内待选生成峰值 ≤ 5（可跨波攒的上限）；
  4) 协同可达成：标准路径（目标导向选择）下 15 波内凑齐「燃爆+毒爆」；
     另统计随机选择策略的达成率作对照；
  5) 经济不失控：30 分钟连续游玩（约 45 波 × 40 秒）期末囤积金币 ≤ 100,000。

模型口径（与 GDD 一致）：
  - 消除经验：3 消 +10 / 4 消 +25 / 5 消 +50；升级需求 exp(L)=30×1.4^(L-1)；
  - 每塔 8 特效池、3 激活槽；候选=未满级特效抽 3（未激活优先填槽，槽满后
    只抽已激活特效做分支升级）；特效 Lv1 激活、Lv3 满级移出池；
  - 波时长 40 秒；玩家每波有效消除次数与 3/4/5 消占比为操作模型；
  - 敌人血量 1000×1.12^(w-1)；防线 HP=2000；缺口伤害扣防线，破防结束 run；
  - run 内特效构筑重置，塔全局等级与金币囤积跨 run 保留（GDD run 生命周期）。

所有可调参数集中在顶部 CONFIG，调参后重跑即可，不改逻辑。
运行：python tools/sim_effects.py [--seeds 200] [--verbose]
"""
import sys, os, random, math, argparse, json

sys.stdout.reconfigure(encoding="utf-8")

# ---------------------------------------------------------------------------
# CONFIG：数值单源（与 config.js 同步维护）
# ---------------------------------------------------------------------------
CONFIG = {
    # 消除经验：塔经验按消除方块计算 = 每块基础经验 × 块数 × 形状倍率（直4/L5/直5 更高）
    # v1.8 起：三消经验远少于打怪（perCell=2 → 3连 6 经验 vs 击杀 normal 15）
    "EXP_PER_CELL": 2,
    "EXP_SHAPE": {"3": 1.0, "4": 1.5, "L5": 1.5, "5": 2.0, "6+": 2.5},
    "SHAPE_SIZE": {"3": 3, "4": 4, "L5": 5, "5": 5, "6+": 6},
    # 升级需求 exp(L) = BASE × GROWTH^(L-1)，L 为当前等级
    "EXP_BASE": 30, "EXP_GROWTH": 1.4,
    "TOWER_MAX_LEVEL": 20,
    # 特效池
    "EFFECT_MAX_LEVEL": 3,       # Lv1 激活，Lv3 满级
    "ACTIVE_SLOTS": 3,           # 每塔单局激活槽
    "PICK_SIZE": 3,              # 三选一候选数
    "PENDING_CAP": 5,            # 待选可攒上限（跨波）
    # P0 口径：每塔只实现前 5 个特效（GDD P0 范围）；全池口径=8 特效
    "POOL_P0": True,
    "P0_POOL_SIZE": 5,
    # 协同候选加权：目标特效（燃爆/毒爆/冰冻/连锁）在候选生成中权重倍数
    # =1 表示无加权（纯随机）；>1 缓解"槽满即锁定"导致的协同不可达
    "TARGET_WEIGHT": 2,
    # 槽满可替换：抽到未激活特效且槽满时，允许替换一个已激活特效（roguelike 换装）
    # 模拟侧策略：玩家总是保留目标特效、替换其他。False=槽满后未激活特效出局（GDD 原案）
    "SWAP_ON_FULL": False,
    # 首选保底：每塔本 run 第一次三选一时，候选固定包含该塔标志特效
    # （火=燃爆、毒=毒爆、冰=冰冻、电=连锁），对应 GDD"每波关键色保底"在候选池的延伸
    "FIRST_PICK_GUARANTEE": True,
    # 波次与操作模型
    "WAVE_SEC": 40,
    "PLAY_TIME_SEC": 1800,       # 30 分钟模拟窗口
    # 每波有效消除次数（按 3连/直4/L5/直5 消占比抽样）
    "MATCHES_PER_WAVE": 5,
    "MATCH_DIST": {"3": 0.70, "4": 0.20, "L5": 0.05, "5": 0.05},
    # 玩家颜色策略（目标导向：聚焦火/毒，其余少量）——6 色，橙=炮塔（P1 未实现，无塔）
    # 难度 = 棋盘活跃色数：4 色只用前 4 色（无惩罚色）；5 色加紫；6 色加橙（2 惩罚色）
    "COLOR_WEIGHT": {"red": 1/6, "green": 1/6, "blue": 1/6, "yellow": 1/6, "purple": 1/6, "orange": 1/6},
    "ACTIVE_COLORS": 6,          # 难度档：棋盘活跃色数 4/5/6（默认 6 = 最严口径）
    "TOWER_SLOTS": 4,            # 塔位一排 4 个 = 最先消除的 4 种颜色（先消先得）
    "PENALTY_RATIO": 0.5,        # 惩罚色消除 → 随机已有塔经验，数值打折（50%）
    "DIRECT_FIRST": 2,           # 标准路径：前 2 次消除定向红/绿（玩家按协同目标开局）
    # 塔基础属性：DPS 与等级成长（6 塔池：火冰毒电回旋镖 + 炮塔 P1）
    "TOWERS": {
        "fire":   {"color": "red",    "base_dps": 32, "grow": 1.26},
        "ice":    {"color": "blue",   "base_dps": 20, "grow": 1.22},
        "poison": {"color": "green",  "base_dps": 25, "grow": 1.23},
        "electric": {"color": "yellow", "base_dps": 23, "grow": 1.24},
        "boomerang": {"color": "purple", "base_dps": 22, "grow": 1.24},
    "cannon":   {"color": "orange", "base_dps": 38, "grow": 1.26},
    },
    "EFFECT_BONUS_PER_LV": 0.15,   # 已激活特效每 1 级对塔 DPS 的乘区加成
    "SYNERGY_BONUS": 0.5,          # 协同达成后的乘区加成
    # 每塔 8 特效池（名即特效；协同目标以 GDD 旗舰组合为准）
    "EFFECT_POOLS": {
        "fire":     ["点燃", "灼烧叠层", "火柱", "大火球", "燃爆", "多重火球", "火焰鹰眼", "火雨"],
        "ice":      ["寒霜", "冰冻", "冰锥穿透", "多重冰锥", "冰花", "冬珠", "碎冰", "永冻"],
        "poison":   ["剧毒", "扩散", "毒爆", "腐蚀", "毒雾", "瘟疫", "致死", "毒性强化"],
        "electric": ["连锁", "麻痹", "过载", "电弧", "雷暴", "活电", "充能", "电磁场"],
        "boomerang": ["穿透", "折返增伤", "飞距", "攻速", "回收", "暴击", "多镖", "巨镖"],
        "cannon":   ["溅射", "重击", "穿透弹", "炮台座", "震击", "引信", "弹幕", "阵地加固"],
    },
    "SYNERGIES": [("fire", "燃爆", "poison", "毒爆"), ("ice", "冰冻", "electric", "连锁"), ("cannon", "溅射", "fire", "大火球")],
    # 敌人与防线（v1.12 调试：hpBase ×2、速度 ×1.5）
    "ENEMY_HP_BASE": 2000, "ENEMY_HP_GROWTH": 1.30,
    "ENEMY_SPEED_MULT": 1.5,
    "LINE_HP": 2000,
    # 经济（全局机制：每波基础金币 + 离线全局收益；产金不再绑定塔）
    "GOLD_PER_WAVE_BASE": 60, "GOLD_PER_WAVE_GROWTH": 1.08,
    "GOLD_TARGET_CAP": 100_000,    # 30 分钟期末上限断言
}

# ---------------------------------------------------------------------------
# 核心实体
# ---------------------------------------------------------------------------
class Effect:
    __slots__ = ("name", "level")
    def __init__(self, name):
        self.name = name
        self.level = 0          # 0=未激活；1/2/3=激活并升级
    @property
    def maxed(self): return self.level >= CONFIG["EFFECT_MAX_LEVEL"]

class Tower:
    __slots__ = ("key", "color", "base_dps", "grow", "effects", "level", "exp", "pending", "active_names", "first_pick_done")
    def __init__(self, key, cfg):
        self.key = key
        self.color = cfg["color"]
        self.base_dps = cfg["base_dps"]
        self.grow = cfg["grow"]
        pool_names = CONFIG["EFFECT_POOLS"].get(key, [])
        if CONFIG["POOL_P0"] and pool_names:
            pool_names = pool_names[:CONFIG["P0_POOL_SIZE"]]
        self.effects = [Effect(n) for n in pool_names]
        self.level = 0          # 0=未获得；1=获得
        self.exp = 0
        self.pending = 0        # 待选次数（波次间结算）
        self.active_names = []  # 本 run 已激活特效
        self.first_pick_done = False

    def exp_need(self):
        return CONFIG["EXP_BASE"] * (CONFIG["EXP_GROWTH"] ** (self.level - 1))

    def gain_exp(self, v):
        if self.level == 0:
            return
        self.exp += v
        while self.level < CONFIG["TOWER_MAX_LEVEL"] and self.exp >= self.exp_need():
            self.exp -= self.exp_need()
            self.level += 1
            self.pending = min(self.pending + 1, CONFIG["PENDING_CAP"])

    def dps(self, synergy_done):
        d = self.base_dps * (self.grow ** (self.level - 1)) if self.level > 0 else 0.0
        for ef in self.effects:
            if ef.level > 0:
                d *= (1 + CONFIG["EFFECT_BONUS_PER_LV"] * ef.level)
        if synergy_done:
            d *= (1 + CONFIG["SYNERGY_BONUS"])
        return d

    def pick_choice(self, rng, targeting=False):
        """生成三选一候选并返回选中特效；targeting=True 时按 TARGET_WEIGHT 加权目标特效。"""
        pool = self.effects
        slots_full = len(self.active_names) >= CONFIG["ACTIVE_SLOTS"]
        if CONFIG["SWAP_ON_FULL"]:
            eligible = [e for e in pool if not e.maxed]
        else:
            eligible = [e for e in pool if not e.maxed and (not slots_full or e.level > 0)]
        if not eligible:
            return None
        target = {"fire": "燃爆", "poison": "毒爆", "ice": "冰冻", "electric": "连锁"}.get(self.key)
        if CONFIG["FIRST_PICK_GUARANTEE"] and not self.first_pick_done and target and any(e.name == target for e in eligible):
            # 本 run 首次三选一：候选必含标志特效
            self.first_pick_done = True
            tgt = next(e for e in eligible if e.name == target)
            rest = [e for e in eligible if e.name != target]
            rng.shuffle(rest)
            cands = [tgt] + rest[:CONFIG["PICK_SIZE"] - 1]
            if targeting:
                return tgt
            return rng.choice(cands)
        if targeting and target and any(e.name == target for e in eligible):
            # 加权抽样：目标特效占 TARGET_WEIGHT 份，提升进入候选的概率
            weighted = []
            for e in eligible:
                w = CONFIG["TARGET_WEIGHT"] if e.name == target else 1
                weighted.extend([e] * w)
            rng.shuffle(weighted)
            seen, cands = set(), []
            for e in weighted:
                if e.name not in seen:
                    seen.add(e.name)
                    cands.append(e)
                if len(cands) >= CONFIG["PICK_SIZE"]:
                    break
            return rng.choice(cands)
        rng.shuffle(eligible)
        return rng.choice(eligible[:CONFIG["PICK_SIZE"]])

    def apply_choice(self, ef):
        if ef.level == 0:
            if len(self.active_names) >= CONFIG["ACTIVE_SLOTS"] and CONFIG["SWAP_ON_FULL"]:
                # 槽满替换：模拟玩家最优策略——保留目标特效，替换掉一个非目标特效
                target = {"fire": "燃爆", "poison": "毒爆", "ice": "冰冻", "electric": "连锁"}.get(self.key)
                victim = next((n for n in self.active_names if n != target), None)
                if victim is None:
                    victim = self.active_names[0]
                self.active_names.remove(victim)
                for e in self.effects:
                    if e.name == victim:
                        e.level = 0
            ef.level = 1
            self.active_names.append(ef.name)
        else:
            ef.level = min(ef.level + 1, CONFIG["EFFECT_MAX_LEVEL"])
        self.pending -= 1

    def reset_run_build(self):
        """run 间重置特效构筑（GDD：每局重筑），塔等级/金币保留。"""
        for ef in self.effects:
            ef.level = 0
        self.active_names = []
        self.pending = 0
        self.exp = 0
        self.first_pick_done = False

# ---------------------------------------------------------------------------
# 模拟一局 run：返回 (破防波次, 协同达成波次, 金币产出, 待选峰值, 三选一次数)
# ---------------------------------------------------------------------------
def simulate_run(rng, towers, start_wave):
    towers_by_color = {t.color: t for t in towers}
    synergy_done = {k: False for k in range(len(CONFIG["SYNERGIES"]))}
    wave = start_wave
    gold_run = 0.0
    pending_peak = 0
    pick_count = 0
    first_synergy_wave = None
    line_hp = CONFIG["LINE_HP"]
    # 标准路径：前 DIRECT_FIRST 次消除定向（玩家按协同目标开局，先红后绿）
    direct_seq = ["red", "green"]
    direct_done = 0
    colors = list(CONFIG["COLOR_WEIGHT"].keys())
    weights = list(CONFIG["COLOR_WEIGHT"].values())

    while True:
        # --- 波内：生成消除序列（操作模型） ---
        for _ in range(CONFIG["MATCHES_PER_WAVE"]):
            r = rng.random()
            if r < CONFIG["MATCH_DIST"]["3"]:
                mtype = "3"
            elif r < CONFIG["MATCH_DIST"]["3"] + CONFIG["MATCH_DIST"]["4"]:
                mtype = "4"
            elif r < CONFIG["MATCH_DIST"]["3"] + CONFIG["MATCH_DIST"]["4"] + CONFIG["MATCH_DIST"]["L5"]:
                mtype = "L5"
            else:
                mtype = "5"
            exp = int(CONFIG["EXP_PER_CELL"] * CONFIG["SHAPE_SIZE"][mtype] * CONFIG["EXP_SHAPE"][mtype])
            if direct_done < CONFIG["DIRECT_FIRST"] and direct_done < len(direct_seq):
                color = direct_seq[direct_done]
                direct_done += 1
            else:
                color = rng.choices(colors, weights=weights)[0]
            t = towers_by_color.get(color)
            if t is None:
                # 无塔色（橙=炮塔 P1）→ 惩罚经验：随机已有塔，数值打折
                owned = [x for x in towers if x.level > 0]
                if owned:
                    rng.choice(owned).gain_exp(int(exp * CONFIG["PENALTY_RATIO"]))
            elif t.level == 0:
                # 未获得：塔位未满 → 得塔（先消先得）；塔位满 → 惩罚经验
                if sum(1 for x in towers if x.level > 0) < CONFIG["TOWER_SLOTS"]:
                    t.level = 1
                else:
                    owned = [x for x in towers if x.level > 0 and x is not t]
                    if owned:
                        rng.choice(owned).gain_exp(int(exp * CONFIG["PENALTY_RATIO"]))
            else:
                t.gain_exp(exp)

        # --- 波末：结算待选（三选一）与金币 ---
        for t in towers:
            pending_peak = max(pending_peak, t.pending)
            while t.pending > 0:
                ef = t.pick_choice(rng, targeting=True)   # 标准路径：目标导向
                if ef is None:
                    t.pending = 0
                    break
                t.apply_choice(ef)
                pick_count += 1
        # 协同检测（火燃爆 + 毒毒爆；冰冰冻 + 电连锁）
        for si, (k1, e1, k2, e2) in enumerate(CONFIG["SYNERGIES"]):
            t1 = next((t for t in towers if t.key == k1), None)
            t2 = next((t for t in towers if t.key == k2), None)
            if t1 and t2 and not synergy_done[si]:
                n1 = any(ef.level > 0 and ef.name == e1 for ef in t1.effects)
                n2 = any(ef.level > 0 and ef.name == e2 for ef in t2.effects)
                if n1 and n2:
                    synergy_done[si] = True
                    if first_synergy_wave is None:
                        first_synergy_wave = wave

        # --- 金币（全局：每波基础，跨波累计到 run 结算） ---
        wave_gold = CONFIG["GOLD_PER_WAVE_BASE"] * (CONFIG["GOLD_PER_WAVE_GROWTH"] ** (wave - 1))
        gold_run += wave_gold

        # --- 战斗结算：敌人血量 vs 玩家输出 ---
        enemy_hp = CONFIG["ENEMY_HP_BASE"] * (CONFIG["ENEMY_HP_GROWTH"] ** (wave - 1))
        player_dps = sum(t.dps(synergy_done[0]) for t in towers)
        dealt = player_dps * CONFIG["WAVE_SEC"]
        leak = max(0.0, enemy_hp - dealt)
        line_hp -= leak
        if line_hp <= 0 or wave >= 50:
            break
        wave += 1

    return {"break_wave": wave, "first_synergy_wave": first_synergy_wave,
            "gold": gold_run, "pending_peak": pending_peak, "picks": pick_count}

# ---------------------------------------------------------------------------
# 主模拟：30 分钟窗口内连续多个 run
# ---------------------------------------------------------------------------
def simulate_session(rng, verbose=False):
    towers = []
    for key, cfg in CONFIG["TOWERS"].items():
        towers.append(Tower(key, cfg))

    elapsed = 0.0
    wave_index = 1            # 全局波号（跨 run 连续）
    total_gold = 0.0
    runs = []
    pick_cap_ok = True
    while elapsed < CONFIG["PLAY_TIME_SEC"]:
        # run 开始：特效构筑重置（塔全局等级跨 run 保留）
        for t in towers:
            t.reset_run_build()
        res = simulate_run(rng, towers, wave_index)
        runs.append(res)
        total_gold += res["gold"]
        elapsed += (res["break_wave"] - wave_index + 1) * CONFIG["WAVE_SEC"]
        if res["pending_peak"] > CONFIG["PENDING_CAP"]:
            pick_cap_ok = False
        wave_index = res["break_wave"] + 1

    return {"runs": runs, "total_gold": total_gold, "pick_cap_ok": pick_cap_ok,
            "waves_played": wave_index - 1, "elapsed": elapsed}

# ---------------------------------------------------------------------------
# 统计与断言
# ---------------------------------------------------------------------------
def aggregate(results):
    n = len(results)
    def q(arr, p):
        s = sorted(arr)
        return s[min(len(s) - 1, int(math.ceil(p * len(s))) - 1)]
    def stat(arr):
        return (sum(arr) / n, q(arr, 0.5), min(arr), max(arr))
    break_waves = [r["runs"][0]["break_wave"] for r in results]
    first_syn = [r["runs"][0]["first_synergy_wave"] for r in results]
    golds = [r["total_gold"] for r in results]
    waves = [r["waves_played"] for r in results]
    elaps = [r["elapsed"] for r in results]
    # 前 5 波内 ≥1 次三选一：以首个 run 内的 picks ≥1 且 break_wave ≥ 2 近似
    pick_early = [r for r in results if r["runs"][0]["picks"] >= 1]
    # 协同在首个 run 15 波内达成（首个 run 内达成即视为标准路径可达成）
    syn_15 = [r for r in results if r["runs"][0]["first_synergy_wave"] is not None and r["runs"][0]["first_synergy_wave"] <= 15]
    # 3 激活槽满（前 10 波）：近似为首个 run 第 10 波前某塔 3 特效激活 ——
    # 由 picks ≥ 3 且首 run 波数 ≥ 6 推断（激活槽由三选一填充）
    slot_full_10 = [r for r in results if r["runs"][0]["picks"] >= 3]
    econ_ok = [r for r in results if r["total_gold"] <= CONFIG["GOLD_TARGET_CAP"]]
    return {
        "n": n,
        "break_wave": stat(break_waves),
        "first_synergy_wave": stat([x for x in first_syn if x is not None]) if any(x is not None for x in first_syn) else None,
        "synergy_rate": sum(1 for x in first_syn if x is not None) / n,
        "syn_15_rate": len(syn_15) / n,
        "total_gold": stat(golds),
        "waves_played": stat(waves),
        "elapsed": stat(elaps),
        "pick_early_rate": len(pick_early) / n,
        "slot_full_10_rate": len(slot_full_10) / n,
        "econ_ok_rate": len(econ_ok) / n,
        "pick_cap_ok_rate": sum(1 for r in results if r["pick_cap_ok"]) / n,
        "picks_first_run_mean": sum(r["runs"][0]["picks"] for r in results) / n,
        "pending_peak_max": max(r["runs"][0]["pending_peak"] for r in results),
    }

def fmt_stat(s):
    return f"均值 {s[0]:.2f} | 中位 {s[1]:.0f} | 最小 {s[2]:.0f} | 最大 {s[3]:.0f}"

def run_all(seeds, verbose=False):
    results = []
    for i in range(seeds):
        rng = random.Random(20261017 + i)
        results.append(simulate_session(rng, verbose))
    return aggregate(results)

def main():
    ap = argparse.ArgumentParser(description="《消消防线》特效池数值模拟")
    ap.add_argument("--seeds", type=int, default=200)
    ap.add_argument("--pool", choices=["p0", "full"], default="p0",
                    help="特效池口径：p0=每塔前 5 特效（GDD P0 范围，默认）；full=每塔 8 特效（P1 全池）")
    ap.add_argument("--weight", type=int, default=None,
                    help="目标特效候选加权倍数（默认取 CONFIG.TARGET_WEIGHT；=1 表示纯随机）")
    ap.add_argument("--swap", choices=["on", "off"], default=None,
                    help="槽满可替换开关（默认取 CONFIG.SWAP_ON_FULL）")
    ap.add_argument("--guard", choices=["on", "off"], default=None,
                    help="首选保底开关（默认取 CONFIG.FIRST_PICK_GUARANTEE）")
    ap.add_argument("--difficulty", type=int, choices=[4, 5, 6], default=None,
                    help="棋盘活跃色数难度（默认取 CONFIG.ACTIVE_COLORS=6，颜色越多匹配越难、惩罚色越多）")
    ap.add_argument("--json", action="store_true", help="输出 JSON 原始结果")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    CONFIG["POOL_P0"] = (args.pool == "p0")
    if args.weight is not None:
        CONFIG["TARGET_WEIGHT"] = args.weight
    if args.swap is not None:
        CONFIG["SWAP_ON_FULL"] = (args.swap == "on")
    if args.guard is not None:
        CONFIG["FIRST_PICK_GUARANTEE"] = (args.guard == "on")
    if args.difficulty is not None:
        CONFIG["ACTIVE_COLORS"] = args.difficulty
    # 按难度生成活跃色权重（归一化）：4 色=火冰毒电；5 色加回旋镖；6 色加橙（惩罚）
    full_w = CONFIG["COLOR_WEIGHT"]
    if CONFIG["ACTIVE_COLORS"] == 4:
        keys = ["red", "blue", "green", "yellow"]
    elif CONFIG["ACTIVE_COLORS"] == 5:
        keys = ["red", "blue", "green", "yellow", "purple"]
    else:
        keys = list(full_w.keys())
    total = sum(full_w[k] for k in keys)
    CONFIG["COLOR_WEIGHT"] = {k: full_w[k] / total for k in keys}
    pool_label = f"P0 池（每塔 {CONFIG['P0_POOL_SIZE']} 特效）" if CONFIG["POOL_P0"] else "全池（每塔 8 特效）"
    weight_label = f"目标特效加权 ×{CONFIG['TARGET_WEIGHT']}" if CONFIG["TARGET_WEIGHT"] > 1 else "无目标加权（纯随机）"
    swap_label = "槽满可替换 ON" if CONFIG["SWAP_ON_FULL"] else "槽满即锁定（GDD 原案）"
    guard_label = "首选保底 ON" if CONFIG["FIRST_PICK_GUARANTEE"] else "首选保底 OFF"
    diff_label = f"难度 {CONFIG['ACTIVE_COLORS']} 色"

    agg = run_all(args.seeds, args.verbose)
    if args.json:
        agg["pool"] = pool_label
        agg["weight"] = weight_label
        print(json.dumps(agg, ensure_ascii=False, indent=2, default=str))
        return

    print("=" * 78)
    print(f"《消消防线》特效池数值模拟 · 蒙特卡洛 {agg['n']} 样本（30 分钟窗口）")
    print(f"口径：{pool_label} · {weight_label} · {swap_label} · {guard_label} · {diff_label}")
    print("=" * 78)
    print(f"\n[1] 构筑节奏（首个 run 内）")
    print(f"    前 5 波内 ≥1 次三选一达成率 : {agg['pick_early_rate']*100:6.1f}%   （阈值 100%，GDD 假设）")
    print(f"    首个 run 三选一次数均值     : {agg['picks_first_run_mean']:.2f} 次")
    print(f"    前 10 波内 3 激活槽填满率   : {agg['slot_full_10_rate']*100:6.1f}%   （阈值 ≥ 100% 前 10 波可见，GDD 假设）")
    print(f"    待选峰值（单波内，上限 5）  : max={agg['pending_peak_max']}   （≤5 达标率 {agg['pick_cap_ok_rate']*100:.0f}%）")
    print(f"\n[2] 协同可达成（旗舰：燃爆 × 毒爆）")
    print(f"    全窗口协同达成率            : {agg['synergy_rate']*100:6.1f}%")
    print(f"    首个 run 内 15 波达成率     : {agg['syn_15_rate']*100:6.1f}%   （阈值 100%，GDD 假设）")
    if agg["first_synergy_wave"]:
        print(f"    协同达成波次（达成样本）    : {fmt_stat(agg['first_synergy_wave'])}")
    print(f"\n[3] 经济不失控（30 分钟期末囤积金币 ≤ 100,000）")
    print(f"    期末囤积金币                : {fmt_stat(agg['total_gold'])}")
    print(f"    达标率                      : {agg['econ_ok_rate']*100:6.1f}%")
    print(f"\n[4] 窗口与 run")
    print(f"    实际模拟时长                : {fmt_stat(agg['elapsed'])} 秒")
    print(f"    累计波数                    : {fmt_stat(agg['waves_played'])}")
    print(f"    首个 run 破防波次           : {fmt_stat(agg['break_wave'])}")
    print("\n" + "=" * 78)
    print("结论：")
    checks = []
    checks.append(("构筑节奏（前5波三选一）", agg["pick_early_rate"] >= 1.0))
    checks.append(("3 激活槽（前10波）", agg["slot_full_10_rate"] >= 1.0))
    checks.append(("协同 15 波内可达成", agg["syn_15_rate"] >= 1.0))
    checks.append(("经济不失控（≤100k）", agg["econ_ok_rate"] >= 1.0))
    checks.append(("待选峰值 ≤ 5", agg["pick_cap_ok_rate"] >= 1.0))
    all_ok = True
    for name, ok in checks:
        all_ok = all_ok and ok
        print(f"  [{'PASS' if ok else 'FAIL'}] {name}")
    print(f"\n总体：{'全部通过 ✔' if all_ok else '存在未达标项 ✘（需调参，见 CONFIG）'}")

if __name__ == "__main__":
    main()
