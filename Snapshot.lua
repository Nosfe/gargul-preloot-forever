local _, GP = ...

local Snapshot = {}
GP.Snapshot = Snapshot

local SCHEMA_VERSION = 2

local current = nil
local raidersByKey = {}

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

    if data.schemaVersion ~= SCHEMA_VERSION then
        return nil, ("version de snapshot non prise en charge (%s, attendu %d)"):format(tostring(data.schemaVersion), SCHEMA_VERSION)
    end

    if not isNonEmptyString(data.tierId) or not isNonEmptyString(data.raidId) then
        return nil, "tierId ou raidId manquant"
    end

    if type(data.raiders) ~= "table" then
        return nil, "liste raiders manquante"
    end

    local entries = 0
    for _ in pairs(data.raiders) do
        entries = entries + 1
    end
    if entries ~= #data.raiders then
        return nil, "liste raiders invalide (entrée vide ou non numérotée)"
    end

    for index, raider in ipairs(data.raiders) do
        if type(raider) ~= "table" or not isNonEmptyString(raider.raiderKey) then
            return nil, ("raider %d sans raiderKey"):format(index)
        end
    end

    return data
end

--- Replace the session snapshot; only called with a successfully parsed snapshot.
function Snapshot.set(data)
    current = data
    raidersByKey = {}
    for _, raider in ipairs(data.raiders) do
        raidersByKey[raider.raiderKey] = raider
    end
end

function Snapshot.get()
    return current
end

function Snapshot.raider(raiderKey)
    return raidersByKey[raiderKey]
end

function Snapshot.clear()
    current = nil
    raidersByKey = {}
end
