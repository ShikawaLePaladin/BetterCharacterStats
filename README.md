# BetterCharacterStats for Turtle WoW
This addon shows your character stats that are not present in default UI.<br>
This version is designed specifically for TurtleWoW and its custom changes.
## Features
 - Base stats: strength, agility, stamina, intellect, spirit, armor
 - Melee/Ranged: weapon skill, damage, attack speed, attack power, hit, crit
 - Spells: spell power, spell hit, crit, healing power, mana regeneration
 - Schools: your spell power for each school of magic
 - Defenses: armor, defense skill, dodge, parry, block, avoidance
## Preview
![preview1](https://github.com/user-attachments/assets/d342aed0-812c-40f9-a4d4-9b33eb48caa3)

## Installation
1. Click Code -> Download ZIP
2. Extract ZIP file into your Interface/AddOnns folder, remove ``-main``
3. Restart the game
 
## Thanks to original author and all contributors
Moh, Bennylava, Lexie, Spit, Pepopo


## Fork notes (Shikiwa, 1.16.0): real server combat rules
The upstream addon picks its formulas from the Turtle client version; on OctoWoW/Sunreach that is not defined, so it fell back to the original Vanilla formulas, which differ from the server. This fork computes the boss figures with the server's own rules (`BCS_Rules.lua`, taken from the server's combat code, level 63 target):
 - melee miss 5 % (+19 % dual wield, white hits only) - 0.2 % per skill point above 315 - hit; special attacks have no dual-wield penalty
 - dodge 5 % - 0.1 % per skill point; parry 14 % at 300 skill (skill capped at your level maximum); block up to 5 %
 - glancing chance and damage (75 % average at 305 skill, not 85 %); crit modifier -3 % up to 315 skill, +0.04 % per point above
 - spells: 83 % base hit against a level 63, 16 % hit needed for the 99 % cap, no level suppression on spell crit
New panels in the stats dropdown: **Melee vs Boss (hit)** and **Spell vs Boss**. `/bcsrules vanilla` goes back to the old formulas, `/bcsrules server` to the new ones.
Tests: `node tests/rules_test.js` (formulas against a line-by-line port of the server code), `node tests/bcs_integration.js` (loads the real addon files on a fake client), `node tests/lint50.js <file>` (Lua 5.0 check); they need Node.js with `fengari`.
Not verified: in-game rendering of the new panels, hit bonuses from talents/set bonuses that the tooltip patterns do not read.
