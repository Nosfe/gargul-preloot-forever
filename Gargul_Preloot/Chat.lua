local _, GP = ...

local Chat = {}
GP.Chat = Chat

local function number(value)
    return GP.Scores.format(value)
end

--- French line for a confirmed award: new BiS Ratio for BIS, new Impact Score for IMPACT, nil otherwise or when not computable.
function Chat.message(entry)
    if type(entry) ~= "table" then
        return nil
    end

    local raider = GP.Awards.liveRaider(entry.winner)
    if not raider then
        return nil
    end

    if entry.treatment == "BIS" then
        local ratio = GP.Scores.bisRatio(raider)
        return ratio and ("%s : nouveau ratio BiS %s"):format(entry.winner, number(ratio)) or nil
    end

    if entry.treatment == "IMPACT" then
        local score = GP.Scores.impactScore(raider, GP.Snapshot.itemSpec(entry.itemID, raider.classSpec))
        return score and ("%s : nouveau score Impact %s pour %s"):format(entry.winner, number(score), GP.Awards.itemLink(entry)) or nil
    end

    return nil
end

--- Send the line to group chat when Gargul's award announcements are on.
function Chat.announce(entry, GL)
    if not GP.Compat.announcementsEnabled(GL) then
        return
    end

    local message = Chat.message(entry)
    if message then
        GP.Compat.sendChat(GL, message)
    end
end
