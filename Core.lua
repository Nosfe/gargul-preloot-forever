--[[
    Gargul Preloot Extension
    
    Extends the Master Looter UI with a custom numeric column that displays
    player-specific data. This implementation demonstrates how to safely extend
    Gargul without modifying core files.
    
    The extension:
    - Adds a new column to the Master Looter players table
    - Displays test decimal values (e.g., 3.125, 2.848, 1.500)
    - Survives Gargul updates since it only hooks, not patches
    - Uses Gargul's event system and public APIs
]]

local ADDON_NAME = "Gargul_Preloot"
local GP = {}  -- Local namespace

-- Wait for Gargul to be fully loaded before extending it
local function onAddonLoaded(self, event, addonName)
    print("|cFFFFFF00[GP Event]|r ADDON_LOADED fired for: " .. tostring(addonName))
    
    if addonName ~= ADDON_NAME then
        return
    end
    
    print("|cFF00FF00[GP Event]|r Our addon loaded! Initializing...")
    
    -- Unregister the load event since we only need it once
    self:UnregisterEvent("ADDON_LOADED")
    
    -- Initialize the extension
    GP:init()
end

-- Initialize the extension after Gargul loads
local LoaderFrame = CreateFrame("Frame")
LoaderFrame:RegisterEvent("ADDON_LOADED")
LoaderFrame:SetScript("OnEvent", onAddonLoaded)

print("|cFF00FFFF[GP Boot]|r Core.lua loaded, waiting for ADDON_LOADED event...")

--[[
    Initialize the Custom Data extension
    
    This function:
    1. Hooks into MasterLooterUI:tableColumns() to add a custom column
    2. Hooks into RollOff:refreshRollsTable() to populate the custom data
    3. Initializes the custom data storage
]]
function GP:init()
    -- Get Gargul reference at init time (not at load time)
    local GL = _G.Gargul
    
    print("|cFF00FF00[GP Init]|r Gargul reference: " .. tostring(GL))
    
    -- Validate Gargul is loaded
    if not GL then
        print("|cFFFF0000[GP Init]|r ERROR: Gargul global not found!")
        return
    end
    
    print("|cFF00FF00[GP Init]|r Gargul loaded: " .. tostring(GL.name))
    
    if not GL.MasterLooterUI then
        print("|cFFFF0000[GP Init]|r ERROR: GL.MasterLooterUI not available!")
        return
    end
    
    if not GL.RollOff then
        print("|cFFFF0000[GP Init]|r ERROR: GL.RollOff not available!")
        return
    end
    
    -- Store GL reference in GP namespace for use in other functions
    self.GL = GL
    
    print("|cFF00FF00[GP Init]|r All Gargul classes available")
    
    -- Initialize custom data storage
    self:initializeCustomData()
    
    -- Hook into Gargul's UI rendering system
    self:hookTableColumns()
    self:hookRefreshRollsTable()
    self:hookAwardedLoot()
    self:hookImporterUI()
    
    print("|cFF00FF00[GP Init]|r Loaded and ready!")
end

--[[
    Normalize player names for imported preloot data lookup
]]
function GP:normalizePlayerKey(playerName)
    if not playerName or type(playerName) ~= "string" then
        return nil
    end

    local normalized = playerName:gsub("^%s*(.-)%s*$", "%1")
    if self.GL and type(self.GL.stripRealm) == "function" then
        normalized = self.GL:stripRealm(normalized)
    end

    return string.lower(normalized)
end

--[[
    Initialize the custom data storage and provide test data
]]
function GP:initializeCustomData()
    -- In a real implementation, this would load from a database or calculate values
    -- For now, we provide static test data that will be indexed by player name
    
    self.playerData = {}
    
    -- Generate test data for demonstration
    -- This maps player names to decimal values
    -- In production, you'd calculate these from raid stats, DKP, loot history, etc.
    self.testData = {
        ["PlayerA"] = 3.125,
        ["PlayerB"] = 2.848,
        ["PlayerC"] = 1.500,
        ["Player"] = 4.250,
    }
end

--[[
    Retrieve custom data for a player, or generate a procedural value
    
    @param playerName string - The name of the player
    @return number - The custom numeric value to display
]]
function GP:getCustomDataForPlayer(playerName)
    -- If we have imported preloot data, prefer that
    if self.importedPreloot and type(self.importedPreloot) == "table" then
        local key = self:normalizePlayerKey(playerName)
        local data = key and self.importedPreloot[key]
        if data then
            if type(data) == "table" then
                local attendance = tonumber(data[1])
                local lootCount = tonumber(data[2])
                if attendance ~= nil and lootCount ~= nil then
                    return self:getPrelootRatio(attendance, lootCount)
                end
            elseif type(data) == "string" then
                local attendance, lootCount = string.match(data, "^%s*(%d+%.?%d*)%s*,%s*(%d+%.?%d*)%s*$")
                attendance = tonumber(attendance)
                lootCount = tonumber(lootCount)
                if attendance ~= nil and lootCount ~= nil then
                    return self:getPrelootRatio(attendance, lootCount)
                end
            end
        end
    end

    -- Generate a random value between 1.000 and 10.000 as a fallback
    local value = math.random(1000, 10000) / 1000
    return value
end

--[[
    Calculate the preloot ratio using custom attendance/loot rules
]]
function GP:getPrelootRatio(attendance, lootCount)
    attendance = tonumber(attendance)
    lootCount = tonumber(lootCount)

    if attendance == nil or lootCount == nil then
        return nil
    end

    if attendance <= 3 then
        return 0
    end

    if lootCount == 0 then
        return 999
    end

    return attendance / lootCount
end

--[[
    Find the imported player with the lowest current ratio
    Optionally exclude a specific player so the award message can compare
    the current player's ratio against the lowest other player.
]]
function GP:getLowestImportedRatioPlayer(excludeKey)
    if not self.importedPreloot or type(self.importedPreloot) ~= "table" then
        return nil
    end

    local lowestName
    local lowestRatio = math.huge

    for key, value in pairs(self.importedPreloot) do
        if key ~= excludeKey then
            local attendance, lootCount

            if type(value) == "table" then
                attendance = tonumber(value[1])
                lootCount = tonumber(value[2])
            elseif type(value) == "string" then
                attendance, lootCount = string.match(value, "^%s*(%d+%.?%d*)%s*,%s*(%d+%.?%d*)%s*$")
                attendance = tonumber(attendance)
                lootCount = tonumber(lootCount)
            end

            if attendance ~= nil and lootCount ~= nil then
                local ratio = self:getPrelootRatio(attendance, lootCount)
                if ratio ~= 0 and ratio < lowestRatio then
                    lowestRatio = ratio
                    lowestName = self.importedPrelootOriginalNames and self.importedPrelootOriginalNames[key] or key
                end
            end
        end
    end

    return lowestName
end

--[[
    Simple hash function for generating procedural values
    Based on player name for deterministic results
]]
function GP:hashString(str)
    local hash = 0
    for i = 1, #str do
        local char = string.byte(str, i)
        hash = ((bit.lshift(hash, 5)) - hash) + char
        hash = bit.band(hash, 0xFFFFFFFF)  -- Keep as 32-bit
    end
    return math.abs(hash)
end

-- Simple base64 decoder fallback
function GP:base64decode(data)
    if not data then return nil end
    local b='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    data = string.gsub(data, '[^'..b..'=]', '')
    return (data:gsub('.', function(x)
        if (x == '=') then return '' end
        local r,f = '', (b:find(x)-1)
        for i=6,1,-1 do r = r .. (f % 2^i - f % 2^(i-1) > 0 and '1' or '0') end
        return r
    end):gsub('%d%d%d?%d?%d?%d?%d?%d?', function(x)
        if (#x ~= 8) then return '' end
        local c = 0
        for i = 1,8 do c = c + (x:sub(i,i) == '1' and 2^(8-i) or 0) end
        return string.char(c)
    end))
end

--[[
    Hook into MasterLooterUI:tableColumns() to add our custom column
    
    This stores the original function and wraps it to add a new column
    for displaying custom numeric data.
]]
function GP:hookTableColumns()
    local GL = self.GL
    local MasterLooterUI = GL.MasterLooterUI
    local originalTableColumns = MasterLooterUI.tableColumns
    
    function MasterLooterUI:tableColumns()
        -- Get the original column definitions
        local columns = originalTableColumns(self)
        
        -- Check if we've already added our column to prevent duplicates
        local hasCustomColumn = false
        for _, col in ipairs(columns) do
            if col.name == "Ratio_Preloot" then
                hasCustomColumn = true
                break
            end
        end
        
        -- Insert our custom column after the +1 column (before "Type")
        -- Position 4 is the "Type" column, so we insert our column at position 4
        if not hasCustomColumn then
            table.insert(columns, 4, {
                name = "Ratio_Preloot",   -- Column header text
                width = 90,               -- Column width in pixels
                align = "CENTER",         -- Alignment: LEFT, CENTER, RIGHT
                color = {
                    r = 0.7,
                    g = 0.9,
                    b = 1.0,
                    a = 1.0
                },
                colorargs = nil,
            })

            -- Try to expand the players table frame so the new column is visible.
            -- Not all GUIs expose the same frame hierarchy, so guard carefully.
            local PlayersTable = GL.Interface and GL.Interface:get(MasterLooterUI, "Table.Players")
            -- Compute total column widths
            local totalColsW = 0
            for _, c in ipairs(columns) do
                totalColsW = totalColsW + (c.width or 80)
            end

            -- Force the main Master Looter window to a minimum width so the new column is visible
            local Window = GL.Interface and GL.Interface:get(MasterLooterUI, "Window")
            if Window then
                -- Prefer the AceGUI object SetWidth; obtain current width defensively
                local currentWinW
                if type(Window.GetWidth) == "function" then
                    currentWinW = Window:GetWidth()
                elseif Window.frame and type(Window.frame.GetWidth) == "function" then
                    currentWinW = Window.frame:GetWidth()
                end

                local minMainWidth = totalColsW + 120 -- padding for margins and other UI elements
                if currentWinW and currentWinW < minMainWidth then
                    if type(Window.SetWidth) == "function" then
                        Window:SetWidth(minMainWidth)
                    elseif Window.frame and type(Window.frame.SetWidth) == "function" then
                        Window.frame:SetWidth(minMainWidth)
                    end
                end
            else
                -- As a fallback, if we can't access the main window, try to nudge the players table frame
                if PlayersTable and PlayersTable.frame and type(PlayersTable.frame.GetWidth) == "function" then
                    local f = PlayersTable.frame
                    local currentW = f:GetWidth()
                    if currentW < totalColsW + 20 then
                        f:SetWidth(totalColsW + 20)
                    end
                end
            end
        end
        
        return columns
    end
    
    print("|cFF00FF00[GP]|r tableColumns() hook installed")
    
    -- Also register an event to update table columns when settings change
    GL.Events:register("GP_SortSettingChanged", "GL.SETTING_CHANGED.RollTracking.sortByPlusOne", function()
        local PlayersTable = GL.Interface:get(MasterLooterUI, "Table.Players")
        if PlayersTable then
            PlayersTable:SetDisplayCols(MasterLooterUI:tableColumns())
            PlayersTable:SortData()
        end
    end)
end

--[[
    Hook into RollOff:refreshRollsTable() to inject custom data
    
    This stores the original function and wraps it to add custom values
    to each player's row data before the table is displayed.
]]
function GP:hookRefreshRollsTable()
    local GL = self.GL
    local RollOff = GL.RollOff
    local originalRefreshRollsTable = RollOff.refreshRollsTable
    
    function RollOff:refreshRollsTable()
        -- Call the original function to get normal Gargul behavior
        originalRefreshRollsTable(self)
        
        -- Now enhance the table with our custom data
        GP:enhanceTableWithCustomData()
    end
    
    print("|cFF00FF00[GP]|r refreshRollsTable() hook installed")
end


-- Hook the Importer window to add a Preloot import button (base64 JSON paste)
function GP:hookImporterUI()
    local GL = self.GL
    if not GL or not GL.Interface or not GL.Interface.Importer then
        return
    end

    local Importer = GL.Interface.Importer
    local originalOpen = Importer.open

    function Importer:open()
        -- Call original open to build/show window
        local Window = originalOpen(self)

        -- Defer adding our button until the window exists
        Window = _G[Importer.windowName] or Window
        if not Window then
            return Window
        end
        -- Restore default importer window dimensions if they were changed
        if type(Window.SetWidth) == "function" then
            Window:SetWidth(300)
        end
        if type(Window.SetHeight) == "function" then
            Window:SetHeight(200)
        end
        -- Avoid adding the button multiple times
        if GP._importButtonAdded then
            return Window
        end

        -- Create our import button at the top of the importer panel
        local PrelootBtn = GL.Interface:dynamicPanelButton(Window, "Preloot (Base64)")
        PrelootBtn:SetPoint("TOPLEFT", Window, "TOPLEFT", 20, -40)
        PrelootBtn:SetPoint("TOPRIGHT", Window, "TOPRIGHT", -20, 0)
        PrelootBtn:SetScript("OnClick", function ()
                if GP.prelootImportDialog then
                    GP.prelootImportDialog.frame:Show()
                    return
                end

                local AceGUI = GL.AceGUI or LibStub("AceGUI-3.0")
                if not AceGUI then
                    print("|cFFFF0000[GP]|r ERROR: AceGUI not available")
                    return
                end

                local dialog = AceGUI:Create("Frame")
                dialog:SetTitle("Preloot Import")
                dialog:SetLayout("Flow")
                dialog:SetWidth(560)
                dialog:SetHeight(340)
                dialog:EnableResize(false)
                dialog:SetCallback("OnClose", function()
                    GP.prelootImportDialog = nil
                    dialog:Release()
                end)

                local editBox = AceGUI:Create("MultiLineEditBox")
                editBox:SetFullWidth(true)
                editBox:SetLabel("")
                editBox:SetNumLines(15)
                editBox:DisableButton(true)
                editBox:SetMaxLetters(8192)
                dialog:AddChild(editBox)

                local buttonGroup = AceGUI:Create("SimpleGroup")
                buttonGroup:SetLayout("Flow")
                buttonGroup:SetFullWidth(true)
                buttonGroup:SetHeight(40)
                dialog:AddChild(buttonGroup)

                local importButton = AceGUI:Create("Button")
                importButton:SetText("Import")
                importButton:SetWidth(100)
                importButton:SetCallback("OnClick", function ()
                    local txt = editBox:GetText()
                    if not txt or txt == "" then
                        print("|cFFFF0000[GP]|r No data to import")
                        return
                    end

                    local decoded
                    if GL and GL.Base64 and type(GL.Base64.Decode) == "function" then
                        decoded = GL.Base64:Decode(txt)
                    end
                    if not decoded and type(GP.base64decode) == "function" then
                        decoded = GP:base64decode(txt)
                    end

                    if not decoded then
                        print("|cFFFF0000[GP]|r ERROR: Could not decode base64 data")
                        return
                    end

                    local json
                    local success
                    success, json = pcall(function() return GL.JSON and GL.JSON:decode(decoded) end)
                    if not success or not json then
                        print("|cFFFF0000[GP]|r ERROR: Decoding JSON failed")
                        return
                    end

                    GP.importedPreloot = {}
                    GP.importedPrelootOriginalNames = {}
                    local count = 0
                    print("|cFF00FF00[GP]|r Preloot data imported:")
                    for player, value in pairs(json) do
                        local key = GP:normalizePlayerKey(player)
                        if key then
                            GP.importedPreloot[key] = value
                            GP.importedPrelootOriginalNames[key] = player
                        end

                        if type(value) == "table" then
                            local attendance = tonumber(value[1])
                            local lootCount = tonumber(value[2])
                            local ratio = "N/A"
                            if attendance and lootCount and lootCount ~= 0 then
                                ratio = string.format("%.3f", attendance / lootCount)
                            elseif attendance and lootCount == 0 then
                                ratio = "inf"
                            end
                            print("|cFF00FF00[GP]|r " .. tostring(player) .. " = attendance=" .. tostring(attendance) .. ", loot=" .. tostring(lootCount) .. ", ratio=" .. tostring(ratio))
                        else
                            print("|cFF00FF00[GP]|r " .. tostring(player) .. " = " .. tostring(value))
                        end
                        count = count + 1
                    end
                    print("|cFF00FF00[GP]|r Total imported values: " .. tostring(count))
                    dialog:Hide()
                end)
                buttonGroup:AddChild(importButton)

                local cancelButton = AceGUI:Create("Button")
                cancelButton:SetText("Cancel")
                cancelButton:SetWidth(100)
                cancelButton:SetCallback("OnClick", function ()
                    dialog:Hide()
                end)
                buttonGroup:AddChild(cancelButton)

                GP.prelootImportDialog = dialog
            end)

        -- Reposition existing buttons downward so our button appears first
        local function label(key, fallback)
            if GL and GL.L and GL.L[key] then return GL.L[key] end
            return fallback
        end
        local order = {label("Soft-Reserves", "Soft-Reserves"), label("TMB, DFT or PRIO3", "TMB, DFT or PRIO3"), label("Boosted Rolls", "Boosted Rolls"), label("Plus Ones", "Plus Ones")}
        local prev = PrelootBtn
        for _, label in ipairs(order) do
            for i=1, select('#', Window:GetChildren()) do
                local child = select(i, Window:GetChildren())
                if child and child ~= PrelootBtn and type(child.GetText) == "function" then
                    local text = child:GetText()
                    if text == label then
                        child:ClearAllPoints()
                        child:SetPoint("TOPLEFT", prev, "TOPLEFT", 0, -26)
                        child:SetPoint("TOPRIGHT", prev, "TOPRIGHT", 0, 0)
                        prev = child
                        break
                    end
                end
            end
        end

        return Window
    end
end

--[[
    Enhance the table data with custom player values
    
    This function:
    1. Gets the current table from the UI
    2. Iterates through all rows
    3. Inserts the custom value for each player
    4. Updates the display
]]
function GP:enhanceTableWithCustomData()
    local GL = self.GL
    local MasterLooterUI = GL.MasterLooterUI
    local RollsTable = GL.Interface:get(MasterLooterUI, "Table.Players")
    
    if not RollsTable then
        print("|cFFFF0000[GP]|r ERROR: RollsTable not found!")
        return
    end
    
    -- Get the current table data. Some ScrollingTable wrappers expose methods,
    -- others expose a raw `data` field. Try method first, fall back to field.
    local currentData
    if type(RollsTable.GetData) == "function" then
        currentData = RollsTable:GetData()
    elseif type(RollsTable.data) == "table" then
        currentData = RollsTable.data
    end

    if not currentData or #currentData == 0 then
        print("|cFFFF0000[GP]|r ERROR: No table data!")
        return
    end

    -- Safely get the column count (not all table objects expose GetColumnCount)
    local colCount = 0
    if RollsTable.GetColumnCount then
        colCount = RollsTable:GetColumnCount()
    end
    
    -- Iterate through each row and add our custom data
    for rowIndex, row in ipairs(currentData) do
        if row.cols and row.cols[1] then
            -- Get the player name from the first column
            local playerDisplayName = row.cols[1].value
            
            -- Extract the base player name (remove "[2]" suffixes)
            local playerName = playerDisplayName
            local bracketPos = string.find(playerName, " %[")
            if bracketPos then
                playerName = string.sub(playerName, 1, bracketPos - 1)
            end
            
            -- Get the custom value for this player
            local customValue = self:getCustomDataForPlayer(playerName)
            
            -- Format it as a decimal (3 decimal places)
            local formattedValue = string.format("%.3f", customValue)
            
            -- Insert into the row at position 4 (after +1, before Type)
            table.insert(row.cols, 4, {
                value = formattedValue,
                color = row.cols[1].color,  -- Use the same color as player name (class color)
            })
        end
    end
    
    -- Update the table with the enhanced data. Use methods when available,
    -- otherwise write back to fields and try to refresh.
    if type(RollsTable.SetData) == "function" then
        RollsTable:SetData(currentData)
    elseif RollsTable.data then
        RollsTable.data = currentData
    end

    if type(RollsTable.SortData) == "function" then
        RollsTable:SortData()
    elseif type(RollsTable.Refresh) == "function" then
        RollsTable:Refresh()
    end
end

--[[
    Hook into awarded loot processing to increment imported loot counts on epic MS awards
]]
function GP:hookAwardedLoot()
    local GL = self.GL
    if not GL or not GL.AwardedLoot then
        return
    end

    local AwardedLoot = GL.AwardedLoot
    local originalAddWinner = AwardedLoot.addWinner

    function AwardedLoot:addWinner(winner, ...)
        local isOS = false
        local itemLink
        local playerName
        local announcement

        if type(winner) == "table" then
            isOS = winner.isOS == true
            itemLink = winner.itemLink
            playerName = winner.winner
            announcement = winner.announce
        elseif type(winner) == "string" then
            playerName = winner
            itemLink = select(1, ...)
            announcement = select(2, ...)
        end

        local key = playerName and GP:normalizePlayerKey(playerName)
        local shouldAppendRatio = false
        local ratioMessage

        if not isOS
            and type(itemLink) == "string"
            and itemLink ~= ""
            and GL
            and type(GL.getItemQualityFromLink) == "function"
            and key
            and GP.importedPreloot
            and GP.importedPreloot[key]
        then
            local quality = GL:getItemQualityFromLink(itemLink)
            if quality == 4 and type(playerName) == "string" and not GL:empty(playerName) then
                local entry = GP.importedPreloot[key]
                local attendance = nil
                local lootCount = nil

                if type(entry) == "table" then
                    attendance = tonumber(entry[1])
                    lootCount = tonumber(entry[2])
                elseif type(entry) == "string" then
                    attendance, lootCount = string.match(entry, "^%s*(%d+%.?%d*)%s*,%s*(%d+%.?%d*)%s*$")
                    attendance = tonumber(attendance)
                    lootCount = tonumber(lootCount)
                end

                if attendance ~= nil and lootCount ~= nil then
                    lootCount = lootCount + 1
                    local newRatio = GP:getPrelootRatio(attendance, lootCount)
                    local lowestPlayer = GP:getLowestImportedRatioPlayer(key) or key
                    ratioMessage = string.format("Ton nouveau ratio est %.3f (Toujours plus haut que %s)", newRatio, lowestPlayer)
                else
                    local lowestPlayer = GP:getLowestImportedRatioPlayer(key) or key
                    ratioMessage = string.format("Ton nouveau ratio est N/A (Toujours plus haut que %s)", lowestPlayer)
                end
                shouldAppendRatio = true
            end
        end

        local originalSendChatMessage
        if shouldAppendRatio and GL and type(GL.sendChatMessage) == "function" then
            originalSendChatMessage = GL.sendChatMessage
            GL.sendChatMessage = function(self, message, ...)
                if type(message) == "string" and ratioMessage then
                    message = message .. " " .. ratioMessage
                end

                return originalSendChatMessage(self, message, ...)
            end
        end

        local result = originalAddWinner(self, winner, ...)

        if originalSendChatMessage then
            GL.sendChatMessage = originalSendChatMessage
        end

        if not isOS
            and type(itemLink) == "string"
            and itemLink ~= ""
            and GL
            and type(GL.getItemQualityFromLink) == "function"
            and key
            and GP.importedPreloot
            and GP.importedPreloot[key]
        then
            local quality = GL:getItemQualityFromLink(itemLink)
            if quality == 4 and type(playerName) == "string" and not GL:empty(playerName) then
                local entry = GP.importedPreloot[key]
                if type(entry) == "table" then
                    entry[2] = tonumber(entry[2]) or 0
                    entry[2] = entry[2] + 1
                elseif type(entry) == "string" then
                    local attendance, lootCount = string.match(entry, "^%s*(%d+%.?%d*)%s*,%s*(%d+%.?%d*)%s*$")
                    attendance = tonumber(attendance) or 0
                    lootCount = tonumber(lootCount) or 0
                    GP.importedPreloot[key] = {attendance, lootCount + 1}
                end

                local customRatio = GP:getCustomDataForPlayer(playerName)
                print("|cFF00FF00[GP]|r Incremented loot count for imported player " .. tostring(playerName) .. " (epic MS award) => new ratio: " .. string.format("%.3f", customRatio))

                if GL.RollOff and type(GL.RollOff.refreshRollsTable) == "function" then
                    GL.RollOff:refreshRollsTable()
                end
            end
        end

        return result
    end

    print("|cFF00FF00[GP]|r AwardedLoot:addWinner() hook installed")
end

-- Expose the GP namespace for debugging if needed
_G.GargulPreloot = GP

print("|cFF00CCFF[" .. ADDON_NAME .. "]|r Core.lua fully loaded.")
