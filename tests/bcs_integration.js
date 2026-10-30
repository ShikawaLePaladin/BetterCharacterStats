// bcs_integration.js : charge les VRAIS fichiers de BCS (regles + localisation + addon) avec un faux client et verifie les panneaux
const fs = require('fs'), path = require('path');
function req(n) { for (const c of ['C:/Temp/ccx/luatest/node_modules']) { try { return require(path.join(c, n)); } catch (e) { } } return require(n); }
const { lua, lauxlib, lualib, to_luastring } = req('fengari');
const L = lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
function run(code, name) { const s = to_luastring(code); if (lauxlib.luaL_loadbuffer(L, s, s.length, to_luastring('@' + name)) || lua.lua_pcall(L, 0, 0, 0)) { console.log('LUA ERROR ' + name + ': ' + lua.lua_tojsstring(L, -1)); process.exit(1); } }
function get(expr) { run('__r = tostring(' + expr + ')', 'get'); lua.lua_getglobal(L, to_luastring('__r')); const v = lua.lua_tojsstring(L, -1); lua.lua_pop(L, 1); return v; }
const dir = path.join(__dirname, '..');
run(`
_G = _G or getfenv(0)
getn = table.getn; format = string.format; strfind = string.find; max = math.max; min = math.min; floor = math.floor
ITEM_SPELL_TRIGGER_ONEQUIP = "Equip:"; DODGE = "Dodge"; PARRY = "Parry"; BLOCK = "Block"
GREEN_FONT_COLOR_CODE = "|cff20ff20"; RED_FONT_COLOR_CODE = "|cffff2020"; FONT_COLOR_CODE_CLOSE = "|r"
UnitName = function() return "Tester" end
UnitClass = function() return "Warrior", PLAYER_CLASS or "WARRIOR" end
UnitLevel = function() return 60 end
getglobal = function(n) return _G[n] end
UnitAttackBothHands = function() return MH or 300, 0, OH or 300, 0 end
UnitRangedAttack = function() return 300, 0 end
OffhandHasWeapon = function() return DUAL and 1 or nil end
SlashCmdList = {}
`, 'mock');
run(fs.readFileSync(path.join(dir, 'BCS_Rules.lua'), 'utf8'), 'BCS_Rules.lua');
run(fs.readFileSync(path.join(dir, 'Localization.lua'), 'utf8'), 'Localization.lua');
run(fs.readFileSync(path.join(dir, 'BetterCharacterStats.lua'), 'utf8'), 'BetterCharacterStats.lua');
// faux cadres
run(`
FRAMES = {}
local function mkText() local t = { v = "" }; function t:SetText(x) self.v = x end; function t:GetText() return self.v end; return t end
for _, prefix in ipairs({"PlayerStatFrameLeft", "PlayerStatFrameRight"}) do
  for i = 1, 6 do
    local n = prefix .. i
    local fr = { name = n }
    function fr:GetName() return self.name end
    function fr:SetScript() end
    _G[n] = fr; _G[n .. "StatText"] = mkText(); _G[n .. "Label"] = mkText()
  end
end
-- statistiques simulees du personnage
HIT = 0; SPELLHIT = 0; MH = 300; OH = 300; CRIT = 10; SCRIT = 8; PEN = 0
BCS.GetHitRating = function() return HIT end
BCS.GetSpellHitRating = function() return SPELLHIT, 0, 0, 0, 0, 0 end
BCS.GetMHWeaponSkill = function() return MH end
BCS.GetOHWeaponSkill = function() return OH end
BCS.GetCritChance = function() return CRIT end
BCS.GetSpellCritChance = function() return SCRIT end
BCS.GetSpellPen = function() return PEN end
BCS.SetSpellHaste = function() end
BCSConfig = BCSConfig or {}
function show(index) BCS:UpdatePaperdollStats("PlayerStatFrameLeft", index); local o = {} for i = 1, 6 do o[i] = (_G["PlayerStatFrameLeft" .. i .. "Label"]:GetText() or "") .. " " .. (_G["PlayerStatFrameLeft" .. i .. "StatText"]:GetText() or "") end return table.concat(o, " ; ") end
`, 'frames');
let fails = 0, passes = 0;
function ok(c, m) { if (!c) { fails++; console.log('FAIL ' + m); } else passes++; }
function has(s, sub, m) { ok(s.indexOf(sub) >= 0, m + '  (obtenu : ' + s + ')'); }
// 1. mele vs boss, arme a une main, competence 300, 0 % de toucher
run('HIT=0; MH=300; DUAL=false', 's1');
let s = get('show("PLAYERSTAT_MELEE_BOSS")');
has(s, 'Miss %: 8.0%', 'echec 8 % (competence 300, sans toucher)'); has(s, 'Dodge %: 6.5%', 'esquive 6,5 %'); has(s, 'Glance Dmg: 65%', 'glancing 65 %'); 
// plafond : 100 - 8 - 6.5 - 40 = 45.5
s = get('show("PLAYERSTAT_MELEE_BOSS")'); has(s, 'Crit Cap: 45.5%', 'plafond de critique 45,5 %'); has(s, 'Eff. Crit: 7.0%', 'critique effectif 10 - 3 = 7');
// 2. avec 5 % de toucher et competence 305
run('HIT=5; MH=305', 's2'); s = get('show("PLAYERSTAT_MELEE_BOSS")');
has(s, 'Miss %: 2.0%', 'echec 305 : 7 - 5 = 2 % (l ancien code Vanilla donnait 1 %)'); has(s, 'Glance Dmg: 75%', 'glancing 305 = 75 % (l ancien code donnait 85 %)');
// 3. deux armes
run('HIT=5; MH=300; OH=300; DUAL=true', 's3'); s = get('show("PLAYERSTAT_MELEE_BOSS")'); has(s, 'Miss %: 22.0% | 22.0%', 'deux armes : 8 + 19 - 5 = 22 %');
// 4. panneau 2
run('HIT=5; MH=300; DUAL=false', 's4'); s = get('show("PLAYERSTAT_MELEE_BOSS2")');
has(s, '5.0', 'toucher actuel 5'); has(s, '/ 8.0%', 'toucher necessaire 8 %'); has(s, 'Parry %: 14.0%', 'parade 14 %'); has(s, 'Block %: 5.0%', 'blocage 5 %'); has(s, 'Crit Mod: -3.00%', 'modificateur -3 %'); has(s, 'Crit Cap F: 31.5%', 'plafond de face 100-3-6,5-14-40-5 = 31,5');
run('HIT=8; MH=300; DUAL=false', 's5'); s = get('show("PLAYERSTAT_MELEE_BOSS2")'); has(s, '|cff20ff208.0%|r / 8.0%', 'toucher au plafond : affiche en vert');
run('MH=316; HIT=0', 's6'); s = get('show("PLAYERSTAT_MELEE_BOSS2")'); has(s, 'Crit Mod: +0.04%', '316 de competence : plus de suppression de critique'); has(s, 'Parry %: 14.0%', 'parade toujours 14 % (competence plafonnee)');
run('MH=316; HIT=0', 's6b'); s = get('show("PLAYERSTAT_MELEE_BOSS")'); has(s, 'Eff. Crit: 10.0%', '316 de competence : critique effectif = critique affiche');
// 5. deux armes dans le panneau 2
run('MH=300; OH=305; HIT=0; DUAL=true', 's7'); s = get('show("PLAYERSTAT_MELEE_BOSS2")'); has(s, '/ 27.0%', 'toucher necessaire deux armes 27 %'); has(s, 'Parry %: 14.0% | 14.0%', 'parade deux mains'); has(s, 'Crit Mod: -3.00% | -3.00%', 'modificateur deux mains');
// 6. sorts
run('SPELLHIT=0; SCRIT=12; PEN=20; DUAL=false', 's8'); s = get('show("PLAYERSTAT_SPELL_BOSS")');
has(s, 'Hit vs 63: 83.0%', 'sorts : 83 % sans toucher'); has(s, 'Hit Needed: 16.0%', 'il faut 16 %'); has(s, 'Crit vs 63: 12.00%', 'critique des sorts non supprime'); has(s, 'Spell Pen: 20', 'penetration');
run('SPELLHIT=10', 's9'); s = get('show("PLAYERSTAT_SPELL_BOSS")'); has(s, 'Hit vs 63: 93.0%', 'sorts : 83 + 10 = 93 %'); has(s, 'Hit Needed: 6.0%', 'reste 6 %');
run('SPELLHIT=16', 's10'); s = get('show("PLAYERSTAT_SPELL_BOSS")'); has(s, 'Hit vs 63: 99.0%', 'sorts plafonnes a 99 %'); has(s, 'Capped', 'plafond atteint affiche');
run('SPELLHIT=25', 's11'); s = get('show("PLAYERSTAT_SPELL_BOSS")'); has(s, 'Hit vs 63: 99.0%', 'au-dela du plafond : 99 %');
// 7. formules Vanilla d origine : /bcsrules vanilla
run('BCSConfig.rules = "vanilla"; HIT=5; MH=305; DUAL=false', 's12'); s = get('show("PLAYERSTAT_MELEE_BOSS")'); has(s, 'Miss %: 1.0%', 'mode vanilla : ancien resultat 1 % (le serveur : 2 %)'); has(s, 'Glance Dmg: 85%', 'mode vanilla : glancing 85 % (le serveur : 75 %)');
run('BCSConfig.rules = nil', 's13');
// 8. classes a baguette : glancing reduit
run('PLAYER_CLASS = "MAGE"', 's14');
console.log(passes + ' verifications OK, ' + fails + ' ECHECS'); process.exit(fails ? 1 : 0);
