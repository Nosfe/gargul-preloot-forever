local addonName, GP = ...

local function say(message)
    print("|cFF00CCFF[Preloot]|r " .. message)
end

-- Each feature installs only when its own Gargul pieces exist, so one missing piece never disables the rest.
local FEATURES = {
    {
        name = "colonnes du tirage",
        needs = { "MasterLooterUI.tableColumns", "RollOff.refreshRollsTable", "Interface.get" },
        install = function(GL) GP.Columns.install(GL) end,
    },
    {
        name = "bouton de l'Importer (utilisez /preloot import)",
        needs = { "Interface.Importer.open", "Interface.dynamicPanelButton" },
        install = function(GL) GP.Import.install(GL) end,
    },
    {
        name = "suivi des attributions",
        needs = { "Events.register" },
        install = function(GL) GP.Awards.install(GL) end,
    },
    {
        name = "remplissage de l'export",
        needs = { "Exporter.transformEntriesToCustomFormat" },
        install = function(GL) GP.Export.install(GL) end,
    },
}

--- Installs every feature whose Gargul APIs exist; returns the names of the features left off.
function GP.installFeatures(GL)
    local off = {}

    if not GP.Compat.hasFunction(GL, "JSON.decode") then
        off[#off + 1] = "import du snapshot (GL.JSON absent)"
    end

    for _, feature in ipairs(FEATURES) do
        local missing = nil
        for _, path in ipairs(feature.needs) do
            if not GP.Compat.hasFunction(GL, path) then
                missing = path
                break
            end
        end

        if missing then
            off[#off + 1] = ("%s (%s absent)"):format(feature.name, missing)
        elseif not GP.Compat.safeCall("installation " .. feature.name, feature.install, GL) then
            off[#off + 1] = feature.name .. " (erreur)"
        end
    end

    GP.Picker.install(GL)
    GP.Awards.onChange = GP.Columns.refresh
    return off
end

local function init()
    local GL = _G.Gargul
    if type(GL) ~= "table" then
        say("|cFFFF4040Gargul introuvable : l'addon est désactivé.|r")
        return
    end

    GP.GL = GL
    local off = GP.installFeatures(GL)
    if #off > 0 then
        say("|cFFFFC040Version de Gargul différente, fonctions désactivées :|r " .. table.concat(off, " ; "))
    end
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
