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
  var requests = [];
  var metadataBySheetId = sheetMetadataById_(sheetsMetadata);

  for (var i = 0; i < TABS.length; i += 1) {
    var tab = TABS[i];
    var existing = existingHeadersByName[tab.name];
    var sheetId = tab.sheetId;

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
      .concat(buildValueFormatRequests_(sheetId, tab))
      .concat(buildValidationRequestsForTab_(sheetId, tab, separator));

    requests = requests.concat(buildDeleteExistingLayoutRequests_(sheetId, metadataBySheetId));

    requests = requests
      .concat(buildBandingRequests_(sheetId, tab))
      .concat(buildConditionalFormatRequestsForTab_(sheetId, tab, separator));
  }

  return { requests: requests };
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
      headersByName[tab.name] = { sheetId: sheet.getSheetId(), headers: [] };
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
      headers: headers
    };
  }

  return headersByName;
}

// Each existing header cell must hold its column's label or its old technical key (first 4.2 version).
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

// Bold white on dark slate, centred and wrapped; header row frozen.
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
            backgroundColor: rgbHex_('253746'),
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
    rerollName: 210,
    mainKey: 210,
    class: 130,
    spec: 170,
    role: 150,
    gainFraction: 140,
    simGainFraction: 140,
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
  var color = tab.group === 'log' ? rgbHex_('93A7B6') : rgbHex_('97B97C');

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

// Gains are stored as fractions (0.05) and displayed as percents (5.0%).
function buildValueFormatRequests_(sheetId, tab) {
  var requests = [];
  var gainColumn = null;

  if (tab.name === 'Roster') {
    gainColumn = columnOf_(tab, 'gainFraction');
  }
  if (tab.name === 'TierItems') {
    gainColumn = columnOf_(tab, 'simGainFraction');
  }

  if (gainColumn !== null) {
    requests.push({
      repeatCell: {
        range: {
          sheetId: sheetId,
          startRowIndex: 1,
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
  }

  return requests;
}

// Strict validation (invalid input is refused); blank cells stay allowed. Re-setting a range replaces its old rule.
function buildValidationRequestsForTab_(sheetId, tab, argSeparator) {
  var requests = [];
  var separator = argSeparator || ',';

  if (tab.name === 'Roster' || tab.name === 'TierItems') {
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

    var classLetter = columnLetter_(columnOf_(tab, 'class'));
    var specLetter = columnLetter_(columnOf_(tab, 'spec'));
    var specFormula = '=REGEXMATCH($' + classLetter + '2&":"&' + specLetter + '2,"' + classSpecRegex_() + '")';
    specFormula = applyArgSeparator_(specFormula, separator);

    requests.push(
      buildDataValidationRequest_(sheetId, columnOf_(tab, 'spec'), {
        condition: {
          type: 'CUSTOM_FORMULA',
          values: [{ userEnteredValue: specFormula }]
        },
        strict: true,
        inputMessage: 'La spé doit être une des trois spés de la classe de la ligne : ' + CLASS_SPECS.map(function (entry) {
          return entry.name + ' (' + entry.specs.join(', ') + ')';
        }).join(' ; ') + '.'
      })
    );
  }

  if (tab.name === 'Roster') {
    requests.push(
      buildDataValidationRequest_(sheetId, columnOf_(tab, 'role'), {
        condition: {
          type: 'ONE_OF_LIST',
          values: ROLE_OPTIONS.map(function (value) {
            return { userEnteredValue: value };
          })
        },
        strict: true,
        showCustomUi: true,
        inputMessage: 'Choisir Tank, Heal, Melee DPS, Ranged DPS ou Caster DPS.'
      })
    );

    requests.push(
      buildDataValidationRequest_(sheetId, columnOf_(tab, 'tankPriority'), {
        condition: {
          type: 'ONE_OF_LIST',
          values: [{ userEnteredValue: 'MT1' }, { userEnteredValue: 'MT2' }]
        },
        strict: true,
        showCustomUi: true,
        inputMessage: 'Priorité tank : MT1 ou MT2.'
      })
    );

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

    requests.push(
      buildDataValidationRequest_(sheetId, columnOf_(tab, 'gainFraction'), {
        condition: {
          type: 'NUMBER_BETWEEN',
          values: [{ userEnteredValue: '0' }, { userEnteredValue: '1' }]
        },
        strict: true,
        inputMessage: 'Gain simulé du raider entre 0 % et 100 %.'
      })
    );
  }

  if (tab.name === 'TierItems') {
    requests.push(
      buildDataValidationRequest_(sheetId, columnOf_(tab, 'status'), {
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
        inputMessage: 'Statut : BIS, ALT_BIS, IMPACT, TIER, CLASS_BOUND ou NORMAL.'
      })
    );

    requests.push(
      buildDataValidationRequest_(sheetId, columnOf_(tab, 'simGainFraction'), {
        condition: {
          type: 'NUMBER_BETWEEN',
          values: [{ userEnteredValue: '-1' }, { userEnteredValue: '1' }]
        },
        strict: true,
        inputMessage: 'Gain simulé de l\'objet entre -100 % et 100 %.'
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

// Bad-name highlights (EXACT: COUNTIF ignores case; INDIRECT: rules cannot reference another tab directly),
// class colours, and the TierItems gain colours (1/50 avoids a locale-dependent decimal).
function buildConditionalFormatRequestsForTab_(sheetId, tab, argSeparator) {
  var requests = [];
  var separator = argSeparator || ',';

  // Each rule is inserted at index 0, so rules added later win: colours first, red bad-name highlights last.
  if (tab.name === 'Roster') {
    requests = requests.concat(
      buildClassColorRules_(
        sheetId,
        columnOf_(tab, 'class'),
        columnOf_(tab, 'raiderKey'),
        columnOf_(tab, 'class') + 1,
        separator
      )
    );
  }

  if (tab.name === 'Roster') {
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
    requests.push(
      buildConditionalFormatRequest_(
        sheetId,
        0,
        1,
        '=AND($A2<>"",SUMPRODUCT(--EXACT($A$2:$A,$A2))+SUMPRODUCT(--EXACT(INDIRECT("Roster!A2:A"),$A2))>1)',
        { backgroundColor: rgbHex_('FFE5E5') },
        separator
      )
    );

    requests.push(
      buildConditionalFormatRequest_(
        sheetId,
        1,
        2,
        '=AND($B2<>"",SUMPRODUCT(--EXACT(INDIRECT("Roster!A2:A"),$B2))=0)',
        { backgroundColor: rgbHex_('FFE5E5') },
        separator
      )
    );
  }

  if (tab.name === 'TierItems') {
    var classColumn = columnOf_(tab, 'class');
    requests = requests.concat(
      buildClassColorRules_(sheetId, classColumn, classColumn, classColumn + 1, separator)
    );

    var gainColumn = columnOf_(tab, 'simGainFraction');
    var gainLetter = columnLetter_(gainColumn);
    requests.push(
      buildConditionalFormatRequest_(
        sheetId,
        gainColumn,
        gainColumn + 1,
        '=' + gainLetter + '2<0',
        { textFormat: { foregroundColor: rgbHex_('B3261E') } },
        separator
      )
    );

    requests.push(
      buildConditionalFormatRequest_(
        sheetId,
        gainColumn,
        gainColumn + 1,
        '=' + gainLetter + '2>=1/50',
        { textFormat: { foregroundColor: rgbHex_('1E7D32'), bold: true } },
        separator
      )
    );
  }

  return requests;
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
