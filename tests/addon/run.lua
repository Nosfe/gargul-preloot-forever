-- Offline tests for the addon's pure logic. Run from the repo root: luajit tests/addon/run.lua
local scriptDir = (arg and arg[0] or "run.lua"):match("^(.*)[\\/][^\\/]*$") or "."
local root = scriptDir .. "/../.."
local gargulDir = os.getenv("GARGUL_DIR") or (root .. "/../Gargul")

local function readFile(path)
    local handle = assert(io.open(path, "rb"), "cannot open " .. path)
    local content = handle:read("*a")
    handle:close()
    return content
end

-- WoW aliases used by Gargul's library files
strchar, strbyte, strsub, strfind, strlen = string.char, string.byte, string.sub, string.find, string.len
strlower, strupper, strmatch, strrep, format = string.lower, string.upper, string.match, string.rep, string.format
gsub, tinsert, tremove = string.gsub, table.insert, table.remove

local GL = {}
assert(loadfile(gargulDir .. "/Classes/Base64.lua"), "Gargul v8.0.1 not found; set GARGUL_DIR")("Gargul", GL)
assert(loadfile(gargulDir .. "/Classes/JSON.lua"))("Gargul", GL)

local GP = {}
for _, file in ipairs({ "Compat.lua", "Snapshot.lua", "Scores.lua", "Columns.lua", "Import.lua", "Awards.lua" }) do
    assert(loadfile(root .. "/" .. file))("Gargul_Preloot", GP)
end

local count, failures = 0, {}
local function check(condition, label)
    count = count + 1
    if not condition then
        failures[#failures + 1] = label
    end
end
local function equal(actual, expected, label)
    check(actual == expected, ("%s (expected %s, got %s)"):format(label, tostring(expected), tostring(actual)))
end

local sampleJson = readFile(root .. "/tools/google_apps_script/fixtures/snapshot-sample.json")
local sampleB64 = GL.Base64.encode(sampleJson)

-- Base64 import
local data, err = GP.Snapshot.parse(sampleB64, GL)
check(data ~= nil, "Base64 sample parses: " .. tostring(err))
equal(data and #data.raiders, 3, "Base64 sample raider count")
equal(data and data.tierId, "forever-t1", "tierId")
equal(data and data.raidId, "4", "raidId")

-- Base64 split over lines still parses
local wrapped = sampleB64:sub(1, 60) .. "\n" .. sampleB64:sub(61) .. "\n"
check(GP.Snapshot.parse(wrapped, GL) ~= nil, "Base64 with line breaks parses")

-- Raw JSON import
local raw = GP.Snapshot.parse("  \n" .. sampleJson, GL)
equal(raw and #raw.raiders, 3, "raw JSON raider count")

-- Accented spec survives byte-for-byte
GP.Snapshot.set(data)
equal(GP.Snapshot.raider("Beryl").classSpec, "Prêtre Sacré", "accented classSpec from Base64")
equal(GP.Snapshot.raider("Cairn").classSpec, "Druide Combat farouche (ours)", "spec with parentheses")

-- Bad payloads are refused and keep the previous snapshot
local bad = {
    { "", "empty text" },
    { "!!! pas du base64 !!!", "invalid Base64 characters" },
    { GL.Base64.encode("pas du json"), "Base64 of non-JSON" },
    { "{ broken json", "broken raw JSON" },
    { sampleJson:gsub('"schemaVersion": 2', '"schemaVersion": 3'), "schemaVersion 3" },
    { sampleJson:gsub('"raiders"', '"rangers"'), "raiders missing" },
    { sampleJson:gsub('"raidId": "4"', '"raidId": ""'), "empty raidId" },
    { sampleJson:gsub('"raiderKey": "Alya"', '"raiderKey": ""'), "raider without key" },
    { '{"schemaVersion":2,"tierId":"t","raidId":"1","raiders":{"x":{"raiderKey":"Alya"}}}', "raiders as an object" },
    { '{"schemaVersion":2,"tierId":"t","raidId":"1","raiders":[{"raiderKey":"A"},null,{"raiderKey":"B"}]}', "null raider entry" },
}
for _, case in ipairs(bad) do
    local result, message = GP.Snapshot.parse(case[1], GL)
    check(result == nil and type(message) == "string", "refused: " .. case[2])
    check(GP.Import.apply(case[1], GL) == false, "Import.apply returns false: " .. case[2])
    check(GP.Snapshot.get() == data, "previous snapshot kept: " .. case[2])
end

-- Successful Import.apply replaces the snapshot
check(GP.Import.apply(sampleB64, GL) == true, "Import.apply accepts the sample")
check(GP.Snapshot.get() ~= data and GP.Snapshot.raider("Alya") ~= nil, "Import.apply replaced the snapshot")

-- BiS Ratio cells
equal(GP.Columns.bisCellText("Alya"), "0.250", "Alya ratio")
equal(GP.Columns.bisCellText("Alya [2]"), "0.250", "re-roll suffix stripped")
equal(GP.Columns.bisCellText("Beryl"), "0.750", "Beryl ratio")
equal(GP.Columns.bisCellText("Cairn"), "0.250", "tank ratio")
equal(GP.Columns.bisCellText("alya"), "", "no case-folding")
equal(GP.Columns.bisCellText("Inconnu"), "", "unknown roller is empty")
equal(GP.Columns.rollerKey("Alya-Thunderstrike"), "Alya-Thunderstrike", "realm suffix kept as Gargul shows it")

local rows = { { cols = {} }, { cols = {} } }
for i = 1, 10 do
    rows[1].cols[i] = { value = i == 1 and "Beryl" or i }
    rows[2].cols[i] = { value = i == 1 and "Inconnu [3]" or i }
end
GP.Columns.appendCells(rows)
equal(#rows[1].cols, 12, "two cells appended")
equal(rows[1].cols[11].value, "0.750", "appended cell value")
equal(rows[1].cols[10].value, 10, "native cell 10 untouched")
equal(rows[2].cols[11].value, "", "unknown roller appended cell empty")

GP.Snapshot.clear()
equal(GP.Columns.bisCellText("Alya"), "", "no snapshot gives empty cell")

-- Large payload (over the old 8192-letter editbox limit)
local raiders = {}
for i = 1, 120 do
    raiders[#raiders + 1] = ('{"raiderKey":"Raider%d","role":"DPS","classSpec":"Mage Givre","tierPresence":3,"tierPresenceMax":4,"bisLootCount":0,"impactLootCount":0,"dpsParse":50,"bisRatio":0.75,"impactBase":37.5}'):format(i)
end
local bigJson = '{"schemaVersion":2,"tierId":"t","raidId":"9","raiders":[' .. table.concat(raiders, ",") .. '],"items":[]}'
local bigB64 = GL.Base64.encode(bigJson)
check(#bigB64 > 8192, "large payload exceeds 8192 characters")
local big = GP.Snapshot.parse(bigB64, GL)
equal(big and #big.raiders, 120, "large payload parses")

-- Hook wiring against stubbed Gargul objects
do
    local tableStub = { data = {} }
    function tableStub:SetData(rows) self.data = rows end
    function tableStub:SortData() end
    local windowStub = { width = 520, frame = {} }
    function windowStub.frame:GetWidth() return windowStub.width end
    function windowStub:SetWidth(width) self.width = width end

    local softReserves = { GetText = function() return "Soft-Reserves" end }
    function softReserves:ClearAllPoints() self.points = {} end
    function softReserves:SetPoint(_, anchor) self.points[#self.points + 1] = anchor end
    local intro = { GetText = function() return "What kind of data would you like to import?" end }
    function intro:Hide() self.hidden = true end
    local importerWindow = { buttons = 0 }
    function importerWindow:GetChildren() return softReserves end
    function importerWindow:GetRegions() return intro end

    local stubGL = {
        Base64 = GL.Base64,
        JSON = GL.JSON,
        MasterLooterUI = {
            tableColumns = function()
                local columns = {}
                for i = 1, 10 do columns[i] = { name = "native" .. i } end
                return columns
            end,
        },
        RollOff = {
            refreshRollsTable = function()
                local cols = {}
                for i = 1, 10 do cols[i] = { value = i == 1 and "Alya" or i } end
                tableStub:SetData({ { cols = cols } })
            end,
        },
        Interface = {
            Importer = { open = function() return importerWindow end },
            dynamicPanelButton = function()
                importerWindow.buttons = importerWindow.buttons + 1
                importerWindow.button = { SetPoint = function() end, SetScript = function() end }
                return importerWindow.button
            end,
        },
    }
    function stubGL.Interface:get(_, path)
        return path == "Table.Players" and tableStub or windowStub
    end

    GP.Columns.install(stubGL)
    GP.Import.install(stubGL)
    GP.Snapshot.set(data)

    local columns = stubGL.MasterLooterUI:tableColumns()
    equal(#columns, 12, "two columns appended")
    equal(columns[11].name, "Ratio BiS", "appended column name")
    equal(columns[12].name, "Impact", "Impact column after Ratio BiS")
    equal(columns[10].name, "native10", "native columns keep their order")

    stubGL.RollOff:refreshRollsTable()
    equal(#tableStub.data[1].cols, 12, "refresh appends two cells")
    equal(tableStub.data[1].cols[11].value, "0.250", "refresh cell value")
    equal(windowStub.width, 650, "master looter window widened")

    stubGL.Interface.Importer:open()
    stubGL.Interface.Importer:open()
    equal(importerWindow.buttons, 1, "importer button added once")
    check(intro.hidden == true, "importer intro line hidden to make room")
    check(softReserves.points and softReserves.points[1] == importerWindow.button, "native buttons moved below the Preloot button")
end

-- Treatment per award (5.2)
do
    function GL:formatPlayerName(name, options)
        assert(options and options.includeRealm == "never", "winner formatted without realm")
        return (name:gsub("%-.*$", ""))
    end
    GL.Exporter = { disenchantedItemIdentifier = "||de||" }

    local prompted, refreshed = {}, 0
    GP.Picker = {
        enqueue = function(checksum) prompted[#prompted + 1] = checksum end,
        refresh = function() refreshed = refreshed + 1 end,
    }
    local handlers = {}
    GL.Events = { register = function(_, _, event, callback) handlers[event] = callback end }
    GL.DB = { AwardHistory = {} }

    local function award(checksum, itemID, awardedTo, isOS)
        local entry = { checksum = checksum, itemID = itemID, itemLink = "[" .. itemID .. "]", awardedTo = awardedTo, OS = isOS }
        GL.DB.AwardHistory[checksum] = entry
        return entry
    end

    GP.Awards.install(GL)
    GP.Snapshot.clear()
    GP.Awards.onSnapshotImported(nil)

    handlers["GL.ITEM_AWARDED"]("GL.ITEM_AWARDED", award("c0", 888, "Alya-Forever"))
    equal(GP.Awards.get("c0"), nil, "no snapshot: award not recorded")
    equal(#prompted, 0, "no snapshot: no popup")

    check(GP.Import.apply(sampleB64, GL), "snapshot imported for awards")

    handlers["GL.ITEM_AWARDED"]("GL.ITEM_AWARDED", award("c1", 888, "Alya-Forever"))
    local alya = GP.Awards.get("c1")
    equal(alya and alya.winner, "Alya", "winner without realm")
    equal(alya and alya.treatment, "IMPACT", "IMPACT prefilled from Mage Givre statut")
    equal(prompted[#prompted], "c1", "popup requested for the award")

    handlers["GL.ITEM_AWARDED"]("GL.ITEM_AWARDED", award("c2", 999, "Alya-Forever"))
    equal(GP.Awards.get("c2").treatment, "NORMAL", "item absent from snapshot: NORMAL")

    handlers["GL.ITEM_AWARDED"]("GL.ITEM_AWARDED", award("c3", 888, "Alya-Forever", true))
    equal(GP.Awards.get("c3").treatment, "NORMAL", "off-spec award: NORMAL")

    handlers["GL.ITEM_AWARDED"]("GL.ITEM_AWARDED", award("c4", 888, "Inconnu-Forever"))
    equal(GP.Awards.get("c4").treatment, "NORMAL", "unknown winner: NORMAL")

    handlers["GL.ITEM_AWARDED"]("GL.ITEM_AWARDED", award("c5", 888, "||de||"))
    equal(GP.Awards.get("c5"), nil, "disenchant not recorded")

    handlers["GL.ITEM_AWARDED"]("GL.ITEM_AWARDED", award("c6", 888, "Beryl-Forever"))
    equal(GP.Awards.get("c6").treatment, "NORMAL", "spec without statut: NORMAL")

    check(GP.Awards.setTreatment("c6", "BIS"), "owner changes treatment")
    equal(GP.Awards.get("c6").treatment, "BIS", "owner choice stored")
    check(not GP.Awards.setTreatment("c6", "NONE"), "unknown treatment refused")
    equal(GP.Awards.get("c6").treatment, "BIS", "refused value leaves treatment")
    check(not GP.Awards.setTreatment("zz", "BIS"), "unknown checksum refused")

    local listed = GP.Awards.list()
    equal(listed[1].checksum, "c6", "list newest first")
    equal(#listed, 5, "list holds recorded awards only")

    local edited = GL.DB.AwardHistory["c6"]
    edited.awardedTo = "Alya-Forever"
    prompted = {}
    handlers["GL.ITEM_AWARD_EDITED"]("GL.ITEM_AWARD_EDITED", edited)
    equal(GP.Awards.get("c6").winner, "Alya", "edit updates winner")
    equal(GP.Awards.get("c6").treatment, "IMPACT", "edit prefills again for the new winner")
    equal(prompted[1], "c6", "edit reopens the popup")

    prompted = {}
    handlers["GL.ITEM_AWARD_EDITED"]("GL.ITEM_AWARD_EDITED", { checksum = "zz", awardedTo = "Alya" })
    equal(#prompted, 0, "edit of unknown checksum ignored")
    equal(#GP.Awards.list(), 5, "edit of unknown checksum leaves the map")

    handlers["GL.ITEM_UNAWARDED"]("GL.ITEM_UNAWARDED", GL.DB.AwardHistory["c2"])
    equal(GP.Awards.get("c2"), nil, "delete removes the entry")
    handlers["GL.ITEM_UNAWARDED"]("GL.ITEM_UNAWARDED", { checksum = "zz" })
    equal(#GP.Awards.list(), 4, "delete of unknown checksum leaves the map")
    check(refreshed >= 2, "picker refreshed after deletes")

    GL.DB.AwardHistory = { c1 = GL.DB.AwardHistory["c1"] }
    handlers["GL.ITEM_UNAWARDED"]("GL.ITEM_UNAWARDED")
    equal(#GP.Awards.list(), 1, "bulk clear keeps only awards still in Gargul history")
    check(GP.Awards.get("c1") ~= nil, "surviving award kept")

    check(GP.Import.apply(sampleB64, GL), "same raid re-imported")
    check(GP.Awards.get("c1") ~= nil, "same raidId keeps treatments")

    -- Review fixes: duplicates, disenchant edits, late item links
    GP.Awards.setTreatment("c1", "CLASS_BOUND")
    prompted = {}
    handlers["GL.ITEM_AWARDED"]("GL.ITEM_AWARDED", GL.DB.AwardHistory["c1"])
    equal(GP.Awards.get("c1").treatment, "CLASS_BOUND", "repeated award keeps the owner's pick")
    equal(#prompted, 0, "repeated award does not prompt again")

    local de = award("d1", 888, "||de||")
    handlers["GL.ITEM_AWARDED"]("GL.ITEM_AWARDED", de)
    de.awardedTo = "Alya-Forever"
    handlers["GL.ITEM_AWARD_EDITED"]("GL.ITEM_AWARD_EDITED", de)
    equal(GP.Awards.get("d1") and GP.Awards.get("d1").treatment, "IMPACT", "disenchant edited to a raider is recorded")
    equal(prompted[#prompted], "d1", "disenchant edited to a raider prompts")
    de.awardedTo = "||de||"
    handlers["GL.ITEM_AWARD_EDITED"]("GL.ITEM_AWARD_EDITED", de)
    equal(GP.Awards.get("d1"), nil, "award edited to disenchant is dropped")

    local remote = award("r1", 777, "Beryl-Forever")
    remote.itemLink = nil
    handlers["GL.ITEM_AWARDED"]("GL.ITEM_AWARDED", remote)
    equal(GP.Awards.itemLink(GP.Awards.get("r1")), "item 777", "remote award without link shows the item ID")
    remote.itemLink = "[Lien]"
    equal(GP.Awards.itemLink(GP.Awards.get("r1")), "[Lien]", "link filled later by Gargul is shown")

    local otherRaid = sampleJson:gsub('"raidId": "4"', '"raidId": "5"')
    check(GP.Import.apply(otherRaid, GL), "other raid imported")
    equal(#GP.Awards.list(), 0, "different raidId clears treatments")
end

-- Picker popups and list against a stubbed AceGUI
do
    local created = {}
    local function newWidget(kind)
        local widget = { kind = kind, callbacks = {}, children = {} }
        setmetatable(widget, { __index = function() return function() end end })
        function widget:SetCallback(name, callback) self.callbacks[name] = callback end
        function widget:SetText(text) self.text = text end
        function widget:SetValue(value) self.value = value end
        function widget:AddChild(child) self.children[#self.children + 1] = child end
        function widget:ReleaseChildren() self.children = {} end
        widget.frame = { GetChildren = function() end }
        function widget:Hide()
            self.closed = true
            if self.callbacks.OnClose then self.callbacks.OnClose(self) end
        end
        created[#created + 1] = widget
        return widget
    end
    _G.LibStub = function() return { Create = function(_, kind) return newWidget(kind) end, Release = function() end } end
    _G.SlashCmdList = {}

    assert(loadfile(root .. "/Picker.lua"))("Gargul_Preloot", GP)
    GP.Picker.install()
    check(_G.SLASH_GARGULPRELOOT1 == "/preloot" and type(_G.SlashCmdList.GARGULPRELOOT) == "function", "/preloot registered")

    GP.Awards.record({ checksum = "p1", itemID = 888, itemLink = "[888]", awardedTo = "Alya-Forever" }, GL)
    GP.Awards.record({ checksum = "p2", itemID = 777, itemLink = "[777]", awardedTo = "Beryl-Forever" }, GL)

    local function lastFrame()
        for i = #created, 1, -1 do
            if created[i].kind == "Frame" then return created[i] end
        end
    end
    local function buttons(frame)
        local result = {}
        for _, child in ipairs(frame.children) do
            if child.kind == "Button" then result[child.text] = child end
        end
        return result
    end

    GP.Picker.enqueue("p1")
    local first = lastFrame()
    check(buttons(first)["[IMPACT]"] ~= nil, "popup marks the prefilled treatment")
    GP.Picker.enqueue("p2")
    equal(lastFrame(), first, "second award queues behind the open popup")

    buttons(first)["BIS"].callbacks.OnClick()
    equal(GP.Awards.get("p1").treatment, "BIS", "popup button sets the treatment")
    local second = lastFrame()
    check(second ~= first and buttons(second)["[NORMAL]"] ~= nil, "queued popup opens after the first closes")

    second:Hide()
    equal(GP.Awards.get("p2").treatment, "NORMAL", "closing keeps the prefilled treatment")

    GP.Picker.openList()
    local list = lastFrame()
    local rows = list.children[1] and list.children[1].children or {}
    equal(#rows, 2, "list shows one row per session award")
    local dropdown = rows[1] and rows[1].children[2]
    equal(dropdown and dropdown.value, "NORMAL", "list row shows the treatment")
    dropdown.callbacks.OnValueChanged(dropdown, "OnValueChanged", "CLASS_BOUND")
    equal(GP.Awards.get("p2").treatment, "CLASS_BOUND", "list dropdown changes the treatment")

    GP.Picker.enqueue("p1")
    local reopened = lastFrame()
    GP.Awards.remove("p1")
    GP.Picker.refresh()
    check(reopened.closed == true, "popup of a deleted award closes")
    equal(#(list.children[1] and list.children[1].children or {}), 1, "list refreshed after delete")
end

-- Custom export fill (5.3)
do
    assert(loadfile(root .. "/Export.lua"))("Gargul_Preloot", GP)
    check(GP.Import.apply(sampleB64, GL), "raid 4 snapshot imported for export")
    GP.Awards.record({ checksum = "e1", itemID = 888, itemLink = "[888]", awardedTo = "Alya-Forever" }, GL)
    GP.Awards.record({ checksum = "e2", itemID = 777, itemLink = "[777]", awardedTo = "Beryl-Forever" }, GL)
    GP.Awards.setTreatment("e2", "CLASS_BOUND")

    local template = '{"checksum":"@CHECKSUM","winner":"@WINNER","itemID":@ID,"itemName":"@ITEM","rollType":"@ROLLTYPE","os":@OS,"date":"@DATE","time":"@TIME","raidId":"@GPRAID","treatment":"@GPTREATMENT"},'
    local function gargulLine(checksum, winner, itemID)
        return (template:gsub("@CHECKSUM", checksum):gsub("@WINNER", winner):gsub("@ID", itemID)
            :gsub("@ITEM", "Objet"):gsub("@ROLLTYPE", "MS"):gsub("@OS", "0")
            :gsub("@DATE", "2026-10-26"):gsub("@TIME", "21:00"))
    end
    local gargulText = table.concat({ gargulLine("e1", "Alya", 888), gargulLine("e2", "Beryl", 777), gargulLine("x9", "Zed", 111) }, "\n")

    local exporterStub = { transformEntriesToCustomFormat = function(_, _, format) return format == "rrobin" and "777,2026-10-26 21:00,Alya-Forever" or gargulText end }
    GP.Export.install({ Exporter = exporterStub })
    local filled = exporterStub:transformEntriesToCustomFormat({}, nil)
    equal(exporterStub:transformEntriesToCustomFormat({}, "rrobin"), "777,2026-10-26 21:00,Alya-Forever", "other formats pass through")

    local sampleKeys = {}
    local sampleFirst = readFile(root .. "/tools/google_apps_script/fixtures/custom-export-sample.txt"):match("^[^\n]*"):gsub(",%s*$", "")
    for key in pairs(GL.JSON:decode(sampleFirst)) do sampleKeys[#sampleKeys + 1] = key end
    table.sort(sampleKeys)

    local parsed = {}
    for line in (filled .. "\n"):gmatch("(.-)\n") do
        check(line:sub(-1) == ",", "filled line keeps its trailing comma")
        local ok, row = pcall(GL.JSON.decode, GL.JSON, (line:gsub(",%s*$", "")))
        check(ok and type(row) == "table", "filled line is valid JSON")
        if ok and type(row) == "table" then
            local keys = {}
            for key in pairs(row) do keys[#keys + 1] = key end
            table.sort(keys)
            equal(table.concat(keys, ","), table.concat(sampleKeys, ","), "filled line has the sample's fields")
            parsed[row.checksum] = row
        end
    end
    equal(parsed.e1 and parsed.e1.raidId, "4", "captured award gets the session raidId")
    equal(parsed.e1 and parsed.e1.treatment, "IMPACT", "captured award gets its prefilled treatment")
    equal(parsed.e2 and parsed.e2.treatment, "CLASS_BOUND", "captured award gets the owner's treatment")
    equal(parsed.x9 and parsed.x9.raidId, "", "uncaptured award: empty raidId")
    equal(parsed.x9 and parsed.x9.treatment, "", "uncaptured award: empty treatment")
    check(not filled:find("@GP", 1, true), "no token left in the export")

    equal(GP.Export.fill(""), "", "empty export stays empty")
    equal(GP.Export.fill(nil), nil, "nil export passes through")
end

-- Snapshot validation and recompute (5.4)
do
    local function near(actual, expected, label)
        if expected == nil then
            check(actual == nil, label .. " (expected nil, got " .. tostring(actual) .. ")")
        else
            check(type(actual) == "number" and math.abs(actual - expected) <= 1e-9 * math.max(1, math.abs(expected)),
                ("%s (expected %s, got %s)"):format(label, tostring(expected), tostring(actual)))
        end
    end

    local cases = GL.JSON:decode(readFile(root .. "/tools/google_apps_script/fixtures/scores.json")).cases
    check(#cases >= 10, "scores.json cases loaded")
    for _, case in ipairs(cases) do
        local inputs = case.inputs
        local raider = {
            role = inputs.role:find("Tank") and "TANK" or "DPS",
            tierPresence = inputs.tierPresence,
            tierPresenceMax = inputs.tierMax,
            bisLootCount = inputs.bisLoots,
            impactLootCount = inputs.impactLoots,
            dpsParse = inputs.parse or 1,
        }
        near(GP.Scores.bisRatio(raider), case.expected.bisRatio, case.name .. " bisRatio")
        near(GP.Scores.impactBase(raider), case.expected.impactBase, case.name .. " impactBase")
    end

    check(GP.Import.apply(sampleB64, GL), "valid sample accepted")
    local kept = GP.Snapshot.get()
    GP.Awards.record({ checksum = "v1", itemID = 888, itemLink = "[888]", awardedTo = "Alya-Forever" }, GL)
    GP.Awards.setTreatment("v1", "BIS")
    local alya = GP.Snapshot.raider("Alya")
    near(GP.Scores.impactBase(alya), alya.impactBase, "sample impactBase recomputes")

    local function once(pattern, replacement)
        local text, count = sampleJson:gsub(pattern, replacement, 1)
        assert(count == 1, "mutation pattern not found: " .. pattern)
        return text
    end

    local broken = {
        { once('"raidId": "4"', '"raidId": 4'), "raidId not a string" },
        { once('"items"', '"objets"'), "items missing" },
        { once('"role": "DPS"', '"role": "MAGE"'), "unknown role", "Alya" },
        { once('"classSpec": "Mage Givre"', '"classSpec": ""'), "empty classSpec", "Alya" },
        { once('"bisLootCount": 1', '"bisLootCount": 1.5'), "non-integer count", "Alya" },
        { once('"impactLootCount": 2', '"impactLootCount": -1'), "negative count", "Alya" },
        { once('"tierPresenceMax": 8', '"tierPresenceMax": 0'), "max below 1", "Alya" },
        { once('"tierPresence": 4', '"tierPresence": 9'), "presence above max", "Alya" },
        { once('"tierPresence": 4', '"tierPresence": 1e999'), "infinite presence", "Alya" },
        { once('"dpsParse": 88', '"dpsParse": 120'), "parse above 100", "Beryl" },
        { once('"dpsParse": 1,', '"dpsParse": "x",'), "parse not a number", "Alya" },
        { once('"raiderKey": "Beryl"', '"raiderKey": "Alya"'), "duplicate raider key", "double" },
        { once('"itemID": 888', '"itemID": 777'), "duplicate itemID", "double" },
        { once('"classSpec": "Paladin Sacré"', '"classSpec": "Guerrier Protection"'), "duplicate spec in item", "double" },
        { once('"bisRatio": 0.75', '"bisRatio": 0.7'), "bisRatio mismatch", "Beryl" },
        { once('"impactBase": 33', '"impactBase": 34'), "impactBase mismatch", "Beryl" },
        { once('"impactBase": 33', '"impactBase": null'), "impactBase missing for a healer", "Beryl" },
        { once('"impactBase": null', '"impactBase": 1'), "tank with impactBase", "Cairn" },
        { once('"statut": "BIS"', '"statut": "NONE"'), "unknown statut", "statut" },
        { once('"gainFraction": 0.12', '"gainFraction": "x"'), "gain not a number", "gain" },
        { once('"itemID": 777', '"itemID": 0'), "itemID not positive", "itemID" },
        { once('"bisRatio": 0.25', '"bisRatio": 0.250000002'), "bisRatio outside tolerance", "Alya" },
        { once('"tierId": "forever%-t1"', '"tierId": ""'), "empty tierId", "tierId" },
        { once('"dpsParse": 1,', '"dpsParse": 0.5,'), "parse below 1", "Alya" },
        { once('"bisRatio": 0.75', '"bisRatio": 1e999'), "infinite bisRatio", "Beryl" },
        { once('"bisRatio": 0.75,', ''), "bisRatio missing", "Beryl" },
        { once('"gainFraction": 0.12', '"gainFraction": 1e999'), "infinite gain", "gain" },
        { once('"itemID": 777', '"itemID": 777.5'), "itemID not an integer", "itemID" },
    }
    for _, case in ipairs(broken) do
        local result, message = GP.Snapshot.parse(case[1], GL)
        check(result == nil and type(message) == "string", "refused: " .. case[2])
        if case[3] and type(message) == "string" then
            check(message:find(case[3], 1, true) ~= nil, ("message names %s: %s (%s)"):format(case[3], case[2], tostring(message)))
        end
        check(GP.Import.apply(case[1], GL) == false and GP.Snapshot.get() == kept, "previous snapshot kept: " .. case[2])
        check(GP.Awards.get("v1") and GP.Awards.get("v1").treatment == "BIS", "recorded awards kept: " .. case[2])
    end

    local twoErrors = once('"role": "DPS"', '"role": "MAGE"'):gsub('"dpsParse": 88', '"dpsParse": 120', 1)
    local _, many = GP.Snapshot.parse(twoErrors, GL)
    check(type(many) == "string" and many:find("(+1 autre)", 1, true) ~= nil, "message counts the other problems: " .. tostring(many))
    local _, three = GP.Snapshot.parse(twoErrors:gsub('"tierId": "forever%-t1"', '"tierId": ""', 1), GL)
    check(type(three) == "string" and three:find("tierId ou raidId manquant (+2 autres)", 1, true) ~= nil, "envelope problem counted with the others: " .. tostring(three))

    local edgeText = once('"bisRatio": 0.25', '"bisRatio": 0.2500000004')
    check(GP.Snapshot.parse(edgeText, GL) ~= nil, "value inside the tolerance accepted")
    check(GP.Import.apply(edgeText, GL), "edge snapshot imported")
    equal(GP.Snapshot.raider("Alya").bisRatio, 0.2500000004, "supplied value kept in the snapshot")
    equal(GP.Scores.bisRatio(GP.Snapshot.raider("Alya")), 0.25, "display uses the recomputed value")
end

-- Impact column (5.5)
do
    GP.Awards.clear()
    local function near(actual, expected, label)
        if expected == nil then
            check(actual == nil, label .. " (expected nil, got " .. tostring(actual) .. ")")
        else
            check(type(actual) == "number" and math.abs(actual - expected) <= 1e-9 * math.max(1, math.abs(expected)),
                ("%s (expected %s, got %s)"):format(label, tostring(expected), tostring(actual)))
        end
    end

    for _, case in ipairs(GL.JSON:decode(readFile(root .. "/tools/google_apps_script/fixtures/scores.json")).cases) do
        local inputs = case.inputs
        local raider = {
            role = inputs.role:find("Tank") and "TANK" or "DPS",
            tierPresence = inputs.tierPresence,
            tierPresenceMax = inputs.tierMax,
            bisLootCount = inputs.bisLoots,
            impactLootCount = inputs.impactLoots,
            dpsParse = inputs.parse or 1,
        }
        near(GP.Scores.impactScore(raider, { statut = inputs.statut, gainFraction = inputs.gainFraction }), case.expected.impactScore, case.name .. " impactScore")
    end

    local sample = GL.JSON:decode(sampleJson)
    sample.items[#sample.items + 1] = { itemID = 555, specs = {
        { classSpec = "Prêtre Sacré", statut = "IMPACT", gainFraction = 0.2 },
        { classSpec = "Druide Combat farouche (ours)", statut = "IMPACT", gainFraction = 0.5 },
        { classSpec = "Mage Givre", statut = "IMPACT" },
    } }
    sample.items[#sample.items + 1] = { itemID = 666, specs = { { classSpec = "Mage Givre", statut = "BIS", gainFraction = 0.4 } } }
    check(GP.Import.apply(GL.JSON:encode(sample), GL), "snapshot with extra items imported")

    equal(GP.Columns.impactCellText("Alya", 888), ("%.3f"):format((4 / 8) * 1 / 3 * 0.5), "IMPACT item: base × gain for the roller's spec")
    equal(GP.Columns.impactCellText("Alya [2]", 888), GP.Columns.impactCellText("Alya", 888), "re-roll suffix stripped")
    equal(GP.Columns.impactCellText("Beryl", 555), "6.600", "healer Impact 33 × 0.2")
    equal(GP.Columns.impactCellText("Cairn", 555), "", "tank: empty even on IMPACT")
    equal(GP.Columns.impactCellText("Alya", 555), "0.000", "null gain counts as 0")
    equal(GP.Columns.impactCellText("Alya", 666), "", "BIS statut: empty")
    equal(GP.Columns.impactCellText("Beryl", 888), "", "no entry for the spec: empty")
    equal(GP.Columns.impactCellText("Alya", 999), "", "item absent from snapshot: empty")
    equal(GP.Columns.impactCellText("Inconnu", 888), "", "unknown roller: empty")
    equal(GP.Columns.impactCellText("Alya", nil), "", "no rolled item: empty")

    local rows = { { cols = {} } }
    for i = 1, 10 do rows[1].cols[i] = { value = i == 1 and "Beryl" or i } end
    GP.Columns.appendCells(rows, 555)
    equal(rows[1].cols[11].value, "0.750", "cell 11 is Ratio BiS")
    equal(rows[1].cols[12].value, "6.600", "cell 12 is Impact for the rolled item")

    local zero = GL.JSON:decode(sampleJson)
    zero.raiders[1].tierPresence = 0
    zero.raiders[1].bisRatio = 0
    zero.raiders[1].impactBase = 0
    zero.items[2].specs[1].gainFraction = -0.1
    check(GP.Import.apply(GL.JSON:encode(zero), GL), "zero-presence snapshot imported")
    equal(GP.Columns.impactCellText("Alya", 888), "0.000", "zero score with a negative gain shows 0.000, not -0.000")

    local hookTable = { data = {} }
    function hookTable:SetData(data) self.data = data end
    function hookTable:SortData() end
    local hookRollOff = {
        CurrentRollOff = { itemID = 888 },
        refreshRollsTable = function()
            local cols = {}
            for i = 1, 10 do cols[i] = { value = i == 1 and "Alya" or i } end
            hookTable:SetData({ { cols = cols } })
        end,
    }
    zero.raiders[1].tierPresence = 4
    zero.raiders[1].bisRatio = 0.25
    zero.raiders[1].impactBase = (4 / 8) * 1 / 3
    zero.items[2].specs[1].gainFraction = 0.5
    check(GP.Import.apply(GL.JSON:encode(zero), GL), "sample-like snapshot imported for the hook")
    GP.Columns.install({
        MasterLooterUI = { tableColumns = function() return {} end },
        RollOff = hookRollOff,
        Interface = { get = function(_, _, path) return path == "Table.Players" and hookTable or nil end },
    })
    hookRollOff:refreshRollsTable()
    equal(hookTable.data[1].cols[12].value, ("%.3f"):format((4 / 8) * 1 / 3 * 0.5), "hook passes CurrentRollOff.itemID to the Impact cell")
end

-- Live recompute and chat line (5.6)
do
    assert(loadfile(root .. "/Chat.lua"))("Gargul_Preloot", GP)

    local created = {}
    _G.CLOSE = "Close"
    local function newWidget(kind)
        local widget = { kind = kind, callbacks = {}, children = {} }
        setmetatable(widget, { __index = function() return function() end end })
        function widget:SetCallback(name, callback) self.callbacks[name] = callback end
        function widget:SetText(text) self.text = text end
        function widget:AddChild(child) self.children[#self.children + 1] = child end
        function widget:Hide()
            self.closed = true
            if not rawget(self, "invisible") and self.callbacks.OnClose then self.callbacks.OnClose(self) end
        end
        local closeButton = { scripts = {} }
        function closeButton:GetText() return "Close" end
        function closeButton:GetScript(name) return self.scripts[name] end
        function closeButton:SetScript(name, script) self.scripts[name] = script end
        closeButton.scripts.OnClick = function() widget:Hide() end
        widget.closeButton = closeButton
        widget.frame = { GetChildren = function() return closeButton end }
        created[#created + 1] = widget
        return widget
    end
    _G.LibStub = function() return { Create = function(_, kind) return newWidget(kind) end, Release = function() end } end
    local function lastPopup()
        for i = #created, 1, -1 do
            if created[i].kind == "Frame" then return created[i] end
        end
    end
    local function click(label)
        for _, child in ipairs(lastPopup().children) do
            if child.kind == "Button" and (child.text == label or child.text == "[" .. label .. "]") then
                child.callbacks.OnClick()
                return
            end
        end
        error("button not found: " .. label)
    end

    local sent, enabled = {}, true
    GL.Settings = { get = function(_, key) return key == "AwardingLoot.awardMessagesEnabled" and enabled end }
    function GL:sendChatMessage(message, channel) sent[#sent + 1] = { message = message, channel = channel } end

    local rollTable = { data = {} }
    function rollTable:SetData(data) self.data = data end
    function rollTable:SortData() end
    local liveRollOff = {
        CurrentRollOff = { itemID = 888 },
        refreshRollsTable = function()
            local rows = {}
            for _, name in ipairs({ "Alya", "Beryl" }) do
                local cols = {}
                for i = 1, 10 do cols[i] = { value = i == 1 and name or i } end
                rows[#rows + 1] = { cols = cols }
            end
            rollTable:SetData(rows)
        end,
    }
    GP.Columns.install({
        MasterLooterUI = { tableColumns = function() return {} end },
        RollOff = liveRollOff,
        Interface = { get = function(_, _, path) return path == "Table.Players" and rollTable or nil end },
    })
    local refreshes = 0
    GP.Awards.onChange = function()
        refreshes = refreshes + 1
        GP.Columns.refresh()
    end
    GP.Picker.install(GL)

    GP.Awards.clear()
    local withExtra = GL.JSON:decode(sampleJson)
    withExtra.items[#withExtra.items + 1] = { itemID = 555, specs = {
        { classSpec = "Druide Combat farouche (ours)", statut = "IMPACT", gainFraction = 0.5 },
    } }
    check(GP.Import.apply(GL.JSON:encode(withExtra), GL), "sample imported for live recompute")
    GP.Awards.clear()
    local function cell(name, column)
        for _, row in ipairs(rollTable.data) do
            if row.cols[1].value == name then return row.cols[column].value end
        end
    end
    local function award(checksum, itemID, winner)
        refreshes = 0
        GP.Awards.record({ checksum = checksum, itemID = itemID, itemLink = "[" .. itemID .. "]", awardedTo = winner .. "-Forever" }, GL)
        GP.Picker.enqueue(checksum)
    end

    -- 1. BIS confirmed by button: Alya 4/8, BiS loots 1 -> 2
    award("a1", 777, "Alya")
    check(refreshes >= 1, "award refreshes the roll table")
    click("BIS")
    equal(cell("Alya", 11), "0.167", "live Ratio BiS after a BIS award (0.5/3)")
    equal(cell("Alya", 12), "0.083", "BIS leaves Impact unchanged (0.5/3 × 0.5)")
    equal(#sent, 1, "BIS confirm sends one chat line")
    equal(sent[1] and sent[1].message, "Alya : nouveau ratio BiS 0.167", "BIS chat line")
    equal(sent[1] and sent[1].channel, "GROUP", "chat goes to the group")
    refreshes = 0
    GP.Awards.setTreatment("a1", "BIS")
    equal(refreshes, 0, "same treatment again does not refresh")

    -- 2. IMPACT prefilled, confirmed by the Close button: Impact loots 2 -> 3, base 0.5/4, gain 0.5
    award("a2", 888, "Alya")
    lastPopup().closeButton.scripts.OnClick(lastPopup().closeButton)
    equal(cell("Alya", 12), "0.063", "live Impact 0.0625 shown as 0.063")
    equal(cell("Alya", 11), "0.167", "IMPACT leaves Ratio BiS unchanged")
    equal(cell("Beryl", 12), "", "Beryl has no Impact for 888")
    equal(sent[2] and sent[2].message, "Alya : nouveau score Impact 0.063 pour [888]", "IMPACT chat line")
    check(created[#created].closeButton.scripts.OnClick ~= nil, "close button script restored on release")

    -- 2b. A UI hide fires OnHide without the Close button: not a confirmation
    award("u1", 777, "Beryl")
    lastPopup():Hide()
    equal(#sent, 2, "hiding the popup without Close sends nothing")
    GP.Awards.remove("u1")

    -- 3. NORMAL and CLASS_BOUND: no counts, no chat
    award("a3", 888, "Beryl")
    lastPopup():Hide()
    award("a4", 777, "Beryl")
    click("CLASS_BOUND")
    equal(#sent, 2, "NORMAL and CLASS_BOUND send nothing")
    equal(cell("Beryl", 11), "0.750", "Beryl unchanged by NORMAL and CLASS_BOUND")

    -- 4. Treatment changed later in the list: counts drop back, no chat
    refreshes = 0
    GP.Awards.setTreatment("a1", "NORMAL")
    check(refreshes == 1, "treatment change refreshes the roll table")
    equal(cell("Alya", 11), "0.250", "Ratio BiS back to 0.5/2 after BIS -> NORMAL")
    equal(#sent, 2, "list change sends nothing")

    -- 5. Delete: Impact loots back to 2
    GP.Awards.remove("a2")
    equal(cell("Alya", 12), ("%.3f"):format(0.5 / 3 * 0.5), "Impact back after delete")

    -- 6. Announcements disabled
    enabled = false
    award("a5", 777, "Alya")
    click("BIS")
    equal(#sent, 2, "no chat when Gargul announcements are off")
    enabled = true

    -- 7. Programmatic closes send nothing
    award("a6", 777, "Alya")
    click("BIS")
    local before = #sent
    award("a7", 777, "Alya")
    local reopened = GP.Awards.edit({ checksum = "a7", awardedTo = "Beryl-Forever" }, GL)
    equal(reopened, "a7", "winner change returns the checksum to prompt again")
    GP.Picker.enqueue(reopened)
    equal(#sent, before, "edit reopening the popup sends nothing")
    equal(GP.Awards.get("a7").winner, "Beryl", "edit moved the award")
    GP.Awards.setTreatment("a7", "BIS")
    equal(GP.Awards.edit({ checksum = "a7", awardedTo = "Beryl-Forever" }, GL), nil, "edit keeping the winner does not prompt")
    equal(GP.Awards.get("a7").treatment, "BIS", "edit keeping the winner keeps the owner's pick")
    GP.Awards.remove("a7")
    GP.Picker.refresh()
    equal(#sent, before, "deleted award's popup closes silently")

    -- 7b. Silent close on a hidden frame (no OnHide) still frees the popup slot
    award("h1", 777, "Alya")
    local hidden = lastPopup()
    hidden.invisible = true
    GP.Awards.remove("h1")
    GP.Picker.refresh()
    award("h2", 777, "Alya")
    check(lastPopup() ~= hidden, "next award opens a new popup after a silent close on a hidden frame")
    click("NORMAL")
    equal(#sent, before, "NORMAL after the hidden-frame close sends nothing")

    -- 8. IMPACT not computable: tank with an IMPACT Statut on item 555
    award("a8", 555, "Cairn")
    click("IMPACT")
    equal(#sent, before, "tank IMPACT sends nothing")

    -- 9. Bulk clear in Gargul: awards missing from its history drop out
    award("b1", 777, "Alya")
    click("BIS")
    equal(cell("Alya", 11), "0.100", "a5, a6 and b1 BIS counted before the bulk clear (0.5/5)")
    refreshes = 0
    GP.Awards.reconcile({})
    check(refreshes == 1, "bulk clear refreshes the roll table")
    equal(cell("Alya", 11), "0.250", "bulk clear drops the counted award")

    -- 10. New raid clears the session
    award("n1", 777, "Alya")
    click("BIS")
    GP.Awards.onSnapshotImported("other")
    equal(cell("Alya", 11), "0.250", "cleared session gives snapshot values")
    GP.Awards.onChange = nil
end

-- Gargul version tolerance
local realPrint = print
local savedGlobals = {}
for _, name in ipairs({ "CreateFrame", "Gargul", "SendChatMessage", "IsInRaid", "IsInGroup" }) do
    savedGlobals[name] = _G[name]
end
local toleranceOk, toleranceError = pcall(function()
    local printed = {}
    print = function(message) printed[#printed + 1] = tostring(message) end

    local loader = {}
    _G.CreateFrame = function()
        loader.frame = {
            RegisterEvent = function() end,
            UnregisterEvent = function() end,
            SetScript = function(_, _, script) loader.script = script end,
        }
        return loader.frame
    end
    _G.Gargul = nil
    assert(loadfile(root .. "/Core.lua"))("Gargul_Preloot", GP)
    loader.script(loader.frame, "ADDON_LOADED", "Gargul_Preloot")
    check(printed[#printed] and printed[#printed]:find("Gargul introuvable", 1, true) ~= nil, "missing Gargul disables the addon with one line")

    local function fullGL()
        return {
            JSON = GL.JSON,
            Base64 = GL.Base64,
            MasterLooterUI = { tableColumns = function() return {} end },
            RollOff = { refreshRollsTable = function() end },
            Interface = { get = function() end, dynamicPanelButton = function() end, Importer = { open = function() end } },
            Events = { register = function() end },
            Exporter = { transformEntriesToCustomFormat = function() return "" end },
        }
    end
    local function offText(stub)
        return table.concat(GP.installFeatures(stub), " ; ")
    end

    local full = fullGL()
    local originalColumns = full.MasterLooterUI.tableColumns
    equal(offText(full), "", "full v8 API: every feature on")
    check(full.MasterLooterUI.tableColumns ~= originalColumns, "columns hooked on full API")

    local noExport = fullGL()
    noExport.Exporter = {}
    local noExportColumns = noExport.MasterLooterUI.tableColumns
    local text = offText(noExport)
    check(text:find("remplissage de l'export", 1, true) ~= nil, "missing exporter is reported: " .. text)
    check(noExport.MasterLooterUI.tableColumns ~= noExportColumns, "other features still installed without the exporter")

    local noEvents = fullGL()
    noEvents.Events = nil
    check(offText(noEvents):find("suivi des attributions", 1, true) ~= nil, "missing events turn award tracking off")

    local noRollTable = fullGL()
    noRollTable.RollOff = {}
    check(offText(noRollTable):find("colonnes du tirage", 1, true) ~= nil, "missing roll table turns the columns off")

    local noImporter = fullGL()
    noImporter.Interface.Importer = nil
    check(offText(noImporter):find("/preloot import", 1, true) ~= nil, "missing Importer points to /preloot import")
    GP.GL = noImporter
    GP.Import.dialog = nil
    _G.SlashCmdList.GARGULPRELOOT(" import ")
    check(GP.Import.dialog ~= nil, "/preloot import opens the paste dialog")
    GP.Import.dialog = nil

    local noJson = fullGL()
    noJson.JSON = nil
    check(offText(noJson):find("import du snapshot", 1, true) ~= nil, "missing JSON is reported")

    -- Base64 variants
    equal(GP.Compat.base64Decode({ Base64 = { decode = GL.Base64.decode } }, sampleB64), sampleJson, "Base64 dot-style decode")
    local colon = { Decode = function(self, b64) assert(type(self) == "table"); return GL.Base64.decode(b64) end }
    equal(GP.Compat.base64Decode({ Base64 = colon }, sampleB64), sampleJson, "Base64 colon-style Decode")
    equal(GP.Compat.base64Decode({}, sampleB64), sampleJson, "bundled Base64 decoder")
    equal(GP.Compat.base64Decode({}, GL.Base64.encode("ab")), "ab", "bundled decoder with == padding")
    equal(GP.Compat.base64Decode({}, GL.Base64.encode("abcd")), "abcd", "bundled decoder with = padding")
    equal(GP.Compat.decodeBase64Pure("abc"), nil, "bundled decoder refuses a bad length")

    -- Name, rolled item, chat fallbacks
    equal(GP.Compat.winnerKey({}, "Alya-Thunderstrike"), "Alya", "winner key without formatPlayerName")
    equal(GP.Compat.winnerKey({}, "Izù"), "Izù", "accented winner without realm")
    equal(GP.Compat.rolledItemID({ CurrentRollOff = { itemLink = "|cffa335ee|Hitem:888:0:0:0|h[Objet]|h|r" } }), 888, "rolled item parsed from the link")
    equal(GP.Compat.rolledItemID({ CurrentRollOff = { itemID = 777, itemLink = "|Hitem:888:|h" } }), 777, "itemID preferred over the link")
    equal(GP.Compat.rolledItemID({}), nil, "no current roll")
    check(GP.Compat.announcementsEnabled({}), "missing setting counts as on")

    local wowSent = {}
    _G.SendChatMessage = function(message, channel) wowSent[#wowSent + 1] = channel .. "|" .. message end
    _G.IsInRaid = function() return true end
    GP.Compat.sendChat({}, "Alya : test")
    equal(wowSent[1], "RAID|Alya : test", "chat falls back to SendChatMessage in a raid")
    _G.IsInRaid = function() return false end
    _G.IsInGroup = function() return true end
    GP.Compat.sendChat({}, "Beryl : test")
    equal(wowSent[2], "PARTY|Beryl : test", "chat falls back to PARTY in a group")

    -- An error inside the addon's wrapper never breaks Gargul's own refresh
    local refreshed = 0
    local broken = fullGL()
    broken.RollOff.refreshRollsTable = function() refreshed = refreshed + 1; return "gargul result" end
    broken.Interface.get = function(_, _, path)
        if path == "Table.Players" then
            return { data = {}, SetData = function() error("boom") end, SortData = function() end }
        end
    end
    GP.Columns.install(broken)
    printed = {}
    local ok, result = pcall(broken.RollOff.refreshRollsTable, broken.RollOff)
    pcall(broken.RollOff.refreshRollsTable, broken.RollOff)
    check(ok and result == "gargul result", "wrapper returns Gargul's result despite an addon error")
    equal(refreshed, 2, "Gargul's refresh ran both times")
    local errors = 0
    for _, line in ipairs(printed) do
        if line:find("Erreur (colonnes du tirage)", 1, true) then errors = errors + 1 end
    end
    equal(errors, 1, "the addon error is printed once")

    local exporterBroken = { Exporter = { transformEntriesToCustomFormat = function() return "@GPRAID" end } }
    local realFill = GP.Export.fill
    GP.Export.fill = function() error("fill failed") end
    GP.Export.install(exporterBroken)
    equal(exporterBroken.Exporter:transformEntriesToCustomFormat({}), "@GPRAID", "export falls back to Gargul's text on an addon error")
    GP.Export.fill = realFill

    -- Review additions
    local noColumns = fullGL()
    noColumns.MasterLooterUI = {}
    check(offText(noColumns):find("colonnes du tirage", 1, true) ~= nil, "missing tableColumns turns the columns off")

    local noEventsAgain = fullGL()
    noEventsAgain.Events = nil
    local eventsColumns = noEventsAgain.MasterLooterUI.tableColumns
    GP.installFeatures(noEventsAgain)
    check(noEventsAgain.MasterLooterUI.tableColumns ~= eventsColumns, "other features stay installed without award events")

    printed = {}
    _G.Gargul = noExport
    loader.script(loader.frame, "ADDON_LOADED", "Gargul_Preloot")
    local summaries = 0
    for _, line in ipairs(printed) do
        if line:find("fonctions désactivées", 1, true) then summaries = summaries + 1 end
    end
    equal(summaries, 1, "init prints exactly one summary line")

    local noJsonImport = GP.Snapshot.parse(sampleB64, { Base64 = GL.Base64 })
    equal(noJsonImport, nil, "import without GL.JSON is refused, not a Lua error")

    equal(GP.Compat.decodeBase64Pure("QQ==QUJD"), nil, "padding inside the text is refused")
    equal(GP.Compat.decodeBase64Pure("AB=C"), nil, "x=y padding is refused")

    local linkTable = { data = {} }
    function linkTable:SetData(data) self.data = data end
    function linkTable:SortData() end
    local linkGL = fullGL()
    linkGL.RollOff = {
        CurrentRollOff = { itemLink = "|cffa335ee|Hitem:888:0:0:0|h[Objet]|h|r" },
        refreshRollsTable = function()
            local cols = {}
            for i = 1, 10 do cols[i] = { value = i == 1 and "Alya" or i } end
            linkTable:SetData({ { cols = cols } })
        end,
    }
    linkGL.Interface.get = function(_, _, path) return path == "Table.Players" and linkTable or nil end
    GP.Columns.install(linkGL)
    linkGL.RollOff:refreshRollsTable()
    equal(linkTable.data[1].cols[12].value, "0.083", "Impact uses the item ID parsed from the roll's link")

    wowSent = {}
    _G.IsInRaid = function() return true end
    GP.Chat.announce({ winner = "Alya", treatment = "BIS", itemID = 777 }, {})
    equal(wowSent[1], "RAID|Alya : nouveau ratio BiS 0.250", "confirmed award chats through SendChatMessage without Gargul's helper")

    GP.Awards.record({ checksum = "compat-1", itemID = 777, awardedTo = "Alya-Realm" }, {})
    equal(GP.Awards.get("compat-1") and GP.Awards.get("compat-1").winner, "Alya", "award winner without formatPlayerName")
    GP.Awards.remove("compat-1")

    local listOpened = false
    local realOpenList = GP.Picker.openList
    GP.Picker.openList = function() listOpened = true end
    _G.SlashCmdList.GARGULPRELOOT("")
    GP.Picker.openList = realOpenList
    check(listOpened, "plain /preloot opens the awards list")

    -- Every API the features need exists in the real Gargul v8.0.1 source
    local sources = {
        ["MasterLooterUI.tableColumns"] = { "Classes/MasterLooterUI.lua", "function MasterLooterUI:tableColumns" },
        ["RollOff.refreshRollsTable"] = { "Classes/RollOff.lua", "function RollOff:refreshRollsTable" },
        ["Interface.get"] = { "Interface/Interface.lua", "function Interface:get" },
        ["Interface.dynamicPanelButton"] = { "Interface/Interface.lua", "function Interface:dynamicPanelButton" },
        ["Interface.Importer.open"] = { "Interface/Importer.lua", "function Importer:open" },
        ["Events.register"] = { "Classes/Events.lua", "function Events:register" },
        ["Exporter.transformEntriesToCustomFormat"] = { "Classes/Exporter.lua", "function Exporter:transformEntriesToCustomFormat" },
        ["JSON.decode"] = { "Classes/JSON.lua", "function JSON:decode" },
        ["Base64.decode"] = { "Classes/Base64.lua", "function Base64.decode" },
        ["formatPlayerName"] = { "Utils/PlayerNames.lua", "function GL:formatPlayerName" },
        ["sendChatMessage"] = { "Utils", "function GL:sendChatMessage" },
    }
    for path, source in pairs(sources) do
        local found = false
        if source[1] == "Utils" then
            for _, file in ipairs({ "Utils/Chat.lua", "Utils/Utils.lua", "Utils/Strings.lua", "bootstrap.lua", "Utils/Messaging.lua" }) do
                local handle = io.open(gargulDir .. "/" .. file, "rb")
                if handle then
                    found = found or handle:read("*a"):find(source[2], 1, true) ~= nil
                    handle:close()
                end
            end
        else
            local handle = io.open(gargulDir .. "/" .. source[1], "rb")
            found = handle ~= nil and handle:read("*a"):find(source[2], 1, true) ~= nil
            if handle then handle:close() end
        end
        check(found, "Gargul v8.0.1 defines " .. path)
    end
end)
print = realPrint
for name, value in pairs(savedGlobals) do
    _G[name] = value
end
check(toleranceOk, "version tolerance block ran: " .. tostring(toleranceError))

if #failures > 0 then
    print(("FAIL: %d of %d assertions"):format(#failures, count))
    for _, label in ipairs(failures) do
        print("  - " .. label)
    end
    os.exit(1)
end

print(("PASS: %d assertions"):format(count))
