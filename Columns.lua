local _, GP = ...

local Columns = {}
GP.Columns = Columns

local BIS_COLUMN_NAME = "Ratio BiS"
local BIS_COLUMN_WIDTH = 70
local IMPACT_COLUMN_NAME = "Impact"
local IMPACT_COLUMN_WIDTH = 60
local NATIVE_WINDOW_WIDTH = 520

--- Roll-table display name to raider key: Gargul appends " [n]" to repeat rolls.
function Columns.rollerKey(displayName)
    if type(displayName) ~= "string" then
        return nil
    end

    return (displayName:gsub(" %[%d+%]$", ""))
end

--- Text shown in the Ratio BiS cell for a display name.
function Columns.bisCellText(displayName)
    local raider = GP.Snapshot.raider(Columns.rollerKey(displayName))
    local ratio = GP.Scores.bisRatio(raider)
    if not ratio then
        return ""
    end

    return ("%.3f"):format(ratio)
end

--- Text shown in the Impact cell: empty unless the item's Statut is IMPACT for the roller's spec.
function Columns.impactCellText(displayName, itemID)
    local raider = GP.Snapshot.raider(Columns.rollerKey(displayName))
    local score = raider and GP.Scores.impactScore(raider, GP.Snapshot.itemSpec(itemID, raider.classSpec))
    if not score then
        return ""
    end

    local text = ("%.3f"):format(score)
    return text == "-0.000" and "0.000" or text
end

--- Append the companion cells to rows built by Gargul (cells 1-10 stay untouched).
function Columns.appendCells(rows, itemID)
    for _, row in ipairs(rows) do
        local cols = row.cols
        if cols and cols[1] then
            cols[#cols + 1] = {
                value = Columns.bisCellText(cols[1].value),
                color = cols[1].color,
            }
            cols[#cols + 1] = {
                value = Columns.impactCellText(cols[1].value, itemID),
                color = cols[1].color,
            }
        end
    end
end

local function hasColumn(columns)
    for _, column in ipairs(columns) do
        if column.name == BIS_COLUMN_NAME then
            return true
        end
    end

    return false
end

local function widenWindow(GL)
    local Window = GL.Interface:get(GL.MasterLooterUI, "Window")
    if not Window or type(Window.SetWidth) ~= "function" or not Window.frame then
        return
    end

    local wanted = NATIVE_WINDOW_WIDTH + BIS_COLUMN_WIDTH + IMPACT_COLUMN_WIDTH
    if Window.frame:GetWidth() < wanted then
        Window:SetWidth(wanted)
    end
end

function Columns.install(GL)
    local MasterLooterUI = GL.MasterLooterUI
    local originalTableColumns = MasterLooterUI.tableColumns

    -- Gargul reads cells 1, 2, 4 and 10 by index, so companion columns only go after them.
    function MasterLooterUI:tableColumns()
        local columns = originalTableColumns(self)
        if not hasColumn(columns) then
            columns[#columns + 1] = {
                name = BIS_COLUMN_NAME,
                width = BIS_COLUMN_WIDTH,
                align = "CENTER",
                color = { r = 0.5, g = 0.5, b = 1.0, a = 1.0 },
                colorargs = nil,
            }
            columns[#columns + 1] = {
                name = IMPACT_COLUMN_NAME,
                width = IMPACT_COLUMN_WIDTH,
                align = "CENTER",
                color = { r = 0.5, g = 0.5, b = 1.0, a = 1.0 },
                colorargs = nil,
            }
        end

        return columns
    end

    local RollOff = GL.RollOff
    local originalRefreshRollsTable = RollOff.refreshRollsTable

    function RollOff:refreshRollsTable()
        originalRefreshRollsTable(self)

        local RollsTable = GL.Interface:get(GL.MasterLooterUI, "Table.Players")
        if not RollsTable or type(RollsTable.data) ~= "table" then
            return
        end

        Columns.appendCells(RollsTable.data, self.CurrentRollOff and self.CurrentRollOff.itemID)
        RollsTable:SetData(RollsTable.data)
        RollsTable:SortData()
        widenWindow(GL)
    end
end
