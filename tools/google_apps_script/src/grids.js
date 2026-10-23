// Builds migration, helper-tab, and grid-tab requests in one batch-safe pass.
function buildGridRequests_(argSeparator) {
  var separator = argSeparator || ',';
  var spreadsheet = SpreadsheetApp.getActive();
  var states = gridSheetStates_(spreadsheet);
  var rosterNames = readSortedRosterNames_(spreadsheet);
  var activeNames = readActiveNames_(spreadsheet, rosterNames);
  var classByName = readClassByName_(spreadsheet);
  var metadataBySheetId = sheetMetadataById_(Sheets.Spreadsheets.get(spreadsheet.getId(), {
    fields: 'sheets(properties.sheetId,conditionalFormats,bandedRanges.bandedRangeId)'
  }));
  var requests = [];

  assertGridMigrationIsSafe_(states);

  requests = requests.concat(buildGridMigrationDeleteRequests_(states));
  requests = requests.concat(buildListsTabRequests_(states.lists, separator));
  requests = requests.concat(buildPresenceGridRequests_(states.presence, rosterNames, separator,
    { state: states.presenceArchive, activeNames: activeNames }, metadataBySheetId, classByName));
  requests = requests.concat(buildAwardsGridRequests_(states.awards, rosterNames,
    { state: states.awardsArchive, activeNames: activeNames }, metadataBySheetId, separator, classByName));
  ITEM_TABS.forEach(function (itemTab, index) {
    requests = requests.concat(
      buildTierItemsGridRequests_(states.itemTabs[index], metadataBySheetId, separator, itemTab)
    );
  });

  return requests;
}

// Reads all sheets that affect 4.2 grid migration and refresh behavior.
function gridSheetStates_(spreadsheet) {
  return {
    raids: readSheetState_(spreadsheet, 'Raids'),
    raidReports: readSheetState_(spreadsheet, 'RaidReports'),
    patternItems: readSheetState_(spreadsheet, 'PatternItems'),
    diagnostics: readSheetState_(spreadsheet, 'Diagnostics'),
    attendance: readSheetState_(spreadsheet, 'Attendance'),
    bench: readSheetState_(spreadsheet, 'Bench'),
    awards: readSheetState_(spreadsheet, GRID_TABS.awards.name),
    tierItems: readSheetState_(spreadsheet, GRID_TABS.tierItems.name),
    itemTabs: ITEM_TABS.map(function (itemTab) { return readSheetState_(spreadsheet, itemTab.name); }),
    presence: readSheetState_(spreadsheet, GRID_TABS.presence.name),
    presenceArchive: readSheetState_(spreadsheet, ARCHIVE_TABS.presence.name),
    awardsArchive: readSheetState_(spreadsheet, ARCHIVE_TABS.awards.name),
    butin: readSheetState_(spreadsheet, 'Butin'),
    lists: readSheetState_(spreadsheet, LISTS_TAB.name)
  };
}

// Captures rows, size, and id for one sheet name when it exists.
function readSheetState_(spreadsheet, name) {
  var sheet = spreadsheet.getSheetByName(name);
  if (!sheet) {
    return { exists: false, name: name };
  }

  var rows = sheet.getDataRange().getValues();
  return {
    exists: true,
    name: name,
    sheetId: sheet.getSheetId(),
    rows: rows,
    maxColumns: sheet.getMaxColumns(),
    headers: trimmedHeaderRow_(rows)
  };
}

// Returns row 1 values with trailing blanks removed.
function trimmedHeaderRow_(rows) {
  var row = rows.length ? (rows[0] || []) : [];
  var headers = row.map(function (value) {
    if (value === null || value === undefined) {
      return '';
    }
    return String(value);
  });
  while (headers.length && headers[headers.length - 1] === '') {
    headers.pop();
  }
  return headers;
}

// Aborts when migration would delete owner data from legacy tabs.
function assertGridMigrationIsSafe_(states) {
  if (isLegacyRaidsSheet_(states.raids) && hasAnyDataRows_(states.raids.rows || [])) {
    throw new Error('Cannot run setup: tab "Raids" has data rows.');
  }
  if (states.raidReports.exists && hasAnyDataRows_(states.raidReports.rows || [])) {
    throw new Error('Cannot run setup: tab "RaidReports" has data rows.');
  }
  if (states.patternItems.exists && hasAnyDataRows_(states.patternItems.rows || [])) {
    throw new Error('Cannot run setup: tab "PatternItems" has data rows.');
  }

  if (states.attendance.exists && hasAnyDataRows_(states.attendance.rows || [])) {
    throw new Error('Cannot run setup: tab "Attendance" has data rows.');
  }
  if (states.bench.exists && hasAnyDataRows_(states.bench.rows || [])) {
    throw new Error('Cannot run setup: tab "Bench" has data rows.');
  }
  if (isLegacyAwardsSheet_(states.awards) && hasAnyDataRows_(states.awards.rows || [])) {
    throw new Error('Cannot run setup: tab "Awards" has data rows.');
  }
  if (isLegacyTierItemsSheet_(states.tierItems) && legacyTierItemsHasItemRows_(states.tierItems)) {
    throw new Error('Cannot run setup: tab "TierItems" has item rows.');
  }
  // Former single spec grid: items start at row 4.
  if (states.tierItems.exists && !isLegacyTierItemsSheet_(states.tierItems) &&
      hasAnyDataRows_((states.tierItems.rows || []).slice(2))) {
    throw new Error('Cannot run setup: tab "TierItems" has item rows; move them to the Objets tabs first.');
  }

  states.itemTabs.forEach(function (itemTabState) {
    // hasAnyDataRows_ skips its first row, so slice from row 3 to check rows 4+.
    if (itemTabHasLegacyOrder_(itemTabState) && hasAnyDataRows_((itemTabState.rows || []).slice(2))) {
      throw new Error('Cannot run setup: tab "' + itemTabState.name + '" has item rows.');
    }
  });
}

// Detects the old Raids layout that still has Palier/Fenêtre BiS/Statut columns.
function isLegacyRaidsSheet_(state) {
  if (!state.exists) {
    return false;
  }

  var headers = state.headers || [];
  return headers.indexOf('Palier') !== -1 || headers.indexOf('tierId') !== -1 ||
    headers.indexOf('Fenêtre BiS') !== -1 || headers.indexOf('bisWindowId') !== -1 ||
    headers.indexOf('Statut') !== -1 || headers.indexOf('status') !== -1;
}

// Detects Objets tabs still using row-3 Gain then Statut order.
function itemTabHasLegacyOrder_(state) {
  if (!state.exists) {
    return false;
  }

  var rows = state.rows || [];
  if (rows.length < 3) {
    return false;
  }

  var labels = rows[2] || [];
  var firstSpecColumn = labels[OBJETS_SLOT_COLUMN] === 'Emplacement' ? OBJETS_FIRST_SPEC_COLUMN : 2;
  for (var column = firstSpecColumn; column + 1 < labels.length; column += 2) {
    if (labels[column] === 'Gain (%)' && labels[column + 1] === 'Statut') {
      return true;
    }
  }

  return false;
}

// Detects the old flat Awards layout from its row-1 contract header.
function isLegacyAwardsSheet_(state) {
  if (!state.exists) {
    return false;
  }
  var first = (state.headers[0] || '').toLowerCase();
  return first === 'checksum' || first === 'checksum gargul';
}

// Detects the old flat TierItems layout from its row-1 contract header.
function isLegacyTierItemsSheet_(state) {
  if (!state.exists) {
    return false;
  }
  var first = state.headers[0] || '';
  var hasItemHeader = state.headers.indexOf('itemID') !== -1 || state.headers.indexOf('Objet (ID)') !== -1;
  return (first === 'tierId' || first === 'Palier') && hasItemHeader;
}

// Returns true when any legacy TierItems row contains Objet (ID).
function legacyTierItemsHasItemRows_(state) {
  var headers = state.headers || [];
  var itemIndex = headers.indexOf('itemID');
  if (itemIndex === -1) {
    itemIndex = headers.indexOf('Objet (ID)');
  }
  if (itemIndex === -1) {
    return false;
  }

  var rows = state.rows || [];
  for (var rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    var row = rows[rowIndex] || [];
    var value = row[itemIndex];
    if (value !== '' && value !== null && value !== undefined) {
      return true;
    }
  }

  return false;
}

// Builds delete requests for obsolete tabs and legacy views.
function buildGridMigrationDeleteRequests_(states) {
  var requests = [];

  if (isLegacyRaidsSheet_(states.raids)) {
    requests.push(buildDeleteSheetRequest_(states.raids.sheetId));
  }
  if (states.raidReports.exists) {
    requests.push(buildDeleteSheetRequest_(states.raidReports.sheetId));
  }
  if (states.patternItems.exists) {
    requests.push(buildDeleteSheetRequest_(states.patternItems.sheetId));
  }
  if (states.diagnostics.exists) {
    requests.push(buildDeleteSheetRequest_(states.diagnostics.sheetId));
  }

  if (states.presence.exists && states.presence.sheetId === 1101) {
    requests.push(buildDeleteSheetRequest_(states.presence.sheetId));
  }
  if (states.butin.exists) {
    requests.push(buildDeleteSheetRequest_(states.butin.sheetId));
  }
  if (states.attendance.exists) {
    requests.push(buildDeleteSheetRequest_(states.attendance.sheetId));
  }
  if (states.bench.exists) {
    requests.push(buildDeleteSheetRequest_(states.bench.sheetId));
  }
  if (isLegacyAwardsSheet_(states.awards)) {
    requests.push(buildDeleteSheetRequest_(states.awards.sheetId));
  }
  // TierItems is replaced by the per-role Objets tabs, whichever layout it has.
  if (states.tierItems.exists) {
    requests.push(buildDeleteSheetRequest_(states.tierItems.sheetId));
  }

  return requests;
}

// Returns one deleteSheet request.
function buildDeleteSheetRequest_(sheetId) {
  return {
    deleteSheet: {
      sheetId: sheetId
    }
  };
}

// Creates or refreshes the hidden _Listes helper sheet.
function buildListsTabRequests_(listsState, argSeparator) {
  var separator = argSeparator || ',';
  var requests = [];
  var sheetId = LISTS_TAB.sheetId;

  if (listsState.exists) {
    sheetId = listsState.sheetId;
  } else {
    requests.push({
      addSheet: {
        properties: {
          sheetId: LISTS_TAB.sheetId,
          title: LISTS_TAB.name,
          hidden: true,
          gridProperties: { columnCount: LISTS_LAYOUT.columnCount }
        }
      }
    });
  }

  requests.push({
    updateSheetProperties: {
      properties: {
        sheetId: sheetId,
        hidden: true,
        gridProperties: { columnCount: Math.max(LISTS_LAYOUT.columnCount, listsState.exists ? Number(listsState.maxColumns || 0) : 0) }
      },
      fields: 'hidden,gridProperties.columnCount'
    }
  });

  // Earlier layouts put lookups where spills now land; a leftover value would block a spill.
  requests.push({
    updateCells: {
      range: { sheetId: sheetId },
      fields: '*'
    }
  });

  requests.push({
    updateCells: {
      start: { sheetId: sheetId, rowIndex: 1, columnIndex: 0 },
      rows: buildListsRows_(separator),
      fields: 'userEnteredValue'
    }
  });

  requests.push({
    updateCells: {
      start: { sheetId: sheetId, rowIndex: 1, columnIndex: LISTS_LAYOUT.rerollsLookupColumn },
      rows: buildRerollsListsRows_(separator),
      fields: 'userEnteredValue'
    }
  });

  requests.push({
    updateCells: {
      start: { sheetId: sheetId, rowIndex: 1, columnIndex: LISTS_LAYOUT.roleKeyColumn },
      rows: buildRoleTableRows_(),
      fields: 'userEnteredValue'
    }
  });

  return requests;
}

// Rows of the Classe|Spé → Rôle table (emoji and bare spec both listed), read by the Rôle formula.
function buildRoleTableRows_() {
  var rows = [];
  SPEC_COLUMNS.forEach(function (entry) {
    var role = ROLE_DISPLAY[entry.role].value;
    [specDisplayValue_(entry.className, entry.spec), entry.spec].forEach(function (specText) {
      rows.push({ values: [
        { userEnteredValue: { stringValue: entry.className + '|' + specText } },
        { userEnteredValue: { stringValue: role } }
      ] });
    });
  });
  return rows;
}

// Rows 2..201 of _Listes: class/spec table in A:E and, in G, a lookup that spills the Roster row's specs into G:J.
// H:J are never written, otherwise the spill would be blocked.
function buildListsRows_(argSeparator) {
  var separator = argSeparator || ',';
  var rows = [];
  var classLetter = columnLetter_(columnOf_(tabByName_('Roster'), 'class'));
  var specsRange = '$B$2:$' + columnLetter_(LISTS_LAYOUT.specCount) + '$10';

  for (var rowNumber = 2; rowNumber <= 201; rowNumber += 1) {
    var classIndex = rowNumber - 2;
    var entry = classIndex < CLASS_SPECS.length ? CLASS_SPECS[classIndex] : null;
    var values = [{ userEnteredValue: { stringValue: entry ? entry.name : '' } }];
    for (var specIndex = 0; specIndex < LISTS_LAYOUT.specCount; specIndex += 1) {
      var spec = entry && entry.specs[specIndex];
      values.push({ userEnteredValue: { stringValue: spec ? specDisplayValue_(entry.name, spec) : '' } });
    }
    while (values.length < LISTS_LAYOUT.rosterLookupColumn) {
      values.push({ userEnteredValue: { stringValue: '' } });
    }
    values.push({
      userEnteredValue: {
        formulaValue: applyArgSeparator_('=IFERROR(XLOOKUP(Roster!' + classLetter + rowNumber + ',$A$2:$A$10,' + specsRange + '),"")', separator)
      }
    });
    rows.push({ values: values });
  }

  return rows;
}

// Rows 2..201 of _Listes column L: class lookup for Rerolls that spills specs into L:O.
function buildRerollsListsRows_(argSeparator) {
  var separator = argSeparator || ',';
  var rows = [];
  var classLetter = columnLetter_(columnOf_(tabByName_('Rerolls'), 'class'));
  var specsRange = '$B$2:$' + columnLetter_(LISTS_LAYOUT.specCount) + '$10';

  for (var rowNumber = 2; rowNumber <= 201; rowNumber += 1) {
    rows.push({
      values: [
        {
          userEnteredValue: {
            formulaValue: applyArgSeparator_('=IFERROR(XLOOKUP(Rerolls!' + classLetter + rowNumber + ',$A$2:$A$10,' + specsRange + '),"")', separator)
          }
        }
      ]
    });
  }

  return rows;
}

// Creates or refreshes the Présence grid without rewriting raid data rows.
function buildPresenceGridRequests_(presenceState, rosterNames, argSeparator, archive, metadataBySheetId, classByName) {
  var separator = argSeparator || ',';
  var requests = [];
  var existingGrid = presenceState.exists && presenceState.sheetId !== 1101;
  var sheetId = existingGrid ? presenceState.sheetId : GRID_TABS.presence.sheetId;

  if (!existingGrid) {
    requests.push({
      addSheet: {
        properties: {
          sheetId: GRID_TABS.presence.sheetId,
          title: GRID_TABS.presence.name
        }
      }
    });
  }

  var existingNames = existingGrid ? readPresenceRaiderHeaders_(presenceState.rows || []) : [];
  if (existingGrid) {
    requests = requests.concat(buildGridRuleResetRequests_(sheetId, archive && archive.state, metadataBySheetId));
  }
  if (existingGrid && archive) {
    var presenceMove = buildArchiveMoveRequests_(
      { sheetId: sheetId, maxColumns: presenceState.maxColumns, names: existingNames },
      { tab: ARCHIVE_TABS.presence, state: archive.state, names: archive.state.exists ? readPresenceRaiderHeaders_(archive.state.rows || []) : [] },
      { firstColumn: PRESENCE_FIRST_RAIDER_COLUMN, width: 1 },
      archive.activeNames
    );
    requests = requests.concat(presenceMove.requests);
    existingNames = presenceMove.names;
  }
  var allNames = appendMissingNames_(existingNames, rosterNames);
  var totalColumns = PRESENCE_FIRST_RAIDER_COLUMN + allNames.length;

  requests.push({
    updateSheetProperties: {
      properties: {
        sheetId: sheetId,
        gridProperties: {
          columnCount: gridColumnCount_(presenceState, existingGrid, totalColumns),
          frozenRowCount: 2,
          frozenColumnCount: PRESENCE_FIRST_RAIDER_COLUMN
        }
      },
      fields: 'gridProperties.columnCount,gridProperties.frozenRowCount,gridProperties.frozenColumnCount'
    }
  });

  requests = requests.concat(buildPresenceWidthRequests_(sheetId, allNames.length));

  var presenceSort = buildSortColumnsRequests_(sheetId, allNames, { firstColumn: PRESENCE_FIRST_RAIDER_COLUMN, width: 1 });
  requests = requests.concat(presenceSort.requests);
  allNames = presenceSort.names;

  var headerValues = [
    { userEnteredValue: { stringValue: 'Raid (ID)' } },
    { userEnteredValue: { stringValue: 'Instance' } },
    { userEnteredValue: { stringValue: 'Date' } }
  ];
  allNames.forEach(function (name) {
    headerValues.push({ userEnteredValue: { stringValue: name } });
  });

  requests.push({
    updateCells: {
      start: { sheetId: sheetId, rowIndex: 0, columnIndex: 0 },
      rows: [{ values: headerValues }],
      fields: 'userEnteredValue'
    }
  });

  var totals = [
    { userEnteredValue: { stringValue: 'Total' } },
    { userEnteredValue: { stringValue: '' } },
    { userEnteredValue: { stringValue: '' } }
  ];
  for (var i = 0; i < allNames.length; i += 1) {
    var letter = columnLetter_(PRESENCE_FIRST_RAIDER_COLUMN + i);
    totals.push({
      userEnteredValue: {
        formulaValue: applyArgSeparator_('=COUNTIF(' + letter + PRESENCE_FIRST_RAID_ROW + ':' + letter + ',1)+COUNTIF(' + letter + PRESENCE_FIRST_RAID_ROW + ':' + letter + ',"B")', separator)
      }
    });
  }

  requests.push({
    updateCells: {
      start: { sheetId: sheetId, rowIndex: 1, columnIndex: 0 },
      rows: [{ values: totals }],
      fields: 'userEnteredValue'
    }
  });

  requests.push({
    repeatCell: {
      range: {
        sheetId: sheetId,
        startRowIndex: 0,
        endRowIndex: 1,
        startColumnIndex: 0,
        endColumnIndex: totalColumns
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
  });
  allNames.forEach(function (name, index) {
    requests.push(buildClassHeaderTextRequest_(sheetId, PRESENCE_FIRST_RAIDER_COLUMN + index, 1, classByName && classByName[name]));
  });

  requests.push({
    repeatCell: {
      range: {
        sheetId: sheetId,
        startRowIndex: 1,
        endRowIndex: 2,
        startColumnIndex: 0,
        endColumnIndex: totalColumns
      },
      cell: {
        userEnteredFormat: {
          backgroundColor: rgbHex_(TOTAL_ROW_BACKGROUND),
          horizontalAlignment: 'CENTER',
          textFormat: { bold: true }
        }
      },
      fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,textFormat)'
    }
  });

  if (allNames.length) {
    var cell = columnLetter_(PRESENCE_FIRST_RAIDER_COLUMN) + PRESENCE_FIRST_RAID_ROW;
    var raidRow = 'OR($' + columnLetter_(PRESENCE_RAID_ID_COLUMN) + PRESENCE_FIRST_RAID_ROW + '<>"",$' + columnLetter_(PRESENCE_DATE_COLUMN) + PRESENCE_FIRST_RAID_ROW + '<>"")';
    var namedColumn = columnLetter_(PRESENCE_FIRST_RAIDER_COLUMN) + '$1<>""';
    [
      { formula: '=' + cell + '=1', style: PRESENCE_STYLE.present },
      { formula: '=' + cell + '="B"', style: PRESENCE_STYLE.bench },
      { formula: '=AND(' + raidRow + ',' + namedColumn + ',OR(' + cell + '="",' + cell + '=0))', style: PRESENCE_STYLE.absent }
    ].forEach(function (rule) {
      requests.push(buildConditionalFormatRequestAtRow_(sheetId, PRESENCE_FIRST_RAIDER_COLUMN, totalColumns, PRESENCE_FIRST_RAID_ROW - 1,
        rule.formula, rarityFormat_(rule.style), separator));
    });
  }

  return requests;
}

// Conditional-format payload: light background with bold coloured text.
function rarityFormat_(style) {
  return {
    backgroundColor: rgbHex_(style.background),
    textFormat: { foregroundColor: rgbHex_(style.text), bold: true }
  };
}

// Raider-name header text in the raider's class colour (Roster or Rerolls); unknown names keep the header colour.
function buildClassHeaderTextRequest_(sheetId, startColumn, width, className) {
  return {
    repeatCell: {
      range: { sheetId: sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: startColumn, endColumnIndex: startColumn + width },
      cell: { userEnteredFormat: { textFormat: { bold: true, foregroundColor: rgbHex_(classHeaderTextHex_(className)) } } },
      fields: 'userEnteredFormat.textFormat.foregroundColor,userEnteredFormat.textFormat.bold'
    }
  };
}

// Reads existing Présence row-1 raider headers from column D onward; blanks keep their slot so names never shift.
function readPresenceRaiderHeaders_(rows) {
  return trimmedHeaderRow_(rows).slice(PRESENCE_FIRST_RAIDER_COLUMN);
}

// Rule indexes come from metadata read before the batch, so delete them before any column move
// (deleted or pasted columns drop or add rules); the grid's rules are rebuilt afterwards.
function buildGridRuleResetRequests_(sheetId, archiveState, metadataBySheetId) {
  var requests = buildDeleteExistingLayoutRequests_(sheetId, metadataBySheetId || {});
  if (archiveState && archiveState.exists) {
    requests = requests.concat(buildDeleteExistingLayoutRequests_(archiveState.sheetId, metadataBySheetId || {}));
  }
  return requests;
}

// Moves the column blocks of names not in Roster/Rerolls to the archive tab, and brings archived blocks back
// for names listed again. Moves are cut-and-paste of whole columns, so values, formats and validations travel.
// Présence archive rows line up with Présence rows: its key columns (A:C) are refreshed on each archive.
// Returns the requests and the grid names left after the move (kept in place, then restored at the end).
function buildArchiveMoveRequests_(grid, archive, layout, activeNames) {
  var first = layout.firstColumn;
  var width = layout.width;
  var inGrid = Object.create(null);
  var archiveIndexes = [];
  var restoreIndexes = [];
  var restored = Object.create(null);

  grid.names.forEach(function (name) {
    if (name) {
      inGrid[name] = true;
    }
  });
  if (Object.keys(activeNames).length) {
    grid.names.forEach(function (name, index) {
      if (name && !activeNames[name]) {
        archiveIndexes.push(index);
      }
    });
  }
  archive.names.forEach(function (name, index) {
    if (name && activeNames[name] && !inGrid[name] && !restored[name]) {
      restored[name] = true;
      restoreIndexes.push(index);
    }
  });

  if (!archiveIndexes.length && !restoreIndexes.length) {
    return { requests: [], names: grid.names };
  }

  var requests = [];
  var archiveSheetId = archive.state.exists ? archive.state.sheetId : archive.tab.sheetId;
  var archiveEnd = first + archive.names.length * width;
  var gridEnd = first + grid.names.length * width;
  var archiveColumns = Math.max(26, archiveEnd + archiveIndexes.length * width, archive.state.exists ? Number(archive.state.maxColumns || 0) : 0);

  if (archive.state.exists) {
    requests.push(buildColumnCountRequest_(archiveSheetId, archiveColumns));
  } else {
    requests.push({
      addSheet: {
        properties: {
          sheetId: archiveSheetId,
          title: archive.tab.name,
          gridProperties: { columnCount: archiveColumns, frozenRowCount: 2, frozenColumnCount: first }
        }
      }
    });
  }
  requests.push(buildColumnCountRequest_(grid.sheetId, Math.max(26, gridEnd + restoreIndexes.length * width, Number(grid.maxColumns || 0))));

  if (first > 0 && archiveIndexes.length) {
    requests.push(buildCopyColumnsRequest_(grid.sheetId, 0, archiveSheetId, 0, first));
  }
  archiveIndexes.forEach(function (index, position) {
    requests.push(buildCopyColumnsRequest_(grid.sheetId, first + index * width, archiveSheetId, archiveEnd + position * width, width));
  });
  restoreIndexes.forEach(function (index, position) {
    requests.push(buildCopyColumnsRequest_(archiveSheetId, first + index * width, grid.sheetId, gridEnd + position * width, width));
  });
  // Right to left, so earlier deletions do not shift the columns still to delete.
  archiveIndexes.slice().reverse().forEach(function (index) {
    requests.push(buildDeleteColumnsRequest_(grid.sheetId, first + index * width, width));
  });
  restoreIndexes.slice().reverse().forEach(function (index) {
    requests.push(buildDeleteColumnsRequest_(archiveSheetId, first + index * width, width));
  });

  var names = grid.names.filter(function (name, index) {
    return archiveIndexes.indexOf(index) === -1;
  }).concat(restoreIndexes.map(function (index) {
    return archive.names[index];
  }));

  return { requests: requests, names: names };
}

function buildColumnCountRequest_(sheetId, columnCount) {
  return {
    updateSheetProperties: {
      properties: { sheetId: sheetId, gridProperties: { columnCount: columnCount } },
      fields: 'gridProperties.columnCount'
    }
  };
}

function buildCopyColumnsRequest_(sourceSheetId, sourceStart, destinationSheetId, destinationStart, count) {
  return {
    copyPaste: {
      source: { sheetId: sourceSheetId, startColumnIndex: sourceStart, endColumnIndex: sourceStart + count },
      destination: { sheetId: destinationSheetId, startColumnIndex: destinationStart, endColumnIndex: destinationStart + count },
      pasteType: 'PASTE_NORMAL'
    }
  };
}

function buildDeleteColumnsRequest_(sheetId, start, count) {
  return {
    deleteDimension: {
      range: { sheetId: sheetId, dimension: 'COLUMNS', startIndex: start, endIndex: start + count }
    }
  };
}

// Grid width for a refresh: never below the tab's current width, since a lower columnCount deletes columns.
function gridColumnCount_(state, existingGrid, neededColumns) {
  var current = existingGrid ? Number(state.maxColumns || 0) : 0;
  return Math.max(26, neededColumns, current);
}

// Returns existing names plus missing roster names appended in sorted order.
function appendMissingNames_(existingNames, rosterNames) {
  var next = existingNames.slice();
  var seen = Object.create(null);

  existingNames.forEach(function (name) {
    if (name) {
      seen[name] = true;
    }
  });

  rosterNames.slice().sort(function (left, right) {
    return left.localeCompare(right);
  }).forEach(function (name) {
    if (!seen[name]) {
      seen[name] = true;
      next.push(name);
    }
  });

  return next;
}

// Moves whole column blocks so names end up in alphabetical order (blank slots last); data travels with them.
// Each step moves the block for position i leftwards, so destinationIndex is unaffected by the removal.
function buildSortColumnsRequests_(sheetId, names, layout) {
  var current = names.slice();
  var sorted = names.slice().sort(function (left, right) {
    if (!left || !right) {
      return left ? -1 : (right ? 1 : 0);
    }
    return left.localeCompare(right);
  });
  var requests = [];

  for (var target = 0; target < sorted.length; target += 1) {
    var from = current.indexOf(sorted[target], target);
    if (from === target) {
      continue;
    }
    requests.push({
      moveDimension: {
        source: {
          sheetId: sheetId,
          dimension: 'COLUMNS',
          startIndex: layout.firstColumn + from * layout.width,
          endIndex: layout.firstColumn + (from + 1) * layout.width
        },
        destinationIndex: layout.firstColumn + target * layout.width
      }
    });
    current.splice(target, 0, current.splice(from, 1)[0]);
  }

  return { requests: requests, names: sorted };
}

// Sets fixed widths for Présence key columns and raider columns.
function buildPresenceWidthRequests_(sheetId, raiderCount) {
  var requests = [
    buildColumnWidthRequest_(sheetId, 0, 1, 140),
    buildColumnWidthRequest_(sheetId, 1, 2, 190),
    buildColumnWidthRequest_(sheetId, 2, 3, 120)
  ];

  for (var i = 0; i < raiderCount; i += 1) {
    var startColumn = PRESENCE_FIRST_RAIDER_COLUMN + i;
    requests.push(buildColumnWidthRequest_(sheetId, startColumn, startColumn + 1, 105));
  }

  return requests;
}

// Creates one updateDimensionProperties request for a column range width.
function buildColumnWidthRequest_(sheetId, startIndex, endIndex, pixelSize) {
  return {
    updateDimensionProperties: {
      range: {
        sheetId: sheetId,
        dimension: 'COLUMNS',
        startIndex: startIndex,
        endIndex: endIndex
      },
      properties: { pixelSize: pixelSize },
      fields: 'pixelSize'
    }
  };
}

// Former Traitement value NONE is now NORMAL; rewrites award rows only, never the header rows.
function buildLegacyNoneTreatmentRequest_(sheetId) {
  return {
    findReplace: {
      find: 'NONE',
      replacement: 'NORMAL',
      matchCase: true,
      matchEntireCell: true,
      range: { sheetId: sheetId, startRowIndex: AWARDS_FIRST_ROW - 1 }
    }
  };
}

// Creates or refreshes the Awards blocks while preserving existing entries.
function buildAwardsGridRequests_(awardsState, rosterNames, archive, metadataBySheetId, argSeparator, classByName) {
  var requests = [];
  var existingGrid = awardsState.exists && !isLegacyAwardsSheet_(awardsState);
  var sheetId = existingGrid ? awardsState.sheetId : GRID_TABS.awards.sheetId;

  if (!existingGrid) {
    requests.push({
      addSheet: {
        properties: {
          sheetId: GRID_TABS.awards.sheetId,
          title: GRID_TABS.awards.name
        }
      }
    });
  }

  var existingNames = existingGrid ? readAwardsBlockNames_(awardsState.rows || []) : [];
  if (existingGrid) {
    requests.push(buildLegacyNoneTreatmentRequest_(sheetId));
    requests = requests.concat(buildGridRuleResetRequests_(sheetId, archive && archive.state, metadataBySheetId));
  }
  if (archive && archive.state && archive.state.exists) {
    requests.push(buildLegacyNoneTreatmentRequest_(archive.state.sheetId));
  }
  if (existingGrid && archive) {
    var awardsMove = buildArchiveMoveRequests_(
      { sheetId: sheetId, maxColumns: awardsState.maxColumns, names: existingNames },
      { tab: ARCHIVE_TABS.awards, state: archive.state, names: archive.state.exists ? readAwardsBlockNames_(archive.state.rows || []) : [] },
      { firstColumn: 0, width: AWARDS_BLOCK_WIDTH },
      archive.activeNames
    );
    requests = requests.concat(awardsMove.requests);
    existingNames = awardsMove.names;
  }
  var allNames = appendMissingNames_(existingNames, rosterNames);
  var totalColumns = allNames.length * AWARDS_BLOCK_WIDTH;

  requests.push({
    updateSheetProperties: {
      properties: {
        sheetId: sheetId,
        gridProperties: {
          columnCount: gridColumnCount_(awardsState, existingGrid, totalColumns),
          frozenRowCount: 2
        }
      },
      fields: 'gridProperties.columnCount,gridProperties.frozenRowCount'
    }
  });

  requests.push({
    unmergeCells: {
      range: {
        sheetId: sheetId,
        startRowIndex: 0,
        endRowIndex: 1,
        startColumnIndex: 0,
        endColumnIndex: Math.max(1, totalColumns)
      }
    }
  });

  requests = requests.concat(buildAwardsWidthRequests_(sheetId, allNames.length));

  var awardsSort = buildSortColumnsRequests_(sheetId, allNames, { firstColumn: 0, width: AWARDS_BLOCK_WIDTH });
  requests = requests.concat(awardsSort.requests);
  allNames = awardsSort.names;

  if (allNames.length) {
    requests.push({
      updateCells: {
        start: { sheetId: sheetId, rowIndex: 0, columnIndex: 0 },
        rows: [{ values: buildAwardsRowOne_(allNames) }],
        fields: 'userEnteredValue'
      }
    });

    requests.push({
      updateCells: {
        start: { sheetId: sheetId, rowIndex: 1, columnIndex: 0 },
        rows: [{ values: buildAwardsRowTwo_(allNames.length) }],
        fields: 'userEnteredValue'
      }
    });

    requests.push({
      repeatCell: {
        range: {
          sheetId: sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: totalColumns
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: rgbHex_(HEADER_STYLE.background),
            horizontalAlignment: 'CENTER',
            textFormat: {
              bold: true,
              fontSize: 14,
              foregroundColor: rgbHex_(HEADER_STYLE.text)
            }
          }
        },
        fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,textFormat)'
      }
    });

    requests.push({
      repeatCell: {
        range: {
          sheetId: sheetId,
          startRowIndex: 1,
          endRowIndex: 2,
          startColumnIndex: 0,
          endColumnIndex: totalColumns
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: rgbHex_(HEADER_STYLE.background),
            horizontalAlignment: 'CENTER',
            textFormat: { bold: true, foregroundColor: rgbHex_(HEADER_STYLE.text) },
            wrapStrategy: 'WRAP'
          }
        },
        fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,textFormat,wrapStrategy)'
      }
    });
  }

  for (var i = 0; i < allNames.length; i += 1) {
    var start = i * AWARDS_BLOCK_WIDTH;
    requests.push(buildClassHeaderTextRequest_(sheetId, start, AWARDS_BLOCK_WIDTH, classByName && classByName[allNames[i]]));
    requests.push({
      mergeCells: {
        range: {
          sheetId: sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: start,
          endColumnIndex: start + AWARDS_BLOCK_WIDTH
        },
        mergeType: 'MERGE_ALL'
      }
    });

    requests.push({
      updateBorders: {
        range: {
          sheetId: sheetId,
          startColumnIndex: start,
          endColumnIndex: start + AWARDS_BLOCK_WIDTH
        },
        right: {
          style: 'SOLID',
          color: rgbHex_('253746')
        }
      }
    });

    requests.push(buildDataValidationRequestByRange_(sheetId, {
      startRowIndex: AWARDS_FIRST_ROW - 1,
      startColumnIndex: start + AWARDS_TREATMENT_OFFSET,
      endColumnIndex: start + AWARDS_TREATMENT_OFFSET + 1
    }, {
      condition: {
        type: 'ONE_OF_LIST',
        values: [
          { userEnteredValue: 'BIS' },
          { userEnteredValue: 'IMPACT' },
          { userEnteredValue: 'CLASS_BOUND' },
          { userEnteredValue: 'NORMAL' }
        ]
      },
      strict: true,
      showCustomUi: true,
      inputMessage: 'Traitement : BIS, IMPACT, CLASS_BOUND ou NORMAL.'
    }));

    // Whole award row tinted by its Traitement with WoW rarity: NORMAL uncommon, CLASS_BOUND rare, BIS epic, IMPACT legendary.
    var treatmentCell = '$' + columnLetter_(start + AWARDS_TREATMENT_OFFSET) + AWARDS_FIRST_ROW;
    [
      { value: 'NORMAL', style: RARITY_STYLE.uncommon },
      { value: 'CLASS_BOUND', style: RARITY_STYLE.rare },
      { value: 'BIS', style: RARITY_STYLE.epic },
      { value: 'IMPACT', style: RARITY_STYLE.legendary }
    ].forEach(function (rule) {
      requests.push(buildConditionalFormatRequestAtRow_(sheetId, start, start + AWARDS_BLOCK_WIDTH, AWARDS_FIRST_ROW - 1,
        '=' + treatmentCell + '="' + rule.value + '"', rarityFormat_(rule.style), argSeparator));
    });
  }

  return requests;
}

// Reads existing Awards block names from row 1 in 5-column steps; a blank title keeps its slot.
function readAwardsBlockNames_(rows) {
  var header = trimmedHeaderRow_(rows);
  var names = [];

  for (var start = 0; start < header.length; start += AWARDS_BLOCK_WIDTH) {
    names.push(header[start] || '');
  }

  return names;
}

// Builds Awards row 1 values (one merged title cell per raider block).
function buildAwardsRowOne_(names) {
  var values = [];

  names.forEach(function (name) {
    for (var offset = 0; offset < AWARDS_BLOCK_WIDTH; offset += 1) {
      values.push({ userEnteredValue: { stringValue: offset === 0 ? name : '' } });
    }
  });

  return values;
}

// Builds Awards row 2 sub-headers repeated for each raider block.
function buildAwardsRowTwo_(count) {
  var values = [];

  for (var i = 0; i < count; i += 1) {
    for (var offset = 0; offset < AWARDS_BLOCK_WIDTH; offset += 1) {
      if (offset === AWARDS_DATE_OFFSET) {
        values.push({ userEnteredValue: { stringValue: 'Date' } });
      } else if (offset === 1) {
        values.push({ userEnteredValue: { stringValue: 'Objet' } });
      } else if (offset === 2) {
        values.push({ userEnteredValue: { stringValue: 'Objet (ID)' } });
      } else if (offset === AWARDS_TREATMENT_OFFSET) {
        values.push({ userEnteredValue: { stringValue: 'Traitement' } });
      } else {
        values.push({ userEnteredValue: { stringValue: 'Raid (ID)' } });
      }
    }
  }

  return values;
}

// Sets standard widths for each 5-column Awards block.
function buildAwardsWidthRequests_(sheetId, blockCount) {
  var requests = [];

  for (var i = 0; i < blockCount; i += 1) {
    var start = i * AWARDS_BLOCK_WIDTH;
    requests.push(buildColumnWidthRequest_(sheetId, start, start + 1, 120));
    requests.push(buildColumnWidthRequest_(sheetId, start + 1, start + 2, 220));
    requests.push(buildColumnWidthRequest_(sheetId, start + 2, start + 3, 120));
    requests.push(buildColumnWidthRequest_(sheetId, start + AWARDS_TREATMENT_OFFSET, start + AWARDS_TREATMENT_OFFSET + 1, 130));
    // Raid (ID) is written by End raid and read by Delete raid; the owner never needs to see it.
    requests.push({
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: 'COLUMNS',
          startIndex: start + AWARDS_RAID_ID_OFFSET,
          endIndex: start + AWARDS_RAID_ID_OFFSET + 1
        },
        properties: { pixelSize: 120, hiddenByUser: true },
        fields: 'pixelSize,hiddenByUser'
      }
    });
  }

  return requests;
}

// Creates or refreshes one role's item grid (Objets <role>) and its rules.
function buildTierItemsGridRequests_(tierState, metadataBySheetId, argSeparator, itemTab) {
  var separator = argSeparator || ',';
  var requests = [];
  var specs = SPEC_COLUMNS.filter(function (entry) { return entry.role === itemTab.role; });
  var existingGrid = tierState.exists;
  var sheetId = existingGrid ? tierState.sheetId : itemTab.sheetId;
  var totalColumns = OBJETS_FIRST_SPEC_COLUMN + (specs.length * 2);
  // Tabs built before the Emplacement column get it inserted so owner data shifts with its spec.
  var needsSlotColumn = existingGrid && ((tierState.rows || [])[2] || [])[OBJETS_SLOT_COLUMN] !== 'Emplacement';

  if (!existingGrid) {
    requests.push({
      addSheet: {
        properties: {
          sheetId: itemTab.sheetId,
          title: itemTab.name
        }
      }
    });
  }

  if (needsSlotColumn) {
    requests.push({
      insertDimension: {
        range: {
          sheetId: sheetId,
          dimension: 'COLUMNS',
          startIndex: OBJETS_SLOT_COLUMN,
          endIndex: OBJETS_SLOT_COLUMN + 1
        },
        inheritFromBefore: true
      }
    });
  }

  requests.push({
    updateSheetProperties: {
      properties: {
        sheetId: sheetId,
        gridProperties: {
          columnCount: gridColumnCount_(tierState, existingGrid,
            Math.max(totalColumns, needsSlotColumn ? Number(tierState.maxColumns || 0) + 1 : 0)),
          frozenRowCount: 3,
          frozenColumnCount: OBJETS_FIRST_SPEC_COLUMN
        }
      },
      fields: 'gridProperties.columnCount,gridProperties.frozenRowCount,gridProperties.frozenColumnCount'
    }
  });

  requests.push({
    unmergeCells: {
      range: {
        sheetId: sheetId,
        startRowIndex: 0,
        endRowIndex: 3,
        startColumnIndex: 0,
        endColumnIndex: totalColumns
      }
    }
  });

  requests.push({
    updateCells: {
      start: { sheetId: sheetId, rowIndex: 0, columnIndex: 0 },
      rows: buildTierHeaderRows_(specs),
      fields: 'userEnteredValue'
    }
  });

  // Rows 1-2 above Objet (ID), Objet and Emplacement stay plain; an earlier insert left a class colour on C2.
  requests.push({
    repeatCell: {
      range: {
        sheetId: sheetId,
        startRowIndex: 0,
        endRowIndex: 2,
        startColumnIndex: 0,
        endColumnIndex: OBJETS_FIRST_SPEC_COLUMN
      },
      cell: { userEnteredFormat: {} },
      fields: 'userEnteredFormat'
    }
  });

  requests.push({
    repeatCell: {
      range: {
        sheetId: sheetId,
        startRowIndex: 0,
        endRowIndex: 1,
        startColumnIndex: OBJETS_FIRST_SPEC_COLUMN,
        endColumnIndex: totalColumns
      },
      cell: {
        userEnteredFormat: {
          backgroundColor: rgbHex_(HEADER_STYLE.background),
          horizontalAlignment: 'CENTER',
          textFormat: {
            bold: true,
            foregroundColor: rgbHex_(HEADER_STYLE.text)
          }
        }
      },
      fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,textFormat)'
    }
  });

  requests.push({
    repeatCell: {
      range: {
        sheetId: sheetId,
        startRowIndex: 2,
        endRowIndex: 3,
        startColumnIndex: 0,
        endColumnIndex: totalColumns
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
  });

  requests = requests.concat(buildTierSpecLabelStyleRequests_(sheetId, specs));
  requests = requests.concat(buildTierMergeRequests_(sheetId, specs));
  requests = requests.concat(buildTierWidthRequests_(sheetId, specs));
  // Only an existing grid has old rules to remove; a recreated tab may reuse nothing.
  if (existingGrid) {
    requests = requests.concat(buildDeleteExistingLayoutRequests_(sheetId, metadataBySheetId));
  }
  requests = requests.concat(buildTierGainRuleRequests_(sheetId, separator, specs));
  requests = requests.concat(buildTierStatusValidationRequests_(sheetId, specs));
  requests = requests.concat(buildTierSlotValidationRequests_(sheetId));
  requests = requests.concat(buildTierStatusTextFormatRequests_(sheetId, specs));
  requests = requests.concat(buildTierGainFormatRequests_(sheetId, specs));

  return requests;
}

// Builds the three item-grid header rows for the given specs.
function buildTierHeaderRows_(specs) {
  var totalColumns = OBJETS_FIRST_SPEC_COLUMN + (specs.length * 2);
  var row1 = [];
  var row2 = [];
  var row3 = [];

  for (var i = 0; i < totalColumns; i += 1) {
    row1.push({ userEnteredValue: { stringValue: '' } });
    row2.push({ userEnteredValue: { stringValue: '' } });
    row3.push({ userEnteredValue: { stringValue: '' } });
  }

  row3[0] = { userEnteredValue: { stringValue: 'Objet (ID)' } };
  row3[1] = { userEnteredValue: { stringValue: 'Objet' } };
  row3[OBJETS_SLOT_COLUMN] = { userEnteredValue: { stringValue: 'Emplacement' } };

  var roleStartByName = Object.create(null);
  var roleEndByName = Object.create(null);

  specs.forEach(function (entry, index) {
    var statusColumn = OBJETS_FIRST_SPEC_COLUMN + (index * 2);
    row2[statusColumn] = { userEnteredValue: { stringValue: entry.spec } };
    row3[statusColumn] = { userEnteredValue: { stringValue: 'Statut' } };
    row3[statusColumn + 1] = { userEnteredValue: { stringValue: 'Gain (%)' } };

    if (!Object.prototype.hasOwnProperty.call(roleStartByName, entry.role)) {
      roleStartByName[entry.role] = statusColumn;
    }
    roleEndByName[entry.role] = statusColumn + 2;
  });

  Object.keys(roleStartByName).forEach(function (roleName) {
    row1[roleStartByName[roleName]] = { userEnteredValue: { stringValue: roleName } };
  });

  return [{ values: row1 }, { values: row2 }, { values: row3 }];
}

// Styles each spec label pair on row 2 with its class colour.
function buildTierSpecLabelStyleRequests_(sheetId, specs) {
  var classColorByName = Object.create(null);
  CLASS_SPECS.forEach(function (entry) {
    classColorByName[entry.name] = { bg: entry.colorHex, text: entry.textHex };
  });

  return specs.map(function (entry, index) {
    var gainColumn = OBJETS_FIRST_SPEC_COLUMN + (index * 2);
    var colors = classColorByName[entry.className] || { bg: 'FFFFFF', text: '1F1F1F' };

    return {
      repeatCell: {
        range: {
          sheetId: sheetId,
          startRowIndex: 1,
          endRowIndex: 2,
          startColumnIndex: gainColumn,
          endColumnIndex: gainColumn + 2
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: rgbHex_(colors.bg),
            horizontalAlignment: 'CENTER',
            textFormat: {
              bold: true,
              foregroundColor: rgbHex_(colors.text)
            },
            wrapStrategy: 'WRAP'
          }
        },
        fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,textFormat,wrapStrategy)'
      }
    };
  });
}

// Merges role headers and spec headers to match the two-row grid hierarchy.
function buildTierMergeRequests_(sheetId, specs) {
  var requests = [];
  var index = 0;

  while (index < specs.length) {
    var roleName = specs[index].role;
    var roleStart = OBJETS_FIRST_SPEC_COLUMN + (index * 2);
    var roleEnd = roleStart;

    while (index < specs.length && specs[index].role === roleName) {
      roleEnd = OBJETS_FIRST_SPEC_COLUMN + (index * 2) + 2;
      index += 1;
    }

    requests.push({
      mergeCells: {
        range: {
          sheetId: sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: roleStart,
          endColumnIndex: roleEnd
        },
        mergeType: 'MERGE_ALL'
      }
    });
  }

  specs.forEach(function (_, specIndex) {
    var gainColumn = OBJETS_FIRST_SPEC_COLUMN + (specIndex * 2);
    requests.push({
      mergeCells: {
        range: {
          sheetId: sheetId,
          startRowIndex: 1,
          endRowIndex: 2,
          startColumnIndex: gainColumn,
          endColumnIndex: gainColumn + 2
        },
        mergeType: 'MERGE_ALL'
      }
    });
  });

  return requests;
}

// Sets one Objets tab's column widths for item fields and per-spec pairs.
function buildTierWidthRequests_(sheetId, specs) {
  var requests = [
    buildColumnWidthRequest_(sheetId, 0, 1, 120),
    buildColumnWidthRequest_(sheetId, 1, 2, 220),
    buildColumnWidthRequest_(sheetId, OBJETS_SLOT_COLUMN, OBJETS_SLOT_COLUMN + 1, 130)
  ];

  specs.forEach(function (_, index) {
    var statusColumn = OBJETS_FIRST_SPEC_COLUMN + (index * 2);
    requests.push(buildColumnWidthRequest_(sheetId, statusColumn, statusColumn + 1, 120));
    requests.push(buildColumnWidthRequest_(sheetId, statusColumn + 1, statusColumn + 2, 105));
  });

  return requests;
}

// Builds one negative and one >=2% conditional format rule for each gain column.
function buildTierGainRuleRequests_(sheetId, argSeparator, specs) {
  var requests = [];

  specs.forEach(function (_, index) {
    var gainColumn = OBJETS_FIRST_SPEC_COLUMN + (index * 2) + 1;
    var gainLetter = columnLetter_(gainColumn);

    requests.push(
      buildConditionalFormatRequestAtRow_(
        sheetId,
        gainColumn,
        gainColumn + 1,
        3,
        '=' + gainLetter + '4<0',
        { textFormat: { foregroundColor: rgbHex_('B3261E') } },
        argSeparator
      )
    );

    requests.push(
      buildConditionalFormatRequestAtRow_(
        sheetId,
        gainColumn,
        gainColumn + 1,
        3,
        '=' + gainLetter + '4>=1/50',
        { textFormat: { foregroundColor: rgbHex_('1E7D32'), bold: true } },
        argSeparator
      )
    );

    // Statut cell only, same WoW rarity colours as the Awards Traitement.
    var statusColumn = gainColumn - 1;
    var statusLetter = columnLetter_(statusColumn);
    [
      { value: 'NORMAL', style: RARITY_STYLE.uncommon },
      { value: 'CLASS_BOUND', style: RARITY_STYLE.rare },
      { value: 'BIS', style: RARITY_STYLE.epic },
      { value: 'IMPACT', style: RARITY_STYLE.legendary }
    ].forEach(function (rule) {
      requests.push(buildConditionalFormatRequestAtRow_(sheetId, statusColumn, statusColumn + 1, 3,
        '=' + statusLetter + '4="' + rule.value + '"', rarityFormat_(rule.style), argSeparator));
    });
  });

  return requests;
}

// Adds per-spec status dropdowns from row 4 to the sheet bottom.
function buildTierStatusValidationRequests_(sheetId, specs) {
  var requests = [];

  specs.forEach(function (_, index) {
    var statusColumn = OBJETS_FIRST_SPEC_COLUMN + (index * 2);
    // Clear both columns of the pair: before the swap the Statut dropdown sat on today's Gain column.
    requests.push(buildDataValidationRequestByRange_(sheetId, {
      startRowIndex: 3,
      startColumnIndex: statusColumn,
      endColumnIndex: statusColumn + 2
    }));

    requests.push(buildDataValidationRequestByRange_(sheetId, {
      startRowIndex: 3,
      startColumnIndex: statusColumn,
      endColumnIndex: statusColumn + 1
    }, {
      condition: {
        type: 'ONE_OF_LIST',
        values: [
          { userEnteredValue: 'BIS' },
          { userEnteredValue: 'IMPACT' },
          { userEnteredValue: 'CLASS_BOUND' },
          { userEnteredValue: 'NORMAL' }
        ]
      },
      strict: true,
      showCustomUi: true,
      inputMessage: 'Statut : BIS, IMPACT, CLASS_BOUND ou NORMAL.'
    }));
  });

  return requests;
}

// Emplacement dropdown from row 4 to the sheet bottom.
function buildTierSlotValidationRequests_(sheetId) {
  return [buildDataValidationRequestByRange_(sheetId, {
    startRowIndex: 3,
    startColumnIndex: OBJETS_SLOT_COLUMN,
    endColumnIndex: OBJETS_SLOT_COLUMN + 1
  }, {
    condition: {
      type: 'ONE_OF_LIST',
      values: ITEM_SLOTS.map(function (slot) { return { userEnteredValue: slot }; })
    },
    strict: true,
    showCustomUi: true,
    inputMessage: 'Emplacement de l\'objet.'
  })];
}

// Applies percent number format on all gain columns from row 4 onward.
function buildTierGainFormatRequests_(sheetId, specs) {
  var requests = [];

  specs.forEach(function (_, index) {
    var gainColumn = OBJETS_FIRST_SPEC_COLUMN + (index * 2) + 1;
    requests.push({
      repeatCell: {
        range: {
          sheetId: sheetId,
          startRowIndex: 3,
          startColumnIndex: gainColumn,
          endColumnIndex: gainColumn + 1
        },
        cell: {
          userEnteredFormat: {
            numberFormat: {
              type: 'PERCENT',
              pattern: '0.0%'
            }
          }
        },
        fields: 'userEnteredFormat.numberFormat'
      }
    });
  });

  return requests;
}

// Applies plain-text format on all statut columns from row 4 onward.
function buildTierStatusTextFormatRequests_(sheetId, specs) {
  var requests = [];

  specs.forEach(function (_, index) {
    var statusColumn = OBJETS_FIRST_SPEC_COLUMN + (index * 2);
    requests.push({
      repeatCell: {
        range: {
          sheetId: sheetId,
          startRowIndex: 3,
          startColumnIndex: statusColumn,
          endColumnIndex: statusColumn + 1
        },
        cell: {
          userEnteredFormat: {
            numberFormat: {
              type: 'TEXT'
            }
          }
        },
        fields: 'userEnteredFormat.numberFormat'
      }
    });
  });

  return requests;
}

// Creates one validation request for an explicit range payload.
function buildDataValidationRequestByRange_(sheetId, range, rule) {
  return {
    setDataValidation: {
      range: {
        sheetId: sheetId,
        startRowIndex: range.startRowIndex,
        endRowIndex: range.endRowIndex,
        startColumnIndex: range.startColumnIndex,
        endColumnIndex: range.endColumnIndex
      },
      rule: rule
    }
  };
}

// Adds a custom-formula conditional format rule starting at a specific row index.
function buildConditionalFormatRequestAtRow_(sheetId, startColumnIndex, endColumnIndex, startRowIndex, formula, format, argSeparator) {
  var normalizedFormula = applyArgSeparator_(formula, argSeparator || ',');

  return {
    addConditionalFormatRule: {
      rule: {
        ranges: [
          {
            sheetId: sheetId,
            startRowIndex: startRowIndex,
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

// Class of each Roster and Rerolls name, for class-coloured raider headers.
function readClassByName_(spreadsheet) {
  var classByName = Object.create(null);
  [['Roster', 'raiderKey'], ['Rerolls', 'rerollName']].forEach(function (entry) {
    var sheet = spreadsheet.getSheetByName(entry[0]);
    if (!sheet) {
      return;
    }
    var tab = tabByName_(entry[0]);
    var nameColumn = columnOf_(tab, entry[1]);
    var rows = sheet.getDataRange().getValues();
    // Read before this batch's column migrations run, so find Classe in the live header, not the contract.
    var liveClassColumn = indexOfHeader_((rows[0] || []).map(function (cell) { return String(cell).trim(); }), ['class', 'Classe']);
    var classColumn = liveClassColumn !== -1 ? liveClassColumn : columnOf_(tab, 'class');
    rows.slice(1).forEach(function (row) {
      var name = (row || [])[nameColumn];
      if (name !== '' && name !== null && name !== undefined && !classByName[String(name)]) {
        classByName[String(name)] = String(row[classColumn] || '');
      }
    });
  });
  return classByName;
}

// Names whose Présence/Awards columns stay active: Roster raiders plus Rerolls names.
function readActiveNames_(spreadsheet, rosterNames) {
  var active = Object.create(null);
  // An empty Roster is more likely a mistake than a disbanded guild: no active names means no archiving.
  if (!rosterNames.length) {
    return active;
  }
  rosterNames.forEach(function (name) {
    active[name] = true;
  });

  var rerollsSheet = spreadsheet.getSheetByName('Rerolls');
  if (!rerollsSheet) {
    return active;
  }
  var nameColumn = columnOf_(tabByName_('Rerolls'), 'rerollName');
  rerollsSheet.getDataRange().getValues().slice(1).forEach(function (row) {
    var value = (row || [])[nameColumn];
    if (value !== '' && value !== null && value !== undefined) {
      active[String(value)] = true;
    }
  });
  return active;
}

// Reads and sorts unique roster names from the Raider column.
function readSortedRosterNames_(spreadsheet) {
  var rosterSheet = spreadsheet.getSheetByName('Roster');
  if (!rosterSheet) {
    return [];
  }

  var rosterTab = tabByName_('Roster');
  var raiderColumn = columnOf_(rosterTab, 'raiderKey');
  var rows = rosterSheet.getDataRange().getValues();
  var seen = Object.create(null);
  var names = [];

  for (var rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    var row = rows[rowIndex] || [];
    var value = row[raiderColumn];
    if (value === '' || value === null || value === undefined) {
      continue;
    }
    var name = String(value);
    if (Object.prototype.hasOwnProperty.call(seen, name)) {
      continue;
    }
    seen[name] = true;
    names.push(name);
  }

  names.sort(function (left, right) {
    return left.localeCompare(right);
  });
  return names;
}
