local _, GP = ...

local Awards = {}
GP.Awards = Awards

Awards.TREATMENTS = { "BIS", "IMPACT", "CLASS_BOUND", "NORMAL" }

local DISENCHANT_WINNER = "||de||"

local entries = {}
local disenchanted = {}
local sequence = 0
local raidId = nil

local function isTreatment(value)
    for _, treatment in ipairs(Awards.TREATMENTS) do
        if treatment == value then
            return true
        end
    end

    return false
end

local function winnerKey(awardedTo, GL)
    return GP.Compat.winnerKey(GL, awardedTo)
end

local function isDisenchant(awardedTo, GL)
    return awardedTo == (GL.Exporter and GL.Exporter.disenchantedItemIdentifier or DISENCHANT_WINNER)
end

local function changed()
    if Awards.onChange then
        Awards.onChange()
    end
end

--- Snapshot raider with this session's BIS and IMPACT awards added to its loot counts; nil when unknown.
function Awards.liveRaider(raiderKey)
    local raider = GP.Snapshot.raider(raiderKey)
    if not raider then
        return nil
    end

    local live = {}
    for field, value in pairs(raider) do
        live[field] = value
    end
    for _, entry in pairs(entries) do
        if entry.winner == raiderKey then
            if entry.treatment == "BIS" then
                live.bisLootCount = live.bisLootCount + 1
            elseif entry.treatment == "IMPACT" then
                live.impactLootCount = live.impactLootCount + 1
            end
        end
    end

    return live
end

--- Prefill: the winner's spec Statut for the item, NORMAL when unknown or off-spec.
function Awards.defaultTreatment(itemID, raiderKey, isOS)
    if isOS then
        return "NORMAL"
    end

    local raider = GP.Snapshot.raider(raiderKey)
    local statut = raider and GP.Snapshot.statut(itemID, raider.classSpec)
    return isTreatment(statut) and statut or "NORMAL"
end

--- Record a new Gargul award; returns its checksum, or nil when it is not recorded.
function Awards.record(AwardEntry, GL)
    if not GP.Snapshot.get() or type(AwardEntry) ~= "table" or type(AwardEntry.checksum) ~= "string" then
        return nil
    end

    -- A repeated award message must not overwrite the owner's pick.
    if entries[AwardEntry.checksum] then
        return nil
    end
    if isDisenchant(AwardEntry.awardedTo, GL) then
        disenchanted[AwardEntry.checksum] = true
        return nil
    end
    disenchanted[AwardEntry.checksum] = nil

    local winner = winnerKey(AwardEntry.awardedTo, GL)
    sequence = sequence + 1
    entries[AwardEntry.checksum] = {
        checksum = AwardEntry.checksum,
        itemID = AwardEntry.itemID,
        source = AwardEntry,
        isOS = AwardEntry.OS == true,
        winner = winner,
        treatment = Awards.defaultTreatment(AwardEntry.itemID, winner, AwardEntry.OS == true),
        sequence = sequence,
    }

    changed()
    return AwardEntry.checksum
end

--- Winner changed in Gargul: update the entry and prefill again; awards moved to or from disenchant are dropped or recorded.
function Awards.edit(AwardEntry, GL)
    if type(AwardEntry) ~= "table" then
        return nil
    end

    local entry = entries[AwardEntry.checksum]
    if isDisenchant(AwardEntry.awardedTo, GL) then
        if entry then
            Awards.remove(AwardEntry.checksum)
            disenchanted[AwardEntry.checksum] = true
        end
        return nil
    end
    if not entry then
        return disenchanted[AwardEntry.checksum] and Awards.record(AwardEntry, GL) or nil
    end

    local winner = winnerKey(AwardEntry.awardedTo, GL)
    -- Gargul also fires this for edits that keep the winner; the owner's pick then stays.
    if winner == entry.winner then
        return nil
    end

    entry.winner = winner
    entry.treatment = Awards.defaultTreatment(entry.itemID, winner, entry.isOS)
    changed()
    return entry.checksum
end

function Awards.setTreatment(checksum, treatment)
    local entry = entries[checksum]
    if not entry or not isTreatment(treatment) then
        return false
    end

    if entry.treatment ~= treatment then
        entry.treatment = treatment
        changed()
    end
    return true
end

function Awards.remove(checksum)
    if entries[checksum] then
        entries[checksum] = nil
        changed()
    end
end

--- Drop entries whose checksum no longer exists in Gargul's award history.
function Awards.reconcile(history)
    local removed = false
    for checksum in pairs(entries) do
        if type(history) ~= "table" or not history[checksum] then
            entries[checksum] = nil
            removed = true
        end
    end
    if removed then
        changed()
    end
end

function Awards.get(checksum)
    return entries[checksum]
end

--- Gargul fills the link of awards received from other officers later, on the same entry.
function Awards.itemLink(entry)
    return entry.source and entry.source.itemLink or ("item " .. tostring(entry.itemID))
end

--- Session awards, newest first.
function Awards.list()
    local result = {}
    for _, entry in pairs(entries) do
        result[#result + 1] = entry
    end
    table.sort(result, function(a, b) return a.sequence > b.sequence end)
    return result
end

function Awards.clear()
    local hadEntries = next(entries) ~= nil
    entries = {}
    disenchanted = {}
    if hadEntries then
        changed()
    end
end

--- Called before a snapshot replaces the current one: a different raid starts a new session.
function Awards.onSnapshotImported(newRaidId)
    if newRaidId ~= raidId then
        Awards.clear()
    end
    raidId = newRaidId
end

--- The raid the recorded awards belong to (the imported snapshot's raidId).
function Awards.raidId()
    return raidId
end

local function prompt(checksum)
    if checksum and GP.Picker then
        GP.Picker.enqueue(checksum)
    end
end

function Awards.install(GL)
    local function on(event, identifier, handler)
        GL.Events:register(identifier, event, function(...)
            GP.Compat.safeCall(event, handler, ...)
        end)
    end

    on("GL.ITEM_AWARDED", "GargulPrelootItemAwarded", function(_, AwardEntry)
        prompt(Awards.record(AwardEntry, GL))
    end)

    on("GL.ITEM_AWARD_EDITED", "GargulPrelootAwardEdited", function(_, AwardEntry)
        prompt(Awards.edit(AwardEntry, GL))
        if GP.Picker then
            GP.Picker.refresh()
        end
    end)

    -- Bulk clears in Gargul fire this without a payload.
    on("GL.ITEM_UNAWARDED", "GargulPrelootItemUnawarded", function(_, AwardEntry)
        if type(AwardEntry) == "table" and AwardEntry.checksum then
            Awards.remove(AwardEntry.checksum)
        else
            Awards.reconcile(GL.DB and GL.DB.AwardHistory)
        end

        if GP.Picker then
            GP.Picker.refresh()
        end
    end)
end
