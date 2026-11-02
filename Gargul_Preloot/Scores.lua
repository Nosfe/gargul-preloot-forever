local _, GP = ...

local Scores = {}
GP.Scores = Scores

--- Display text with 3 decimals, halves rounded away from zero on every platform, and no "-0.000".
function Scores.format(value)
    local rounded = value >= 0 and math.floor(value * 1000 + 0.5) / 1000 or -math.floor(-value * 1000 + 0.5) / 1000
    local text = ("%.3f"):format(rounded)
    return text == "-0.000" and "0.000" or text
end

--- BiS Ratio = (Tier Presence / Tier Presence Max) / (BiS loots + 1); nil when an operand is missing.
function Scores.bisRatio(raider)
    if type(raider) ~= "table" then
        return nil
    end

    local presence = tonumber(raider.tierPresence)
    local presenceMax = tonumber(raider.tierPresenceMax)
    local bisLoots = tonumber(raider.bisLootCount)
    if not presence or not presenceMax or not bisLoots or presenceMax <= 0 then
        return nil
    end

    return (presence / presenceMax) / (bisLoots + 1)
end

--- Impact Score = (Tier Presence / Tier Presence Max) × parse × item gain in DPS / (Impact loots + 1), only for an IMPACT
--- Statut; nil for tanks or a missing operand; a null gain counts as 0 like the workbook. Used to check the snapshot's scores.
function Scores.impactScore(raider, itemSpec)
    if type(raider) ~= "table" or raider.role == "TANK" or type(itemSpec) ~= "table" or itemSpec.statut ~= "IMPACT" then
        return nil
    end

    local presence = tonumber(raider.tierPresence)
    local presenceMax = tonumber(raider.tierPresenceMax)
    local parse = tonumber(raider.dpsParse)
    local impactLoots = tonumber(raider.impactLootCount)
    if not presence or not presenceMax or not parse or not impactLoots or presenceMax <= 0 then
        return nil
    end

    return (presence / presenceMax) * parse * (tonumber(itemSpec.gainDps) or 0) / (impactLoots + 1)
end
