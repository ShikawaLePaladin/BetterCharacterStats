-- BCS_Rules.lua : formules de combat du SERVEUR (OctoWoW / Sunreach), sans aucune dependance au jeu (testable hors du client).
-- Source : code du serveur (Unit.cpp : MeleeMissChanceCalc, RollMeleeOutcomeAgainst, GetUnitCriticalChance, MELEE_HIT_GLANCING ;
-- Object.cpp : MagicSpellHitChance, MeleeSpellMissChance). Defense d'une cible de niveau L = 5 * L ; competence max d'un joueur de niveau N = 5 * N.
-- Lua 5.0 / 5.1 : pas de '#', pas de string.match.
BCS = BCS or {}
BCS.Rules = {}
local R = BCS.Rules

local min, max, floor = math.min, math.max, math.floor

R.BOSS_LEVEL = 63
R.PLAYER_MAX_SKILL = 300 -- niveau 60

local function clamp(v, lo, hi)
	if v < lo then return lo end
	if v > hi then return hi end
	return v
end
R.Clamp = clamp

-- defense de la cible (niveau * 5)
function R.TargetDefense(targetLevel)
	return (targetLevel or R.BOSS_LEVEL) * 5
end

-- Echec d'une attaque blanche : 5 % (+19 % si deux armes) - 0,2 % par point de (competence - defense) - bonus de toucher, borne a [0 ; 60]
-- (Unit::MeleeMissChanceCalc : l'ecart de competence vaut 0,2 % par point CONTRE UN MONSTRE, sans palier a -10 comme au Vanilla d'origine)
function R.Miss(skill, hit, dual, def)
	def = def or R.TargetDefense()
	local miss = 5 + (dual and 19 or 0) - 0.2 * (skill - def) - (hit or 0)
	return clamp(miss, 0, 60)
end

-- Echec d'une attaque speciale (jaune) : pas de malus des deux armes (WorldObject::MeleeSpellMissChance)
function R.MissSpecial(skill, hit, def)
	return R.Miss(skill, hit, false, def)
end

-- Bonus de toucher qu'il faut pour ne plus rater (plafond d'echec)
function R.HitNeeded(skill, dual, def)
	def = def or R.TargetDefense()
	return max(0, 5 + (dual and 19 or 0) - 0.2 * (skill - def))
end

-- Esquive d'un monstre : 5 % - 0,1 % par point de (competence - defense), jamais negative
function R.Dodge(skill, def)
	def = def or R.TargetDefense()
	return max(0, 5 - 0.1 * (skill - def))
end

-- Parade d'un monstre (de face seulement) : 5 % + 0,2 % par point de competence manquant (0,6 % au-dela de 10 points manquants) ;
-- la competence est PLAFONNEE a celle de ton niveau : le +skill au-dela de 300 n'y change rien
function R.Parry(skill, def, maxSkill)
	def = def or R.TargetDefense()
	maxSkill = maxSkill or R.PLAYER_MAX_SKILL
	local capped = min(maxSkill, skill) - def
	local bonus
	if capped < -10 then bonus = 0.6 * capped else bonus = 0.2 * capped end
	return max(0, 5 - bonus)
end

-- Blocage d'un monstre (de face seulement) : 5 % - 0,1 % par point de (competence - defense), plafonne a 5 %
function R.Block(skill, def)
	def = def or R.TargetDefense()
	return clamp(5 - 0.1 * (skill - def), 0, 5)
end

-- Chance de coup "glancing" : 10 % + 2 % par point de defense en plus de ta competence (plafonnee a ton niveau), maximum 40 %
function R.GlanceChance(skill, def, maxSkill)
	def = def or R.TargetDefense()
	maxSkill = maxSkill or R.PLAYER_MAX_SKILL
	local s = min(skill, maxSkill)
	return clamp(10 + (def - s) * 2, 0, 40)
end

-- Degats d'un coup glancing, en % des degats normaux : bornes basse / haute puis moyenne (tirage uniforme).
-- wand = classe qui utilise une baguette (pretre, mage, demoniste) : malus supplementaire du serveur
function R.GlanceBounds(skill, def, maxSkill, wand)
	def = def or R.TargetDefense()
	maxSkill = maxSkill or R.PLAYER_MAX_SKILL
	local diff = def - skill
	local extra = max(skill - maxSkill, 0)
	local low = 1.3 - 0.05 * diff - 0.03 * extra
	local high = 1.2 - 0.03 * diff - 0.01 * extra
	local lowCap, highCap = 0.91, 0.99
	if wand then
		low = low - 0.7
		high = high - 0.3
		lowCap = 0.6
	end
	if low < 0.01 then low = 0.01 end
	if high < 0.2 then high = 0.2 end
	if low > lowCap then low = lowCap end
	if high > highCap then high = highCap end
	return low * 100, high * 100
end
function R.GlanceDamage(skill, def, maxSkill, wand)
	local low, high = R.GlanceBounds(skill, def, maxSkill, wand)
	return (low + high) / 2
end

-- Modificateur de critique CONTRE UN MONSTRE (Unit::GetUnitCriticalChance) :
--   competence <= defense : 0,2 % par point d'ecart, avec ta competence plafonnee a celle de ton niveau (-3 % pour un boss 63 des 300)
--   competence >  defense : +0,04 % par point (la suppression disparait)
function R.CritMod(skill, def, maxSkill)
	def = def or R.TargetDefense()
	maxSkill = maxSkill or R.PLAYER_MAX_SKILL
	local diff = skill - def
	if diff > 0 then return 0.04 * diff end
	return 0.2 * (min(maxSkill, skill) - def)
end

-- Table d'attaque blanche vue de DERRIERE : echec, esquive, glancing, puis critique (les coups de face ajoutent parade et blocage)
function R.CritCapBehind(miss, dodge, glance)
	return clamp(100 - miss - dodge - glance, 0, 100)
end
function R.CritCapFront(miss, dodge, parry, glance, block)
	return clamp(100 - miss - dodge - parry - glance - block, 0, 100)
end

-- Sorts : base de toucher selon l'ecart de niveau (cible - lanceur) ; MagicSpellHitChance
--   ecart < 3 : 96 - ecart ; sinon 94 - (ecart - 2) * 11 (monstre) ; plancher de 33 % pour un joueur ; resultat final borne a [1 ; 99]
function R.SpellBaseHit(levelDiff, targetIsPlayer)
	local lchance = targetIsPlayer and 7 or 11
	local base
	if levelDiff < 3 then base = 96 - levelDiff else base = 94 - (levelDiff - 2) * lchance end
	if base < 33 then base = 33 end
	return base
end
function R.SpellHit(base, hit)
	return clamp(base + (hit or 0), 1, 99)
end
function R.SpellHitNeeded(base)
	return max(0, 99 - base)
end
