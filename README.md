# Gargul Preloot

Gargul Preloot is a World of Warcraft add-on that extends Gargul's Master Looter player table with an imported attendance-to-loot ratio.

It adds a `Ratio_Preloot` column, updates a player's loot count after eligible awards, and persists those updates across logout, login, and `/reload`.

## Requirements

- Gargul must be installed and enabled.
- `Gargul_Preloot` must be copied to the same `Interface/AddOns` directory and enabled.

Gargul is declared as a required dependency, so this extension initializes after Gargul is available.

## Installation

1. Copy the `Gargul_Preloot` directory into your World of Warcraft `Interface/AddOns` directory.
2. Enable **Gargul** and **Gargul Preloot** in the add-on list.
3. Log in or run `/reload`.

## Importing preloot data

1. Open Gargul's Importer window.
2. Select **Preloot (Base64)**.
3. Paste a Base64-encoded JSON object into the dialog.
4. Select **Import**.

The decoded JSON must map each player name to an array containing attendance first and loot count second:

```json
{
  "PlayerA": [19, 4],
  "PlayerB": [29, 7],
  "PlayerC": [34, 17.33]
}
```

Both values may be integers or decimals. Player names are matched case-insensitively and realm suffixes are removed when Gargul provides that normalization.

A successful import completely replaces the previously persisted preloot snapshot, including loot-count changes made from earlier awards. Empty or invalid input does not replace the stored data.

See `sample_json` for a larger decoded example.

## Ratio calculation

The displayed ratio is calculated from the imported attendance and loot count:

| Condition | Displayed ratio |
| --- | ---: |
| Attendance is 3 or lower | `0.000` |
| Attendance is above 3 and loot count is 0 | `999.000` |
| Otherwise | `attendance / loot count` |

Ratios are displayed to three decimal places in the Master Looter player table. Players without usable imported data currently receive the add-on's generated fallback value.

## Automatic updates after awards

The imported loot count is incremented when all of these conditions are met:

- The recipient exists in the imported preloot data.
- The item is epic quality.
- The award is not marked as off-spec (`OS`).

After an eligible award, the add-on:

1. Calculates the recipient's new ratio using the incremented loot count.
2. Appends the new ratio to Gargul's award announcement.
3. Updates the ratio shown in the player table.
4. Keeps the updated loot count in `GargulPrelootDB` for the next login or `/reload`.

## Persistence and startup log

Imported attendance, loot counts, and original player names are stored in WoW's `GargulPrelootDB` SavedVariable.

Each successful import also stores its timestamp. On login or `/reload`, the add-on restores the saved data and prints a compact ratio summary followed by the last import date shortly after the player enters the world:

```text
[GP] Persisted preloot ratios loaded for 25 player(s). Highest: PlayerA (12.500), Lowest: PlayerB (1.250)
[GP] Last preloot import: 2026-09-03 18:45:12
```

The date and time use the game client's local time. If no valid ratios or import timestamp are stored, it prints:

```text
[GP] No persisted preloot ratios loaded. Import ratios from Gargul's Importer > Preloot (Base64).
[GP] Last preloot import: not recorded. Import ratios to start tracking it.
```

As with all WoW SavedVariables, changes are written by the game during normal logout and `/reload` processing.

## Debugging

Check whether the extension initialized:

```lua
/script print(GargulPreloot and "OK" or "FAIL")
```

Inspect the current ratio for a player:

```lua
/script print(GargulPreloot:getCustomDataForPlayer("PlayerA"))
```

Inspect the persisted imported entry for a player:

```lua
/dump GargulPrelootDB.importedPreloot["playera"]
```

Player keys in the saved table are normalized to lowercase.

## Files

- `Core.lua` contains the Gargul hooks, import handling, ratio calculation, award updates, and persistence logic.
- `Gargul_Preloot.toc` contains add-on metadata and declares `GargulPrelootDB` as a SavedVariable.
- `sample_json` demonstrates the decoded attendance/loot import structure.

**Version:** 1.1.0
