// Menu action: deletes one raid everywhere (Raids row, Présence row, its loot in Awards and the archives).
function deleteRaid() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.prompt(
    'Delete raid',
    'Raid (ID) à supprimer. Sa ligne Raids, sa ligne Présence et ses loots dans Awards (archives comprises) seront supprimés.',
    ui.ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }
  var raidId = normalizeCellString_(response.getResponseText()).trim();
  if (!raidId) {
    return;
  }

  try {
    var summary = '';
    applyBatch_(function () {
      var built = buildDeleteRaidRequests_(SpreadsheetApp.getActive(), raidId);
      summary = built.summary;
      return built.requests;
    });
    ui.alert(summary);
  } catch (error) {
    ui.alert('Delete raid failed:\n' + error.message);
  }
}

// All requests that remove one raid; rows are deleted bottom-up so earlier indexes stay valid.
function buildDeleteRaidRequests_(spreadsheet, raidId) {
  var configSheet = snapshotSheet_(spreadsheet, 'Config');
  var raidsSheet = snapshotSheet_(spreadsheet, 'Raids');
  var presenceSheet = snapshotSheet_(spreadsheet, GRID_TABS.presence.name);
  var configRows = requireCurrentLayout_(configSheet.getDataRange().getValues(), 'Config');
  var raidsRows = requireCurrentLayout_(raidsSheet.getDataRange().getValues(), 'Raids');
  var presenceRows = presenceSheet.getDataRange().getValues();
  var requests = [];
  var counts = { raids: 0, presence: 0, awards: 0 };

  var raidsIndexes = matchingRowIndexes_(raidsRows, 1, columnOf_(tabByName_('Raids'), 'raidId'), raidId);
  requests = requests.concat(buildDeleteRowRequests_(raidsSheet.getSheetId(), raidsIndexes));
  counts.raids = raidsIndexes.length;

  var presenceIndexes = matchingRowIndexes_(presenceRows, PRESENCE_FIRST_RAID_ROW - 1, PRESENCE_RAID_ID_COLUMN, raidId);
  requests = requests.concat(buildDeleteRowRequests_(presenceSheet.getSheetId(), presenceIndexes));
  counts.presence = presenceIndexes.length;

  // Présence (archive) rows line up with Présence rows, so the same rows go.
  var presenceArchive = spreadsheet.getSheetByName(ARCHIVE_TABS.presence.name);
  if (presenceArchive) {
    var archiveRows = presenceArchive.getDataRange().getValues();
    var archiveIndexes = presenceIndexes.filter(function (index) {
      return normalizeCellString_((archiveRows[index] || [])[PRESENCE_RAID_ID_COLUMN]).trim() === raidId;
    });
    requests = requests.concat(buildDeleteRowRequests_(presenceArchive.getSheetId(), archiveIndexes));
  }

  [GRID_TABS.awards.name, ARCHIVE_TABS.awards.name].forEach(function (name) {
    var sheet = spreadsheet.getSheetByName(name);
    if (!sheet) {
      return;
    }
    var rows = sheet.getDataRange().getValues();
    var width = (rows[0] || []).length;
    for (var start = 0; start < width; start += AWARDS_BLOCK_WIDTH) {
      var entryIndexes = matchingRowIndexes_(rows, AWARDS_FIRST_ROW - 1, start + AWARDS_RAID_ID_OFFSET, raidId);
      entryIndexes.slice().reverse().forEach(function (rowIndex) {
        requests.push({
          deleteRange: {
            range: { sheetId: sheet.getSheetId(), startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: start, endColumnIndex: start + AWARDS_BLOCK_WIDTH },
            shiftDimension: 'ROWS'
          }
        });
      });
      if (name === GRID_TABS.awards.name) {
        counts.awards += entryIndexes.length;
      }
    }
  });

  var openRaidColumn = columnOf_(tabByName_('Config'), 'openRaidId');
  var wasStarted = normalizeCellString_((configRows[1] || [])[openRaidColumn]).trim() === raidId;
  if (wasStarted) {
    requests = requests.concat(buildRaidProtectionDeleteRequests_(Sheets.Spreadsheets.get(spreadsheet.getId(), {
      fields: 'sheets(properties(sheetId,title),protectedRanges(protectedRangeId,description))'
    })));
    requests.push({
      updateCells: {
        start: { sheetId: configSheet.getSheetId(), rowIndex: 1, columnIndex: openRaidColumn },
        rows: [{ values: [{}] }],
        fields: 'userEnteredValue'
      }
    });
  }

  if (!requests.length) {
    throw new Error('Raid ' + raidId + ' introuvable : rien supprimé.');
  }

  return {
    requests: requests,
    summary: 'Raid ' + raidId + ' supprimé : ' + counts.raids + ' ligne(s) Raids, ' + counts.presence + ' ligne(s) Présence, ' +
      counts.awards + ' loot(s) Awards' + (wasStarted ? ', raid démarré annulé.' : '.')
  };
}

// Indexes of rows (from firstIndex) whose column holds the raid ID.
function matchingRowIndexes_(rows, firstIndex, column, raidId) {
  var indexes = [];
  for (var rowIndex = firstIndex; rowIndex < rows.length; rowIndex += 1) {
    if (normalizeCellString_((rows[rowIndex] || [])[column]).trim() === raidId) {
      indexes.push(rowIndex);
    }
  }
  return indexes;
}

// Whole-row deletes, highest index first.
function buildDeleteRowRequests_(sheetId, rowIndexes) {
  return rowIndexes.slice().sort(function (a, b) { return b - a; }).map(function (rowIndex) {
    return {
      deleteDimension: {
        range: { sheetId: sheetId, dimension: 'ROWS', startIndex: rowIndex, endIndex: rowIndex + 1 }
      }
    };
  });
}
