// Menu action: creates missing tabs and (re)applies the whole layout in one locked batch; safe to run again.
function setUpWorkbook() {
  var ui = SpreadsheetApp.getUi();

  try {
    // Read and plan inside the lock so another action cannot change the tabs in between.
    applyBatch_(function () {
      var spreadsheet = SpreadsheetApp.getActive();
      var separator = formulaArgSeparator_();
      var existingHeadersByName = readExistingHeadersByName_();
      // Existing rules and banding are needed so they can be replaced instead of duplicated.
      var sheetsMetadata = Sheets.Spreadsheets.get(spreadsheet.getId(), {
        fields: 'sheets(properties.sheetId,conditionalFormats,bandedRanges.bandedRangeId)'
      });
      var plan = buildSetupPlan_(existingHeadersByName, sheetsMetadata, separator);
      return plan.requests;
    });

    ui.alert('Workbook layout applied.');
  } catch (error) {
    ui.alert('Workbook setup failed: ' + error.message);
  }
}

// Requests only (test entry point).
function buildSetupRequests_(existingHeadersByName, sheetsMetadata, argSeparator) {
  return buildSetupPlan_(existingHeadersByName, sheetsMetadata, argSeparator).requests;
}

// Rule formulas are parsed like typed input, so locales with a decimal comma (e.g. fr_FR) need ';'.
function formulaArgSeparator_() {
  var locale = String(SpreadsheetApp.getActive().getSpreadsheetLocale() || '').replace('_', '-');
  try {
    return (1.5).toLocaleString(locale).indexOf(',') !== -1 ? ';' : ',';
  } catch (error) {
    return ',';
  }
}

// Per tab: create if missing (else check headers), write labels and notes, style, validate,
// then delete the old rules/banding and add the current ones. A header conflict throws: nothing is written.
function buildSetupPlan_(existingHeadersByName, sheetsMetadata, argSeparator) {
  var separator = argSeparator || ',';
  // Column migrations run first: the _Listes lookup written by the grids would otherwise shift with an inserted column.
  var requests = buildLegacyTabMigrationRequests_(existingHeadersByName);
  // Grids next: they delete obsolete tabs and create _Listes, which the Roster Spé dropdown references.
  // Grids read live sheet data inside the lock, so this part of the plan is not pure.
  requests = requests.concat(buildGridRequests_(separator));
  var effectiveHeadersByName = effectiveHeadersByName_(existingHeadersByName);
  var deletedSheetIds = deletedSheetIdsFromRequests_(requests);
  var metadataBySheetId = sheetMetadataById_(sheetsMetadata);

  for (var i = 0; i < TABS.length; i += 1) {
    var tab = TABS[i];
    var existing = effectiveHeadersByName[tab.name];
    var sheetId = tab.sheetId;

    if (existing && deletedSheetIds[existing.sheetId]) {
      existing = null;
    }

    if (!existing) {
      requests = requests.concat(buildCreateTabRequests_(tab));
    } else {
      validateHeaderCompatibility_(tab, existing.headers);
      sheetId = existing.sheetId;
    }

    requests = requests
      .concat(buildHeaderRowRequest_(sheetId, tab))
      .concat(buildHeaderStyleRequests_(sheetId, tab))
      .concat(buildColumnWidthRequests_(sheetId, tab))
      .concat(buildTabColorRequests_(sheetId, tab))
      .concat(buildBoldDataRequests_(sheetId, tab))
      .concat(buildValidationRequestsForTab_(sheetId, tab, separator));

    requests = requests.concat(buildRosterFormulaRequests_(sheetId, tab, separator));
    requests = requests.concat(buildRoleFormulaRequests_(sheetId, tab, separator));

    requests = requests.concat(buildDeleteExistingLayoutRequests_(sheetId, metadataBySheetId));

    requests = requests
      .concat(buildBandingRequests_(sheetId, tab))
      .concat(buildConditionalFormatRequestsForTab_(sheetId, tab, separator));
  }

  requests = requests.concat(buildRoleAndSpecRewriteRequests_(effectiveHeadersByName));

  requests = requests.concat(buildTabOrderRequests_(requests));

  return { requests: requests };
}

// Writes all Roster score formulas for rows 2..201 and applies 3-decimal display on ratio and impact.
function buildRosterFormulaRequests_(sheetId, tab, argSeparator) {
  if (tab.name !== 'Roster') {
    return [];
  }

  var separator = argSeparator || ',';
  var rosterTab = tabByName_('Roster');
  var configTab = tabByName_('Config');
  var nameColumn = columnOf_(rosterTab, 'raiderKey');
  var roleColumn = columnOf_(rosterTab, 'role');
  var parseColumn = columnOf_(rosterTab, 'dpsParse');
  var tierPresenceColumn = columnOf_(rosterTab, 'tierPresence');
  var tierPresenceMaxColumn = columnOf_(rosterTab, 'tierPresenceMax');
  var lifetimePresenceColumn = columnOf_(rosterTab, 'lifetimePresence');
  var lifetimePresenceMaxColumn = columnOf_(rosterTab, 'lifetimePresenceMax');
  var bisLootCountColumn = columnOf_(rosterTab, 'bisLootCount');
  var impactLootCountColumn = columnOf_(rosterTab, 'impactLootCount');
  var bisRatioColumn = columnOf_(rosterTab, 'bisRatio');
  var impactBaseColumn = columnOf_(rosterTab, 'impactBase');
  var nameLetter = columnLetter_(nameColumn);
  var roleLetter = columnLetter_(roleColumn);
  var parseLetter = columnLetter_(parseColumn);
  var tierPresenceLetter = columnLetter_(tierPresenceColumn);
  var tierPresenceMaxLetter = columnLetter_(tierPresenceMaxColumn);
  var lifetimePresenceLetter = columnLetter_(lifetimePresenceColumn);
  var lifetimePresenceMaxLetter = columnLetter_(lifetimePresenceMaxColumn);
  var bisLootCountLetter = columnLetter_(bisLootCountColumn);
  var impactLootCountLetter = columnLetter_(impactLootCountColumn);
  var presenceStart = '$' + PRESENCE_FIRST_RAID_ROW + ':$1000';
  var awardsStart = '$' + AWARDS_FIRST_ROW + ':$1000';
  var presenceSheet = "'" + GRID_TABS.presence.name + "'!";
  var configStartDateRef = configTab.name + '!$' + columnLetter_(columnOf_(configTab, 'bisWindowStart')) + '$2';
  var presenceDateColumn = PRESENCE_DATE_COLUMN + 1;
  var presenceRaidIdColumn = PRESENCE_RAID_ID_COLUMN + 1;
  var awardsDateOffset = AWARDS_DATE_OFFSET;
  var awardsTreatmentOffset = AWARDS_TREATMENT_OFFSET;
  var presenceDateLookup = {
    range: presenceSheet + '$' + columnLetter_(PRESENCE_RAID_ID_COLUMN) + '$' + PRESENCE_FIRST_RAID_ROW + ':$' + columnLetter_(PRESENCE_DATE_COLUMN) + '$1000',
    column: PRESENCE_DATE_COLUMN - PRESENCE_RAID_ID_COLUMN + 1
  };
  var rows = [];

  for (var rowNumber = 2; rowNumber <= 201; rowNumber += 1) {
    var rowValues = [
      { userEnteredValue: { formulaValue: applyArgSeparator_(buildTierPresenceFormula_(nameLetter, rowNumber, presenceSheet, presenceStart, presenceDateColumn, presenceRaidIdColumn, configStartDateRef), separator) } },
      { userEnteredValue: { formulaValue: applyArgSeparator_('=IF($' + nameLetter + rowNumber + '="","",' + buildTierPresenceMaxFormula_(presenceSheet, presenceStart, presenceDateColumn, presenceRaidIdColumn, configStartDateRef).slice(1) + ')', separator) } },
      { userEnteredValue: { formulaValue: applyArgSeparator_(buildLifetimePresenceFormula_(nameLetter, rowNumber, presenceSheet, presenceStart, presenceDateColumn, presenceRaidIdColumn), separator) } },
      { userEnteredValue: { formulaValue: applyArgSeparator_('=IF($' + nameLetter + rowNumber + '="","",' + buildLifetimePresenceMaxFormula_(presenceSheet, presenceStart, presenceDateColumn, presenceRaidIdColumn).slice(1) + ')', separator) } },
      { userEnteredValue: { formulaValue: applyArgSeparator_(buildBisLootFormula_(nameLetter, rowNumber, awardsStart, awardsDateOffset, awardsTreatmentOffset, AWARDS_RAID_ID_OFFSET, presenceDateLookup, configStartDateRef), separator) } },
      { userEnteredValue: { formulaValue: applyArgSeparator_(buildImpactLootFormula_(nameLetter, rowNumber, awardsStart, awardsTreatmentOffset), separator) } },
      { userEnteredValue: { formulaValue: applyArgSeparator_('=IF($' + nameLetter + rowNumber + '="","",($' + tierPresenceLetter + rowNumber + '/$' + tierPresenceMaxLetter + rowNumber + ')/($' + bisLootCountLetter + rowNumber + '+1))', separator) } },
      { userEnteredValue: { formulaValue: applyArgSeparator_('=IF(OR($' + nameLetter + rowNumber + '="",$' + roleLetter + rowNumber + '="' + ROLE_DISPLAY.Tank.value + '"),"",($' + lifetimePresenceLetter + rowNumber + '/$' + lifetimePresenceMaxLetter + rowNumber + ')*IF(N($' + parseLetter + rowNumber + ')=0,1,$' + parseLetter + rowNumber + ')/($' + impactLootCountLetter + rowNumber + '+1))', separator) } }
    ];
    rows.push({ values: rowValues });
  }

  return [
    {
      updateCells: {
        start: {
          sheetId: sheetId,
          rowIndex: 1,
          columnIndex: tierPresenceColumn
        },
        rows: rows,
        fields: 'userEnteredValue'
      }
    },
    {
      repeatCell: {
        range: {
          sheetId: sheetId,
          startRowIndex: 1,
          endRowIndex: 201,
          startColumnIndex: bisRatioColumn,
          endColumnIndex: impactBaseColumn + 1
        },
        cell: {
          userEnteredFormat: {
            numberFormat: {
              type: 'NUMBER',
              pattern: '0.000'
            }
          }
        },
        fields: 'userEnteredFormat.numberFormat'
      }
    }
  ];
}

// Rôle formula on rows 2..201 of Roster and Rerolls: looks up Classe|Spé in the _Listes role table.
function buildRoleFormulaRequests_(sheetId, tab, argSeparator) {
  if (tab.name !== 'Roster' && tab.name !== 'Rerolls') {
    return [];
  }

  var classLetter = columnLetter_(columnOf_(tab, 'class'));
  var specLetter = columnLetter_(columnOf_(tab, 'spec'));
  var keyLetter = columnLetter_(LISTS_LAYOUT.roleKeyColumn);
  var valueLetter = columnLetter_(LISTS_LAYOUT.roleValueColumn);
  var rows = [];

  for (var rowNumber = 2; rowNumber <= 201; rowNumber += 1) {
    var classCell = '$' + classLetter + rowNumber;
    var specCell = '$' + specLetter + rowNumber;
    rows.push({ values: [{ userEnteredValue: { formulaValue: applyArgSeparator_(
      '=IF(OR(' + classCell + '="",' + specCell + '=""),"",IFERROR(INDEX(\'' + LISTS_TAB.name + '\'!$' + valueLetter + '$2:$' + valueLetter + '$200,' +
      'MATCH(' + classCell + '&"|"&' + specCell + ',\'' + LISTS_TAB.name + '\'!$' + keyLetter + '$2:$' + keyLetter + '$200,0)),""))',
      argSeparator || ','
    ) } }] });
  }

  return [{
    updateCells: {
      start: { sheetId: sheetId, rowIndex: 1, columnIndex: columnOf_(tab, 'role') },
      rows: rows,
      fields: 'userEnteredValue'
    }
  }];
}

// WCL parse colours on the parse column: coloured text on white, one exclusive band per rule.
function buildParseColorRules_(sheetId, parseColumn, argSeparator) {
  var cell = '$' + columnLetter_(parseColumn) + '2';
  return WCL_PARSE_COLORS.map(function (band) {
    var tests = ['ISNUMBER(' + cell + ')'];
    if (band.min !== null) {
      tests.push(cell + '>=' + band.min);
    }
    if (band.max !== null) {
      tests.push(cell + '<' + band.max);
    }
    return buildConditionalFormatRequest_(
      sheetId,
      parseColumn,
      parseColumn + 1,
      '=AND(' + tests.join(',') + ')',
      { backgroundColor: rgbHex_('FFFFFF'), textFormat: { foregroundColor: rgbHex_(band.hex), bold: true } },
      argSeparator
    );
  });
}

// Exact (case-sensitive) 1-based column of a raider name in row 1 of a sheet; ARRAYFORMULA makes EXACT compare the whole row.
function exactHeaderMatch_(sheetRef, nameRef) {
  return 'MATCH(TRUE,ARRAYFORMULA(EXACT(' + sheetRef + '$1:$1,' + nameRef + ')),0)';
}

// Présence palier: 1/B counts in the BiS window from Config start date.
function buildTierPresenceFormula_(nameLetter, rowNumber, presenceSheet, presenceStart, presenceDateColumn, presenceRaidIdColumn, configStartDateRef) {
  return '=IF($' + nameLetter + rowNumber + '="","",IFERROR(LET(c,' + exactHeaderMatch_(presenceSheet, '$' + nameLetter + rowNumber) + ',v,INDEX(' + presenceSheet + presenceStart + ',0,c),d,INDEX(' + presenceSheet + presenceStart + ',0,' + presenceDateColumn + '),i,INDEX(' + presenceSheet + presenceStart + ',0,' + presenceRaidIdColumn + '),SUMPRODUCT(' + raidRowTest_('i', 'd') + '*(d>=N(' + configStartDateRef + '))*((v=1)+(v="B")))),0))';
}

// Nombre de raids par palier: raid rows in the BiS window, minimum 1.
function buildTierPresenceMaxFormula_(presenceSheet, presenceStart, presenceDateColumn, presenceRaidIdColumn, configStartDateRef) {
  return '=MAX(1,LET(d,INDEX(' + presenceSheet + presenceStart + ',0,' + presenceDateColumn + '),i,INDEX(' + presenceSheet + presenceStart + ',0,' + presenceRaidIdColumn + '),SUMPRODUCT(' + raidRowTest_('i', 'd') + '*(d>=N(' + configStartDateRef + ')))))';
}

// Présence totale: 1/B counts over every raid row.
function buildLifetimePresenceFormula_(nameLetter, rowNumber, presenceSheet, presenceStart, presenceDateColumn, presenceRaidIdColumn) {
  return '=IF($' + nameLetter + rowNumber + '="","",IFERROR(LET(c,' + exactHeaderMatch_(presenceSheet, '$' + nameLetter + rowNumber) + ',v,INDEX(' + presenceSheet + presenceStart + ',0,c),d,INDEX(' + presenceSheet + presenceStart + ',0,' + presenceDateColumn + '),i,INDEX(' + presenceSheet + presenceStart + ',0,' + presenceRaidIdColumn + '),SUMPRODUCT(' + raidRowTest_('i', 'd') + '*((v=1)+(v="B")))),0))';
}

// Nombre de raids totaux: every raid row, minimum 1.
function buildLifetimePresenceMaxFormula_(presenceSheet, presenceStart, presenceDateColumn, presenceRaidIdColumn) {
  return '=MAX(1,LET(d,INDEX(' + presenceSheet + presenceStart + ',0,' + presenceDateColumn + '),i,INDEX(' + presenceSheet + presenceStart + ',0,' + presenceRaidIdColumn + '),SUMPRODUCT(--' + raidRowTest_('i', 'd') + ')))';
}

// A Présence row is a raid when it has a Raid (ID) or a Date.
function raidRowTest_(raidIdName, dateName) {
  return '((' + raidIdName + '<>"")+(' + dateName + '<>"")>0)';
}

// Loots BiS: BIS treatments in the raider block from the BiS window start. A blank Date falls back to
// the Date of the award's Raid (ID) in Présence; with neither, the award counts.
function buildBisLootFormula_(nameLetter, rowNumber, awardsStart, awardsDateOffset, awardsTreatmentOffset, awardsRaidIdOffset, presenceDateLookup, configStartDateRef) {
  var awards = GRID_TABS.awards.name + '!' + awardsStart;
  return '=IF($' + nameLetter + rowNumber + '="","",IFERROR(LET(c,' + exactHeaderMatch_(GRID_TABS.awards.name + '!', '$' + nameLetter + rowNumber) +
    ',t,INDEX(' + awards + ',0,c+' + awardsTreatmentOffset + ')' +
    ',d,INDEX(' + awards + ',0,c+' + awardsDateOffset + ')' +
    ',r,INDEX(' + awards + ',0,c+' + awardsRaidIdOffset + ')' +
    ',e,ARRAYFORMULA(IF(d<>"",d,IFERROR(VLOOKUP(r,' + presenceDateLookup.range + ',' + presenceDateLookup.column + ',FALSE),"")))' +
    ',SUMPRODUCT((t="BIS")*(((e="")+(e>=N(' + configStartDateRef + ')))>0))),0))';
}

// Loots Impact: IMPACT treatments in the raider block over every row.
function buildImpactLootFormula_(nameLetter, rowNumber, awardsStart, awardsTreatmentOffset) {
  return '=IF($' + nameLetter + rowNumber + '="","",IFERROR(LET(c,' + exactHeaderMatch_(GRID_TABS.awards.name + '!', '$' + nameLetter + rowNumber) + ',SUMPRODUCT(--(INDEX(' + GRID_TABS.awards.name + '!' + awardsStart + ',0,c+' + awardsTreatmentOffset + ')="IMPACT"))),0))';
}

// Returns the sheet ids deleted by requests already queued in the same batch.
function deletedSheetIdsFromRequests_(requests) {
  var ids = Object.create(null);
  requests.forEach(function (request) {
    if (request.deleteSheet && typeof request.deleteSheet.sheetId === 'number') {
      ids[request.deleteSheet.sheetId] = true;
    }
  });
  return ids;
}

// Applies this batch's Roster/Rerolls column migrations to the read headers and rows, so the header check
// and the role/spec rewrite see the real post-migration columns.
function effectiveHeadersByName_(existingHeadersByName) {
  var next = Object.create(null);
  Object.keys(existingHeadersByName || {}).forEach(function (name) {
    next[name] = existingHeadersByName[name];
  });

  var roster = next.Roster;
  if (roster && isLegacyRosterHeaders_(roster.headers || [])) {
    var removed = legacyRosterColumns_(roster.headers);
    var keep = function (_, index) { return removed.indexOf(index) === -1; };
    next.Roster = {
      sheetId: roster.sheetId,
      headers: roster.headers.filter(keep),
      rows: (roster.rows || []).map(function (row) { return (row || []).filter(keep); }),
      hasDataRows: roster.hasDataRows
    };
  }

  roster = next.Roster;
  if (roster && needsRosterGroupColumn_(roster.headers || [])) {
    var groupLabel = labelsOf_(tabByName_('Roster'))[columnOf_(tabByName_('Roster'), 'raidGroup')];
    next.Roster = {
      sheetId: roster.sheetId,
      headers: roster.headers.slice(0, 1).concat([groupLabel], roster.headers.slice(1)),
      rows: (roster.rows || []).map(function (row) {
        var copy = (row || []).slice();
        copy.splice(1, 0, '');
        return copy;
      }),
      hasDataRows: roster.hasDataRows
    };
  }

  var rerolls = next.Rerolls;
  if (rerolls && isLegacyRerollsHeaders_(rerolls.headers || [])) {
    next.Rerolls = {
      sheetId: rerolls.sheetId,
      // Exactly two old columns, so the new contract labels are the post-insert headers.
      headers: labelsOf_(tabByName_('Rerolls')),
      rows: (rerolls.rows || []).map(function (row) {
        var copy = (row || []).slice();
        copy.splice(1, 0, '', '', '', '');
        return copy;
      }),
      hasDataRows: rerolls.hasDataRows
    };
  }

  var config = next.Config;
  var windowColumn = config ? legacyConfigWindowColumn_(config.headers || []) : -1;
  if (windowColumn !== -1) {
    var keepConfig = function (_, index) { return index !== windowColumn; };
    next.Config = {
      sheetId: config.sheetId,
      headers: config.headers.filter(keepConfig),
      rows: (config.rows || []).map(function (row) { return (row || []).filter(keepConfig); }),
      hasDataRows: config.hasDataRows
    };
  }

  return next;
}

// Index of the removed Config BiS window ID column (the BiS window is the tier), else -1.
function legacyConfigWindowColumn_(headers) {
  return indexOfHeader_(headers, ['bisWindowId', 'Fenêtre BiS active (ID)']);
}

// Indexes of the removed Roster columns (tank priority, raider gain), highest first.
function legacyRosterColumns_(headers) {
  return [
    indexOfHeader_(headers, ['tankPriority', 'Priorité tank']),
    indexOfHeader_(headers, ['gainFraction', 'Gain simulé du raider (%)'])
  ].filter(function (index) { return index !== -1; }).sort(function (a, b) { return b - a; });
}

// Adds delete/insert column migrations needed before writing reshaped headers.
function buildLegacyTabMigrationRequests_(existingHeadersByName) {
  var requests = [];
  var roster = existingHeadersByName.Roster;
  var rerolls = existingHeadersByName.Rerolls;
  var config = existingHeadersByName.Config;

  if (config && legacyConfigWindowColumn_(config.headers || []) !== -1) {
    requests.push(buildDeleteColumnRequest_(config.sheetId, legacyConfigWindowColumn_(config.headers)));
  }

  if (roster && isLegacyRosterHeaders_(roster.headers || [])) {
    legacyRosterColumns_(roster.headers).forEach(function (index) {
      requests.push(buildDeleteColumnRequest_(roster.sheetId, index));
    });
  }

  if (roster && needsRosterGroupColumn_(roster.headers || [])) {
    requests.push({
      insertDimension: {
        range: {
          sheetId: roster.sheetId,
          dimension: 'COLUMNS',
          startIndex: 1,
          endIndex: 2
        },
        inheritFromBefore: true
      }
    });
  }

  if (rerolls && isLegacyRerollsHeaders_(rerolls.headers || [])) {
    requests.push({
      insertDimension: {
        range: {
          sheetId: rerolls.sheetId,
          dimension: 'COLUMNS',
          startIndex: 1,
          endIndex: 5
        },
        inheritFromBefore: true
      }
    });
  }

  return requests;
}

// True when Roster still has the removed tank-priority or raider-gain columns.
function isLegacyRosterHeaders_(headers) {
  return indexOfHeader_(headers, ['tankPriority', 'Priorité tank']) !== -1 ||
    indexOfHeader_(headers, ['gainFraction', 'Gain simulé du raider (%)']) !== -1;
}

// True when an existing Roster predates the "Groupe de raid" column (inserted at B, right after the name).
function needsRosterGroupColumn_(headers) {
  return headers.length > 0 && indexOfHeader_(headers, ['raidGroup', 'Groupe de raid']) === -1;
}

// True when Rerolls is exactly the 2-column pre-polish contract; any extra column falls through to the header check.
function isLegacyRerollsHeaders_(headers) {
  if (!headers || headers.length !== 2) {
    return false;
  }
  return (headers[0] === 'rerollName' || headers[0] === 'Reroll (nom exact)') &&
    (headers[1] === 'mainKey' || headers[1] === 'Personnage principal');
}

// First index in headers that matches any candidate, else -1.
function indexOfHeader_(headers, candidates) {
  for (var i = 0; i < headers.length; i += 1) {
    for (var j = 0; j < candidates.length; j += 1) {
      if (headers[i] === candidates[j]) {
        return i;
      }
    }
  }
  return -1;
}

// Builds one deleteDimension request for a single column.
function buildDeleteColumnRequest_(sheetId, index) {
  return {
    deleteDimension: {
      range: {
        sheetId: sheetId,
        dimension: 'COLUMNS',
        startIndex: index,
        endIndex: index + 1
      }
    }
  };
}

// Bold text on every data cell of Roster and Rerolls (rows 2+); only the bold flag is touched.
function buildBoldDataRequests_(sheetId, tab) {
  if (tab.name !== 'Roster' && tab.name !== 'Rerolls') {
    return [];
  }
  return [{
    repeatCell: {
      range: { sheetId: sheetId, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: tab.columns.length },
      cell: { userEnteredFormat: { textFormat: { bold: true } } },
      fields: 'userEnteredFormat.textFormat.bold'
    }
  }];
}

// Moves tabs into TAB_ORDER, using the final id of each title after this batch's adds and deletes.
function buildTabOrderRequests_(plannedRequests) {
  var spreadsheet = SpreadsheetApp.getActive();
  var createdIdByTitle = Object.create(null);
  var deletedIds = Object.create(null);

  plannedRequests.forEach(function (request) {
    if (request.addSheet) {
      createdIdByTitle[request.addSheet.properties.title] = request.addSheet.properties.sheetId;
    }
    if (request.deleteSheet) {
      deletedIds[request.deleteSheet.sheetId] = true;
    }
  });

  var requests = [];
  TAB_ORDER.forEach(function (title) {
    var sheetId = createdIdByTitle[title];
    if (sheetId === undefined) {
      var sheet = spreadsheet.getSheetByName(title);
      if (!sheet || deletedIds[sheet.getSheetId()]) {
        return;
      }
      sheetId = sheet.getSheetId();
    }
    requests.push({
      updateSheetProperties: {
        properties: { sheetId: sheetId, index: requests.length },
        fields: 'index'
      }
    });
  });

  return requests;
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
      headersByName[tab.name] = { sheetId: sheet.getSheetId(), headers: [], rows: [], hasDataRows: false };
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
    while (headers.length && headers[headers.length - 1] === '') {
      headers.pop();
    }

    headersByName[tab.name] = {
      sheetId: sheet.getSheetId(),
      headers: headers,
      rows: rows,
      hasDataRows: hasAnyDataRows_(rows)
    };
  }

  return headersByName;
}

// True when any row below the header contains at least one non-empty value.
function hasAnyDataRows_(rows) {
  for (var rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    var row = rows[rowIndex] || [];
    for (var col = 0; col < row.length; col += 1) {
      if (row[col] !== '' && row[col] !== null && row[col] !== undefined) {
        return true;
      }
    }
  }
  return false;
}

// Each existing header cell must hold its column's label or its old technical key (first 4.2 version).
function validateHeaderCompatibility_(tab, existingHeaders) {
  var keys = keysOf_(tab);
  var labels = labelsOf_(tab);
  var knownByIndex = [];
  var i;

  for (i = 0; i < keys.length; i += 1) {
    // A renamed column still matches its earlier label, so renaming a label never blocks setup.
    knownByIndex.push([keys[i], labels[i]].concat(tab.columns[i].formerLabels || []));
  }

  for (i = 0; i < existingHeaders.length; i += 1) {
    if (i >= knownByIndex.length) {
      throw headerConflictError_(tab.name, existingHeaders, labels);
    }
    if (knownByIndex[i].indexOf(existingHeaders[i]) === -1) {
      throw headerConflictError_(tab.name, existingHeaders, labels);
    }
  }
}

function headerConflictError_(tabName, existingHeaders, expectedLabels) {
  return new Error(
    'Header conflict in tab "' + tabName + '". Existing: [' + existingHeaders.join(', ') +
    ']. Expected keys or labels for: [' + expectedLabels.join(', ') + '].'
  );
}

// Existing conditional formats and banded ranges per sheet id, from Sheets.Spreadsheets.get.
function sheetMetadataById_(sheetsMetadata) {
  var byId = Object.create(null);
  var sheets = (sheetsMetadata && sheetsMetadata.sheets) || [];

  for (var i = 0; i < sheets.length; i += 1) {
    var item = sheets[i] || {};
    var properties = item.properties || {};
    var sheetId = properties.sheetId;
    if (typeof sheetId !== 'number') {
      continue;
    }
    byId[sheetId] = {
      conditionalFormats: item.conditionalFormats || [],
      bandedRanges: item.bandedRanges || []
    };
  }

  return byId;
}

// Fixed id lets later requests in the same batch target the new tab.
function buildCreateTabRequests_(tab) {
  return [
    {
      addSheet: {
        properties: {
          sheetId: tab.sheetId,
          title: tab.name,
          gridProperties: { frozenRowCount: 1 }
        }
      }
    }
  ];
}

// Row 1 only: labels plus hover notes; data rows are never touched.
function buildHeaderRowRequest_(sheetId, tab) {
  var labels = labelsOf_(tab);
  var notes = notesOf_(tab);

  return [
    {
      updateCells: {
        start: { sheetId: sheetId, rowIndex: 0, columnIndex: 0 },
        rows: [
          {
            values: labels.map(function (label, index) {
              return {
                userEnteredValue: { stringValue: label },
                note: notes[index] || ''
              };
            })
          }
        ],
        fields: 'userEnteredValue,note'
      }
    }
  ];
}

// Bold light-blue header, centred and wrapped; header row frozen.
function buildHeaderStyleRequests_(sheetId, tab) {
  var width = labelsOf_(tab).length;
  return [
    {
      repeatCell: {
        range: {
          sheetId: sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: width
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: rgbHex_(HEADER_STYLE.background),
            horizontalAlignment: 'CENTER',
            textFormat: {
              bold: true,
              foregroundColor: rgbHex_(HEADER_STYLE.text)
            },
            wrapStrategy: 'WRAP'
          }
        },
        fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,textFormat,wrapStrategy)'
      }
    },
    {
      updateSheetProperties: {
        properties: {
          sheetId: sheetId,
          gridProperties: { frozenRowCount: 1 }
        },
        fields: 'gridProperties.frozenRowCount'
      }
    }
  ];
}

// Wider columns for names and labels; default width otherwise.
function buildColumnWidthRequests_(sheetId, tab) {
  var widthsByKey = {
    raiderKey: 210,
    raidGroup: 130,
    rerollName: 210,
    mainKey: 210,
    class: 130,
    spec: 170,
    role: 150,
    dpsParse: 145,
    itemName: 220
  };

  return tab.columns.map(function (column, index) {
    var width = widthsByKey[column.key] || 155;
    return {
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: 'COLUMNS',
          startIndex: index,
          endIndex: index + 1
        },
        properties: { pixelSize: width },
        fields: 'pixelSize'
      }
    };
  });
}

// Green tabs = filled by the owner; grey-blue tabs = written by the script.
function buildTabColorRequests_(sheetId, tab) {
  var color = rgbHex_('97B97C');
  if (tab.group === 'log') {
    color = rgbHex_('93A7B6');
  }
  if (tab.group === 'view') {
    color = rgbHex_('5F7FA2');
  }

  return [
    {
      updateSheetProperties: {
        properties: {
          sheetId: sheetId,
          tabColorStyle: {
            rgbColor: color
          }
        },
        fields: 'tabColorStyle'
      }
    }
  ];
}

// Strict validation (invalid input is refused); blank cells stay allowed. Re-setting a range replaces its old rule.
function buildValidationRequestsForTab_(sheetId, tab, argSeparator) {
  var requests = [];

  // A start date typed as text would silently mean "no BiS window", so only real dates are accepted.
  if (tab.name === 'Config') {
    var startColumn = columnOf_(tab, 'bisWindowStart');
    requests.push(buildDataValidationRequest_(sheetId, startColumn, {
      condition: { type: 'DATE_IS_VALID' },
      strict: true,
      inputMessage: 'Date du reset BiS (une vraie date, ex. 01/11/2026).'
    }));
    requests.push({
      repeatCell: {
        range: { sheetId: sheetId, startRowIndex: 1, startColumnIndex: startColumn, endColumnIndex: startColumn + 1 },
        cell: { userEnteredFormat: { numberFormat: { type: 'DATE' } } },
        fields: 'userEnteredFormat.numberFormat'
      }
    });
  }

  if (tab.name === 'Roster' || tab.name === 'Rerolls') {
    requests.push(
      buildDataValidationRequest_(sheetId, columnOf_(tab, 'class'), {
        condition: {
          type: 'ONE_OF_LIST',
          values: classNames_().map(function (name) {
            return { userEnteredValue: name };
          })
        },
        strict: true,
        showCustomUi: true,
        inputMessage: 'Choisir une classe parmi les 9 classes classiques.'
      })
    );

    requests = requests.concat(
      buildSpecValidationRequests_(sheetId, tab, tab.name === 'Roster' ? LISTS_LAYOUT.rosterLookupColumn : LISTS_LAYOUT.rerollsLookupColumn)
    );

    // Rôle is a formula now: drop the old dropdown.
    requests.push(buildDataValidationRequest_(sheetId, columnOf_(tab, 'role')));

    requests.push(
      buildDataValidationRequest_(sheetId, columnOf_(tab, 'dpsParse'), {
        condition: {
          type: 'NUMBER_BETWEEN',
          values: [{ userEnteredValue: '1' }, { userEnteredValue: '100' }]
        },
        strict: true,
        inputMessage: 'Parse WCL moyen entre 1 et 100.'
      })
    );
  }

  if (tab.name === 'Roster') {
    requests.push(buildDataValidationRequest_(sheetId, columnOf_(tab, 'raidGroup'), {
      condition: {
        type: 'ONE_OF_LIST',
        values: RAID_GROUPS.map(function (group) { return { userEnteredValue: group }; })
      },
      strict: true,
      showCustomUi: true,
      inputMessage: 'Groupe de raid : ' + RAID_GROUPS.join(' ou ') + '.'
    }));
  }
  return requests;
}

// Adds strict dependent spec dropdowns for rows 2..201 from the row's _Listes lookup spill.
function buildSpecValidationRequests_(sheetId, tab, helperStartColumn) {
  var requests = [];
  var specColumnIndex = columnOf_(tab, 'spec');
  var helperStartLetter = columnLetter_(helperStartColumn);
  var helperEndLetter = columnLetter_(helperStartColumn + LISTS_LAYOUT.specCount - 1);

  // Clear the whole column first: the earlier version put a typed-spec check on it.
  requests.push({
    setDataValidation: {
      range: {
        sheetId: sheetId,
        startRowIndex: 1,
        startColumnIndex: specColumnIndex,
        endColumnIndex: specColumnIndex + 1
      }
    }
  });

  for (var rowNumber = 2; rowNumber <= 201; rowNumber += 1) {
    requests.push({
      setDataValidation: {
        range: {
          sheetId: sheetId,
          startRowIndex: rowNumber - 1,
          endRowIndex: rowNumber,
          startColumnIndex: specColumnIndex,
          endColumnIndex: specColumnIndex + 1
        },
        rule: {
          condition: {
            type: 'ONE_OF_RANGE',
            values: [{ userEnteredValue: "='_Listes'!$" + helperStartLetter + rowNumber + ':$' + helperEndLetter + rowNumber }]
          },
          strict: true,
          showCustomUi: true,
          inputMessage: 'Choisir une spé proposée pour la classe de la ligne.'
        }
      }
    });
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

// Rules are deleted from the highest index down so earlier indexes stay valid within the batch.
function buildDeleteExistingLayoutRequests_(sheetId, metadataBySheetId) {
  var requests = [];
  var metadata = metadataBySheetId[sheetId] || {};
  var conditionalFormats = metadata.conditionalFormats || [];
  var bandedRanges = metadata.bandedRanges || [];

  for (var i = conditionalFormats.length - 1; i >= 0; i -= 1) {
    requests.push({
      deleteConditionalFormatRule: {
        sheetId: sheetId,
        index: i
      }
    });
  }

  for (i = 0; i < bandedRanges.length; i += 1) {
    requests.push({
      deleteBanding: {
        bandedRangeId: bandedRanges[i].bandedRangeId
      }
    });
  }

  return requests;
}

// Light alternating rows from row 2; conditional formats paint over them.
function buildBandingRequests_(sheetId, tab) {
  var width = labelsOf_(tab).length;
  return [
    {
      addBanding: {
        bandedRange: {
          range: {
            sheetId: sheetId,
            startRowIndex: 1,
            startColumnIndex: 0,
            endColumnIndex: width
          },
          rowProperties: {
            firstBandColor: rgbHex_('F5F8FA'),
            secondBandColor: rgbHex_('EBF1F4')
          }
        }
      }
    }
  ];
}

// Bad-name highlights (EXACT: COUNTIF ignores case; INDIRECT: rules cannot reference another tab directly).
function buildConditionalFormatRequestsForTab_(sheetId, tab, argSeparator) {
  var requests = [];
  var separator = argSeparator || ',';

  // Each rule is inserted at index 0, so rules added later win: colours first, red bad-name highlights last.
  if (tab.name === 'Roster' || tab.name === 'Rerolls') {
    var nameColumn = columnOf_(tab, tab.name === 'Roster' ? 'raiderKey' : 'rerollName');
    requests = requests.concat(
      buildClassColorRules_(
        sheetId,
        columnOf_(tab, 'class'),
        columnOf_(tab, 'class'),
        columnOf_(tab, 'spec') + 1,
        separator
      )
    );
    requests = requests.concat(buildRoleColorRules_(sheetId, columnOf_(tab, 'role'), separator));
    requests = requests.concat(buildParseColorRules_(sheetId, columnOf_(tab, 'dpsParse'), separator));
    requests.push(buildConditionalFormatRequest_(
      sheetId,
      nameColumn,
      nameColumn + 1,
      '=$' + columnLetter_(nameColumn) + '2<>""',
      { backgroundColor: rgbHex_('FFFFFF'), textFormat: { foregroundColor: rgbHex_('000000'), bold: true } },
      separator
    ));
  }

  if (tab.name === 'Roster') {
    // Groupe de raid looks like the raider name.
    var groupColumn = columnOf_(tab, 'raidGroup');
    requests.push(buildConditionalFormatRequest_(
      sheetId,
      groupColumn,
      groupColumn + 1,
      '=$' + columnLetter_(groupColumn) + '2<>""',
      { backgroundColor: rgbHex_('FFFFFF'), textFormat: { foregroundColor: rgbHex_('000000'), bold: true } },
      separator
    ));
    requests.push(
      buildConditionalFormatRequest_(
        sheetId,
        0,
        1,
        '=AND($A2<>"",SUMPRODUCT(--EXACT($A$2:$A,$A2))>1)',
        { backgroundColor: rgbHex_('FFE5E5') },
        separator
      )
    );
  }

  if (tab.name === 'Rerolls') {
    var rerollNameLetter = columnLetter_(columnOf_(tab, 'rerollName'));
    var mainKeyLetter = columnLetter_(columnOf_(tab, 'mainKey'));
    requests.push(
      buildConditionalFormatRequest_(
        sheetId,
        0,
        1,
        '=AND($' + rerollNameLetter + '2<>"",SUMPRODUCT(--EXACT($' + rerollNameLetter + '$2:$' + rerollNameLetter + ',$' + rerollNameLetter + '2))+SUMPRODUCT(--EXACT(INDIRECT("Roster!A2:A"),$' + rerollNameLetter + '2))>1)',
        { backgroundColor: rgbHex_('FFE5E5') },
        separator
      )
    );

    requests.push(
      buildConditionalFormatRequest_(
        sheetId,
        columnOf_(tab, 'mainKey'),
        columnOf_(tab, 'mainKey') + 1,
        '=AND($' + mainKeyLetter + '2<>"",SUMPRODUCT(--EXACT(INDIRECT("Roster!A2:A"),$' + mainKeyLetter + '2))=0)',
        { backgroundColor: rgbHex_('FFE5E5') },
        separator
      )
    );
  }

  return requests;
}

// One rule per displayed role value on the role column.
function buildRoleColorRules_(sheetId, roleColumn, argSeparator) {
  var roleLetter = columnLetter_(roleColumn);
  var requests = [];

  ROLE_OPTIONS.forEach(function (role) {
    var display = ROLE_DISPLAY[role];
    requests.push(
      buildConditionalFormatRequest_(
        sheetId,
        roleColumn,
        roleColumn + 1,
        '=$' + roleLetter + '2="' + display.value + '"',
        {
          backgroundColor: rgbHex_(display.colorHex),
          textFormat: {
            foregroundColor: rgbHex_(display.textHex)
          }
        },
        argSeparator
      )
    );
  });

  return requests;
}

// Rewrites plain spec values to emoji display values without touching other cells (Rôle is a formula).
function buildRoleAndSpecRewriteRequests_(existingHeadersByName) {
  var requests = [];
  requests = requests.concat(buildRoleAndSpecRewriteForTab_(existingHeadersByName.Roster, tabByName_('Roster')));
  requests = requests.concat(buildRoleAndSpecRewriteForTab_(existingHeadersByName.Rerolls, tabByName_('Rerolls')));
  return requests;
}

// Builds per-cell rewrite requests for one tab state.
function buildRoleAndSpecRewriteForTab_(state, tab) {
  if (!state || !Array.isArray(state.rows) || !state.rows.length) {
    return [];
  }

  var requests = [];
  var classIndex = columnOf_(tab, 'class');
  var specIndex = columnOf_(tab, 'spec');
  var roleIndex = columnOf_(tab, 'role');

  for (var rowIndex = 1; rowIndex < state.rows.length; rowIndex += 1) {
    var row = state.rows[rowIndex] || [];
    var className = normalizeCellString_(row[classIndex]);
    var specValue = normalizeCellString_(row[specIndex]);
    var roleValue = normalizeCellString_(row[roleIndex]);

    var roleDisplay = roleDisplayValue_(roleValue);
    var specDisplay = specDisplayValue_(className, legacyDruidSpec_(className, specValue, roleDisplay));
    if (specDisplay && specDisplay !== specValue) {
      requests.push(buildCellRewriteRequest_(state.sheetId, rowIndex, specIndex, specDisplay));
    }
  }

  return requests;
}

// The former single druid feral spec becomes ours (tank role) or félin (any other role); other specs pass through.
function legacyDruidSpec_(className, specValue, roleDisplay) {
  if (className !== 'Druide' || ['Combat farouche', '🐻 Combat farouche'].indexOf(specValue) === -1) {
    return specValue;
  }
  return roleDisplay === ROLE_DISPLAY.Tank.value ? 'Combat farouche (ours)' : 'Combat farouche (félin)';
}

// One updateCells request that rewrites a single value.
function buildCellRewriteRequest_(sheetId, rowIndex, columnIndex, value) {
  return {
    updateCells: {
      start: { sheetId: sheetId, rowIndex: rowIndex, columnIndex: columnIndex },
      rows: [{ values: [{ userEnteredValue: { stringValue: value } }] }],
      fields: 'userEnteredValue'
    }
  };
}

// Normalized string form of one cell value.
function normalizeCellString_(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

// Returns the emoji role value for plain inputs, or null when unchanged/unknown.
function roleDisplayValue_(value) {
  if (!value) {
    return null;
  }

  if (Object.prototype.hasOwnProperty.call(ROLE_DISPLAY, value)) {
    return ROLE_DISPLAY[value].value;
  }

  for (var i = 0; i < ROLE_OPTIONS.length; i += 1) {
    var role = ROLE_OPTIONS[i];
    if (ROLE_DISPLAY[role].value === value) {
      return value;
    }
  }

  return null;
}

// Returns emoji + spec when class/spec are known plain values, else null.
function specDisplayValue_(className, specValue) {
  if (!className || !specValue) {
    return null;
  }

  for (var i = 0; i < CLASS_SPECS.length; i += 1) {
    var entry = CLASS_SPECS[i];
    if (entry.name !== className) {
      continue;
    }
    if (!entry.specIcons || !Object.prototype.hasOwnProperty.call(entry.specIcons, specValue)) {
      return null;
    }
    return entry.specIcons[specValue] + ' ' + specValue;
  }

  return null;
}

// One rule per class: colours the given columns when the row's class matches.
function buildClassColorRules_(sheetId, classColumn, rangeStartColumn, rangeEndColumn, argSeparator) {
  var classLetter = columnLetter_(classColumn);
  var requests = [];

  CLASS_SPECS.forEach(function (entry) {
    requests.push(
      buildConditionalFormatRequest_(
        sheetId,
        rangeStartColumn,
        rangeEndColumn,
        '=$' + classLetter + '2="' + entry.name + '"',
        {
          backgroundColor: rgbHex_(entry.colorHex),
          textFormat: {
            foregroundColor: rgbHex_(entry.textHex)
          }
        },
        argSeparator
      )
    );
  });

  return requests;
}

// Custom-formula rule on rows 2 and below of the given columns.
function buildConditionalFormatRequest_(sheetId, startColumnIndex, endColumnIndex, formula, format, argSeparator) {
  var normalizedFormula = applyArgSeparator_(formula, argSeparator || ',');

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
            values: [{ userEnteredValue: normalizedFormula }]
          },
          format: format
        }
      },
      index: 0
    }
  };
}

// Our formulas hold no commas inside strings, so a plain swap is safe.
function applyArgSeparator_(formula, argSeparator) {
  return String(formula).split(',').join(argSeparator || ',');
}

// 0 -> A, 25 -> Z, 26 -> AA.
function columnLetter_(zeroBasedIndex) {
  var letters = '';
  var index = zeroBasedIndex;

  while (index >= 0) {
    letters = String.fromCharCode((index % 26) + 65) + letters;
    index = Math.floor(index / 26) - 1;
  }

  return letters;
}

// 'RRGGBB' -> Sheets API colour (0-1 channels).
function rgbHex_(hex) {
  var value = String(hex || '').replace('#', '');
  return {
    red: parseInt(value.slice(0, 2), 16) / 255,
    green: parseInt(value.slice(2, 4), 16) / 255,
    blue: parseInt(value.slice(4, 6), 16) / 255
  };
}
