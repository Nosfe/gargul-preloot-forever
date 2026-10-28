# Gargul Preloot

Owner-only companion addon for [Gargul](https://github.com/papa-smurf/Gargul). It shows each roller's loot priority from the guild's Preloot workbook (Google Sheets) right in Gargul's roll table. It also records how each award should count, so the workbook can import the raid's loot afterwards.

The addon never chooses or awards loot: the loot master decides every award, even against the displayed values. Only the loot master installs it; raiders keep their usual Gargul.

The workbook and its Apps Script live in [tools/google_apps_script](tools/google_apps_script/README.md).

## What it does

- **Snapshot import:** paste the snapshot exported by the workbook (Base64 or raw JSON). It holds each raider's spec, tier presence, loot counts and parse, plus the Objets table (Statut and Gain per item and spec). The whole snapshot is checked and both scores are recomputed. Anything inconsistent is refused, and the previous snapshot is kept.
- **Two columns after Gargul's own:**
  - **Ratio BiS**: (tier presence / raids in the tier) / (BiS loots + 1).
  - **Impact**: (tier presence / raids in the tier) × parse / (Impact loots + 1) × the rolled item's gain for the roller's spec. It is shown only when that spec's Statut for the item is IMPACT, and never for tanks.
- **Treatment per award:** each Gargul award opens a small window with BIS, IMPACT, CLASS_BOUND and NORMAL. The button matching the winner's spec Statut for that item is marked; an off-spec award is marked NORMAL.
  - Click a button, or **Fermer** (Close) to keep the marked one.
  - `/preloot` lists every award of the raid, so a treatment can be changed later.
- **Live values:** BIS and IMPACT awards count immediately, so both columns are up to date for the next roll. NORMAL and CLASS_BOUND count for nothing.
- **Chat line:** when a treatment is confirmed in the window, a French line goes to group chat with the winner's new value. For example: `Alya : nouveau ratio BiS 0.167` or `Alya : nouveau score Impact 0.063 pour [item]`. Nothing is sent for NORMAL or CLASS_BOUND, nor when Gargul's award announcements are turned off.
- **Export fill:** Gargul's Custom export gets each line's `raidId` and `treatment` filled in, matched by the award's checksum, so the workbook's **Raid > Terminer** can import it.

## Requirements

- Gargul. It was built and tested against Gargul **v8.0.1**. Other versions are detected at load: any part that cannot hook into them is switched off on its own (see below).
- WoW Forever (`Interface-Camelot: 16001`) or TBC Anniversary (`Interface-BCC: 20506`).

## Installation

1. Copy the `Gargul_Preloot` folder (the one inside this repo, holding `Gargul_Preloot.toc`) into `Interface/AddOns/` in the WoW folder, so you get `Interface/AddOns/Gargul_Preloot/Gargul_Preloot.toc`. Nothing else from the repo is needed in game.
2. Enable **Gargul** and **Gargul Preloot**, then log in or `/reload`.

## Gargul export settings

In Gargul's loot exporter:

1. Choose the **Custom** format.
2. Untick **Include offspec items** and **Include disenchanted items**.
3. Paste the format line from the workbook menu **Preloot > Configuration > Afficher le format d'export Gargul**.

The addon replaces that line's `@GPRAID` and `@GPTREATMENT` tokens; Gargul fills the rest.

## Raid night

1. In the workbook: **Preloot > Raid > Démarrer (exporter le snapshot)**, then copy the snapshot.
2. In game: open Gargul's Importer, click **Preloot (snapshot)**, paste, then **Importer**. Chat confirms the tier, the raid and the number of raiders. `/preloot import` opens the same paste window.
3. Roll and award as usual in Gargul, and confirm each award's treatment in the window.
4. After the raid, export from Gargul. In the workbook, use **Preloot > Raid > Terminer** with the Warcraft Logs report link and the export.

The addon keeps nothing between sessions: import the snapshot again before every raid. A `/reload` during a raid clears both the snapshot and the treatments recorded so far:

- the columns stay empty and new awards are not recorded until the snapshot is imported again (run **Démarrer** again: it exports the same raid ID);
- awards made before the reload are no longer counted in the columns for the rest of the raid;
- their exported lines have an empty `raidId`, which the workbook refuses: type the raid ID in those lines, or delete lines from another raid. An empty treatment is not a problem: pick it in the Terminer preview.

## Slash commands

| Command | Effect |
| --- | --- |
| `/preloot` | List of this raid's awards, with a treatment dropdown each |
| `/preloot import` | Snapshot paste window (useful when the Importer button is unavailable) |

## Other Gargul versions

On load, one chat line lists any part switched off because the installed Gargul lacks what it needs. For example: `Version de Gargul différente, fonctions désactivées : remplissage de l'export (Exporter.transformEntriesToCustomFormat absent)`. The other parts keep working.

Where it is safe, the addon falls back to its own code:

- its own Base64 decoder;
- realm stripping on player names;
- the rolled item read from its link;
- WoW's chat when Gargul's chat helper is missing.

An error inside the addon is printed once and never stops Gargul's own roll table or export.

## Tests

Offline tests run on [LuaJIT](https://luajit.org/), which implements Lua 5.1 like WoW. They load Gargul's own Base64 and JSON code from a Gargul v8.0.1 checkout:

```powershell
git clone --depth 1 --branch v8.0.1 https://github.com/papa-smurf/Gargul.git ..\Gargul
luajit tests/addon/run.lua
```

Set `GARGUL_DIR` when the checkout is not at `../Gargul`. The suite prints `PASS: <n> assertions`.

To try the addon in game without workbook data, paste `tests/addon/payloads/test-snapshot.b64.txt`. It holds 28 raiders and 46 Classic and TBC items, with raid ID `test-1`. To rebuild it after editing the names or items, run `luajit tests/addon/make_test_snapshot.lua`. The workbook refuses exports from that test raid ID.

## Files

The addon is the `Gargul_Preloot/` folder:

| File | Role |
| --- | --- |
| `Gargul_Preloot.toc` | Addon metadata and load order |
| `Compat.lua` | Gargul feature detection and fallbacks |
| `Snapshot.lua` | Snapshot decoding and Interchange v2 validation |
| `Scores.lua` | BiS Ratio, Impact base and Impact Score, display rounding |
| `Columns.lua` | Ratio BiS and Impact columns in the roll table |
| `Import.lua` | Importer button and paste window |
| `Awards.lua` | Treatment per award for the session, and live loot counts |
| `Picker.lua` | Treatment window and `/preloot` list |
| `Chat.lua` | The French chat line |
| `Export.lua` | `@GPRAID` / `@GPTREATMENT` fill in Gargul's Custom export |
| `Core.lua` | Startup and per-feature installation |

Outside it, not used in game:

| Folder | Role |
| --- | --- |
| `tests/addon/` | Offline tests and the test snapshot |
| `tools/google_apps_script/` | The workbook's Apps Script |

**Version:** 2.0.0
