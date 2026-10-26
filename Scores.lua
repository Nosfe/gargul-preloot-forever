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
