-- Builds a valid Interchange v2 test snapshot for in-game trials without workbook data.
-- Run from the repo root: luajit tests/addon/make_test_snapshot.lua
local scriptDir = (arg and arg[0] or "make_test_snapshot.lua"):match("^(.*)[\\/][^\\/]*$") or "."
local root = scriptDir .. "/../.."
local gargulDir = os.getenv("GARGUL_DIR") or (root .. "/../Gargul")

strchar, strbyte, strsub, strfind, strlen = string.char, string.byte, string.sub, string.find, string.len
strlower, strupper, strmatch, strrep, format = string.lower, string.upper, string.match, string.rep, string.format
gsub, tinsert, tremove = string.gsub, table.insert, table.remove

local GL = {}
assert(loadfile(gargulDir .. "/Classes/Base64.lua"), "Gargul v8.0.1 not found; set GARGUL_DIR")("Gargul", GL)
assert(loadfile(gargulDir .. "/Classes/JSON.lua"))("Gargul", GL)
local GP = {}
for _, file in ipairs({ "Compat.lua", "Snapshot.lua", "Scores.lua" }) do
    assert(loadfile(root .. "/" .. file))("Gargul_Preloot", GP)
end

local NAMES = {
    "Pepitasse", "Scodruid", "Inmyzoo", "Izù", "Krungski", "Jüice", "Stooner", "Priayks", "Noxcius", "Pørtoss",
    "Holychrìs", "Samblà", "Carpëdiem", "Meuhmeuh", "Göblar", "Ouestlgoret", "Aznorsh", "Krãkotte", "Olafe", "Zykö",
    "Willhona", "Sokachaman", "Yajiru", "Pøchità", "Ambroisy", "Mitiati", "Narvalo", "Mïtchelline",
}

-- Labels as in the workbook's Objets tabs (schema.js SPEC_COLUMNS).
local SPECS = {
    { "Guerrier Protection", "TANK" }, { "Paladin Protection", "TANK" }, { "Druide Combat farouche (ours)", "TANK" },
    { "Paladin Sacré", "HEALER" }, { "Prêtre Discipline", "HEALER" }, { "Prêtre Sacré", "HEALER" },
    { "Chaman Restauration", "HEALER" }, { "Druide Restauration", "HEALER" },
    { "Guerrier Armes", "DPS" }, { "Guerrier Fureur", "DPS" }, { "Paladin Vindicte", "DPS" },
    { "Voleur Assassinat", "DPS" }, { "Voleur Combat", "DPS" }, { "Voleur Finesse", "DPS" },
    { "Chaman Amélioration", "DPS" }, { "Druide Combat farouche (félin)", "DPS" },
    { "Chasseur Maîtrise des bêtes", "DPS" }, { "Chasseur Précision", "DPS" }, { "Chasseur Survie", "DPS" },
    { "Mage Arcanes", "DPS" }, { "Mage Feu", "DPS" }, { "Mage Givre", "DPS" },
    { "Démoniste Affliction", "DPS" }, { "Démoniste Démonologie", "DPS" }, { "Démoniste Destruction", "DPS" },
    { "Prêtre Ombre", "DPS" }, { "Chaman Élémentaire", "DPS" }, { "Druide Équilibre", "DPS" },
}

-- Classic and TBC raid drops; an ID that does not match the rolled item simply leaves Impact empty.
local ITEM_IDS = {
    19019, 17182, 18814, 19137, 17076, 18832, 17063, 19364, 19363, 19360, 19356, 19405, 19406, 19431, 19379,
    21126, 23054, 22798, 23577, 22691,
    28830, 28789, 28770, 28772, 28773, 28749, 28802, 28774, 28767, 28794, 28800, 28823, 29458, 28782, 28781,
    28657, 28658, 29348, 30627, 32483, 29996, 30311, 30312, 30090, 32500, 32471,
}

local TIER_MAX = 12
local raiders = {}
for index, name in ipairs(NAMES) do
    local spec = SPECS[(index - 1) % #SPECS + 1]
    local raider = {
        raiderKey = name,
        role = spec[2],
        classSpec = spec[1],
        tierPresence = (index * 5) % (TIER_MAX + 1),
        tierPresenceMax = TIER_MAX,
        bisLootCount = index % 4,
        impactLootCount = (index * 3) % 5,
        dpsParse = 35 + (index * 13) % 65,
    }
    raider.bisRatio = GP.Scores.bisRatio(raider)
    raider.impactBase = GP.Scores.impactBase(raider)
    raiders[#raiders + 1] = raider
end

-- Each item lists six specs: three IMPACT with different gains, then BIS, CLASS_BOUND and NORMAL.
local STATUTS = { "IMPACT", "IMPACT", "IMPACT", "BIS", "CLASS_BOUND", "NORMAL" }
local items = {}
for index, itemID in ipairs(ITEM_IDS) do
    local specs = {}
    for slot, statut in ipairs(STATUTS) do
        local spec = SPECS[((index - 1) * 5 + slot - 1) % #SPECS + 1]
        specs[#specs + 1] = {
            classSpec = spec[1],
            statut = statut,
            gainFraction = statut == "IMPACT" and (5 + (index * 7 + slot * 3) % 30) / 100 or nil,
        }
    end
    items[#items + 1] = { itemID = itemID, specs = specs }
end

local snapshot = { schemaVersion = 2, tierId = "anniversary-test", raidId = "test-1", raiders = raiders, items = items }
local json = GL.JSON:encode(snapshot)
local b64 = GL.Base64.encode(json)

local parsed, err = GP.Snapshot.parse(b64, GL)
assert(parsed, "generated snapshot is invalid: " .. tostring(err))

local outDir = scriptDir .. "/payloads"
for path, content in pairs({ [outDir .. "/test-snapshot.json"] = json, [outDir .. "/test-snapshot.b64.txt"] = b64 }) do
    local handle = assert(io.open(path, "wb"))
    handle:write(content)
    handle:close()
end

print(("OK: %d raiders, %d items; %d JSON bytes, %d Base64 characters"):format(#raiders, #items, #json, #b64))
