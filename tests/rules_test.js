// rules_test.js : BCS_Rules.lua contre une traduction ligne a ligne du code C++ du serveur (entiers en centiemes de %, comme le serveur)
const fs = require('fs'), path = require('path');
function req(n) { for (const c of ['C:/Temp/ccx/luatest/node_modules', path.join(__dirname, '..', 'node_modules')]) { try { return require(path.join(c, n)); } catch (e) { } } return require(n); }
const { lua, lauxlib, lualib, to_luastring } = req('fengari');
const L = lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
function run(code, name) { const s = to_luastring(code); if (lauxlib.luaL_loadbuffer(L, s, s.length, to_luastring('@' + name)) || lua.lua_pcall(L, 0, 0, 0)) { console.log('LUA ERROR ' + name + ': ' + lua.lua_tojsstring(L, -1)); process.exit(1); } }
run(fs.readFileSync(path.join(__dirname, '..', 'BCS_Rules.lua'), 'utf8'), 'BCS_Rules.lua');
function call(expr) { run('__r = ' + expr, 'call'); lua.lua_getglobal(L, to_luastring('__r')); const v = lua.lua_tonumber(L, -1); lua.lua_pop(L, 1); return v; }

// ---------- reference : traduction du C++ (Unit.cpp / Object.cpp du serveur) ----------
const trunc = Math.trunc;
// Unit::MeleeMissChanceCalc : missChance (float) ; ensuite le serveur l'utilise en int32(miss*100)
function cppMiss(skill, hit, dual, def) {
  let miss = 5.0; if (dual) miss += 19.0;
  const skillDiff = skill - def; miss -= skillDiff * 0.2; miss -= hit;
  if (miss < 0) return 0; if (miss > 60) return 60; return miss;
}
// RollMeleeOutcomeAgainst : dodge_chance (int32, centiemes) = 500 - 10*skillDiff ; skillDiff = skill - victimMaxSkillValueForLevel
function cppDodge(skill, defMax) { const skillDiff = skill - defMax; const dodgeSkillBonus = 10 * skillDiff; const d = 500 - dodgeSkillBonus; return d > 0 ? d / 100 : 0; }
function cppParry(skill, defMax, attMax) {
  const cappedSkillDiff = Math.min(attMax, skill) - defMax;
  const parrySkillBonus = cappedSkillDiff < -10 ? 60 * cappedSkillDiff : 20 * cappedSkillDiff;
  const p = 500 - parrySkillBonus; return p > 0 ? p / 100 : 0;
}
function cppBlock(skill, defMax) { const skillDiff = skill - defMax; let b = 500 - 10 * skillDiff; if (b > 500) b = 500; return b > 0 ? b / 100 : 0; }
function cppGlance(skill, def, attMax) { let a = skill; if (a > attMax) a = attMax; let tmp = (10 + ((def - a) * 2)) * 100; tmp = tmp > 4000 ? 4000 : tmp; if (tmp < 0) tmp = 0; return tmp / 100; }
function cppGlanceBounds(weaponSkill, def, attMax, wand) {
  const skillDiff = def - weaponSkill; const extra = Math.max(weaponSkill - attMax, 0);
  let low = 1.3 - 0.05 * skillDiff - 0.03 * extra, high = 1.2 - 0.03 * skillDiff - 0.01 * extra, lowCap = 0.91, highCap = 0.99;
  if (wand) { low -= 0.7; high -= 0.3; lowCap = 0.6; }
  if (low < 0.01) low = 0.01; if (high < 0.2) high = 0.2; if (low > lowCap) low = lowCap; if (high > highCap) high = highCap;
  return [low * 100, high * 100];
}
// Unit::GetUnitCriticalChance (partie "defence skill") contre un monstre
function cppCritMod(skill, def, attMax) {
  const skillDiff = skill - def; const minSkill = attMax < skill ? attMax : skill; const capped = minSkill - def;
  return skillDiff > 0 ? skillDiff * 0.04 : capped * 0.2;
}
// WorldObject::MagicSpellHitChance
function cppSpell(leveldif, hit, victimPlayer) {
  const lchance = victimPlayer ? 7 : 11; let m = leveldif < 3 ? 96 - leveldif : 94 - (leveldif - 2) * lchance;
  if (m < 33) m = 33; m += hit; let h = trunc(m * 100); if (h < 100) h = 100; if (h > 9900) h = 9900; return h / 100;
}

let fails = 0, passes = 0;
function eq(a, b, msg) { if (Math.abs(a - b) > 0.0101) { fails++; console.log('FAIL ' + msg + ' : lua ' + a + ' / serveur ' + b); } else passes++; }
const DEF = 315, MAXS = 300;
for (let skill = 250; skill <= 340; skill += 1) {
  for (const hit of [0, 1, 3, 5, 8, 9, 12]) {
    for (const dual of [false, true]) eq(call(`BCS.Rules.Miss(${skill},${hit},${dual},${DEF})`), cppMiss(skill, hit, dual, DEF), `miss skill=${skill} hit=${hit} dw=${dual}`);
  }
  eq(call(`BCS.Rules.Dodge(${skill},${DEF})`), cppDodge(skill, DEF), `dodge ${skill}`);
  eq(call(`BCS.Rules.Parry(${skill},${DEF},${MAXS})`), cppParry(skill, DEF, MAXS), `parry ${skill}`);
  eq(call(`BCS.Rules.Block(${skill},${DEF})`), cppBlock(skill, DEF), `block ${skill}`);
  eq(call(`BCS.Rules.GlanceChance(${skill},${DEF},${MAXS})`), cppGlance(skill, DEF, MAXS), `glance chance ${skill}`);
  for (const wand of [false, true]) {
    const [lo, hi] = cppGlanceBounds(skill, DEF, MAXS, wand);
    eq(call(`select(1, BCS.Rules.GlanceBounds(${skill},${DEF},${MAXS},${wand}))`), lo, `glance low ${skill} wand=${wand}`);
    eq(call(`select(2, BCS.Rules.GlanceBounds(${skill},${DEF},${MAXS},${wand}))`), hi, `glance high ${skill} wand=${wand}`);
    eq(call(`BCS.Rules.GlanceDamage(${skill},${DEF},${MAXS},${wand})`), (lo + hi) / 2, `glance moyenne ${skill} wand=${wand}`);
  }
  eq(call(`BCS.Rules.CritMod(${skill},${DEF},${MAXS})`), cppCritMod(skill, DEF, MAXS), `crit mod ${skill}`);
}
// niveaux de cible differents (defense = 5 * niveau)
for (const lvl of [60, 61, 62, 63, 64, 70]) for (const skill of [290, 300, 305, 310, 315, 320]) {
  const d = lvl * 5; eq(call(`BCS.Rules.Miss(${skill},0,false,${d})`), cppMiss(skill, 0, false, d), `miss L${lvl} s${skill}`);
}
for (let diff = -3; diff <= 6; diff++) for (const hit of [0, 5, 16, 17, 30]) {
  eq(call(`BCS.Rules.SpellHit(BCS.Rules.SpellBaseHit(${diff},false),${hit})`), cppSpell(diff, hit, false), `sort diff=${diff} hit=${hit}`);
  eq(call(`BCS.Rules.SpellHit(BCS.Rules.SpellBaseHit(${diff},true),${hit})`), cppSpell(diff, hit, true), `sort joueur diff=${diff} hit=${hit}`);
}
// ---------- valeurs calculees a la main depuis le code du serveur (boss niveau 63, competence 300) ----------
eq(call('BCS.Rules.Miss(300,0,false)'), 8, 'main : echec blanc 300 = 8 %');
eq(call('BCS.Rules.Miss(300,0,true)'), 27, 'main : echec deux armes 300 = 27 %');
eq(call('BCS.Rules.HitNeeded(300,false)'), 8, 'main : toucher necessaire (jaune) 300 = 8 %');
eq(call('BCS.Rules.HitNeeded(300,true)'), 27, 'main : toucher necessaire (deux armes) 300 = 27 %');
eq(call('BCS.Rules.HitNeeded(305,false)'), 7, 'main : toucher necessaire 305 = 7 %');
eq(call('BCS.Rules.HitNeeded(315,false)'), 5, 'main : toucher necessaire 315 = 5 %');
eq(call('BCS.Rules.Dodge(300)'), 6.5, 'main : esquive 300 = 6,5 %');
eq(call('BCS.Rules.Dodge(315)'), 5, 'main : esquive 315 = 5 %');
eq(call('BCS.Rules.Parry(300)'), 14, 'main : parade 300 = 14 %');
eq(call('BCS.Rules.Parry(310)'), 14, 'main : parade 310 = 14 % (skill plafonne a 300)');
eq(call('BCS.Rules.Block(300)'), 5, 'main : blocage 300 = 5 %');
eq(call('BCS.Rules.GlanceChance(300)'), 40, 'main : glancing 300 = 40 %');
eq(call('BCS.Rules.GlanceChance(310)'), 40, 'main : glancing 310 = 40 % (plafonne a 300)');
eq(call('BCS.Rules.GlanceDamage(300)'), 65, 'main : degats glancing 300 = 65 %');
eq(call('BCS.Rules.GlanceDamage(305)'), 75, 'main : degats glancing 305 = 75 %');
eq(call('BCS.Rules.GlanceDamage(310)'), 85, 'main : degats glancing 310 = 85 %');
eq(call('BCS.Rules.GlanceDamage(315)'), 92, 'main : degats glancing 315 = 92 % (bas 85, haut 99 plafonne)');
eq(call('BCS.Rules.CritMod(300)'), -3, 'main : critique 300 = -3 %');
eq(call('BCS.Rules.CritMod(310)'), -3, 'main : critique 310 = -3 % (skill plafonne a 300)');
eq(call('BCS.Rules.CritMod(315)'), -3, 'main : critique 315 = -3 %');
eq(call('BCS.Rules.CritMod(316)'), 0.04, 'main : critique 316 = +0,04 % (la suppression disparait)');
eq(call('BCS.Rules.SpellBaseHit(3,false)'), 83, 'main : base de toucher des sorts vs 63 = 83 %');
eq(call('BCS.Rules.SpellHitNeeded(83)'), 16, 'main : toucher des sorts a ajouter pour le plafond 99 % = 16 %');
eq(call('BCS.Rules.SpellHit(83,16)'), 99, 'main : 83 + 16 = 99 %');
eq(call('BCS.Rules.SpellHit(83,20)'), 99, 'main : plafond 99 %');
eq(call('BCS.Rules.SpellHit(83,0)'), 83, 'main : 83 % sans toucher');
console.log(passes + ' verifications OK, ' + fails + ' ECHECS');
process.exit(fails ? 1 : 0);
