// Shared assertions and workbook fixtures for the story-4-* test pages. Load after harness.js.
var testAssertions = 0;

function equal(actual, expected, label) {
  testAssertions += 1;
  if (actual !== expected) {
    throw new Error(label + ': expected ' + expected + ', got ' + actual);
  }
}

function truthy(value, label) {
  testAssertions += 1;
  if (!value) {
    throw new Error(label + ': expected truthy value');
  }
}

function contains(text, expectedSubstring, label) {
  testAssertions += 1;
  if (String(text).indexOf(expectedSubstring) === -1) {
    throw new Error(label + ': expected "' + text + '" to contain "' + expectedSubstring + '"');
  }
}

function withHarness(fn) {
  TracerHarness.install();
  try {
    fn();
  } finally {
    TracerHarness.uninstall();
  }
}

function loadJsonSync_(path) {
  var request = new XMLHttpRequest();
  request.open('GET', path, false);
  request.send(null);
  if (request.status !== 0 && request.status !== 200) {
    throw new Error('Unable to load ' + path + ': status ' + request.status);
  }
  return JSON.parse(request.responseText);
}

function textCell_(value) {
  return { userEnteredValue: { stringValue: String(value) } };
}

function numberCell_(value) {
  return { userEnteredValue: { numberValue: Number(value) } };
}

function writeCells_(sheetId, rowIndex, columnIndex, values) {
  Sheets.Spreadsheets.batchUpdate({ requests: [{
    updateCells: {
      start: { sheetId: sheetId, rowIndex: rowIndex, columnIndex: columnIndex },
      rows: [{ values: values.map(function (value) {
        return typeof value === 'number' ? numberCell_(value) : textCell_(value);
      }) }],
      fields: 'userEnteredValue'
    }
  }] }, SpreadsheetApp.getActive().getId());
}

// Every tab with its key header row, Ana/Bob/Cid in Roster, then setup; two Objets Caster DPS items.
function seedCoreTabs_() {
  TABS.forEach(function (tab) {
    if (tab.name === 'Roster') {
      return;
    }
    TracerHarness.seedSheet(tab.name, [keysOf_(tab)]);
  });
  TracerHarness.seedSheet('Roster', [
    keysOf_(tabByName_('Roster')),
    ['Ana', 'Raid 1', 'Mage', '', '', ''],
    ['Bob', 'Raid 1', 'Mage', '', '', ''],
    ['Cid', 'Raid 2', 'Mage', '', '', '']
  ]);
  setUpWorkbook();

  var casterSheetId = SpreadsheetApp.getActive().getSheetByName('Objets Caster DPS').getSheetId();
  writeCells_(casterSheetId, 3, 0, [777, 'Bâton ancien']);
  writeCells_(casterSheetId, 4, 0, [888, 'Anneau céleste']);
}

// Marks raidId as started: Config Raid en cours, its Raids row and the Roster protection.
function setStartedRaid_(raidId) {
  var spreadsheet = SpreadsheetApp.getActive();
  var configId = spreadsheet.getSheetByName('Config').getSheetId();
  var raidsId = spreadsheet.getSheetByName('Raids').getSheetId();

  writeCells_(configId, 1, 0, ['forever-t1', '2026-10-01', raidId]);
  writeCells_(raidsId, 1, 0, [raidId]);

  Sheets.Spreadsheets.batchUpdate({ requests: [{
    addProtectedRange: {
      protectedRange: {
        range: { sheetId: spreadsheet.getSheetByName('Roster').getSheetId() },
        warningOnly: true,
        description: RAID_OPEN_PROTECTION_PREFIX + ' ' + raidId + ' : entrées de score figées'
      }
    }
  }] }, spreadsheet.getId());

  return columnOf_(tabByName_('Config'), 'openRaidId');
}

// WCL token then the sample report.
function queueWclSuccess_() {
  var fixture = loadJsonSync_('../fixtures/wcl-report-sample.json');
  TracerHarness.setFetchResponses([
    { statusCode: 200, body: { access_token: 'token' } },
    { statusCode: 200, body: fixture }
  ]);
}
