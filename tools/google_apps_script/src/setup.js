// Menu action: creates or extends the data tabs in one locked batch; safe to run again.
function setUpWorkbook() {
  var ui = SpreadsheetApp.getUi();
  var plan = null;

  try {
    // Read and plan inside the lock so another action cannot change the tabs in between.
    applyBatch_(function () {
      var existingHeadersByName = readExistingHeadersByName_();
      plan = buildSetupPlan_(existingHeadersByName);
      return plan.requests;
    });

    if (!plan || plan.requests.length === 0) {
      ui.alert('Workbook is already set up.');
      return;
    }

    var parts = ['Workbook setup complete.'];
    if (plan.createdTabs.length) {
      parts.push('Created tabs: ' + plan.createdTabs.join(', ') + '.');
    }
    if (plan.extendedTabs.length) {
      parts.push('Extended headers: ' + plan.extendedTabs.join(', ') + '.');
    }

    ui.alert(parts.join(' '));
  } catch (error) {
    ui.alert('Workbook setup failed: ' + error.message);
  }
}

// Requests only, without the summary lists.
function buildSetupRequests_(existingHeadersByName) {
  return buildSetupPlan_(existingHeadersByName).requests;
}

// Missing tab -> create it with rules; header prefix -> append the missing headers; anything else throws (nothing written).
function buildSetupPlan_(existingHeadersByName) {
  var requests = [];
  var createdTabs = [];
  var extendedTabs = [];

  for (var i = 0; i < TABS.length; i += 1) {
    var tab = TABS[i];
    var existing = existingHeadersByName[tab.name];

    // Rules are added only at creation so a re-run never duplicates them.
    if (!existing) {
      createdTabs.push(tab.name);
      requests = requests
        .concat(buildCreateTabRequests_(tab))
        .concat(buildValidationRequestsForTab_(tab))
        .concat(buildConditionalFormatRequestsForTab_(tab));
      continue;
    }

    validateHeaderCompatibility_(tab, existing.headers);

    if (existing.headers.length < tab.headers.length) {
      var missingCount = tab.headers.length - existing.headers.length;
      extendedTabs.push(tab.name + ' (+' + missingCount + ')');
      requests.push(
        buildHeaderAppendRequest_(
          existing.sheetId,
          existing.headers.length,
          tab.headers.slice(existing.headers.length)
        )
      );
    }
  }

  return {
    requests: requests,
    createdTabs: createdTabs,
    extendedTabs: extendedTabs
  };
}

// Row 1 of each contract tab that already exists, keyed by tab name.
function readExistingHeadersByName_() {
  var spreadsheet = SpreadsheetApp.getActive();
  var headersByName = Object.create(null);

  for (var i = 0; i < TABS.length; i += 1) {
    var tab = TABS[i];
    var sheet = spreadsheet.getSheetByName(tab.name);
    if (!sheet) {
      continue;
    }

    var lastColumn = sheet.getLastColumn();
    if (lastColumn <= 0) {
      headersByName[tab.name] = {
        sheetId: sheet.getSheetId(),
        headers: []
      };
      continue;
    }

    var rows = sheet.getDataRange().getValues();
    var headerRow = rows.length ? rows[0] : [];
    var headers = headerRow.slice(0, lastColumn).map(function (value) {
      if (value === null || value === undefined) {
        return '';
      }
      return String(value);
    });
    // getDataRange pads row 1 to the widest used column on the sheet.
    while (headers.length && headers[headers.length - 1] === '') {
      headers.pop();
    }
    headersByName[tab.name] = {
      sheetId: sheet.getSheetId(),
      headers: headers
    };
  }

  return headersByName;
}

// Existing headers must be an exact prefix of the contract.
function validateHeaderCompatibility_(tab, existingHeaders) {
  if (existingHeaders.length > tab.headers.length) {
    throw headerConflictError_(tab.name, existingHeaders, tab.headers);
  }

  for (var i = 0; i < existingHeaders.length; i += 1) {
    if (existingHeaders[i] !== tab.headers[i]) {
      throw headerConflictError_(tab.name, existingHeaders, tab.headers);
    }
  }
}

function headerConflictError_(tabName, existingHeaders, expectedHeaders) {
  return new Error(
    'Header conflict in tab "' + tabName + '". Existing: [' + existingHeaders.join(', ') +
      ']. Expected prefix of: [' + expectedHeaders.join(', ') + '].'
  );
}

function buildCreateTabRequests_(tab) {
  return [
    {
      addSheet: {
        properties: {
          sheetId: tab.sheetId,
          title: tab.name,
          gridProperties: {
            frozenRowCount: 1
          }
        }
      }
    },
    buildHeaderAppendRequest_(tab.sheetId, 0, tab.headers)
  ];
}

// Writes header names into row 1 starting at startColumn (0-based).
function buildHeaderAppendRequest_(sheetId, startColumn, headers) {
  return {
    updateCells: {
      start: {
        sheetId: sheetId,
        rowIndex: 0,
        columnIndex: startColumn
      },
      rows: [
        {
          values: headers.map(function (header) {
            return {
              userEnteredValue: {
                stringValue: header
              }
            };
          })
        }
      ],
      fields: 'userEnteredValue'
    }
  };
}

// Strict dropdowns and ranges matching the Interchange v1 limits; blank cells stay allowed.
function buildValidationRequestsForTab_(tab) {
  var requests = [];

  if (tab.name === 'Roster') {
    requests.push(
      buildDataValidationRequest_(tab.sheetId, columnOf_(tab, 'role'), {
        condition: {
          type: 'ONE_OF_LIST',
          values: [
            { userEnteredValue: 'DPS' },
            { userEnteredValue: 'HEALER' },
            { userEnteredValue: 'TANK' }
          ]
        },
        strict: true,
        showCustomUi: true,
        inputMessage: 'Role must be DPS, HEALER or TANK.'
      })
    );

    requests.push(
      buildDataValidationRequest_(tab.sheetId, columnOf_(tab, 'tankPriority'), {
        condition: {
          type: 'ONE_OF_LIST',
          values: [{ userEnteredValue: 'MT1' }, { userEnteredValue: 'MT2' }]
        },
        strict: true,
        showCustomUi: true,
        inputMessage: 'Tank priority must be MT1 or MT2.'
      })
    );

    requests.push(
      buildDataValidationRequest_(tab.sheetId, columnOf_(tab, 'dpsParse'), {
        condition: {
          type: 'NUMBER_BETWEEN',
          values: [{ userEnteredValue: '1' }, { userEnteredValue: '100' }]
        },
        strict: true,
        inputMessage: 'Parse must be between 1 and 100.'
      })
    );

    requests.push(
      buildDataValidationRequest_(tab.sheetId, columnOf_(tab, 'gainFraction'), {
        condition: {
          type: 'NUMBER_BETWEEN',
          values: [{ userEnteredValue: '0' }, { userEnteredValue: '1' }]
        },
        strict: true,
        inputMessage: 'Gain fraction must be between 0 and 1.'
      })
    );
  }

  if (tab.name === 'TierItems') {
    requests.push(
      buildDataValidationRequest_(tab.sheetId, columnOf_(tab, 'status'), {
        condition: {
          type: 'ONE_OF_LIST',
          values: [
            { userEnteredValue: 'BIS' },
            { userEnteredValue: 'ALT_BIS' },
            { userEnteredValue: 'IMPACT' },
            { userEnteredValue: 'TIER' },
            { userEnteredValue: 'CLASS_BOUND' },
            { userEnteredValue: 'NORMAL' }
          ]
        },
        strict: true,
        showCustomUi: true,
        inputMessage: 'Status must be one of the defined item classes.'
      })
    );
  }

  return requests;
}

// Whole column below the header (no endRowIndex = to the bottom of the sheet).
function buildDataValidationRequest_(sheetId, columnIndex, rule) {
  return {
    setDataValidation: {
      range: {
        sheetId: sheetId,
        startRowIndex: 1,
        startColumnIndex: columnIndex,
        endColumnIndex: columnIndex + 1
      },
      rule: rule
    }
  };
}

// Live highlighting of bad names. EXACT is used because COUNTIF ignores case;
// INDIRECT is required because conditional formats cannot reference another tab directly.
function buildConditionalFormatRequestsForTab_(tab) {
  var requests = [];

  // Roster: duplicate raiderKey.
  if (tab.name === 'Roster') {
    requests.push(
      buildConditionalFormatRequest_(
        tab.sheetId,
        0,
        1,
        '=AND($A2<>"",SUMPRODUCT(--EXACT($A$2:$A,$A2))>1)'
      )
    );
  }

  // Rerolls: alt name repeated or equal to a raider (column A); main not in Roster (column B).
  if (tab.name === 'Rerolls') {
    requests.push(
      buildConditionalFormatRequest_(
        tab.sheetId,
        0,
        1,
        '=AND($A2<>"",SUMPRODUCT(--EXACT($A$2:$A,$A2))+SUMPRODUCT(--EXACT(INDIRECT("Roster!A2:A"),$A2))>1)'
      )
    );

    requests.push(
      buildConditionalFormatRequest_(
        tab.sheetId,
        1,
        2,
        '=AND($B2<>"",SUMPRODUCT(--EXACT(INDIRECT("Roster!A2:A"),$B2))=0)'
      )
    );
  }

  return requests;
}

// Light red background on matching cells, rows 2 and below.
function buildConditionalFormatRequest_(sheetId, startColumnIndex, endColumnIndex, formula) {
  return {
    addConditionalFormatRule: {
      rule: {
        ranges: [
          {
            sheetId: sheetId,
            startRowIndex: 1,
            startColumnIndex: startColumnIndex,
            endColumnIndex: endColumnIndex
          }
        ],
        booleanRule: {
          condition: {
            type: 'CUSTOM_FORMULA',
            values: [{ userEnteredValue: formula }]
          },
          format: {
            backgroundColor: {
              red: 1,
              green: 0.9,
              blue: 0.9
            }
          }
        }
      },
      index: 0
    }
  };
}
