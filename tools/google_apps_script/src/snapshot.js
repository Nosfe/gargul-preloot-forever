// Exports one Interchange v2 snapshot and opens a Base64 dialog; opens a raid only when none is open.
function exportRaidSnapshot() {
  var ui = SpreadsheetApp.getUi();

  try {
    var snapshot = null;

    applyBatch_(function () {
      var spreadsheet = SpreadsheetApp.getActive();
      var configSheet = snapshotSheet_(spreadsheet, 'Config');
      var rosterSheet = snapshotSheet_(spreadsheet, 'Roster');
      var raidsSheet = snapshotSheet_(spreadsheet, 'Raids');
      var presenceSheet = snapshotSheet_(spreadsheet, GRID_TABS.presence.name);
      var configRows = configSheet.getDataRange().getValues();
      requireCurrentLayout_(configRows, 'Config');
      requireCurrentLayout_(raidsSheet.getDataRange().getValues(), 'Raids');
      var configRow = configRows.length > 1 ? (configRows[1] || []) : [];
      var openRaidCell = configRow[columnOf_(tabByName_('Config'), 'openRaidId')];
      var openRaidId = normalizeCellString_(openRaidCell).trim();
      var raidId = openRaidId || nextRaidId_(raidsSheet.getDataRange().getValues(), presenceSheet.getDataRange().getValues());
      var itemStates = ITEM_TABS.map(function (itemTab) {
        return {
          role: itemTab.role,
          rows: snapshotSheet_(spreadsheet, itemTab.name).getDataRange().getValues()
        };
      });

      snapshot = buildSnapshot_({
        configRow: configRow,
        raidId: raidId,
        rosterRows: requireCurrentLayout_(rosterSheet.getDataRange().getValues(), 'Roster'),
        itemStates: itemStates
      });

      if (openRaidId) {
        return [];
      }

      var sheetsMetadata = Sheets.Spreadsheets.get(spreadsheet.getId(), {
        fields: 'sheets(properties(sheetId,title),protectedRanges(protectedRangeId,description))'
      });

      return buildOpenRaidRequests_({
        spreadsheet: spreadsheet,
        sheetsMetadata: sheetsMetadata,
        raidId: raidId,
        tierId: normalizeCellString_(configRow[columnOf_(tabByName_('Config'), 'tierId')]).trim()
      });
    });

    showSnapshotDialog_(snapshot);
  } catch (error) {
    ui.alert('Export raid snapshot failed:\n' + error.message);
  }
}

// Picks the next numeric raid id from Raids A (rows 2+) and Présence A (raid rows), defaulting to 1.
function nextRaidId_(raidsRows, presenceRows) {
  var highest = 0;

  [
    [raidsRows || [], 1, columnOf_(tabByName_('Raids'), 'raidId')],
    [presenceRows || [], PRESENCE_FIRST_RAID_ROW - 1, PRESENCE_RAID_ID_COLUMN]
  ].forEach(function (entry) {
    var rows = entry[0];
    for (var rowIndex = entry[1]; rowIndex < rows.length; rowIndex += 1) {
      var value = (rows[rowIndex] || [])[entry[2]];
      var parsed = snapshotPositiveInteger_(value);
      if (parsed !== null && parsed > highest) {
        highest = parsed;
      }
    }
  });

  return String(highest + 1);
}

// Builds snapshot raiders and collects row-level validation errors.
function buildSnapshotRaiders_(rosterRows) {
  var tab = tabByName_('Roster');
  var raiders = [];
  var errors = [];
  var seenKeys = Object.create(null);

  for (var rowIndex = 1; rowIndex < (rosterRows || []).length; rowIndex += 1) {
    var row = rosterRows[rowIndex] || [];
    var raiderKey = normalizeCellString_(row[columnOf_(tab, 'raiderKey')]).trim();
    if (!raiderKey) {
      continue;
    }
    if (seenKeys[raiderKey]) {
      errors.push(raiderKey + ': nom en double dans Roster.');
      continue;
    }
    seenKeys[raiderKey] = true;

    var className = normalizeCellString_(row[columnOf_(tab, 'class')]).trim();
    var specCell = normalizeCellString_(row[columnOf_(tab, 'spec')]).trim();
    var roleCell = normalizeCellString_(row[columnOf_(tab, 'role')]).trim();
    var role = snapshotRole_(roleCell);
    var classSpec = null;

    if (!className) {
      errors.push(raiderKey + ': classe manquante.');
    }
    if (!specCell) {
      errors.push(raiderKey + ': spé manquante.');
    }
    if (!role) {
      errors.push(raiderKey + ': rôle inconnu (' + roleCell + ').');
    }
    if (className && specCell && role) {
      try {
        classSpec = classSpecLabel_(className, specCell, role);
      } catch (error) {
        errors.push(raiderKey + ': ' + error.message);
      }
    }

    var tierPresence = readSnapshotInteger_(row[columnOf_(tab, 'tierPresence')], raiderKey, 'Présence palier', errors, 0);
    var tierPresenceMax = readSnapshotInteger_(row[columnOf_(tab, 'tierPresenceMax')], raiderKey, 'Nombre de raids du palier', errors, 1);
    var bisLootCount = readSnapshotInteger_(row[columnOf_(tab, 'bisLootCount')], raiderKey, 'Loots BiS', errors, 0);
    var impactLootCount = readSnapshotInteger_(row[columnOf_(tab, 'impactLootCount')], raiderKey, 'Loots Impact', errors, 0);

    if (tierPresence !== null && tierPresenceMax !== null && tierPresence > tierPresenceMax) {
      errors.push(raiderKey + ': Présence palier > Nombre de raids du palier.');
    }

    // Like the sheet's N(): empty, text or 0 counts as 1; any other value must be 1-100.
    var parseCell = row[columnOf_(tab, 'dpsParse')];
    var dpsParse = 1;
    var parseValid = true;
    if (typeof parseCell === 'number' && isFinite(parseCell) && parseCell !== 0) {
      if (parseCell < 1 || parseCell > 100) {
        parseValid = false;
        errors.push(raiderKey + ': Parse WCL moyen hors plage (1-100).');
      } else {
        dpsParse = parseCell;
      }
    }

    var bisRatioCell = row[columnOf_(tab, 'bisRatio')];
    var impactBaseCell = row[columnOf_(tab, 'impactBase')];
    var bisRatio = null;
    var impactBase = null;

    if (tierPresence !== null && tierPresenceMax !== null && bisLootCount !== null) {
      var recomputedBisRatio = bisRatio_(tierPresence, tierPresenceMax, bisLootCount);
      if (typeof bisRatioCell !== 'number' || !isFinite(bisRatioCell)) {
        errors.push(raiderKey + ': Ratio BiS non numérique.');
      } else if (!withinSnapshotTolerance_(bisRatioCell, recomputedBisRatio)) {
        errors.push(raiderKey + ': Ratio BiS ne correspond pas au calcul.');
      } else {
        bisRatio = bisRatioCell;
      }
    }

    if (role === 'TANK') {
      impactBase = null;
    } else if (parseValid && tierPresence !== null && tierPresenceMax !== null && impactLootCount !== null) {
      var recomputedImpactBase = impactBase_(tierPresence, tierPresenceMax, dpsParse, impactLootCount, false);
      if (typeof impactBaseCell !== 'number' || !isFinite(impactBaseCell)) {
        errors.push(raiderKey + ': Impact (sans gain objet) non numérique.');
      } else if (!withinSnapshotTolerance_(impactBaseCell, recomputedImpactBase)) {
        errors.push(raiderKey + ': Impact (sans gain objet) ne correspond pas au calcul.');
      } else {
        impactBase = impactBaseCell;
      }
    }

    if (!classSpec || !role || bisRatio === null) {
      continue;
    }
    if (role !== 'TANK' && impactBase === null) {
      continue;
    }
    if (tierPresence === null || tierPresenceMax === null ||
        bisLootCount === null || impactLootCount === null) {
      continue;
    }

    raiders.push({
      raiderKey: raiderKey,
      role: role,
      classSpec: classSpec,
      tierPresence: tierPresence,
      tierPresenceMax: tierPresenceMax,
      bisLootCount: bisLootCount,
      impactLootCount: impactLootCount,
      dpsParse: dpsParse,
      bisRatio: bisRatio,
      impactBase: impactBase
    });
  }

  return { raiders: raiders, errors: errors };
}

// Builds snapshot items from all Objets tabs and merges item ids across roles.
function buildSnapshotItems_(itemStates) {
  var itemsById = Object.create(null);
  var itemIds = [];
  var seenPairByKey = Object.create(null);
  var errors = [];

  (itemStates || []).forEach(function (state) {
    var specs = SPEC_COLUMNS.filter(function (entry) {
      return entry.role === state.role;
    });
    var rows = state.rows || [];
    var where = 'Objets ' + state.role + ' ligne ';

    for (var rowIndex = 3; rowIndex < rows.length; rowIndex += 1) {
      var row = rows[rowIndex] || [];
      var rawItemId = row[0];
      if (rawItemId === '' || rawItemId === null || rawItemId === undefined) {
        continue;
      }

      var itemId = snapshotPositiveInteger_(rawItemId);
      if (itemId === null) {
        errors.push(where + (rowIndex + 1) + ': Objet (ID) invalide (' + rawItemId + ').');
        continue;
      }

      var itemKey = String(itemId);
      if (!Object.prototype.hasOwnProperty.call(itemsById, itemKey)) {
        itemsById[itemKey] = { itemID: itemId, specs: [] };
        itemIds.push(itemId);
      }

      specs.forEach(function (spec, specIndex) {
        var statutCell = normalizeCellString_(row[OBJETS_FIRST_SPEC_COLUMN + (specIndex * 2)]).trim();
        var gainCell = row[OBJETS_FIRST_SPEC_COLUMN + 1 + (specIndex * 2)];
        if (!statutCell && (gainCell === '' || gainCell === null || gainCell === undefined)) {
          return;
        }

        if (['BIS', 'IMPACT', 'CLASS_BOUND', 'NORMAL'].indexOf(statutCell) === -1) {
          errors.push(where + (rowIndex + 1) + ': statut invalide pour ' + spec.label + '.');
          return;
        }

        var gainFraction = null;
        if (!(gainCell === '' || gainCell === null || gainCell === undefined)) {
          if (typeof gainCell !== 'number' || !isFinite(gainCell)) {
            errors.push(where + (rowIndex + 1) + ': gain non numérique pour ' + spec.label + '.');
            return;
          }
          gainFraction = gainCell;
        }

        var pairKey = itemKey + '|' + spec.label;
        if (Object.prototype.hasOwnProperty.call(seenPairByKey, pairKey)) {
          errors.push(where + (rowIndex + 1) + ': Objet (ID) ' + itemId + ' en double pour ' + spec.label + ' (déjà en ' + seenPairByKey[pairKey] + ').');
          return;
        }
        seenPairByKey[pairKey] = where + (rowIndex + 1);

        itemsById[itemKey].specs.push({
          classSpec: spec.label,
          statut: statutCell,
          gainFraction: gainFraction
        });
      });
    }
  });

  itemIds.sort(function (left, right) { return left - right; });
  return {
    items: itemIds.map(function (id) {
      return itemsById[String(id)];
    }),
    errors: errors
  };
}

// Builds and validates one Interchange v2 snapshot envelope.
function buildSnapshot_(data) {
  var errors = [];
  var configTab = tabByName_('Config');
  var configRow = (data && data.configRow) || [];
  var tierId = normalizeCellString_(configRow[columnOf_(configTab, 'tierId')]).trim();

  if (!tierId) {
    errors.push('Config: Palier actif (ID) vide.');
  }

  var raidersResult = buildSnapshotRaiders_((data && data.rosterRows) || []);
  var itemsResult = buildSnapshotItems_((data && data.itemStates) || []);
  errors = errors.concat(raidersResult.errors, itemsResult.errors);

  if (errors.length) {
    throw new Error('Snapshot validation failed:\n- ' + errors.join('\n- '));
  }

  return {
    schemaVersion: 2,
    tierId: tierId,
    raidId: String(data.raidId),
    raiders: raidersResult.raiders,
    items: itemsResult.items
  };
}

// Builds one batch of requests that opens a raid and applies warning-only protections.
function buildOpenRaidRequests_(context) {
  var spreadsheet = context.spreadsheet;
  var raidId = String(context.raidId);
  var requests = [];
  var raidsSheet = snapshotSheet_(spreadsheet, 'Raids');
  var configSheet = snapshotSheet_(spreadsheet, 'Config');
  var configOpenRaidColumn = columnOf_(tabByName_('Config'), 'openRaidId');
  var protectionDescription = RAID_OPEN_PROTECTION_PREFIX + ' ' + raidId + ' : entrées de score figées';
  var raidsTab = tabByName_('Raids');
  var raidsValues = [];
  raidsValues[columnOf_(raidsTab, 'raidId')] = { userEnteredValue: { numberValue: Number(raidId) } };
  raidsValues[columnOf_(raidsTab, 'raidTier')] = { userEnteredValue: { stringValue: String(context.tierId || '') } };
  for (var i = 0; i < raidsValues.length; i += 1) {
    raidsValues[i] = raidsValues[i] || {};
  }

  requests.push({
    appendCells: {
      sheetId: raidsSheet.getSheetId(),
      rows: [{ values: raidsValues }],
      fields: 'userEnteredValue'
    }
  });

  requests.push({
    updateCells: {
      start: { sheetId: configSheet.getSheetId(), rowIndex: 1, columnIndex: configOpenRaidColumn },
      rows: [{ values: [{ userEnteredValue: { numberValue: Number(raidId) } }] }],
      fields: 'userEnteredValue'
    }
  });

  ((context.sheetsMetadata && context.sheetsMetadata.sheets) || []).forEach(function (sheet) {
    requests = requests.concat(buildRaidProtectionDeleteRequests_({ sheets: [sheet] }));
  });

  var freezeTabs = ['Roster', GRID_TABS.presence.name, 'Raids', GRID_TABS.awards.name]
    .concat(ITEM_TABS.map(function (tab) { return tab.name; }))
    .concat(['Config']);
  freezeTabs.forEach(function (name) {
    requests.push({
      addProtectedRange: {
        protectedRange: {
          range: { sheetId: snapshotSheet_(spreadsheet, name).getSheetId() },
          warningOnly: true,
          description: protectionDescription
        }
      }
    });
  });

  return requests;
}

// Resolves the Objets classSpec label from class + spec cell + role.
function classSpecLabel_(className, specCell, role) {
  var classEntry = null;
  for (var i = 0; i < CLASS_SPECS.length; i += 1) {
    if (CLASS_SPECS[i].name === className) {
      classEntry = CLASS_SPECS[i];
      break;
    }
  }

  if (!classEntry) {
    throw new Error('classe inconnue (' + className + ')');
  }

  var spec = null;
  classEntry.specs.forEach(function (candidate) {
    if (specCell === candidate || specCell === specDisplayValue_(className, candidate)) {
      spec = candidate;
    }
  });
  if (!spec) {
    throw new Error('spé inconnue (' + specCell + ')');
  }

  // The spec must belong to the raider's role (tank specs for TANK, heal for HEALER, DPS otherwise).
  var matches = SPEC_COLUMNS.filter(function (entry) {
    return entry.className === className && entry.spec === spec && snapshotRole_(entry.role) === role;
  });
  if (matches.length !== 1) {
    throw new Error('spé ' + spec + ' incompatible avec le rôle ' + role + '.');
  }
  return matches[0].label;
}

// Maps displayed/legacy role values to Interchange role codes.
function snapshotRole_(roleCell) {
  if (roleCell === ROLE_DISPLAY.Tank.value || roleCell === 'Tank') {
    return 'TANK';
  }
  if (roleCell === ROLE_DISPLAY.Heal.value || roleCell === 'Heal') {
    return 'HEALER';
  }
  if (roleCell === ROLE_DISPLAY['Melee DPS'].value || roleCell === 'Melee DPS' ||
      roleCell === ROLE_DISPLAY['Ranged DPS'].value || roleCell === 'Ranged DPS' ||
      roleCell === ROLE_DISPLAY['Caster DPS'].value || roleCell === 'Caster DPS') {
    return 'DPS';
  }
  return null;
}

// Rows of a contract tab whose row 1 matches the current columns (label, former label or key);
// otherwise columns read by index would hit the wrong cells, so ask for a setup refresh.
function requireCurrentLayout_(rows, tabName) {
  var tab = tabByName_(tabName);
  var header = (rows && rows[0]) || [];
  var mismatch = tab.columns.some(function (column, index) {
    var cell = normalizeCellString_(header[index]).trim();
    return [column.label, column.key].concat(column.formerLabels || []).indexOf(cell) === -1;
  });
  if (mismatch) {
    throw new Error('The "' + tabName + '" tab does not match the current layout. Run "Configuration > Rafraîchir le classeur" first; nothing was changed.');
  }
  return rows;
}

// Sheet by name, or an error naming the missing tab.
function snapshotSheet_(spreadsheet, name) {
  var sheet = spreadsheet.getSheetByName(name);
  if (!sheet) {
    throw new Error('Missing tab: ' + name + '.');
  }
  return sheet;
}

// Positive whole number from a number or digits-only text, else null.
function snapshotPositiveInteger_(value) {
  var parsed = null;
  if (typeof value === 'number') {
    parsed = value;
  } else if (typeof value === 'string' && /^\s*\d+\s*$/.test(value)) {
    parsed = Number(value);
  }
  if (parsed === null || !isFinite(parsed) || Math.floor(parsed) !== parsed || parsed < 1) {
    return null;
  }
  return parsed;
}

// Whole-number count from a formula cell, at least min; otherwise records an error.
function readSnapshotInteger_(value, raiderKey, label, errors, min) {
  if (typeof value !== 'number' || !isFinite(value) || Math.floor(value) !== value || value < min) {
    errors.push(raiderKey + ': ' + label + ' doit être un entier >= ' + min + '.');
    return null;
  }
  return value;
}

// Same tolerance as the companion's import check (AD-6).
function withinSnapshotTolerance_(value, recomputed) {
  var tolerance = 1e-9 * Math.max(1, Math.abs(recomputed));
  return Math.abs(value - recomputed) <= tolerance;
}

// Modal dialog with the Base64 snapshot and a copy button.
function showSnapshotDialog_(snapshot) {
  var json = JSON.stringify(snapshot);
  var payload = Utilities.base64Encode(json, Utilities.Charset.UTF_8);
  var html = HtmlService.createHtmlOutput(
    '<div style="font-family:Verdana,Arial,sans-serif;padding:12px">' +
      '<p style="margin:0 0 8px 0"><strong>Snapshot Base64</strong></p>' +
      '<textarea id="snapshot-base64" readonly style="width:100%;height:260px">' + snapshotEscapeHtml_(payload) + '</textarea>' +
      '<div style="margin-top:10px;display:flex;gap:8px;align-items:center">' +
        '<button onclick="copySnapshot()">Copier</button>' +
        '<span id="copy-status" style="color:#1E7D32"></span>' +
      '</div>' +
      '<script>' +
        'function fallbackCopy(textarea,status){' +
          'try{document.execCommand("copy");status.textContent="Copié";}' +
          'catch(error){status.textContent="Copie impossible : Ctrl+C";}' +
        '}' +
        'function copySnapshot(){' +
          'var textarea=document.getElementById("snapshot-base64");' +
          'var status=document.getElementById("copy-status");' +
          'textarea.focus();textarea.select();' +
          'if(navigator.clipboard&&window.isSecureContext){' +
            'navigator.clipboard.writeText(textarea.value).then(function(){status.textContent="Copié";},function(){fallbackCopy(textarea,status);});' +
          '}else{fallbackCopy(textarea,status);}' +
        '}' +
      '</script>' +
    '</div>'
  ).setWidth(760).setHeight(420);

  SpreadsheetApp.getUi().showModalDialog(html, 'Export raid snapshot');
}

// Escapes text for an HTML attribute or element body.
function snapshotEscapeHtml_(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Menu action: abandons the open raid (no loot to import): removes the raid protections,
// clears Config's Raid ouvert and drops its Raids row when it holds nothing but the ID.
function cancelOpenRaid() {
  var ui = SpreadsheetApp.getUi();

  try {
    var raidId = '';
    applyBatch_(function () {
      var spreadsheet = SpreadsheetApp.getActive();
      var configSheet = snapshotSheet_(spreadsheet, 'Config');
      var raidsSheet = snapshotSheet_(spreadsheet, 'Raids');
      var configRow = requireCurrentLayout_(configSheet.getDataRange().getValues(), 'Config')[1] || [];
      var openRaidColumn = columnOf_(tabByName_('Config'), 'openRaidId');
      raidId = normalizeCellString_(configRow[openRaidColumn]).trim();

      if (!raidId) {
        return [];
      }

      var requests = buildRaidProtectionDeleteRequests_(Sheets.Spreadsheets.get(spreadsheet.getId(), {
        fields: 'sheets(properties(sheetId,title),protectedRanges(protectedRangeId,description))'
      }));

      requests.push({
        updateCells: {
          start: { sheetId: configSheet.getSheetId(), rowIndex: 1, columnIndex: openRaidColumn },
          rows: [{ values: [{}] }],
          fields: 'userEnteredValue'
        }
      });

      var raidIdColumn = columnOf_(tabByName_('Raids'), 'raidId');
      var raidTierColumn = columnOf_(tabByName_('Raids'), 'raidTier');
      var raidsRows = requireCurrentLayout_(raidsSheet.getDataRange().getValues(), 'Raids');
      for (var rowIndex = raidsRows.length - 1; rowIndex >= 1; rowIndex -= 1) {
        var row = raidsRows[rowIndex] || [];
        // Raid > Démarrer writes only the ID and the tier; anything else means Raid > Terminer already filled it.
        var onlyId = row.every(function (value, column) {
          return column === raidIdColumn || column === raidTierColumn || normalizeCellString_(value) === '';
        });
        if (normalizeCellString_(row[raidIdColumn]).trim() === raidId && onlyId) {
          requests.push({
            deleteDimension: {
              range: { sheetId: raidsSheet.getSheetId(), dimension: 'ROWS', startIndex: rowIndex, endIndex: rowIndex + 1 }
            }
          });
          break;
        }
      }
      return requests;
    });

    ui.alert(raidId
      ? 'Raid ' + raidId + ' annulé : protections retirées, Raid ouvert vidé.'
      : 'Aucun raid démarré : rien à annuler.');
  } catch (error) {
    ui.alert('Cancel open raid failed:\n' + error.message);
  }
}

// Deletes every protection whose description starts with the open-raid prefix (shared with 4.7).
function buildRaidProtectionDeleteRequests_(sheetsMetadata) {
  var requests = [];
  ((sheetsMetadata && sheetsMetadata.sheets) || []).forEach(function (sheet) {
    ((sheet && sheet.protectedRanges) || []).forEach(function (protection) {
      if (normalizeCellString_(protection.description).indexOf(RAID_OPEN_PROTECTION_PREFIX) === 0) {
        requests.push({ deleteProtectedRange: { protectedRangeId: protection.protectedRangeId } });
      }
    });
  });
  return requests;
}
