var DIAGNOSTICS_SHEET_NAME = 'Diagnostics';
var DIAGNOSTICS_SHEET_ID = 41041;
var DIAGNOSTICS_MISSING_SHEET_ID = 919191;

function onOpen() {
  var ui = SpreadsheetApp.getUi();

  ui
    .createMenu('Loot priority')
    .addItem('Sync attendance', 'runAttendanceSync')
    .addItem('Export raid snapshot', 'exportRaidSnapshot')
    .addItem('Import raid ledger', 'importRaidLedger')
    .addItem('Archive tier and activate next', 'archiveTierAndActivateNext')
    .addSubMenu(
      ui
        .createMenu('Diagnostics')
        .addItem('Test write', 'runDiagnosticsTestWrite')
        .addItem('Test failed write', 'runDiagnosticsTestFailedWrite')
    )
    .addToUi();
}

function runDiagnosticsTestWrite() {
  runDiagnostics_(false);
}

function runDiagnosticsTestFailedWrite() {
  runDiagnostics_(true);
}

function runDiagnostics_(forceFailure) {
  var ui = SpreadsheetApp.getUi();

  try {
    applyBatch_(function () {
      return buildDiagnosticsRequests_(forceFailure);
    });

    if (forceFailure) {
      ui.alert('Unexpected success: forced failure did not fail.');
      return;
    }

    ui.alert('Diagnostics write completed.');
  } catch (error) {
    ui.alert('Diagnostics failed: ' + error.message);
  }
}

function buildDiagnosticsRequests_(forceFailure) {
  var spreadsheet = SpreadsheetApp.getActive();
  var diagnosticsSheet = spreadsheet.getSheetByName(DIAGNOSTICS_SHEET_NAME);
  var diagnosticsSheetId = DIAGNOSTICS_SHEET_ID;
  var requests = [];

  if (!diagnosticsSheet) {
    requests.push({
      addSheet: {
        properties: {
          sheetId: diagnosticsSheetId,
          title: DIAGNOSTICS_SHEET_NAME
        }
      }
    });
  } else {
    diagnosticsSheetId = diagnosticsSheet.getSheetId();
  }

  requests.push(
    buildAppendCellsRequest_(
      diagnosticsSheetId,
      [
        Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'),
        forceFailure ? 'forced-write' : 'test-write'
      ]
    )
  );

  if (forceFailure) {
    requests.push(
      buildAppendCellsRequest_(DIAGNOSTICS_MISSING_SHEET_ID, ['this', 'must-fail'])
    );
  }

  return requests;
}

function buildAppendCellsRequest_(sheetId, values) {
  return {
    appendCells: {
      sheetId: sheetId,
      rows: [
        {
          values: values.map(function (value) {
            return {
              userEnteredValue: {
                stringValue: String(value)
              }
            };
          })
        }
      ],
      fields: 'userEnteredValue'
    }
  };
}
