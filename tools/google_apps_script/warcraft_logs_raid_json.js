const WCL_CONFIG = Object.freeze({
  TOKEN_URL: 'https://www.warcraftlogs.com/oauth/token',
  API_URL: 'https://www.warcraftlogs.com/api/v2/client',
  SHEET_NAME: 'WCL Raid JSON',
  OUTPUT_FOLDER: 'Warcraft Logs Raid JSON',
  MINIMUM_ATTENDANCE_PERCENT: 25,
  RAID_LOGS_SHEET: 'raid_logs',
  RAID_ID_COLUMN: 5,
  ATTENDEES_JSON_COLUMN: 6,
  FIRST_DATA_ROW: 2
});

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Warcraft Logs')
    .addItem('Populate raid_logs attendees', 'main')
    .addSeparator()
    .addItem('Set up JSON sheet', 'setupRaidJsonSheet')
    .addItem('Generate all JSON files', 'generateAllRaidJsonFiles')
    .addItem('Test JSON generator', 'testRaidJsonGenerator')
    .addItem('Test live example report', 'testLiveWarcraftLogsExample')
    .addToUi();
}

/**
 * Production entry point.
 *
 * For every data row in `raid_logs`:
 * - column E must contain a Warcraft Logs report ID or URL;
 * - column F must be completely empty and contain no formula;
 * - column F receives a compact JSON string array of attendee names whose
 *   attendancePercent is strictly greater than 25.
 *
 * Duplicate report IDs are fetched only once per run. If a report fails, its
 * column F cell stays empty and receives an error note so a later run can retry it.
 */
function process_attendance() {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(1000)) {
    throw new Error('Another raid_logs attendance update is already running.');
  }

  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getSheetByName(WCL_CONFIG.RAID_LOGS_SHEET);
    if (!sheet) {
      throw new Error('Sheet "' + WCL_CONFIG.RAID_LOGS_SHEET + '" was not found.');
    }

    const lastRow = sheet.getLastRow();
    if (lastRow < WCL_CONFIG.FIRST_DATA_ROW) {
      return {processed: 0, failed: 0, pendingReports: 0};
    }

    const rowCount = lastRow - WCL_CONFIG.FIRST_DATA_ROW + 1;
    const raidInputs = sheet.getRange(
      WCL_CONFIG.FIRST_DATA_ROW,
      WCL_CONFIG.RAID_ID_COLUMN,
      rowCount,
      1
    ).getDisplayValues();
    const outputRange = sheet.getRange(
      WCL_CONFIG.FIRST_DATA_ROW,
      WCL_CONFIG.ATTENDEES_JSON_COLUMN,
      rowCount,
      1
    );
    const existingOutputs = outputRange.getDisplayValues();
    const outputFormulas = outputRange.getFormulas();
    const rowsByReportCode = {};
    let failed = 0;

    raidInputs.forEach(function (row, index) {
      const raidInput = String(row[0] || '').trim();
      const existingOutput = String(existingOutputs[index][0] || '').trim();
      const existingFormula = String(outputFormulas[index][0] || '').trim();

      // A formula counts as populated even when it currently displays an empty string.
      if (!raidInput || existingOutput || existingFormula) {
        return;
      }

      const sheetRow = WCL_CONFIG.FIRST_DATA_ROW + index;
      const reportCode = extractReportCode_(raidInput);
      if (!reportCode) {
        sheet.getRange(sheetRow, WCL_CONFIG.ATTENDEES_JSON_COLUMN)
          .setNote('Invalid Warcraft Logs report ID or URL in column E.');
        failed += 1;
        return;
      }

      if (!rowsByReportCode[reportCode]) {
        rowsByReportCode[reportCode] = [];
      }
      rowsByReportCode[reportCode].push(sheetRow);
    });

    const reportCodes = Object.keys(rowsByReportCode);
    let processed = 0;

    reportCodes.forEach(function (reportCode) {
      try {
        const result = generateRaidJson_(reportCode);
        const compactAttendeesJson = JSON.stringify(result.qualifiedNames);

        rowsByReportCode[reportCode].forEach(function (sheetRow) {
          const cell = sheet.getRange(sheetRow, WCL_CONFIG.ATTENDEES_JSON_COLUMN);
          cell.setNumberFormat('@');
          cell.setValue(compactAttendeesJson);
          cell.clearNote();
          processed += 1;
        });
      } catch (error) {
        rowsByReportCode[reportCode].forEach(function (sheetRow) {
          sheet.getRange(sheetRow, WCL_CONFIG.ATTENDEES_JSON_COLUMN)
            .setNote('Warcraft Logs error: ' + error.message);
          failed += 1;
        });
        console.error('Failed report ' + reportCode + ': ' + error.stack);
      }
    });

    SpreadsheetApp.flush();
    const summary = {
      processed: processed,
      failed: failed,
      pendingReports: reportCodes.length
    };
    spreadsheet.toast(
      'Updated ' + processed + ' row(s); ' + failed + ' failed.',
      'Warcraft Logs',
      5
    );
    return summary;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Creates a sheet where column A contains one report ID or report URL per row.
 */
function setupRaidJsonSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(WCL_CONFIG.SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(WCL_CONFIG.SHEET_NAME);
  }

  sheet.getRange('A1:D1').setValues([[
    'Raid ID or Warcraft Logs URL',
    'JSON file',
    'Status',
    'Generated at'
  ]]);
  sheet.getRange('A1:D1').setFontWeight('bold');
  sheet.setFrozenRows(1);

  if (!sheet.getRange('A2').getValue()) {
    sheet.getRange('A2').setValue('JLtYATQjzR9wc3mH');
  }

  sheet.autoResizeColumns(1, 4);
  spreadsheet.setActiveSheet(sheet);
}

/**
 * Generates one <report ID>.json Drive file for every non-empty row in column A.
 */
function generateAllRaidJsonFiles() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(WCL_CONFIG.SHEET_NAME);

  if (!sheet) {
    throw new Error('Run setupRaidJsonSheet first.');
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    throw new Error('Add at least one Warcraft Logs report ID in column A.');
  }

  const values = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
  const folder = getOrCreateOutputFolder_();

  values.forEach(function (row, index) {
    const sheetRow = index + 2;
    const input = String(row[0]).trim();

    if (!input) {
      return;
    }

    const reportCode = extractReportCode_(input);
    if (!reportCode) {
      sheet.getRange(sheetRow, 2, 1, 3).setValues([[
        '',
        'Invalid report ID or URL',
        new Date()
      ]]);
      return;
    }

    sheet.getRange(sheetRow, 3).setValue('Loading...');
    SpreadsheetApp.flush();

    try {
      const result = generateRaidJson_(reportCode);
      const file = replaceJsonFile_(folder, reportCode + '.json', result.json);
      replaceJsonFile_(
        folder,
        reportCode + '_attendees.json',
        result.qualifiedNamesJson
      );

      sheet.getRange(sheetRow, 2, 1, 3).setValues([[
        file.getUrl(),
        result.qualifiedNames.length + ' names above 25%; ' +
        result.document.summary.bossPulls + ' boss pulls',
        new Date()
      ]]);
    } catch (error) {
      sheet.getRange(sheetRow, 2, 1, 3).setValues([[
        '',
        'Error: ' + error.message,
        new Date()
      ]]);
    }
  });

  sheet.getRange(2, 4, Math.max(lastRow - 1, 1), 1)
    .setNumberFormat('yyyy-mm-dd hh:mm:ss');
  sheet.autoResizeColumns(1, 4);
}

/**
 * Fetches a report and returns both the JSON string and its object representation.
 */
function generateRaidJson_(reportCode) {
  const report = fetchWarcraftLogsReport_(reportCode);
  const document = buildRaidDocument_(report, new Date());
  const qualifiedNames = buildQualifiedAttendeeNames_(
    document,
    WCL_CONFIG.MINIMUM_ATTENDANCE_PERCENT
  );

  return {
    document: document,
    json: JSON.stringify(document, null, 2),
    qualifiedNames: qualifiedNames,
    qualifiedNamesJson: JSON.stringify(qualifiedNames, null, 2)
  };
}

function buildQualifiedAttendeeNames_(document, minimumAttendancePercent) {
  return document.attendees.filter(function (attendee) {
    return attendee.attendancePercent > minimumAttendancePercent;
  }).map(function (attendee) {
    return attendee.name;
  });
}

function fetchWarcraftLogsReport_(reportCode) {
  const accessToken = getWarcraftLogsAccessToken_();
  const query = [
    'query RaidAttendance($code: String!) {',
    '  reportData {',
    '    report(code: $code, allowUnlisted: true) {',
    '      code',
    '      startTime',
    '      endTime',
    '      masterData(translate: true) {',
    '        actors(type: "Player") {',
    '          id',
    '          name',
    '          server',
    '          subType',
    '        }',
    '      }',
    '      fights {',
    '        id',
    '        name',
    '        encounterID',
    '        kill',
    '        inProgress',
    '        startTime',
    '        endTime',
    '        friendlyPlayers',
    '      }',
    '    }',
    '  }',
    '}'
  ].join('\n');

  const response = UrlFetchApp.fetch(WCL_CONFIG.API_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: {Authorization: 'Bearer ' + accessToken},
    payload: JSON.stringify({
      query: query,
      variables: {code: reportCode}
    }),
    muteHttpExceptions: true
  });

  const statusCode = response.getResponseCode();
  const body = response.getContentText();
  let result;

  try {
    result = JSON.parse(body);
  } catch (error) {
    throw new Error('Warcraft Logs returned invalid JSON (HTTP ' + statusCode + ').');
  }

  if (statusCode < 200 || statusCode >= 300 || (result.errors || []).length) {
    const messages = (result.errors || []).map(function (item) {
      return item.message;
    });
    throw new Error(messages.join('; ') || result.error_description ||
      result.error || 'Warcraft Logs HTTP error ' + statusCode);
  }

  const report = result.data && result.data.reportData && result.data.reportData.report;
  if (!report) {
    throw new Error('Report not found or inaccessible. Private reports need user OAuth.');
  }

  return report;
}

/**
 * Pure transformation kept separate so it can be tested without API credentials.
 * Attendance is the union of friendly players on completed boss encounters.
 */
function buildRaidDocument_(report, generatedAt) {
  const actors = (report.masterData && report.masterData.actors) || [];
  const allFights = report.fights || [];
  let countedFights = allFights.filter(function (fight) {
    return Number(fight.encounterID) > 0 && fight.inProgress !== true;
  });

  // Some unusual reports contain no detected boss encounter. In that case,
  // use completed logged fights so the resulting attendee list is still useful.
  if (!countedFights.length) {
    countedFights = allFights.filter(function (fight) {
      return fight.inProgress !== true;
    });
  }

  const actorById = {};
  actors.forEach(function (actor) {
    actorById[String(actor.id)] = actor;
  });

  const attendeeById = {};
  countedFights.forEach(function (fight) {
    (fight.friendlyPlayers || []).forEach(function (actorId) {
      const key = String(actorId);
      const actor = actorById[key];
      if (!actor) {
        return;
      }

      if (!attendeeById[key]) {
        attendeeById[key] = {
          name: actor.name || '',
          realm: actor.server || '',
          class: actor.subType || '',
          bossPullsAttended: 0,
          killsAttended: 0,
          fights: []
        };
      }

      const attendee = attendeeById[key];
      attendee.bossPullsAttended += 1;
      attendee.killsAttended += fight.kill === true ? 1 : 0;
      attendee.fights.push({
        id: fight.id,
        encounterId: fight.encounterID,
        name: fight.name,
        kill: fight.kill === true
      });
    });
  });

  const pullCount = countedFights.length;
  const attendees = Object.keys(attendeeById).map(function (key) {
    const attendee = attendeeById[key];
    attendee.attendancePercent = pullCount
      ? Number((attendee.bossPullsAttended * 100 / pullCount).toFixed(2))
      : 0;
    return attendee;
  }).sort(function (left, right) {
    return left.name.localeCompare(right.name);
  });

  return {
    raidId: report.code,
    generatedAt: generatedAt.toISOString(),
    report: {
      startTime: new Date(report.startTime).toISOString(),
      endTime: new Date(report.endTime).toISOString()
    },
    summary: {
      attendees: attendees.length,
      bossPulls: pullCount,
      kills: countedFights.filter(function (fight) { return fight.kill === true; }).length
    },
    attendees: attendees
  };
}

function getWarcraftLogsAccessToken_() {
  const cache = CacheService.getScriptCache();
  const cachedToken = cache.get('WCL_ACCESS_TOKEN');
  if (cachedToken) {
    return cachedToken;
  }

  const properties = PropertiesService.getScriptProperties();
  const clientId = properties.getProperty('WCL_CLIENT_ID');
  const clientSecret = properties.getProperty('WCL_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    throw new Error('Set WCL_CLIENT_ID and WCL_CLIENT_SECRET in Script Properties.');
  }

  const response = UrlFetchApp.fetch(WCL_CONFIG.TOKEN_URL, {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    headers: {
      Authorization: 'Basic ' + Utilities.base64Encode(clientId + ':' + clientSecret)
    },
    payload: {grant_type: 'client_credentials'},
    muteHttpExceptions: true
  });

  const statusCode = response.getResponseCode();
  const result = JSON.parse(response.getContentText());
  if (statusCode < 200 || statusCode >= 300 || !result.access_token) {
    throw new Error(result.error_description || result.error ||
      'Warcraft Logs authentication failed (HTTP ' + statusCode + ').');
  }

  const cacheSeconds = Math.max(Math.min((result.expires_in || 3600) - 60, 21600), 60);
  cache.put('WCL_ACCESS_TOKEN', result.access_token, cacheSeconds);
  return result.access_token;
}

function getOrCreateOutputFolder_() {
  const folders = DriveApp.getFoldersByName(WCL_CONFIG.OUTPUT_FOLDER);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(WCL_CONFIG.OUTPUT_FOLDER);
}

function replaceJsonFile_(folder, fileName, contents) {
  const existingFiles = folder.getFilesByName(fileName);
  if (existingFiles.hasNext()) {
    const existingFile = existingFiles.next();
    existingFile.setContent(contents);
    return existingFile;
  }
  return folder.createFile(fileName, contents, 'application/json');
}

function extractReportCode_(value) {
  const text = String(value || '').trim();
  const urlMatch = text.match(/\/reports\/([A-Za-z0-9]+)/i);
  if (urlMatch) {
    return urlMatch[1];
  }
  return /^[A-Za-z0-9]+$/.test(text) ? text : '';
}

/**
 * Credential-free in-sheet test. It throws on failure and returns a success
 * message on success. The menu exposes this as "Test JSON generator".
 */
function testRaidJsonGenerator() {
  const mockReport = {
    code: 'TEST123',
    startTime: Date.UTC(2026, 7, 1, 18, 0, 0),
    endTime: Date.UTC(2026, 7, 1, 21, 0, 0),
    masterData: {actors: [
      {id: 1, name: 'Alice', server: 'RealmOne', subType: 'Priest'},
      {id: 2, name: 'Bob', server: 'RealmTwo', subType: 'Warrior'},
      {id: 3, name: 'TrashOnly', server: 'RealmOne', subType: 'Rogue'}
    ]},
    fights: [
      {id: 10, name: 'Trash', encounterID: 0, kill: false, friendlyPlayers: [1, 3]},
      {id: 11, name: 'Boss One', encounterID: 101, kill: true, friendlyPlayers: [1, 2]},
      {id: 12, name: 'Boss Two', encounterID: 102, kill: false, friendlyPlayers: [1]}
    ]
  };

  const document = buildRaidDocument_(mockReport, new Date('2026-08-02T00:00:00.000Z'));
  assertEqual_(document.raidId, 'TEST123', 'raidId');
  assertEqual_(document.summary.attendees, 2, 'attendee count');
  assertEqual_(document.summary.bossPulls, 2, 'boss pull count');
  assertEqual_(document.summary.kills, 1, 'kill count');
  assertEqual_(document.attendees[0].name, 'Alice', 'alphabetical attendee order');
  assertEqual_(document.attendees[0].attendancePercent, 100, 'Alice attendance');
  assertEqual_(document.attendees[1].attendancePercent, 50, 'Bob attendance');
  assertEqual_(extractReportCode_('https://www.warcraftlogs.com/reports/JLtYATQjzR9wc3mH'),
    'JLtYATQjzR9wc3mH', 'report URL parsing');
  const qualifiedNames = buildQualifiedAttendeeNames_({attendees: [
    {name: 'Excluded', attendancePercent: 25},
    {name: 'Included', attendancePercent: 25.01}
  ]}, 25);
  assertEqual_(qualifiedNames.length, 1, 'strict attendance threshold count');
  assertEqual_(qualifiedNames[0], 'Included', 'strict attendance threshold name');

  SpreadsheetApp.getUi().alert('All 11 Warcraft Logs JSON generator tests passed.');
  return 'All 11 Warcraft Logs JSON generator tests passed.';
}

/**
 * Authenticated integration test using the example report from the sheet.
 * Requires valid WCL_CLIENT_ID and WCL_CLIENT_SECRET Script Properties.
 */
function testLiveWarcraftLogsExample() {
  const result = generateRaidJson_('JLtYATQjzR9wc3mH');
  assertEqual_(result.document.raidId, 'JLtYATQjzR9wc3mH', 'live report ID');

  if (!result.document.attendees.length) {
    throw new Error('The live report returned no attendees.');
  }
  if (!result.document.summary.bossPulls) {
    throw new Error('The live report returned no boss pulls.');
  }

  const message = 'Live API test passed: ' + result.document.attendees.length +
    ' attendees across ' + result.document.summary.bossPulls + ' boss pulls.';
  SpreadsheetApp.getUi().alert(message);
  return message;
}

function assertEqual_(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(label + ': expected ' + expected + ', got ' + actual);
  }
}
