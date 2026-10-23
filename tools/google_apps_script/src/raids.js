// Menu action: picks a raid from the Raids tab, then deletes it everywhere after a confirmation.
function deleteRaid() {
  var ui = SpreadsheetApp.getUi();
  var choices = raidChoices_(SpreadsheetApp.getActive());
  if (!choices.length) {
    ui.alert('Aucun raid dans l\'onglet Raids.');
    return;
  }

  var options = choices.map(function (choice) {
    return '<option value="' + snapshotEscapeHtml_(choice.raidId) + '">' + snapshotEscapeHtml_(choice.label) + '</option>';
  }).join('');
  var html = HtmlService.createHtmlOutput(
    '<div style="font-family:Verdana,Arial,sans-serif;padding:12px">' +
      '<p style="margin:0 0 8px 0">Sa ligne Raids, sa ligne Présence et ses loots dans Awards (archives comprises) seront supprimés.</p>' +
      '<select id="raid" style="width:100%;padding:4px">' + options + '</select>' +
      '<div style="margin-top:12px;display:flex;gap:8px;align-items:center">' +
        '<button id="delete" onclick="confirmDelete()">Supprimer</button>' +
        '<button onclick="google.script.host.close()">Annuler</button>' +
        '<span id="status"></span>' +
      '</div>' +
      '<script>' +
        'function confirmDelete(){' +
          'var select=document.getElementById("raid");' +
          'var label=select.options[select.selectedIndex].text;' +
          'if(!window.confirm("Supprimer définitivement le raid "+label+" ?")){return;}' +
          'document.getElementById("delete").disabled=true;' +
          'document.getElementById("status").textContent="Suppression...";' +
          'google.script.run' +
            '.withSuccessHandler(function(message){alert(message);google.script.host.close();})' +
            '.withFailureHandler(function(error){document.getElementById("delete").disabled=false;document.getElementById("status").textContent="";alert("Delete raid failed:\\n"+error.message);})' +
            '.submitDeleteRaid(select.value);' +
        '}' +
      '</script>' +
    '</div>'
  ).setWidth(520).setHeight(200);

  ui.showModalDialog(html, 'Delete raid');
}

// Called by the Delete raid dialog after the owner confirmed; returns the summary.
function submitDeleteRaid(raidId) {
  var id = normalizeCellString_(raidId).trim();
  if (!id) {
    throw new Error('Choisir un raid.');
  }
  var summary = '';
  applyBatch_(function () {
    var built = buildDeleteRaidRequests_(SpreadsheetApp.getActive(), id);
    summary = built.summary;
    return built.requests;
  });
  return summary;
}

// One choice per Raids row: "Raid (ID) - Instance - Date du raid", blank parts left out.
function raidChoices_(spreadsheet) {
  var sheet = spreadsheet.getSheetByName('Raids');
  if (!sheet) {
    return [];
  }
  var tab = tabByName_('Raids');
  var timeZone = Session.getScriptTimeZone();
  return sheet.getDataRange().getValues().slice(1).map(function (row) {
    var raidId = normalizeCellString_(row[columnOf_(tab, 'raidId')]).trim();
    var date = row[columnOf_(tab, 'raidDate')];
    var dateText = date instanceof Date ? Utilities.formatDate(date, timeZone, 'dd/MM/yyyy') : normalizeCellString_(date).trim();
    var parts = [raidId, normalizeCellString_(row[columnOf_(tab, 'instance')]).trim(), dateText].filter(function (part) { return part; });
    return { raidId: raidId, label: parts.join(' - ') };
  }).filter(function (choice) {
    return choice.raidId;
  });
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
