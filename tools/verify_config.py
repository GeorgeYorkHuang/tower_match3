#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""config.js（JS 数值单源）与 sim_effects.py（模拟 CONFIG）一致性校验"""
import json, subprocess, sys, importlib.util

sys.stdout.reconfigure(encoding="utf-8")

# 1) node 加载 config.js → JSON
out = subprocess.run(["node", "-e", "console.log(JSON.stringify(require('./js/config.js')))"],
                     capture_output=True, text=True, cwd="F:/workspace/towerdefence", encoding="utf-8")
if out.returncode != 0:
    print("NODE FAIL:", out.stderr)
    sys.exit(1)
C = json.loads(out.stdout)

# 2) 加载模拟脚本 CONFIG
spec = importlib.util.spec_from_file_location("sim", "F:/workspace/towerdefence/tools/sim_effects.py")
sim = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sim)
S = sim.CONFIG

fails = []

def chk(label, a, b):
    ok = a == b
    print(f"  [{'PASS' if ok else 'FAIL'}] {label}: js={a} sim={b}")
    if not ok:
        fails.append(label)

print("== 消除经验 ==")
chk("EXP_PER_CELL", C["EXP"]["perCell"], S["EXP_PER_CELL"])
chk("EXP_SHAPE", C["EXP"]["shape"], S["EXP_SHAPE"])
chk("EXP_BASE", C["EXP"]["base"], S["EXP_BASE"])
chk("EXP_GROWTH", C["EXP"]["growth"], S["EXP_GROWTH"])
chk("TOWER_MAX_LEVEL", C["EXP"]["towerMaxLevel"], S["TOWER_MAX_LEVEL"])

print("== 特效系统 ==")
chk("EFFECT_MAX_LEVEL", C["EFFECT"]["maxLevel"], S["EFFECT_MAX_LEVEL"])
chk("ACTIVE_SLOTS", C["EFFECT"]["activeSlots"], S["ACTIVE_SLOTS"])
chk("PICK_SIZE", C["EFFECT"]["pickSize"], S["PICK_SIZE"])
chk("PENDING_CAP", C["EFFECT"]["pendingCap"], S["PENDING_CAP"])
chk("P0_POOL_SIZE", C["EFFECT"]["p0PoolSize"], S["P0_POOL_SIZE"])
chk("TARGET_WEIGHT", C["EFFECT"]["targetWeight"], S["TARGET_WEIGHT"])
chk("SWAP_ON_FULL", C["EFFECT"]["swapOnFull"], S["SWAP_ON_FULL"])
chk("FIRST_PICK_GUARANTEE", C["EFFECT"]["firstPickGuarantee"], S["FIRST_PICK_GUARANTEE"])
chk("EFFECT_BONUS_PER_LV", C["EFFECT"]["bonusPerLv"], S["EFFECT_BONUS_PER_LV"])
chk("SYNERGY_BONUS", C["EFFECT"]["synergyBonus"], S["SYNERGY_BONUS"])

print("== 塔属性 ==")
for key in ("fire", "ice", "poison", "electric", "boomerang"):
    chk(f"{key}.baseDps", C["TOWERS"][key]["baseDps"], S["TOWERS"][key]["base_dps"])
    chk(f"{key}.grow", C["TOWERS"][key]["grow"], S["TOWERS"][key]["grow"])

print("== 特效池（P0 前 5 与模拟一致） ==")
for key in ("fire", "ice", "poison", "electric", "boomerang"):
    js_names = [e["name"] for e in C["EFFECT_POOLS"][key] if e["p0"]]
    sim_names = S["EFFECT_POOLS"][key][:S["P0_POOL_SIZE"]]
    chk(f"{key}.P0池", js_names, sim_names)
    # 全 8 名一致
    js_all = [e["name"] for e in C["EFFECT_POOLS"][key]]
    sim_all = S["EFFECT_POOLS"][key]
    chk(f"{key}.全池", js_all, sim_all)

print("== 协同 ==")
js_syn = [(s["a"]["tower"], s["a"]["effect"], s["b"]["tower"], s["b"]["effect"]) for s in C["SYNERGIES"]]
sim_syn = list(S["SYNERGIES"])
chk("SYNERGIES", js_syn, sim_syn)

print("== 波次/敌人/防线 ==")
chk("WAVE_SEC", C["WAVE"]["seconds"], S["WAVE_SEC"])
chk("MATCHES_PER_WAVE", C["WAVE"]["matchesPerWave"], S["MATCHES_PER_WAVE"])
chk("MATCH_DIST", C["WAVE"]["matchDist"], {str(k): v for k, v in S["MATCH_DIST"].items()})
chk("ENEMY_HP_BASE", C["ENEMY"]["hpBase"], S["ENEMY_HP_BASE"])
chk("ENEMY_HP_GROWTH", C["ENEMY"]["hpGrowth"], S["ENEMY_HP_GROWTH"])
chk("LINE_HP", C["LINE"]["hp"], S["LINE_HP"])

print("== 经济 ==")
chk("GOLD_PER_WAVE_BASE", C["ECONOMY"]["goldPerWaveBase"], S["GOLD_PER_WAVE_BASE"])
chk("GOLD_PER_WAVE_GROWTH", C["ECONOMY"]["goldPerWaveGrowth"], S["GOLD_PER_WAVE_GROWTH"])
chk("GOLD_TARGET_CAP", C["ECONOMY"]["goldTargetCap"], S["GOLD_TARGET_CAP"])

print("== 颜色/塔位/惩罚/难度 ==")
chk("COLOR_WEIGHT", C["COLOR_WEIGHT"], S["COLOR_WEIGHT"])
chk("TOWER_SLOTS", C["TOWER_SLOTS"], S["TOWER_SLOTS"])
chk("PENALTY_RATIO", C["PENALTY_RATIO"], S["PENALTY_RATIO"])
chk("DIRECT_FIRST", C["DIRECT_FIRST"], S["DIRECT_FIRST"])
chk("ACTIVE_COLORS", C["DIFFICULTY"]["default"], S["ACTIVE_COLORS"])

print()
if fails:
    print(f"不一致项 {len(fails)} 个：{fails}")
    sys.exit(1)
print("全部一致 ✔  config.js 与 sim_effects.py CONFIG 同步")
