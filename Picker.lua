local _, GP = ...

local Picker = {}
GP.Picker = Picker

local queue = {}
local popup = nil
local popupChecksum = nil
local listWindow = nil

local function AceGUI()
    return LibStub("AceGUI-3.0")
end

local function awardLine(entry)
    return ("%s  →  %s"):format(GP.Awards.itemLink(entry), entry.winner)
end

local showNext

local function openPopup(entry)
    local gui = AceGUI()
    popup = gui:Create("Frame")
    popupChecksum = entry.checksum
    popup:SetTitle("Traitement Preloot")
    popup:SetStatusText(("Proposé : %s. Fermer garde ce choix."):format(entry.treatment))
    popup:SetLayout("Flow")
    popup:SetWidth(460)
    popup:SetHeight(150)
    popup:EnableResize(false)
    popup:SetCallback("OnClose", function(widget)
        popup = nil
        popupChecksum = nil
        gui:Release(widget)
        showNext()
    end)

    local label = gui:Create("Label")
    label:SetFullWidth(true)
    label:SetText(awardLine(entry))
    popup:AddChild(label)

    for _, treatment in ipairs(GP.Awards.TREATMENTS) do
        local button = gui:Create("Button")
        button:SetText(treatment == entry.treatment and ("[" .. treatment .. "]") or treatment)
        button:SetWidth(105)
        button:SetCallback("OnClick", function()
            GP.Awards.setTreatment(entry.checksum, treatment)
            if listWindow then
                Picker.refresh()
            end
            popup:Hide()
        end)
        popup:AddChild(button)
    end
end

showNext = function()
    while #queue > 0 do
        local entry = GP.Awards.get(table.remove(queue, 1))
        if entry then
            openPopup(entry)
            return
        end
    end
end

--- Ask the owner for an award's treatment; awards queue while a popup is open.
function Picker.enqueue(checksum)
    if popupChecksum == checksum then
        popup:Hide()
    end

    for _, queued in ipairs(queue) do
        if queued == checksum then
            Picker.refresh()
            return
        end
    end
    queue[#queue + 1] = checksum

    if not popup then
        showNext()
    end
    Picker.refresh()
end

local function fillList()
    local gui = AceGUI()
    listWindow:ReleaseChildren()

    local scroll = gui:Create("ScrollFrame")
    scroll:SetLayout("List")
    scroll:SetFullWidth(true)
    scroll:SetFullHeight(true)
    listWindow:AddChild(scroll)

    local awards = GP.Awards.list()
    if #awards == 0 then
        local empty = gui:Create("Label")
        empty:SetFullWidth(true)
        empty:SetText("Aucune attribution enregistrée pour ce raid.")
        scroll:AddChild(empty)
        return
    end

    local choices = {}
    for _, treatment in ipairs(GP.Awards.TREATMENTS) do
        choices[treatment] = treatment
    end

    for _, entry in ipairs(awards) do
        local row = gui:Create("SimpleGroup")
        row:SetLayout("Flow")
        row:SetFullWidth(true)

        local label = gui:Create("Label")
        label:SetRelativeWidth(0.68)
        label:SetText(awardLine(entry))
        row:AddChild(label)

        local dropdown = gui:Create("Dropdown")
        dropdown:SetRelativeWidth(0.3)
        dropdown:SetList(choices, GP.Awards.TREATMENTS)
        dropdown:SetValue(entry.treatment)
        dropdown:SetCallback("OnValueChanged", function(_, _, value)
            GP.Awards.setTreatment(entry.checksum, value)
        end)
        row:AddChild(dropdown)

        scroll:AddChild(row)
    end
end

--- `/preloot`: every session award with its treatment, for later changes.
function Picker.openList()
    if listWindow then
        fillList()
        return
    end

    local gui = AceGUI()
    listWindow = gui:Create("Frame")
    listWindow:SetTitle("Traitements Preloot")
    listWindow:SetStatusText("Attributions de ce raid, la plus récente en haut.")
    listWindow:SetLayout("Fill")
    listWindow:SetWidth(560)
    listWindow:SetHeight(400)
    listWindow:SetCallback("OnClose", function(widget)
        listWindow = nil
        gui:Release(widget)
    end)
    fillList()
end

--- Re-draw open windows after awards change; a popup for a deleted award closes.
function Picker.refresh()
    if popupChecksum and not GP.Awards.get(popupChecksum) then
        popup:Hide()
    end

    if listWindow then
        fillList()
    end
end

function Picker.install()
    _G.SLASH_GARGULPRELOOT1 = "/preloot"
    _G.SlashCmdList["GARGULPRELOOT"] = Picker.openList
end
