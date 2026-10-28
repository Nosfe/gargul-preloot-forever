local _, GP = ...

local Picker = {}
GP.Picker = Picker

local queue = {}
local popup = nil
local popupChecksum = nil
local listWindow = nil
local confirmClose = false
local installedGL = nil

local function AceGUI()
    return LibStub("AceGUI-3.0")
end

local function awardLine(entry)
    return ("%s  →  %s"):format(GP.Awards.itemLink(entry), entry.winner)
end

local showNext

local closeButton = nil
local closeButtonScript = nil

-- AceGUI's Frame fires OnClose from OnHide, which a UI hide also triggers; only its Close button and our buttons confirm.
local function hookCloseButton(widget)
    for _, child in ipairs({ widget.frame:GetChildren() }) do
        if type(child.GetText) == "function" and child:GetText() == _G.CLOSE then
            closeButton = child
            closeButtonScript = child:GetScript("OnClick")
            child:SetScript("OnClick", function(...)
                confirmClose = true
                closeButtonScript(...)
            end)
            return
        end
    end
end

local function finishPopup(widget)
    local confirmed = confirmClose
    confirmClose = false
    local checksum = popupChecksum
    popup = nil
    popupChecksum = nil
    -- The frame goes back to AceGUI's shared pool, so its Close button gets its own script back.
    if closeButton then
        closeButton:SetScript("OnClick", closeButtonScript)
        closeButton, closeButtonScript = nil, nil
    end
    AceGUI():Release(widget)
    if confirmed and GP.Chat then
        GP.Chat.announce(GP.Awards.get(checksum), installedGL)
    end
    showNext()
end

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
    hookCloseButton(popup)
    popup:SetCallback("OnClose", finishPopup)

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
            confirmClose = true
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

local function closeSilently()
    local widget = popup
    confirmClose = false
    widget:Hide()
    -- Hide on a frame already invisible (UI hidden) fires no OnHide, so finish here.
    if popup == widget then
        finishPopup(widget)
    end
end

--- Ask the owner for an award's treatment; awards queue while a popup is open.
function Picker.enqueue(checksum)
    if popupChecksum == checksum then
        closeSilently()
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
        closeSilently()
    end

    if listWindow then
        fillList()
    end
end

function Picker.install(GL)
    installedGL = GL
    _G.SLASH_GARGULPRELOOT1 = "/preloot"
    _G.SlashCmdList["GARGULPRELOOT"] = function(argument)
        if type(argument) == "string" and argument:lower():match("^%s*import%s*$") then
            GP.Import.open()
        else
            Picker.openList()
        end
    end
end
