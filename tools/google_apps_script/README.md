# Preloot workbook (Google Apps Script)

Source of the Apps Script bound to the Google Sheets workbook **preloot-forever** (French locale). The script builds and refreshes the workbook, opens and closes raids, imports Warcraft Logs attendance and Gargul's loot export, and manages tiers. The loot master's in-game companion addon is described in the [root README](../../README.md).

## Setup with clasp

[clasp](https://github.com/google/clasp) uploads the files in `src/` to the script bound to the workbook. `.clasp.json` already points at that script (`scriptId`) and the workbook (`parentId`).

1. Install [Node.js](https://nodejs.org/) (LTS), then clasp: `npm install -g @google/clasp`.
2. Turn on the **Google Apps Script API** at <https://script.google.com/home/usersettings>.
3. Run `clasp login` and sign in with the Google account that owns the workbook. The token is stored in your user profile (`.clasprc.json`, ignored by git).
4. From this folder, upload: `clasp push --force`. It prints `Pushed 14 files`.
5. Reload the workbook. The **Preloot** menu appears; the first menu action asks for authorisation.

`.claspignore` uploads only `appsscript.json` and the `.js` files. `appsscript.json` turns on the V8 runtime and the advanced **Sheets** service (v4) that every batched write uses.

If `clasp push` hangs with no output, stop it and run it again.

To bind a copy of the workbook, use **File > Make a copy** in Sheets (the bound script comes with it), then put the copy's script ID and spreadsheet ID in `scriptId` and `parentId` in `.clasp.json`.

## Menu

**Preloot > Raid**

| Item | Effect |
| --- | --- |
| Démarrer (exporter le snapshot) | Opens the next raid (Raids row, Config's *Raid en cours*, warning-only protection of score inputs). Shows the Base64 snapshot to paste into the addon. Run it again during the same raid to export again with the same raid ID. |
| Terminer | Ends the open raid in one batch. It takes a Warcraft Logs report link (attendance: a raider present for more than 25% of the boss fights gets credit) and Gargul's Custom export. A preview lists the awards with a Traitement dropdown, and the rejected lines with the reason. Only lines whose `raidId` is the open raid are imported. |
| Annuler | Cancels the open raid (removes its row and the protections) without importing anything. |
| Supprimer | Deletes a raid chosen from a list of all Raids rows, after confirmation. Choosing the raid in progress also cancels it, like Annuler. |

**Preloot > Configuration**

| Item | Effect |
| --- | --- |
| Rafraîchir le classeur | Creates or refreshes every tab, formula and format; migrates older layouts. Stops without writing when owner data would be lost. |
| Identifiants WCL | Stores the Warcraft Logs API client ID and secret in your own user properties, never in the workbook. |
| Mettre à jour les parses WCL | Fills the Roster parses from Warcraft Logs. Needs Config's *Serveur WCL* and the WCL credentials; refused while a raid is open. |
| Afficher le format d'export Gargul | The line to paste as Gargul's Custom export format. |
| Nouveau palier | Starts the next tier (new ID and start date). The current Objets tabs are copied into an `Objets (<old tier>)` archive tab, protected with a warning, and then **emptied** for the new tier. Both scores reset. Refused while a raid is open. |

## Tabs

| Tab | Content |
| --- | --- |
| Roster | One row per character: raid group, class, spec, role, parse, tier presence, loot counts, BiS Ratio and Impact base. |
| Présence | One row per raid, one column per raider (`1` present, `B` bench). |
| Awards | One block per raider: date, item, item ID, Traitement and the raid ID (hidden). |
| Objets Tank / Heal / Melee DPS / Ranged DPS / Caster DPS | Items of the tier, with a Statut (BIS, IMPACT, CLASS_BOUND, NORMAL) and a Gain (%) per spec. |
| Raids | Raid ID, instance, date, report codes, import time, tier. |
| Config | Active tier, tier start, open raid, WCL server. |
| Présence (archive), Awards (archive), _Listes | Archives and the lists behind dropdowns. |

Rows from earlier tiers stay visible in grey. Each tier change also adds an `Objets (<tier>)` archive tab.

## Tests

The `tests/story-4-*.html` pages run the script against a fake Sheets API (`tests/harness.js`). Each page prints `PASS: <n> assertions` or `FAIL: …` in its DOM.

Run one with headless Edge (or Chrome):

```powershell
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --disable-gpu `
  --user-data-dir="$env:TEMP\edge-headless-$(Get-Random)" --allow-file-access-from-files `
  --dump-dom "file:///C:/Repos/Gargul_Preloot/tools/google_apps_script/tests/story-4-7.html"
```

Use a fresh `--user-data-dir` for each page, because a shared profile can hang. Pages 4-3, 4-4, 4-6 and 4-7 read `fixtures/` files, which browsers block for `file://` pages unless started with `--allow-file-access-from-files`; 4-1, 4-2 and 4-8 also work when opened plainly.

`fixtures/` holds the data shared with the addon's tests:

- `scores.json`: score cases;
- `snapshot-sample.json`: a pre-raid snapshot;
- `custom-export-sample.txt`: a Gargul Custom export;
- `wcl-report-sample.json`: a Warcraft Logs report.
