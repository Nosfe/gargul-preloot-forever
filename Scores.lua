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
