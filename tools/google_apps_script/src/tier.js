// Setup menu: opens the Nouveau palier dialog (refused while a raid is in progress).
function openNewTierDialog() {
  var ui = SpreadsheetApp.getUi();
  var current;
  try {
    current = readTierState_(SpreadsheetApp.getActive());
  } catch (error) {
    ui.alert('Nouveau palier impossible :\n' + error.message);
    return;
  }
  if (current.openRaidId) {
    ui.alert('Nouveau palier impossible : terminez ou annulez le raid en cours (' + current.openRaidId + ') d\'abord.');
    return;
  }

  var currentText = current.tierId
    ? 'Palier actuel : ' + current.tierId + (current.startSerial !== null ? ', depuis le ' + formatSerialDate_(current.startSerial) : '')
    : 'Aucun palier actif : ce sera le premier.';
  var html = HtmlService.createHtmlOutput(
    '<div style="font-family:Verdana,Arial,sans-serif;padding:12px">' +
      '<p style="margin:0 0 10px 0">' + snapshotEscapeHtml_(currentText) + '</p>' +
      '<label>Palier (ID)<br><input id="tier" style="width:100%;padding:4px" placeholder="ex. forever-t2"></label>' +
      '<label style="display:block;margin-top:8px">Début du palier<br><input id="start" type="date" style="padding:4px"></label>' +
      '<div style="margin-top:12px;display:flex;gap:8px;align-items:center">' +
        '<button id="go" onclick="confirmTier()">Valider</button>' +
        '<button onclick="google.script.host.close()">Annuler</button>' +
        '<span id="status"></span>' +
      '</div>' +
      '<script>' +
        'var current=' + JSON.stringify(current.tierId).replace(/</g, '\\u003c') + ';' +
        'var d=new Date();document.getElementById("start").value=d.getFullYear()+"-"+("0"+(d.getMonth()+1)).slice(-2)+"-"+("0"+d.getDate()).slice(-2);' +
        'function confirmTier(){' +
          'var tier=document.getElementById("tier").value.trim();' +
          'var start=document.getElementById("start").value;' +
          'if(!tier||!start){alert("Palier (ID) et Début du palier sont obligatoires.");return;}' +
          'var p=start.split("-");' +
          'var recap="Nouveau palier : "+tier+"\\nDébut du palier : "+p[2]+"/"+p[1]+"/"+p[0];' +
          'if(current){recap+="\\n\\nPalier sortant : "+current+' +
            '"\\n- les raids sans palier dans Raids seront marqués "+current+' +
            '"\\n- les onglets Objets seront archivés dans « Objets ("+current+") » puis vidés";}' +
          'if(!window.confirm(recap+"\\n\\nConfirmer ?")){return;}' +
          'document.getElementById("go").disabled=true;document.getElementById("status").textContent="En cours...";' +
          'google.script.run' +
            '.withSuccessHandler(function(message){alert(message);google.script.host.close();})' +
            '.withFailureHandler(function(error){document.getElementById("go").disabled=false;document.getElementById("status").textContent="";alert("Nouveau palier impossible :\\n"+error.message);})' +
            '.submitNewTier(tier,start);' +
        '}' +
      '</script>' +
    '</div>'
  ).setWidth(460).setHeight(260);

  ui.showModalDialog(html, 'Nouveau palier');
}

// Called by the dialog after the owner confirmed: activates the tier in one batch and returns the summary.
function submitNewTier(tierIdText, startIso) {
  var summary = '';
  applyBatch_(function () {
    var built = buildNewTierRequests_(SpreadsheetApp.getActive(), tierIdText, startIso);
    summary = built.summary;
    return built.requests;
  });
  return summary;
}

// Config's tier cells (current layout required).
function readTierState_(spreadsheet) {
  var configTab = tabByName_('Config');
  var configRow = requireCurrentLayout_(snapshotSheet_(spreadsheet, 'Config').getDataRange().getValues(), 'Config')[1] || [];
  return {
    tierId: normalizeCellString_(configRow[columnOf_(configTab, 'tierId')]).trim(),
    startSerial: dateSerialFromCell_(configRow[columnOf_(configTab, 'bisWindowStart')]),
    openRaidId: normalizeCellString_(configRow[columnOf_(configTab, 'openRaidId')]).trim()
  };
}

// Config writes, Raids tier stamps, the one-tab Objets archive and the emptying of the live Objets tabs.
function buildNewTierRequests_(spreadsheet, tierIdText, startIso) {
  var tierId = normalizeCellString_(tierIdText).trim();
  var startSerial = dateSerialFromIso_(startIso);
  var current = readTierState_(spreadsheet);
  var raidsSheet = snapshotSheet_(spreadsheet, 'Raids');
  var raidsRows = requireCurrentLayout_(raidsSheet.getDataRange().getValues(), 'Raids');

  if (current.openRaidId) {
    throw new Error('terminez ou annulez le raid en cours (' + current.openRaidId + ') d\'abord.');
  }
  if (!tierId) {
    throw new Error('Palier (ID) obligatoire.');
  }
  if (startSerial === null) {
    throw new Error('Début du palier invalide.');
  }
  if (current.tierId && tierId === current.tierId) {
    throw new Error('le palier ' + tierId + ' est déjà actif.');
  }
  if (current.startSerial !== null && startSerial <= current.startSerial) {
    throw new Error('le début du palier doit être après le ' + formatSerialDate_(current.startSerial) + '.');
  }

  var configSheet = snapshotSheet_(spreadsheet, 'Config');
  var configTab = tabByName_('Config');
  var requests = [{
    updateCells: {
      start: { sheetId: configSheet.getSheetId(), rowIndex: 1, columnIndex: columnOf_(configTab, 'tierId') },
      rows: [{ values: [{ userEnteredValue: { stringValue: tierId } }] }],
      fields: 'userEnteredValue'
    }
  }, {
    updateCells: {
      start: { sheetId: configSheet.getSheetId(), rowIndex: 1, columnIndex: columnOf_(configTab, 'bisWindowStart') },
      rows: [{ values: [{ userEnteredValue: { numberValue: startSerial } }] }],
      fields: 'userEnteredValue'
    }
  }];
  var summary = 'Palier ' + tierId + ' actif depuis le ' + formatSerialDate_(startSerial) + '.';

  if (!current.tierId) {
    return { requests: requests, summary: summary };
  }

  var raidsTab = tabByName_('Raids');
  var raidIdColumn = columnOf_(raidsTab, 'raidId');
  var raidTierColumn = columnOf_(raidsTab, 'raidTier');
  var raidDateColumn = columnOf_(raidsTab, 'raidDate');
  var stamped = 0;
  for (var rowIndex = 1; rowIndex < raidsRows.length; rowIndex += 1) {
    var row = raidsRows[rowIndex] || [];
    if (normalizeCellString_(row[raidIdColumn]).trim() && !normalizeCellString_(row[raidTierColumn]).trim()) {
      // A raid dated from the new start counts for the new tier (like the scores), any other for the outgoing one.
      var raidSerial = dateSerialFromCell_(row[raidDateColumn]);
      var raidTier = raidSerial !== null && raidSerial >= startSerial ? tierId : current.tierId;
      requests.push({
        updateCells: {
          start: { sheetId: raidsSheet.getSheetId(), rowIndex: rowIndex, columnIndex: raidTierColumn },
          rows: [{ values: [{ userEnteredValue: { stringValue: raidTier } }] }],
          fields: 'userEnteredValue'
        }
      });
      stamped += 1;
    }
  }

  var archiveName = 'Objets (' + current.tierId + ')';
  if (spreadsheet.getSheetByName(archiveName)) {
    throw new Error('l\'onglet « ' + archiveName + ' » existe déjà.');
  }
  var itemSheets = ITEM_TABS.map(function (itemTab) {
    return { role: itemTab.role, sheet: snapshotSheet_(spreadsheet, itemTab.name) };
  });
  var archiveRows = buildTierArchiveRows_(itemSheets.map(function (entry) {
    return { role: entry.role, rows: entry.sheet.getDataRange().getValues() };
  }));
  requests = requests.concat(buildTierArchiveTabRequests_(archiveName, archiveRows, spreadsheet));

  itemSheets.forEach(function (entry) {
    requests.push({
      updateCells: {
        range: { sheetId: entry.sheet.getSheetId(), startRowIndex: 3 },
        fields: 'userEnteredValue'
      }
    });
  });

  return {
    requests: requests,
    summary: summary + '\nPalier ' + current.tierId + ' : ' + stamped + ' raid(s) marqué(s), ' + archiveRows.length +
      ' ligne(s) archivée(s) dans « ' + archiveName + ' », onglets Objets vidés.'
  };
}

// Long layout: one row per item and filled spec; an item with no spec filled keeps one row so nothing is lost.
function buildTierArchiveRows_(itemStates) {
  var archive = [];
  (itemStates || []).forEach(function (state) {
    var specs = SPEC_COLUMNS.filter(function (entry) { return entry.role === state.role; });
    var rows = state.rows || [];
    for (var rowIndex = 3; rowIndex < rows.length; rowIndex += 1) {
      var row = rows[rowIndex] || [];
      var itemId = row[0];
      var itemName = normalizeCellString_(row[1]).trim();
      if (!row.some(function (cell) { return normalizeCellString_(cell).trim() !== ''; })) {
        continue;
      }
      var base = [state.role, itemId, itemName, normalizeCellString_(row[OBJETS_SLOT_COLUMN]).trim()];
      var filled = 0;
      specs.forEach(function (spec, specIndex) {
        var statut = normalizeCellString_(row[OBJETS_FIRST_SPEC_COLUMN + specIndex * 2]).trim();
        var gain = row[OBJETS_FIRST_SPEC_COLUMN + 1 + specIndex * 2];
        if (!statut && (gain === '' || gain === null || gain === undefined)) {
          return;
        }
        archive.push(base.concat([spec.label, statut, gain === undefined || gain === null ? '' : gain]));
        filled += 1;
      });
      if (!filled) {
        archive.push(base.concat(['', '', '']));
      }
    }
  });
  return archive;
}

// The archive tab: header, rows, percent Gain, frozen header and a warning-only protection.
function buildTierArchiveTabRequests_(archiveName, archiveRows, spreadsheet) {
  // Fixed id derived from the name, so later requests in the same batch can target the new tab; skip ids in use.
  var sheetId = 2000;
  for (var i = 0; i < archiveName.length; i += 1) {
    sheetId = (sheetId * 31 + archiveName.charCodeAt(i)) % 900000000;
  }
  sheetId += 100000;
  var usedIds = (spreadsheet ? spreadsheet.getSheets() : []).map(function (sheet) { return sheet.getSheetId(); });
  while (usedIds.indexOf(sheetId) !== -1) {
    sheetId += 1;
  }
  var header = ['Rôle', 'Objet (ID)', 'Objet', 'Emplacement', 'Spé', 'Statut', 'Gain (%)'];
  var toCell = function (value) {
    return typeof value === 'number' ? { userEnteredValue: { numberValue: value } } : { userEnteredValue: { stringValue: String(value) } };
  };
  return [{
    addSheet: {
      properties: {
        sheetId: sheetId,
        title: archiveName,
        gridProperties: { rowCount: Math.max(1000, archiveRows.length + 10), columnCount: header.length, frozenRowCount: 1 }
      }
    }
  }, {
    updateCells: {
      start: { sheetId: sheetId, rowIndex: 0, columnIndex: 0 },
      rows: [{ values: header.map(toCell) }].concat(archiveRows.map(function (row) { return { values: row.map(toCell) }; })),
      fields: 'userEnteredValue'
    }
  }, {
    repeatCell: {
      range: { sheetId: sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: header.length },
      cell: { userEnteredFormat: { backgroundColor: rgbHex_(HEADER_STYLE.background), textFormat: { bold: true, foregroundColor: rgbHex_(HEADER_STYLE.text) } } },
      fields: 'userEnteredFormat(backgroundColor,textFormat)'
    }
  }, {
    repeatCell: {
      range: { sheetId: sheetId, startRowIndex: 1, startColumnIndex: header.length - 1, endColumnIndex: header.length },
      cell: { userEnteredFormat: { numberFormat: { type: 'PERCENT', pattern: '0.0%' } } },
      fields: 'userEnteredFormat.numberFormat'
    }
  }, {
    addProtectedRange: {
      protectedRange: { range: { sheetId: sheetId }, description: TIER_ARCHIVE_PROTECTION_DESCRIPTION, warningOnly: true }
    }
  }];
}

// 'yyyy-mm-dd' from the date input → sheet date serial, else null.
function dateSerialFromIso_(value) {
  var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalizeCellString_(value).trim());
  if (!match) {
    return null;
  }
  var utc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  var check = new Date(utc);
  if (check.getUTCMonth() !== Number(match[2]) - 1) {
    return null;
  }
  return (utc - Date.UTC(1899, 11, 30)) / 86400000;
}

// Config date cell → serial: a number as is, a Date by its calendar day in the script time zone, ISO text parsed.
function dateSerialFromCell_(value) {
  if (typeof value === 'number' && isFinite(value)) {
    return value;
  }
  if (value instanceof Date) {
    return dateSerialFromIso_(Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd'));
  }
  return dateSerialFromIso_(value);
}

// Serial → dd/MM/yyyy.
function formatSerialDate_(serial) {
  var date = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000);
  return ('0' + date.getUTCDate()).slice(-2) + '/' + ('0' + (date.getUTCMonth() + 1)).slice(-2) + '/' + date.getUTCFullYear();
}
