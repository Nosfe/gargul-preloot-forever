local _, GP = ...

local Scores = {}
GP.Scores = Scores

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

--- Impact base = (Tier Presence / Tier Presence Max) × parse / (Impact loots + 1); nil for tanks or a missing operand.
function Scores.impactBase(raider)
    if type(raider) ~= "table" or raider.role == "TANK" then
        return nil
    end

    local presence = tonumber(raider.tierPresence)
    local presenceMax = tonumber(raider.tierPresenceMax)
    local parse = tonumber(raider.dpsParse)
    local impactLoots = tonumber(raider.impactLootCount)
    if not presence or not presenceMax or not parse or not impactLoots or presenceMax <= 0 then
        return nil
    end

    return (presence / presenceMax) * parse / (impactLoots + 1)
end

--- Full Impact Score = Impact base × gain, only for an IMPACT Statut; a null gain counts as 0 like the workbook.
function Scores.impactScore(raider, itemSpec)
    if type(itemSpec) ~= "table" or itemSpec.statut ~= "IMPACT" then
        return nil
    end

    local impactBase = Scores.impactBase(raider)
    if not impactBase then
        return nil
    end

    return impactBase * (tonumber(itemSpec.gainFraction) or 0)
end
