# Gargul_Preloot Extension

**Gargul_Preloot** is a safe extension addon for Gargul that adds a custom numeric column to the Master Looter window without modifying any Gargul core files.

## Quick Start

1. Copy this folder to `World of Warcraft\Interface\AddOns\`
2. Enable in Addons menu
3. `/reload`
4. Open Master Looter window
5. See "Value" column with custom player data

## Features

- ✅ Adds "Value" column between "+1" and "Type"
- ✅ Displays decimal values (3.125, 2.848, 1.500, etc.)
- ✅ Uses class colors from player names
- ✅ Updates automatically on rolloffs
- ✅ Zero modifications to Gargul core files
- ✅ Survives Gargul updates

## How It Works

The addon hooks into two Gargul functions:

1. **`MasterLooterUI:tableColumns()`** - Adds custom column definition
2. **`RollOff:refreshRollsTable()`** - Injects custom values into rows

Both hooks preserve original Gargul behavior and only enhance it.

## Customization

Edit `Core.lua`:

### Change Display Format
```lua
-- In enhanceTableWithCustomData(), change:
local formattedValue = string.format("%.3f", customValue)

-- To display integers:
local formattedValue = tostring(math.floor(customValue))
```

### Modify Test Data
```lua
-- In initializeCustomData():
self.testData = {
    ["PlayerName"] = 5.0,
    ["AnotherPlayer"] = 3.5,
}
```

### Load External Data
```lua
-- In getCustomDataForPlayer():
return MyExternalSystem:getValue(playerName) or 0
```

## Files

- **Core.lua** - Main implementation (fully commented)
- **Gargul_Preloot.toc** - Addon metadata

## Debugging

Check if loaded:
```
/script print(GargulPreloot and "OK" or "FAIL")
```

List column structure:
```
/script
local cols = Gargul.MasterLooterUI:tableColumns()
for i, c in ipairs(cols) do
    print(i, c.name)
end
```

Verify test data:
```
/script print(GargulPreloot:getCustomDataForPlayer("PlayerA"))
```

## Compatibility

- ✅ TBC, Vanilla, Wrath, Cataclysm (all Gargul versions)
- ✅ No dependencies except Gargul
- ✅ Safe to remove anytime

## Support

For detailed documentation, configuration examples, and troubleshooting, refer to the full guides in the original Gargul_CustomData addon or view the comments in Core.lua.

---

**Version:** 1.0.0  
**Status:** Production-ready
