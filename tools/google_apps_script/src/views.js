// Builds both read-only view tabs (Présence and Butin) from the data tabs.
function buildViewRequests_(argSeparator) {
  var separator = argSeparator || ',';
  var spreadsheet = SpreadsheetApp.getActive();
  var rosterNames = readSortedRosterNames_(spreadsheet);
  var requests = [];

  requests = requests.concat(buildPresenceViewRequests_(spreadsheet, rosterNames, separator));
  requests = requests.concat(buildButinViewRequests_(spreadsheet, rosterNames, separator));

  return requests;
}

// Dark blue of the old workbook's presence_details and loot_details headers.
var VIEW_HEADER_HEX = '073763';

// Open-ended data range of a contract column, e.g. Awards!I2:I (prefix '$' for absolute).
function dataRange_(tabName, key, absolute) {
  var letter = columnLetter_(columnOf_(tabByName_(tabName), key));
  var d = absolute ? '$' : '';
  return tabName + '!' + d + letter + d + '2:' + d + letter;
}

// Reads unique raider names from Roster and sorts them for stable column/block order.
function readSortedRosterNames_(spreadsheet) {
  var rosterSheet = spreadsheet.getSheetByName('Roster');
  if (!rosterSheet) {
    return [];
  }

  var rosterTab = tabByName_('Roster');
  var raiderKeyColumn = columnOf_(rosterTab, 'raiderKey');
  var rows = rosterSheet.getDataRange().getValues();
  var seen = Object.create(null);
  var names = [];

  for (var rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    var row = rows[rowIndex] || [];
    var rawName = row[raiderKeyColumn];
    if (rawName === null || rawName === undefined || rawName === '') {
      continue;
    }
    var name = String(rawName);
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

// Creates a view sheet with its fixed id when missing.
function buildCreateViewSheetRequest_(spreadsheet, viewTab) {
  var sheet = spreadsheet.getSheetByName(viewTab.name);
  if (sheet) {
    return null;
  }

  return {
    addSheet: {
      properties: {
        sheetId: viewTab.sheetId,
        title: viewTab.name
      }
    }
  };
}

// Clears a whole sheet (values, formats, notes, merges) and sizes its grid before rebuilding it.
// New tabs have only 26 columns; Butin needs 4 per raider, so the grid follows the roster.
function buildClearViewSheetRequests_(sheetId, columnsNeeded) {
  return [
    {
      unmergeCells: {
        range: { sheetId: sheetId }
      }
    },
    {
      updateCells: {
        range: { sheetId: sheetId },
        fields: '*'
      }
    },
    {
      updateSheetProperties: {
        properties: {
          sheetId: sheetId,
          gridProperties: { columnCount: Math.max(26, columnsNeeded) }
        },
        fields: 'gridProperties.columnCount'
      }
    }
  ];
}

// Rebuilds the Présence tab as a raids x raiders matrix plus totals.
function buildPresenceViewRequests_(spreadsheet, rosterNames, argSeparator) {
  var requests = [];
  var viewTab = VIEW_TABS[0];
  var createRequest = buildCreateViewSheetRequest_(spreadsheet, viewTab);
  var sheet = spreadsheet.getSheetByName(viewTab.name);
  var sheetId = sheet ? sheet.getSheetId() : viewTab.sheetId;

  if (createRequest) {
    requests.push(createRequest);
  }

  requests = requests
    .concat(buildClearViewSheetRequests_(sheetId, 3 + rosterNames.length))
    .concat(buildTabColorRequests_(sheetId, viewTab));

  requests.push({
    updateSheetProperties: {
      properties: {
        sheetId: sheetId,
        gridProperties: {
          frozenRowCount: 2,
          frozenColumnCount: 3
        }
      },
      fields: 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount'
    }
  });

  requests.push({
    updateDimensionProperties: {
      range: {
        sheetId: sheetId,
        dimension: 'COLUMNS',
        startIndex: 0,
        endIndex: 1
      },
      properties: { pixelSize: 140 },
      fields: 'pixelSize'
    }
  });

  requests.push({
    updateDimensionProperties: {
      range: {
        sheetId: sheetId,
        dimension: 'COLUMNS',
        startIndex: 1,
        endIndex: 2
      },
      properties: { pixelSize: 190 },
      fields: 'pixelSize'
    }
  });

  requests.push({
    updateDimensionProperties: {
      range: {
        sheetId: sheetId,
        dimension: 'COLUMNS',
        startIndex: 2,
        endIndex: 3
      },
      properties: { pixelSize: 120 },
      fields: 'pixelSize'
    }
  });

  for (var i = 0; i < rosterNames.length; i += 1) {
    requests.push({
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: 'COLUMNS',
          startIndex: 3 + i,
          endIndex: 4 + i
        },
        properties: { pixelSize: 105 },
        fields: 'pixelSize'
      }
    });
  }

  var headerValues = [
    { userEnteredValue: { stringValue: 'Raid (ID)' } },
    { userEnteredValue: { stringValue: 'Instance' } },
    { userEnteredValue: { stringValue: 'Date' } }
  ];

  rosterNames.forEach(function (name) {
    headerValues.push({ userEnteredValue: { stringValue: name } });
  });

  requests.push({
    updateCells: {
      start: { sheetId: sheetId, rowIndex: 0, columnIndex: 0 },
      rows: [{ values: headerValues }],
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
        endColumnIndex: 3 + rosterNames.length
      },
      cell: {
        userEnteredFormat: {
          backgroundColor: rgbHex_(VIEW_HEADER_HEX),
          horizontalAlignment: 'CENTER',
          textFormat: {
            bold: true,
            foregroundColor: rgbHex_('FFFFFF')
          },
          wrapStrategy: 'WRAP'
        }
      },
      fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,textFormat,wrapStrategy)'
    }
  });

  var totalValues = [
    { userEnteredValue: { stringValue: 'Total' } },
    { userEnteredValue: { stringValue: '' } },
    { userEnteredValue: { stringValue: '' } }
  ];

  for (i = 0; i < rosterNames.length; i += 1) {
    var totalColumnLetter = columnLetter_(3 + i);
    var totalFormula = '=COUNTIF(' + totalColumnLetter + '3:' + totalColumnLetter + ',1)+COUNTIF(' + totalColumnLetter + '3:' + totalColumnLetter + ',"B")';
    totalValues.push({
      userEnteredValue: {
        formulaValue: applyArgSeparator_(totalFormula, argSeparator)
      }
    });
  }

  requests.push({
    updateCells: {
      start: { sheetId: sheetId, rowIndex: 1, columnIndex: 0 },
      rows: [{ values: totalValues }],
      fields: 'userEnteredValue'
    }
  });

  requests.push({
    repeatCell: {
      range: {
        sheetId: sheetId,
        startRowIndex: 1,
        endRowIndex: 2,
        startColumnIndex: 0,
        endColumnIndex: 3 + rosterNames.length
      },
      cell: {
        userEnteredFormat: {
          textFormat: { bold: true },
          horizontalAlignment: 'CENTER'
        }
      },
      fields: 'userEnteredFormat(textFormat,horizontalAlignment)'
    }
  });

  var raidsFormula = '=SORT(FILTER(HSTACK(' + dataRange_('Raids', 'raidId') + ',' + dataRange_('Raids', 'instance') + ',' +
    dataRange_('Raids', 'raidDate') + '),' + dataRange_('Raids', 'raidId') + '<>""),3,TRUE)';
  requests.push({
    updateCells: {
      start: { sheetId: sheetId, rowIndex: 2, columnIndex: 0 },
      rows: [
        {
          values: [
            {
              userEnteredValue: {
                formulaValue: applyArgSeparator_(raidsFormula, argSeparator)
              }
            }
          ]
        }
      ],
      fields: 'userEnteredValue'
    }
  });

  for (i = 0; i < rosterNames.length; i += 1) {
    var raiderColumnLetter = columnLetter_(3 + i);
    var presenceFormula = '=MAP($A3:$A,LAMBDA(r,IF(r="",,IF(SUMPRODUCT((' + dataRange_('Attendance', 'raidId', true) + '=r)*EXACT(' +
      dataRange_('Attendance', 'raiderKey', true) + ',' + raiderColumnLetter + '$1)),1,IF(SUMPRODUCT((' +
      dataRange_('Bench', 'raidId', true) + '=r)*EXACT(' + dataRange_('Bench', 'raiderKey', true) + ',' +
      raiderColumnLetter + '$1)),"B",0)))))';

    requests.push({
      updateCells: {
        start: { sheetId: sheetId, rowIndex: 2, columnIndex: 3 + i },
        rows: [
          {
            values: [
              {
                userEnteredValue: {
                  formulaValue: applyArgSeparator_(presenceFormula, argSeparator)
                }
              }
            ]
          }
        ],
        fields: 'userEnteredValue'
      }
    });

    requests.push({
      updateBorders: {
        range: {
          sheetId: sheetId,
          startColumnIndex: 3 + i,
          endColumnIndex: 4 + i
        },
        right: {
          style: 'SOLID',
          color: rgbHex_('253746')
        }
      }
    });
  }

  return requests;
}

// Rebuilds the Butin tab as one 4-column loot block per raider.
function buildButinViewRequests_(spreadsheet, rosterNames, argSeparator) {
  var requests = [];
  var viewTab = VIEW_TABS[1];
  var createRequest = buildCreateViewSheetRequest_(spreadsheet, viewTab);
  var sheet = spreadsheet.getSheetByName(viewTab.name);
  var sheetId = sheet ? sheet.getSheetId() : viewTab.sheetId;

  if (createRequest) {
    requests.push(createRequest);
  }

  requests = requests
    .concat(buildClearViewSheetRequests_(sheetId, 4 * rosterNames.length))
    .concat(buildTabColorRequests_(sheetId, viewTab));

  requests.push({
    updateSheetProperties: {
      properties: {
        sheetId: sheetId,
        gridProperties: {
          frozenRowCount: 2
        }
      },
      fields: 'gridProperties.frozenRowCount'
    }
  });

  var rowOneValues = [];
  var rowTwoValues = [];

  for (var i = 0; i < rosterNames.length; i += 1) {
    var blockStart = i * 4;
    var blockHeaderLetter = columnLetter_(blockStart);
    // Date column shows "date heure" so awards from the same raid also sort newest first.
    var lootFormula = '=IFERROR(SORT(FILTER(HSTACK(' + dataRange_('Awards', 'date') + '&" "&' + dataRange_('Awards', 'time') +
      ',IFERROR(XLOOKUP(' +
      dataRange_('Awards', 'itemID') + ',' + dataRange_('TierItems', 'itemID') + ',' + dataRange_('TierItems', 'itemName') +
      '),""),' + dataRange_('Awards', 'itemID') + ',' + dataRange_('Awards', 'treatment') + '),EXACT(' +
      dataRange_('Awards', 'raiderKey') + ',' + blockHeaderLetter + '$1)),1,FALSE),"")';

    rowOneValues.push({ userEnteredValue: { stringValue: rosterNames[i] } });
    rowOneValues.push({ userEnteredValue: { stringValue: '' } });
    rowOneValues.push({ userEnteredValue: { stringValue: '' } });
    rowOneValues.push({ userEnteredValue: { stringValue: '' } });

    rowTwoValues.push({ userEnteredValue: { stringValue: 'Date' } });
    rowTwoValues.push({ userEnteredValue: { stringValue: 'Objet' } });
    rowTwoValues.push({ userEnteredValue: { stringValue: 'Objet (ID)' } });
    rowTwoValues.push({ userEnteredValue: { stringValue: 'Traitement' } });

    requests.push({
      mergeCells: {
        range: {
          sheetId: sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: blockStart,
          endColumnIndex: blockStart + 4
        },
        mergeType: 'MERGE_ALL'
      }
    });

    requests.push({
      updateCells: {
        start: { sheetId: sheetId, rowIndex: 2, columnIndex: blockStart },
        rows: [
          {
            values: [
              {
                userEnteredValue: {
                  formulaValue: applyArgSeparator_(lootFormula, argSeparator)
                }
              }
            ]
          }
        ],
        fields: 'userEnteredValue'
      }
    });

    requests.push({
      updateBorders: {
        range: {
          sheetId: sheetId,
          startColumnIndex: blockStart,
          endColumnIndex: blockStart + 4
        },
        right: {
          style: 'SOLID',
          color: rgbHex_('253746')
        }
      }
    });

    requests.push({
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: 'COLUMNS',
          startIndex: blockStart,
          endIndex: blockStart + 1
        },
        properties: { pixelSize: 120 },
        fields: 'pixelSize'
      }
    });

    requests.push({
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: 'COLUMNS',
          startIndex: blockStart + 1,
          endIndex: blockStart + 2
        },
        properties: { pixelSize: 220 },
        fields: 'pixelSize'
      }
    });

    requests.push({
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: 'COLUMNS',
          startIndex: blockStart + 2,
          endIndex: blockStart + 3
        },
        properties: { pixelSize: 120 },
        fields: 'pixelSize'
      }
    });

    requests.push({
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: 'COLUMNS',
          startIndex: blockStart + 3,
          endIndex: blockStart + 4
        },
        properties: { pixelSize: 120 },
        fields: 'pixelSize'
      }
    });
  }

  if (rowOneValues.length) {
    requests.push({
      updateCells: {
        start: { sheetId: sheetId, rowIndex: 0, columnIndex: 0 },
        rows: [{ values: rowOneValues }],
        fields: 'userEnteredValue'
      }
    });

    requests.push({
      updateCells: {
        start: { sheetId: sheetId, rowIndex: 1, columnIndex: 0 },
        rows: [{ values: rowTwoValues }],
        fields: 'userEnteredValue'
      }
    });
  }

  if (rosterNames.length) {
    requests.push({
      repeatCell: {
        range: {
          sheetId: sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: rosterNames.length * 4
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: rgbHex_(VIEW_HEADER_HEX),
            horizontalAlignment: 'CENTER',
            // Large raider names, as in the old loot_details.
            textFormat: {
              bold: true,
              fontSize: 16,
              foregroundColor: rgbHex_('FFFFFF')
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
          endColumnIndex: rosterNames.length * 4
        },
        cell: {
          userEnteredFormat: {
            horizontalAlignment: 'CENTER',
            textFormat: { bold: true },
            wrapStrategy: 'WRAP'
          }
        },
        fields: 'userEnteredFormat(horizontalAlignment,textFormat,wrapStrategy)'
      }
    });
  }

  return requests;
}
