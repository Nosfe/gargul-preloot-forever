local _, GP = ...

-- Feature detection and fallbacks, so the addon does not depend on one Gargul version's internals.
local Compat = {}
GP.Compat = Compat

local function say(message)
    print("|cFF00CCFF[Preloot]|r " .. message)
end

--- Value at a dotted path under root ("Interface.Importer.open"), or nil.
function Compat.get(root, path)
    local value = root
    for key in path:gmatch("[^%.]+") do
        if type(value) ~= "table" then
            return nil
        end
        value = value[key]
    end
    return value
end

function Compat.hasFunction(root, path)
    return type(Compat.get(root, path)) == "function"
end

local reported = {}

--- pcall that prints the first error per label; returns ok and the function's first result.
function Compat.safeCall(label, fn, ...)
    local ok, result = pcall(fn, ...)
    if not ok and not reported[label] then
        reported[label] = true
        say(("|cFFFF4040Erreur (%s) :|r %s"):format(label, tostring(result)))
    end
    return ok, result
end

local ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
local VALUES = {}
for index = 1, #ALPHABET do
    VALUES[ALPHABET:byte(index)] = index - 1
end

--- Pure-Lua Base64 decoder used when Gargul offers none; nil on invalid input.
function Compat.decodeBase64Pure(b64)
    b64 = b64:gsub("[^%w%+/=]", "")
    if #b64 % 4 ~= 0 then
        return nil
    end

    local out = {}
    for index = 1, #b64, 4 do
        local a, b, c, d = b64:byte(index, index + 3)
        local last = index + 3 == #b64
        -- "=" only pads the final group, and "x=y" is never valid.
        if a == 61 or b == 61 or (not last and (c == 61 or d == 61)) or (c == 61 and d ~= 61) then
            return nil
        end
        local va, vb = VALUES[a], VALUES[b]
        local vc = c ~= 61 and VALUES[c] or 0
        local vd = d ~= 61 and VALUES[d] or 0
        if not va or not vb or not vc or not vd then
            return nil
        end
        local n = va * 262144 + vb * 4096 + vc * 64 + vd
        local b1 = math.floor(n / 65536)
        local b2 = math.floor(n / 256) % 256
        local b3 = n % 256
        if c == 61 then
            out[#out + 1] = string.char(b1)
        elseif d == 61 then
            out[#out + 1] = string.char(b1, b2)
        else
            out[#out + 1] = string.char(b1, b2, b3)
        end
    end
    return table.concat(out)
end

--- Gargul's Base64 decoder (dot or colon style, `decode` or `Decode`), else the bundled one.
function Compat.base64Decode(GL, b64)
    local Base64 = GL and GL.Base64
    if type(Base64) == "table" then
        for _, name in ipairs({ "decode", "Decode" }) do
            local fn = Base64[name]
            if type(fn) == "function" then
                local ok, out = pcall(fn, b64)
                if ok and type(out) == "string" and out ~= "" then
                    return out
                end
                ok, out = pcall(fn, Base64, b64)
                if ok and type(out) == "string" and out ~= "" then
                    return out
                end
            end
        end
    end
    return Compat.decodeBase64Pure(b64)
end

--- Realm-less winner name as Gargul exports it (@WINNER); falls back to the text before the first "-".
function Compat.winnerKey(GL, awardedTo)
    if GL and type(GL.formatPlayerName) == "function" then
        local ok, name = pcall(GL.formatPlayerName, GL, awardedTo, { includeRealm = "never" })
        if ok and type(name) == "string" and name ~= "" then
            return name
        end
    end
    return (tostring(awardedTo):match("^[^%-]+"))
end

--- ID of the item being rolled: CurrentRollOff.itemID, else parsed from its item link.
function Compat.rolledItemID(RollOff)
    local current = type(RollOff) == "table" and RollOff.CurrentRollOff
    if type(current) ~= "table" then
        return nil
    end
    local itemID = tonumber(current.itemID)
    if itemID then
        return itemID
    end
    return tonumber(type(current.itemLink) == "string" and current.itemLink:match("item:(%d+)") or nil)
end

--- Gargul's award announcement setting; on when the setting cannot be read.
function Compat.announcementsEnabled(GL)
    local Settings = GL and GL.Settings
    if type(Settings) == "table" and type(Settings.get) == "function" then
        local ok, value = pcall(Settings.get, Settings, "AwardingLoot.awardMessagesEnabled")
        if ok and value ~= nil then
            return value and true or false
        end
    end
    return true
end

--- Group chat through Gargul, else WoW's SendChatMessage to RAID or PARTY, else a local print.
function Compat.sendChat(GL, message)
    if GL and type(GL.sendChatMessage) == "function" then
        local ok = pcall(GL.sendChatMessage, GL, message, "GROUP")
        if ok then
            return
        end
    end

    local channel = (type(_G.IsInRaid) == "function" and _G.IsInRaid() and "RAID")
        or (type(_G.IsInGroup) == "function" and _G.IsInGroup() and "PARTY")
    if channel and type(_G.SendChatMessage) == "function" then
        _G.SendChatMessage(message, channel)
    else
        say(message)
    end
end
