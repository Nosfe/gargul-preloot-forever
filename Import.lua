local _, GP = ...

local Import = {}
GP.Import = Import

local BUTTON_LABEL = "Preloot (snapshot)"
local BUTTON_SPACING = 26

local function say(message)
    print("|cFF00CCFF[Preloot]|r " .. message)
end

--- Parse pasted text and replace the session snapshot only on success; returns true when imported.
function Import.apply(text, GL)
    local data, err = GP.Snapshot.parse(text, GL)
    if not data then
        say("|cFFFF4040Import refusé :|r " .. err .. ". Le snapshot précédent est conservé.")
        return false
    end

    GP.Awards.onSnapshotImported(data.raidId)
    GP.Snapshot.set(data)
    if GP.Picker then
        GP.Picker.refresh()
    end
    say(("Snapshot importé : palier %s, raid %s, %d raider(s)."):format(data.tierId, data.raidId, #data.raiders))

    if GP.Compat.hasFunction(GL, "RollOff.refreshRollsTable") then
        GP.Compat.safeCall("rafraîchissement du tirage", GL.RollOff.refreshRollsTable, GL.RollOff)
    end

    return true
end

local function openDialog(GL)
    if Import.dialog then
        Import.dialog:Show()
        return
    end

    local AceGUI = LibStub("AceGUI-3.0")

    local dialog = AceGUI:Create("Frame")
    dialog:SetTitle("Import du snapshot Preloot")
    dialog:SetStatusText("Collez le snapshot exporté par le classeur (Base64 ou JSON).")
    dialog:SetLayout("Flow")
    dialog:SetWidth(560)
    dialog:SetHeight(340)
    dialog:EnableResize(false)
    dialog:SetCallback("OnClose", function(widget)
        Import.dialog = nil
        AceGUI:Release(widget)
    end)

    local editBox = AceGUI:Create("MultiLineEditBox")
    editBox:SetFullWidth(true)
    editBox:SetLabel("")
    editBox:SetNumLines(15)
    editBox:DisableButton(true)
    editBox:SetMaxLetters(0)
    dialog:AddChild(editBox)

    local importButton = AceGUI:Create("Button")
    importButton:SetText("Importer")
    importButton:SetWidth(120)
    importButton:SetCallback("OnClick", function()
        if Import.apply(editBox:GetText(), GL) then
            dialog:Hide()
        end
    end)
    dialog:AddChild(importButton)

    local cancelButton = AceGUI:Create("Button")
    cancelButton:SetText("Annuler")
    cancelButton:SetWidth(120)
    cancelButton:SetCallback("OnClick", function()
        dialog:Hide()
    end)
    dialog:AddChild(cancelButton)

    Import.dialog = dialog
end

--- Opens the paste dialog; also reachable with /preloot import when Gargul's Importer cannot be hooked.
function Import.open()
    openDialog(GP.GL)
end

local function findButton(Window, label)
    for _, child in ipairs({ Window:GetChildren() }) do
        if type(child.GetText) == "function" and child:GetText() == label then
            return child
        end
    end

    return nil
end

local function hideRegion(Window, text)
    for _, region in ipairs({ Window:GetRegions() }) do
        if type(region.GetText) == "function" and region:GetText() == text then
            region:Hide()
        end
    end
end

function Import.install(GL)
    local Importer = GL.Interface.Importer
    local originalOpen = Importer.open

    -- Gargul clamps this window to 200 px, so the button takes the intro line's place and the native buttons move down one step.
    function Importer:open(...)
        local Window = originalOpen(self, ...)
        if type(Window) ~= "table" or GP._importButtonAdded then
            return Window
        end

        -- Set first: a later failure must not stack another button on Gargul's reused window.
        GP._importButtonAdded = true
        GP.Compat.safeCall("bouton de l'Importer", function()
            local L = _G.Gargul_L or {}
            hideRegion(Window, L["What kind of data would you like to import?"] or "What kind of data would you like to import?")

            local button = GL.Interface:dynamicPanelButton(Window, BUTTON_LABEL)
            button:SetPoint("TOPLEFT", Window, "TOPLEFT", 20, -30)
            button:SetPoint("TOPRIGHT", Window, "TOPRIGHT", -20, 0)
            button:SetScript("OnClick", function()
                openDialog(GL)
            end)

            local softReserves = findButton(Window, L["Soft-Reserves"] or "Soft-Reserves")
            if softReserves then
                softReserves:ClearAllPoints()
                softReserves:SetPoint("TOPLEFT", button, "TOPLEFT", 0, -BUTTON_SPACING)
                softReserves:SetPoint("TOPRIGHT", button, "TOPRIGHT", 0, 0)
            end
        end)

        return Window
    end
end
