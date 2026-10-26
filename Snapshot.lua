local _, GP = ...

local Snapshot = {}
GP.Snapshot = Snapshot

local SCHEMA_VERSION = 2

local current = nil
local raidersByKey = {}
local statutsByItem = {}

local function trim(text)
    return (text:gsub("^%s+", ""):gsub("%s+$", ""))
end

local function isNonEmptyString(value)
    return type(value) == "string" and value ~= ""
end

local function decodeText(text, GL)
    local body = trim(text)
    if body:sub(1, 1) == "{" then
        return body
    end

    local b64 = body:gsub("%s+", "")
    if b64 == "" or b64:find("[^%w%+/=]") then
        return nil, "le texte n'est ni du Base64 ni du JSON"
    end

    local ok, decoded = pcall(GL.Base64.decode, b64)
    if not ok or type(decoded) ~= "string" or decoded == "" then
        return nil, "décodage Base64 impossible"
    end

    return decoded
end

--- Parse a pasted snapshot (Base64 or raw JSON); returns the snapshot table, or nil and a French error.
function Snapshot.parse(text, GL)
    if type(text) ~= "string" or trim(text) == "" then
        return nil, "aucun texte collé"
    end

    local json, decodeError = decodeText(text, GL)
    if not json then
        return nil, decodeError
    end

    local ok, data = pcall(GL.JSON.decode, GL.JSON, json)
    if not ok or type(data) ~= "table" then
        return nil, "JSON invalide"
    end

    local validationError = Snapshot.validate(data)
    if validationError then
        return nil, validationError
    end

    return data
end

local ROLES = { DPS = true, HEALER = true, TANK = true }
local STATUTS = { BIS = true, IMPACT = true, CLASS_BOUND = true, NORMAL = true }

local function isFiniteNumber(value)
    return type(value) == "number" and value == value and value ~= math.huge and value ~= -math.huge
end

local function isInteger(value, minimum)
    return isFiniteNumber(value) and value == math.floor(value) and value >= minimum
end

-- A JSON array decodes to a table whose only keys are 1..n.
local function isArray(value)
    if type(value) ~= "table" then
        return false
    end

    local count = 0
    for _ in pairs(value) do
        count = count + 1
    end
    return count == #value
end

-- Same check as the workbook exporter's withinSnapshotTolerance_ (AD-6).
local function withinTolerance(value, recomputed)
    return math.abs(value - recomputed) <= 1e-9 * math.max(1, math.abs(recomputed))
end

local function validateRaider(raider, index, errors, seenKeys)
    if type(raider) ~= "table" or not isNonEmptyString(raider.raiderKey) then
        errors[#errors + 1] = ("raider %d sans raiderKey"):format(index)
        return
    end

    local key = raider.raiderKey
    local function fail(message)
        errors[#errors + 1] = key .. " : " .. message
    end

    if seenKeys[key] then
        fail("nom en double")
        return
    end
    seenKeys[key] = true

    if not ROLES[raider.role] then
        fail("rôle inconnu (" .. tostring(raider.role) .. ")")
    end
    if not isNonEmptyString(raider.classSpec) then
        fail("classSpec manquante")
    end

    local countsValid = true
    for _, field in ipairs({ { "tierPresence", 0 }, { "tierPresenceMax", 1 }, { "bisLootCount", 0 }, { "impactLootCount", 0 } }) do
        if not isInteger(raider[field[1]], field[2]) then
            fail(("%s doit être un entier >= %d"):format(field[1], field[2]))
            countsValid = false
        end
    end
    if countsValid and raider.tierPresence > raider.tierPresenceMax then
        fail("tierPresence > tierPresenceMax")
        countsValid = false
    end

    local parseValid = isFiniteNumber(raider.dpsParse) and raider.dpsParse >= 1 and raider.dpsParse <= 100
    if not parseValid then
        fail("dpsParse hors plage (1-100)")
    end

    if countsValid then
        local bisRatio = GP.Scores.bisRatio(raider)
        if not isFiniteNumber(raider.bisRatio) or not withinTolerance(raider.bisRatio, bisRatio) then
            fail("bisRatio ne correspond pas au calcul")
        end
    end

    if raider.role == "TANK" then
        if raider.impactBase ~= nil then
            fail("impactBase doit être null pour un tank")
        end
    elseif countsValid and parseValid and ROLES[raider.role] then
        local impactBase = GP.Scores.impactBase(raider)
        if not isFiniteNumber(raider.impactBase) or not withinTolerance(raider.impactBase, impactBase) then
            fail("impactBase ne correspond pas au calcul")
        end
    end
end

local function validateItem(item, index, errors, seenIDs)
    if type(item) ~= "table" or not isInteger(item.itemID, 1) then
        errors[#errors + 1] = ("objet %d : itemID invalide"):format(index)
        return
    end

    local where = "objet " .. item.itemID
    if seenIDs[item.itemID] then
        errors[#errors + 1] = where .. " : itemID en double"
        return
    end
    seenIDs[item.itemID] = true

    if not isArray(item.specs) then
        errors[#errors + 1] = where .. " : liste specs invalide"
        return
    end

    local seenSpecs = {}
    for _, spec in ipairs(item.specs) do
        if type(spec) ~= "table" or not isNonEmptyString(spec.classSpec) then
            errors[#errors + 1] = where .. " : spé sans classSpec"
        elseif seenSpecs[spec.classSpec] then
            errors[#errors + 1] = where .. " : " .. spec.classSpec .. " en double"
        else
            seenSpecs[spec.classSpec] = true
            if not STATUTS[spec.statut] then
                errors[#errors + 1] = where .. " : statut invalide pour " .. spec.classSpec
            end
            if spec.gainFraction ~= nil and not isFiniteNumber(spec.gainFraction) then
                errors[#errors + 1] = where .. " : gain non numérique pour " .. spec.classSpec
            end
        end
    end
end

--- Full Interchange v2 check; returns nil when valid, else the first problem in French and how many others.
function Snapshot.validate(data)
    if not isArray(data.raiders) then
        return "liste raiders manquante ou invalide"
    end
    if not isArray(data.items) then
        return "liste items manquante ou invalide"
    end

    local errors = {}
    if data.schemaVersion ~= SCHEMA_VERSION then
        errors[#errors + 1] = ("version de snapshot non prise en charge (%s, attendu %d)"):format(tostring(data.schemaVersion), SCHEMA_VERSION)
    end
    if not isNonEmptyString(data.tierId) or not isNonEmptyString(data.raidId) then
        errors[#errors + 1] = "tierId ou raidId manquant"
    end

    local seenKeys = {}
    for index, raider in ipairs(data.raiders) do
        validateRaider(raider, index, errors, seenKeys)
    end
    local seenIDs = {}
    for index, item in ipairs(data.items) do
        validateItem(item, index, errors, seenIDs)
    end

    if #errors == 0 then
        return nil
    end
    if #errors == 1 then
        return errors[1]
    end
    return ("%s (+%d %s)"):format(errors[1], #errors - 1, #errors == 2 and "autre" or "autres")
end

--- Replace the session snapshot; only called with a successfully parsed snapshot.
function Snapshot.set(data)
    current = data
    raidersByKey = {}
    for _, raider in ipairs(data.raiders) do
        raidersByKey[raider.raiderKey] = raider
    end

    statutsByItem = {}
    for _, item in ipairs(type(data.items) == "table" and data.items or {}) do
        local itemID = type(item) == "table" and tonumber(item.itemID)
        if itemID and type(item.specs) == "table" then
            local bySpec = {}
            for _, spec in ipairs(item.specs) do
                if type(spec) == "table" and type(spec.classSpec) == "string" then
                    bySpec[spec.classSpec] = spec
                end
            end
            statutsByItem[itemID] = bySpec
        end
    end
end

function Snapshot.get()
    return current
end

function Snapshot.raider(raiderKey)
    return raidersByKey[raiderKey]
end

--- The owner's Statut for an item and spec, or nil when the snapshot has none.
function Snapshot.statut(itemID, classSpec)
    local spec = Snapshot.itemSpec(itemID, classSpec)
    return spec and spec.statut or nil
end

--- The snapshot's {classSpec, statut, gainFraction} for an item and spec, or nil.
function Snapshot.itemSpec(itemID, classSpec)
    local bySpec = statutsByItem[tonumber(itemID)]
    return bySpec and bySpec[classSpec] or nil
end

function Snapshot.clear()
    current = nil
    raidersByKey = {}
    statutsByItem = {}
end
