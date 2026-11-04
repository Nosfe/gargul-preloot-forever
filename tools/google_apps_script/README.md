# Preloot workbook (Google Apps Script)

Source of the Apps Script bound to the Google Sheets workbook **preloot-forever** (French locale). The script builds and refreshes the workbook, opens and closes raids, imports Warcraft Logs attendance and Gargul's loot export, and manages tiers. The loot master's in-game companion addon is described in the [root README](../../README.md).

## Setup with clasp

[clasp](https://github.com/google/clasp) uploads the files in `src/` to the script bound to the workbook. `.clasp.json` already points at that script (`scriptId`) and the workbook (`parentId`).

1. Install [Node.js](https://nodejs.org/) (LTS), then clasp: `npm install -g @google/clasp`.
2. Turn on the **Google Apps Script API** at <https://script.google.com/home/usersettings>.
3. Run `clasp login` and sign in with the Google account that owns the workbook. The token is stored in your user profile (`.clasprc.json`, ignored by git).
4. From this folder, upload: `clasp push --force`. It prints `Pushed 17 files`.
5. Reload the workbook. The **Preloot** menu appears; the first menu action asks for authorisation.

`.claspignore` uploads only `appsscript.json`, the `.js` files and `portal.html`. `appsscript.json` turns on the V8 runtime and the advanced **Sheets** service (v4) that every batched write uses, and sets the web app below.

If `clasp push` hangs with no output, stop it and run it again.

To bind a copy of the workbook, use **File > Make a copy** in Sheets (the bound script comes with it), then put the copy's script ID and spreadsheet ID in `scriptId` and `parentId` in `.clasp.json`.

## Menu

**Parsimonie > Raid**

| Item | Effect |
| --- | --- |
| Démarrer (exporter le snapshot) | Opens the next raid (Raids row, Config's *Raid en cours*, warning-only protection of score inputs). Shows the Base64 snapshot to paste into the addon. Run it again during the same raid to export again with the same raid ID. |
| Terminer | Ends the open raid in one batch. It takes a Warcraft Logs report link (attendance: a raider present for more than 25% of the boss fights gets credit) and Gargul's Custom export. A preview lists the awards with their Traitement (see Awards below; Gargul's value is shown in brackets when it differs) and the rejected lines with the reason. Only lines whose `raidId` is the open raid are imported. |
| Annuler | Cancels the open raid (removes its row and the protections) without importing anything. |
| Supprimer | Deletes a raid chosen from a list of all Raids rows, after confirmation. Choosing the raid in progress also cancels it, like Annuler. |

**Parsimonie > Configuration**

| Item | Effect |
| --- | --- |
| Rafraîchir le classeur | Creates or refreshes every tab, formula and format. Stops without writing when a tab does not match the current layout. |
| Identifiants WCL | Stores the Warcraft Logs API client ID and secret in your own user properties, never in the workbook. |
| Mettre à jour les parses WCL | Fills the Roster parses from Warcraft Logs. Needs Config's *Serveur WCL* and the WCL credentials; refused while a raid is open. |
| Afficher le format d'export Gargul | The line to paste as Gargul's Custom export format. |
| Nouveau palier | Starts the next tier (new ID and start date). The current Objets tabs are copied into an `Objets (<old tier>)` archive tab, protected with a warning, and then **emptied** for the new tier. Both scores reset. Refused while a raid is open. |
| Réinitialiser tout le classeur | Deletes every tab (data, archives, Config) and rebuilds the empty layout. Asks for the owner's password; only its salted SHA-256 is in the code. WCL credentials are kept. |

**Parsimonie > Données de test**

| Item | Effect |
| --- | --- |
| Remplir (aperçu du portail) | Adds test data next to the real data, to preview the raider portal: 20 fictional raiders (every role); the ZA-phase BiS lists of wowtbc.gg (191 items, written in `testdata.js`), each item added only to the Objets tabs of a role whose spec lists it (IDs already listed are skipped), BIS for those specs and IMPACT with a gain for about one in three (never for tanks); 6 raids `test-1` to `test-6` dated within the tier, with presence and 24 loots taken from the winners' lists (one ALT per raid). What was added is recorded in the document properties. Refused while a raid is open, if a test name is already in Roster, or if test data is already there. While present, the test raids count in every raider's tier presence. |
| Effacer | Removes exactly what was recorded: the test raids (like Raid > Supprimer), the test raiders (Roster rows and their Présence and Awards columns) and the item rows added by the fill, then refreshes the workbook. |

## Tabs

| Tab | Content |
| --- | --- |
| Roster | One row per character: raid group, class, spec, role, parse, tier presence, loot counts and BiS Ratio. |
| Classement Impact | Formulas only: one row per item with an IMPACT Statut, and the 5 raiders with the best Impact score for it, as "Name (score)" in the raider's class colour; the top 3 in bold on a gold, silver and bronze fill. A raider who already received the item (Awards) is left out. Raid > Démarrer sends Gargul the scores of every raider. |
| Présence | One row per raid, one column per raider (`1` present, `B` bench). |
| Awards | One block per raider: date, item, item ID, Traitement and the raid ID (hidden). The Objets tabs decide the Traitement, on Raid > Terminer and whenever a row is typed or changed by hand: the winner's spec Statut for the item; without one, CLASS_BOUND is kept and anything else becomes ALT; an off-spec (OS) loot is ALT. |
| Objets Tank / Heal / Melee DPS / Ranged DPS / Caster DPS | Items of the tier, with an Emplacement (Tête … Pieds, Doigt, Bijou, Arme, Main gauche, Distance, Relique, as on wowtbc.gg) and a Statut (BIS, IMPACT, CLASS_BOUND, ALT) and a Gain (DPS) per spec: the raw DPS the item adds for that spec. A refresh rewrites older values: NORMAL as ALT, the detailed weapon slots as Arme or Main gauche. |
| Raids | Raid ID, instance, date, report codes, import time, tier. |
| Config | Active tier, tier start, open raid, WCL server. |
| Présence (archive), Awards (archive), _Listes | Archives and the lists behind dropdowns. |

Rows from earlier tiers stay visible in grey. Each tier change also adds an `Objets (<tier>)` archive tab.

## Raider portal

A read-only web page for the raiders (`webapp.js`, `portal.html`), in French and dark-themed: Mon personnage (pick your name: your numbers with the BiS ratio calculation on hover, your loots, your rank on each IMPACT item, and the BiS List: one row per gear slot like wowtbc.gg, BIS and IMPACT items comma-separated, an IMPACT item replacing the BIS ones of its slot, with a Looté mark and date per item), Classement Impact (top 5 per item as cards, the full calculation when one item is picked), Roster, Objets, Loots and Présence of the active tier. Items link to Wowhead (Config *Version Wowhead*); the parse links to the character on Warcraft Logs and, for TBC, an Armory link is shown (both built from Config *Serveur WCL*, the only Config value that reaches the page). Filter choices are remembered per browser. Data is cached for one minute.

The web app runs as the owner and opens for anyone with the link, without a Google account (`appsscript.json` > `webapp`).

- Create the deployment once: `clasp deploy --description "Portail raiders"`. It prints the deployment ID; the link is `https://script.google.com/macros/s/<deployment ID>/exec`.
- After each `clasp push`, update the same link: `clasp deploy -i <deployment ID> --description "Portail raiders"`. Without `-i`, a new link is created.
- To stop sharing, archive the deployment in the Apps Script editor (**Deploy > Manage deployments**).

## Tests

The `tests/story-4-*.html`, `tests/portal.html` and `tests/test-data.html` pages run the script against a fake Sheets API (`tests/harness.js`), with shared assertions and fixtures in `tests/helpers.js`. Each page prints `PASS: <n> assertions` or `FAIL: …` in its DOM.

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
