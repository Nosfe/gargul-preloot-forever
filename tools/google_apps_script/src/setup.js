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
        fields: 'sheets(properties.sheetId,conditionalFormats,bandedRanges.bandedRangeId,protectedRanges(protectedRangeId,description))'
      });
      var plan = buildSetupPlan_(existingHeadersByName, sheetsMetadata, separator);
      return plan.requests;
    });

    ui.alert('Classeur mis à jour.');
  } catch (error) {
    ui.alert('Mise à jour du classeur impossible : ' + error.message);
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
  // Grids first: they create _Listes, which the Roster Spé dropdown references.
  // Grids read live sheet data inside the lock, so this part of the plan is not pure.
  var requests = buildGridRequests_(separator);
  var metadataBySheetId = sheetMetadataById_(sheetsMetadata);

  for (var i = 0; i < TABS.length; i += 1) {
    var tab = TABS[i];
    var existing = existingHeadersByName[tab.name];
    var sheetId = tab.sheetId;

    if (!existing) {
      requests = requests.concat(buildCreateTabRequests_(tab));
    } else {
      // A view holds only formulas: its values are cleared and rebuilt, whatever its earlier layout.
      if (tab.group === 'view') {
        requests.push({ updateCells: { range: { sheetId: existing.sheetId }, fields: 'userEnteredValue' } });
      } else {
        validateHeaderCompatibility_(tab, existing.headers);
      }
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
    requests = requests.concat(buildRankingFormulaRequests_(sheetId, tab, separator));
    requests = requests.concat(buildRoleFormulaRequests_(sheetId, tab, separator));
    requests = requests.concat(buildConfigProtectionRequests_(sheetId, tab, metadataBySheetId));

    requests = requests.concat(buildDeleteExistingLayoutRequests_(sheetId, metadataBySheetId));

    requests = requests
      .concat(buildBandingRequests_(sheetId, tab))
      .concat(buildConditionalFormatRequestsForTab_(sheetId, tab, separator));
  }

  requests = requests.concat(buildRoleAndSpecRewriteRequests_(existingHeadersByName));

  requests = requests.concat(buildTabOrderRequests_(requests));

  return { requests: requests };
}

// Writes all Roster score formulas for rows 2..201 and applies 3-decimal display on Ratio BiS.
function buildRosterFormulaRequests_(sheetId, tab, argSeparator) {
  if (tab.name !== 'Roster') {
    return [];
  }

  var separator = argSeparator || ',';
  var rosterTab = tabByName_('Roster');
  var configTab = tabByName_('Config');
  var nameColumn = columnOf_(rosterTab, 'raiderKey');
  var tierPresenceColumn = columnOf_(rosterTab, 'tierPresence');
  var tierPresenceMaxColumn = columnOf_(rosterTab, 'tierPresenceMax');
  var bisLootCountColumn = columnOf_(rosterTab, 'bisLootCount');
  var bisRatioColumn = columnOf_(rosterTab, 'bisRatio');
  var nameLetter = columnLetter_(nameColumn);
  var tierPresenceLetter = columnLetter_(tierPresenceColumn);
  var tierPresenceMaxLetter = columnLetter_(tierPresenceMaxColumn);
  var bisLootCountLetter = columnLetter_(bisLootCountColumn);
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
      { userEnteredValue: { formulaValue: applyArgSeparator_(buildTierLootFormula_(nameLetter, rowNumber, awardsStart, awardsDateOffset, awardsTreatmentOffset, AWARDS_RAID_ID_OFFSET, presenceDateLookup, configStartDateRef, 'BIS'), separator) } },
      { userEnteredValue: { formulaValue: applyArgSeparator_(buildTierLootFormula_(nameLetter, rowNumber, awardsStart, awardsDateOffset, awardsTreatmentOffset, AWARDS_RAID_ID_OFFSET, presenceDateLookup, configStartDateRef, 'IMPACT'), separator) } },
      { userEnteredValue: { formulaValue: applyArgSeparator_('=IF($' + nameLetter + rowNumber + '="","",($' + tierPresenceLetter + rowNumber + '/$' + tierPresenceMaxLetter + rowNumber + ')/($' + bisLootCountLetter + rowNumber + '+1))', separator) } }
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
          endColumnIndex: bisRatioColumn + 1
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

// Classement Impact row 2: the IMPACT item list, names, then one spill per rank. Same Impact formula as the
// snapshot (scores.js): presence ratio × parse (empty, text or 0 = 1) × gain in DPS / (Loots Impact + 1); no tanks.
function buildRankingFormulaRequests_(sheetId, tab, argSeparator) {
  if (tab.name !== RANKING_TAB_NAME) {
    return [];
  }

  var roster = tabByName_('Roster');
  var rosterRange = function (key) {
    var letter = columnLetter_(columnOf_(roster, key));
    return "'Roster'!$" + letter + '$2:$' + letter + '$201';
  };
  var listsRange = function (offset) {
    var letter = columnLetter_(LISTS_LAYOUT.impactGainColumn + offset);
    return "'" + LISTS_TAB.name + "'!$" + letter + '$2:$' + letter + '$' + LISTS_LAYOUT.rowCount;
  };
  var items = '$A$2:$A$' + (RANKING_ROW_COUNT + 1);
  var ownedLetter = columnLetter_(LISTS_LAYOUT.ownedItemColumn);
  var owned = "'" + LISTS_TAB.name + "'!$" + ownedLetter + '$2:$' + ownedLetter + '$' + LISTS_LAYOUT.rowCount;
  var formulas = [
    '=IFERROR(SORT(UNIQUE(FILTER(' + listsRange(2) + ',' + listsRange(2) + '<>""))),"")',
    '=MAP(' + items + ',LAMBDA(i,IF(i="","",IFERROR(INDEX(FILTER(' + listsRange(3) + ',' + listsRange(2) + '=i,' + listsRange(3) + '<>""),1),""))))'
  ];
  for (var rank = 1; rank <= RANKING_SIZE; rank += 1) {
    formulas.push('=MAP(' + items + ',LAMBDA(i,IF(i="","",ARRAYFORMULA(LET(' +
      'n,' + rosterRange('raiderKey') + ',' +
      'g,IFERROR(XLOOKUP(i&"|"&' + rosterRange('class') + '&"|"&' + rosterRange('spec') + ',' + listsRange(0) + ',' + listsRange(1) + '),""),' +
      'p,' + rosterRange('dpsParse') + ',' +
      'b,IFERROR(IF((n="")+(' + rosterRange('role') + '="' + ROLE_DISPLAY.Tank.value + '"),"",(' + rosterRange('tierPresence') + '/' + rosterRange('tierPresenceMax') + ')*IF(ISNUMBER(p)*(p<>0),p,1)),""),' +
      'o,ISNUMBER(XMATCH(n&"|"&i,' + owned + ')),' +
      's,IF((g="")+(b="")+o,"",b*g/(' + rosterRange('impactLootCount') + '+1)),' +
      'r,IFERROR(SORT(FILTER(HSTACK(n,s),s<>""),2,FALSE),""),' +
      'IFERROR(INDEX(r,' + rank + ',1)&" ("&FIXED(INDEX(r,' + rank + ',2),3,TRUE)&")",""))))))');
  }

  var requests = [{
    updateCells: {
      start: { sheetId: sheetId, rowIndex: 1, columnIndex: 0 },
      rows: [{ values: formulas.map(function (formula) {
        return { userEnteredValue: { formulaValue: applyArgSeparator_(formula, argSeparator || ',') } };
      }) }],
      fields: 'userEnteredValue'
    }
  }];
  // Top 3 bold even before the class rules match (name not in Roster yet); 4e and 5e plain.
  for (var index = 1; index <= RANKING_SIZE; index += 1) {
    var column = columnOf_(tab, 'rank' + index);
    requests.push({
      repeatCell: {
        range: { sheetId: sheetId, startRowIndex: 1, endRowIndex: RANKING_ROW_COUNT + 1, startColumnIndex: column, endColumnIndex: column + 1 },
        cell: { userEnteredFormat: { textFormat: { bold: index <= 3 } } },
        fields: 'userEnteredFormat.textFormat'
      }
    });
  }
  return requests;
}

// "Name (score)" in the raider's class colour (like the Présence headers), bold on a gold/silver/bronze fill for the top 3.
// One rule per class and rank: a cell takes a single conditional format, and rules cannot read Roster without INDIRECT.
function buildRankingClassColorRules_(sheetId, argSeparator) {
  var tab = tabByName_(RANKING_TAB_NAME);
  var roster = tabByName_('Roster');
  var rosterRange = function (key) {
    var letter = columnLetter_(columnOf_(roster, key));
    return 'INDIRECT("\'Roster\'!$' + letter + '$2:$' + letter + '$201")';
  };
  var requests = [];
  for (var rank = 1; rank <= RANKING_SIZE; rank += 1) {
    var column = columnOf_(tab, 'rank' + rank);
    var cell = columnLetter_(column) + '2';
    var name = 'IFERROR(LEFT(' + cell + ',FIND(" (",' + cell + ')-1),"")';
    CLASS_SPECS.forEach(function (entry) {
      var format = { textFormat: { foregroundColor: rgbHex_(classHeaderTextHex_(entry.name)), bold: rank <= 3 } };
      if (RANKING_BACKGROUNDS[rank - 1]) {
        format.backgroundColor = rgbHex_(RANKING_BACKGROUNDS[rank - 1]);
      }
      requests.push(buildConditionalFormatRequest_(sheetId, column, column + 1,
        '=XLOOKUP(' + name + ',' + rosterRange('raiderKey') + ',' + rosterRange('class') + ',"")="' + entry.name + '"',
        format, argSeparator));
    });
  }
  return requests;
}

// Rôle formula on Roster rows 2..201: looks up Classe|Spé in the _Listes role table.
function buildRoleFormulaRequests_(sheetId, tab, argSeparator) {
  if (tab.name !== 'Roster') {
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

// A Présence row is a raid when it has a Raid (ID) or a Date.
function raidRowTest_(raidIdName, dateName) {
  return '((' + raidIdName + '<>"")+(' + dateName + '<>"")>0)';
}

// Loots BiS / Loots Impact: awards of one treatment in the raider block from the tier start. A blank Date falls back to
// the Date of the award's Raid (ID) in Présence; with neither, the award counts.
function buildTierLootFormula_(nameLetter, rowNumber, awardsStart, awardsDateOffset, awardsTreatmentOffset, awardsRaidIdOffset, presenceDateLookup, configStartDateRef, treatment) {
  var awards = GRID_TABS.awards.name + '!' + awardsStart;
  return '=IF($' + nameLetter + rowNumber + '="","",IFERROR(LET(c,' + exactHeaderMatch_(GRID_TABS.awards.name + '!', '$' + nameLetter + rowNumber) +
    ',t,INDEX(' + awards + ',0,c+' + awardsTreatmentOffset + ')' +
    ',d,INDEX(' + awards + ',0,c+' + awardsDateOffset + ')' +
    ',r,INDEX(' + awards + ',0,c+' + awardsRaidIdOffset + ')' +
    ',e,ARRAYFORMULA(IF(d<>"",d,IFERROR(VLOOKUP(r,' + presenceDateLookup.range + ',' + presenceDateLookup.column + ',FALSE),"")))' +
    ',SUMPRODUCT((t="' + treatment + '")*(((e="")+(e>=N(' + configStartDateRef + ')))>0))),0))';
}

// Bold text on every Roster data cell (rows 2+); only the bold flag is touched.
function buildBoldDataRequests_(sheetId, tab) {
  if (tab.name !== 'Roster') {
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

// Each existing header cell must hold its column's label or its technical key.
function validateHeaderCompatibility_(tab, existingHeaders) {
  var keys = keysOf_(tab);
  var labels = labelsOf_(tab);
  var knownByIndex = [];
  var i;

  for (i = 0; i < keys.length; i += 1) {
    knownByIndex.push([keys[i], labels[i]]);
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
    'Conflit d\'en-têtes dans l\'onglet "' + tabName + '". Existants : [' + existingHeaders.join(', ') +
    ']. Attendus : [' + expectedLabels.join(', ') + '].'
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
      bandedRanges: item.bandedRanges || [],
      protectedRanges: item.protectedRanges || []
    };
  }

  return byId;
}

// Config tier cells (Palier actif, Début du palier, Raid en cours) warn on manual edits; Serveur WCL stays free.
// Sheets cannot hard-lock the owner, so the protection is warning-only; the old one is replaced, never duplicated.
function buildConfigProtectionRequests_(sheetId, tab, metadataBySheetId) {
  if (tab.name !== 'Config') {
    return [];
  }
  var requests = ((metadataBySheetId[sheetId] || {}).protectedRanges || []).filter(function (range) {
    return range.description === CONFIG_PROTECTION_DESCRIPTION || range.description === LEGACY_CONFIG_PROTECTION_DESCRIPTION;
  }).map(function (range) {
    return { deleteProtectedRange: { protectedRangeId: range.protectedRangeId } };
  });
  requests.push({
    addProtectedRange: {
      protectedRange: {
        range: { sheetId: sheetId, startRowIndex: 0, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: columnOf_(tab, 'openRaidId') + 1 },
        description: CONFIG_PROTECTION_DESCRIPTION,
        warningOnly: true
      }
    }
  });
  return requests;
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
    class: 130,
    spec: 170,
    role: 150,
    dpsParse: 145,
    itemName: 220,
    rank1: 190,
    rank2: 190,
    rank3: 190,
    rank4: 190,
    rank5: 190
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
    requests.push(buildDataValidationRequest_(sheetId, columnOf_(tab, 'wowheadVersion'), {
      condition: {
        type: 'ONE_OF_LIST',
        values: WOWHEAD_VERSIONS.map(function (version) { return { userEnteredValue: version.label }; })
      },
      strict: true,
      showCustomUi: true,
      inputMessage: 'Version du jeu pour les liens Wowhead du portail. Vide = Forever.'
    }));
  }

  if (tab.name === 'Roster') {
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
      buildSpecValidationRequests_(sheetId, tab, LISTS_LAYOUT.rosterLookupColumn)
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
  if (tab.name === 'Roster') {
    var nameColumn = columnOf_(tab, 'raiderKey');
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

  if (tab.name === RANKING_TAB_NAME) {
    requests = requests.concat(buildRankingClassColorRules_(sheetId, separator));
  }

  if (tab.name === 'Raids') {
    var raidDateCell = '$' + columnLetter_(columnOf_(tab, 'raidDate')) + '2';
    requests.push(buildConditionalFormatRequest_(
      sheetId,
      0,
      labelsOf_(tab).length,
      '=AND(ISNUMBER(' + raidDateCell + '),' + raidDateCell + '<' + TIER_START_REF + ')',
      oldTierFormat_(),
      separator
    ));
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

// Rewrites spec cells still carrying an icon to the plain spec name (Rôle is a formula).
function buildRoleAndSpecRewriteRequests_(existingHeadersByName) {
  return buildRoleAndSpecRewriteForTab_(existingHeadersByName.Roster, tabByName_('Roster'));
}

// Builds per-cell rewrite requests for one tab state.
function buildRoleAndSpecRewriteForTab_(state, tab) {
  if (!state || !Array.isArray(state.rows) || !state.rows.length) {
    return [];
  }

  var requests = [];
  var classIndex = columnOf_(tab, 'class');
  var specIndex = columnOf_(tab, 'spec');

  for (var rowIndex = 1; rowIndex < state.rows.length; rowIndex += 1) {
    var row = state.rows[rowIndex] || [];
    var className = normalizeCellString_(row[classIndex]);
    var specValue = normalizeCellString_(row[specIndex]);

    var specDisplay = specDisplayValue_(className, specValue);
    if (specDisplay && specDisplay !== specValue) {
      requests.push(buildCellRewriteRequest_(state.sheetId, rowIndex, specIndex, specDisplay));
    }
  }

  return requests;
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

// Plain spec name for a known spec of the class, typed with or without a leading icon; else null.
function specDisplayValue_(className, specValue) {
  if (!className || !specValue) {
    return null;
  }

  for (var i = 0; i < CLASS_SPECS.length; i += 1) {
    var entry = CLASS_SPECS[i];
    if (entry.name !== className) {
      continue;
    }
    for (var j = 0; j < entry.specs.length; j += 1) {
      var spec = entry.specs[j];
      var prefix = specValue.slice(0, specValue.length - spec.length);
      if (specValue === spec ||
          (specValue.slice(-spec.length - 1) === ' ' + spec && !/[0-9A-Za-z\u00C0-\u017F]/.test(prefix))) {
        return spec;
      }
    }
    return null;
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
