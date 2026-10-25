// 把 AI 生成的圣遗物图标按 RELIC_RUN id 落位到 images/relic/<cat>/<id>.png
// 名称与 js/config.js RELIC_RUN 完全一致；id 为 config 中的真实 id
import fs from 'fs';
import path from 'path';

const SRC = 'F:/workspace/towerdefence/images/relic'; // 成品已在此目录（relic_ai_* 序号名），原位重命名为 id 名
const DST = SRC;

const IDS = {
  fire: [['fire_seed','火种'],['fire_seal','赤印'],['fire_core','熔心'],['fire_nuke','爆核'],['fire_chain','连锁爆破'],['fire_rain','焰雨'],['fire_wall','火墙增烈'],['fire_skyfire','天火'],['fire_forge','熔炉之息'],['fire_fuel','薪柴'],['fire_ember','余烬风暴'],['fire_bounce','火焰弹射'],['fire_inferno','炼狱'],['fire_tongue','火舌'],['fire_hasten','燃尽加速'],['fire_burnall','焚天']],
  ice: [['ice_spike','霜刺'],['ice_forever','永冻'],['ice_pierce','穿透凝冰'],['ice_blizzard','暴雪'],['ice_crystal','冰晶'],['ice_domain','冬域'],['ice_shard','碎冰强化'],['ice_armor','冰甲'],['ice_marrow','寒髓'],['ice_extreme','极寒'],['ice_frostburst','霜爆'],['ice_fog','冰雾'],['ice_glacier','冰川'],['ice_wallshift','冰墙裂变'],['ice_avalanche','雪崩'],['ice_condense','凝霜']],
  poison: [['poison_gland','毒腺'],['poison_source','瘟疫之源'],['poison_fen','腐沼'],['poison_branch','毒枝'],['poison_essence','剧毒精华'],['poison_quick','速疫'],['poison_vine','缠毒'],['poison_miasma','瘴毒'],['poison_fang','毒牙'],['poison_slow','缓毒'],['poison_burst','毒爆连锁'],['poison_corrode','腐化'],['poison_nest','毒巢'],['poison_cloud','毒云'],['poison_spread','蔓延'],['poison_all','万毒']],
  electric: [['elec_arc','电弧'],['elec_strong','强麻'],['elec_overload','过载'],['elec_chain','电链'],['elec_storm','雷霆'],['elec_orb','电球'],['elec_fast','快充'],['elec_magnet','磁力'],['elec_light','电光'],['elec_conduit','传导'],['elec_spread','麻痹扩散'],['elec_static','静电'],['elec_domain','雷域'],['elec_super','超导'],['elec_boost','闪电链增强'],['elec_surge','电涌']],
  boomerang: [['boo_return','强返'],['boo_blood','血刃'],['boo_multi','镖群'],['boo_catch','疾接'],['boo_hunt','猎心'],['boo_eye','风暴眼'],['boo_bounce','弹力'],['boo_trail','长痕'],['boo_spin','回旋'],['boo_bleed','放血刃'],['boo_mark','追猎'],['boo_cyclone','旋风'],['boo_blade','飞刃'],['boo_wind','风刃'],['boo_tip','镖尖'],['boo_speed','疾风回旋']],
  cannon: [['can_heavy','重爆'],['can_quake','震地'],['can_pierce','穿透'],['can_double','双发'],['can_airstrike','空袭'],['can_minefield','雷场'],['can_turret','炮群'],['can_armory','弹药库'],['can_powder','火药'],['can_rapid','速射'],['can_knock','震烈'],['can_fireline','火线'],['can_incend','燃烧弹'],['can_reinforce','增援'],['can_mine','地雷强化'],['can_war','军火之王']],
  universal: [['cm_triple','三消之力'],['cm_vault','金库'],['cm_wall','城墙加固'],['cm_ammobox','弹药箱'],['cm_charge','全局充能'],['cm_speed','攻速戒指'],['cm_power','力量符'],['cm_exp','经验之心'],['cm_guard','减伤护符'],['cm_regen','生命回复'],['cm_combo','连锁反应'],['cm_stasis','时间停滞'],['cm_freeze','冻结时刻'],['cm_bounty','赏金猎人'],['cm_tome','智慧典籍'],['cm_shuffle','战术转移']],
};

let copied = 0;
const missing = [];
for (const [cat, pairs] of Object.entries(IDS)) {
  const map = JSON.parse(fs.readFileSync(path.join(SRC, cat, 'mapping.json'), 'utf8'));
  const byName = Object.fromEntries(map.items.map((it) => [it.name, it.file]));
  fs.mkdirSync(path.join(DST, cat), { recursive: true });
  for (const [id, name] of pairs) {
    const srcFile = byName[name];
    if (!srcFile) { missing.push(`${cat}/${name}`); continue; }
    const dst = path.join(DST, cat, `${id}.png`);
    if (path.join(SRC, cat, srcFile) !== dst) {
      fs.renameSync(path.join(SRC, cat, srcFile), dst);
    }
    copied++;
  }
}
console.log(`copied ${copied} icons -> ${DST}`);
if (missing.length) { console.log('MISSING:', missing.join(', ')); process.exit(1); }
