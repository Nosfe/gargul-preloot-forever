local _, GP = ...

local Export = {}
GP.Export = Export

local function literal(text)
    return (text:gsub("%%", "%%%%"))
end

--- Fill @GPRAID and @GPTREATMENT on each line from the session, by the line's checksum; empty when not captured.
function Export.fill(text)
    if type(text) ~= "string" or not text:find("@GP", 1, true) then
        return text
    end

    local lines = {}
    for line in (text .. "\n"):gmatch("(.-)\n") do
        local checksum = line:match('"checksum"%s*:%s*"([^"]*)"')
        local entry = checksum and GP.Awards.get(checksum)
        local raidId = entry and GP.Awards.raidId() or ""
        local treatment = entry and entry.treatment or ""

        line = line:gsub("@GPRAID", literal(tostring(raidId)))
        line = line:gsub("@GPTREATMENT", literal(treatment))
        lines[#lines + 1] = line
    end

    return table.concat(lines, "\n")
end

function Export.install(GL)
    local Exporter = GL.Exporter
    local originalTransform = Exporter.transformEntriesToCustomFormat

    function Exporter:transformEntriesToCustomFormat(...)
        return Export.fill(originalTransform(self, ...))
    end
end
