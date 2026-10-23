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
for _, file in ipairs({ "Snapshot.lua", "Scores.lua", "Columns.lua", "Import.lua" }) do
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
equal(#rows[1].cols, 11, "one cell appended")
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
    equal(#columns, 11, "one column appended")
    equal(columns[11].name, "Ratio BiS", "appended column name")
    equal(columns[10].name, "native10", "native columns keep their order")

    stubGL.RollOff:refreshRollsTable()
    equal(#tableStub.data[1].cols, 11, "refresh appends one cell")
    equal(tableStub.data[1].cols[11].value, "0.250", "refresh cell value")
    equal(windowStub.width, 590, "master looter window widened")

    stubGL.Interface.Importer:open()
    stubGL.Interface.Importer:open()
    equal(importerWindow.buttons, 1, "importer button added once")
    check(intro.hidden == true, "importer intro line hidden to make room")
    check(softReserves.points and softReserves.points[1] == importerWindow.button, "native buttons moved below the Preloot button")
end

if #failures > 0 then
    print(("FAIL: %d of %d assertions"):format(#failures, count))
    for _, label in ipairs(failures) do
        print("  - " .. label)
    end
    os.exit(1)
end

print(("PASS: %d assertions"):format(count))
