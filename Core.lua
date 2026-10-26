local addonName, GP = ...

local function say(message)
    print("|cFF00CCFF[Preloot]|r " .. message)
end

local function init()
    local GL = _G.Gargul
    if not GL or not GL.MasterLooterUI or not GL.RollOff or not GL.Interface or not GL.Interface.Importer or not GL.Events or not GL.Exporter then
        say("|cFFFF4040Gargul introuvable : l'addon est désactivé.|r")
        return
    end

    GP.GL = GL
    GP.Columns.install(GL)
    GP.Import.install(GL)
    GP.Awards.install(GL)
    GP.Picker.install(GL)
    GP.Export.install(GL)
    GP.Awards.onChange = GP.Columns.refresh
end

local LoaderFrame = CreateFrame("Frame")
LoaderFrame:RegisterEvent("ADDON_LOADED")
LoaderFrame:SetScript("OnEvent", function(self, _, loadedName)
    if loadedName ~= addonName then
        return
    end

    self:UnregisterEvent("ADDON_LOADED")
    init()
end)

_G.GargulPreloot = GP
