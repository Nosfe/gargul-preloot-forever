# Warcraft Logs raid JSON for Google Sheets

Paste `warcraft_logs_raid_json.js` into a spreadsheet-bound Google Apps Script project.

## Production `main()` function

The primary entry point is `main()`:

1. It opens the sheet named `raid_logs`.
2. Starting at row 2, it reads Warcraft Logs report IDs or URLs from column E.
3. It processes only rows where column F is blank and has no formula.
4. It writes compact JSON such as `["Alice","Bob"]` into column F, including only
   attendees whose `attendancePercent` is strictly greater than 25.

Duplicate report IDs are requested only once during a run. Failed rows remain blank and
receive a cell note containing the error, allowing the next invocation to retry them.

## Setup

1. Create a Warcraft Logs API client.
2. In Apps Script, open **Project Settings > Script Properties**.
3. Add `WCL_CLIENT_ID` and `WCL_CLIENT_SECRET`.
4. Run `setupRaidJsonSheet` once and approve the requested permissions.
5. Put one report ID or report URL per row in column A.
6. Run **Warcraft Logs > Generate all JSON files**.

The script creates or updates `<report ID>.json` files in the Google Drive folder
`Warcraft Logs Raid JSON`. Column B receives each file's Drive URL.

Use **Warcraft Logs > Test JSON generator** to run the credential-free fixture test.
The fixture verifies report-code parsing, trash exclusion, attendee union, pull counts,
kill counts, sorting, and attendance percentages.

After adding API credentials, use **Warcraft Logs > Test live example report** to run
an authenticated integration test against `JLtYATQjzR9wc3mH`.

Client credentials can access public API information. Private reports require the
Warcraft Logs user OAuth flow and are not supported by this script.

## Local PowerShell test and export

The local runner does not require Google Sheets, Node, or Python.

1. Fill `WCL_CLIENT_ID` and `WCL_CLIENT_SECRET` in `.env`.
2. Put one report ID or full report URL per row in `raid_ids.csv` under `raid_id`.
3. From this directory, run:

   ```text
   .\run_local.cmd
   ```

Two files are written to `output` for every valid CSV row:

- `<report ID>.json` contains the complete report attendance data.
- `<report ID>_attendees.json` is a JSON array containing only player names whose
  `attendancePercent` is strictly greater than 25. A value of exactly 25 is excluded.

Change `OUTPUT_DIR` in `.env` to use a different directory.

Run the credential-free local transformation test with:

```powershell
.\run_local.cmd -Test
```

The `.cmd` launcher uses a process-scoped execution-policy bypass because Windows may
block direct `.ps1` execution. It does not modify the machine or user execution policy.
