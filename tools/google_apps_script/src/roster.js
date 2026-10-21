// Exact-name roster lookup shared by the attendance (4.4) and ledger (4.7) imports.
// Names are compared verbatim: no case-folding, no realm stripping (AD-3).

// Builds the lookup from raw tab values (header row first); collects every problem instead of stopping at the first.
function buildRosterIndex_(rosterRows, rerollRows) {
  // Prototype-free maps so names like "constructor" or "__proto__" are ordinary keys.
  var raiders = Object.create(null);
  var rerollToMain = Object.create(null);
  var errors = [];
  var rerollRowsByKey = Object.create(null);

  var rosterTab = tabByName_('Roster');
  var rerollsTab = tabByName_('Rerolls');

  var rosterKeyColumn = columnOf_(rosterTab, 'raiderKey');
  var rerollNameColumn = columnOf_(rerollsTab, 'rerollName');
  var rerollMainColumn = columnOf_(rerollsTab, 'mainKey');

  for (var rowIndex = 1; rowIndex < rosterRows.length; rowIndex += 1) {
    var row = rosterRows[rowIndex] || [];
    var rawKey = normalizeKeyValue_(row[rosterKeyColumn]);
    if (!rawKey) {
      continue;
    }

    if (isTrimMismatch_(rawKey)) {
      errors.push('Roster row ' + (rowIndex + 1) + ': invalid key with leading/trailing whitespace: "' + rawKey + '".');
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(raiders, rawKey)) {
      errors.push(
        'Roster duplicate key "' + rawKey + '" at rows ' + raiders[rawKey].row + ' and ' + (rowIndex + 1) + '.'
      );
      continue;
    }

    raiders[rawKey] = { row: rowIndex + 1 };
  }

  // Rerolls alts credit their main's attendance only; awards never resolve through them.
  for (rowIndex = 1; rowIndex < rerollRows.length; rowIndex += 1) {
    row = rerollRows[rowIndex] || [];
    var rerollName = normalizeKeyValue_(row[rerollNameColumn]);
    var mainKey = normalizeKeyValue_(row[rerollMainColumn]);
    var rerollRowNumber = rowIndex + 1;
    var duplicateReroll = false;

    if (!rerollName && !mainKey) {
      continue;
    }

    if (!rerollName || !mainKey) {
      errors.push('Rerolls row ' + rerollRowNumber + ': both rerollName and mainKey are required.');
      continue;
    }

    if (isTrimMismatch_(rerollName)) {
      errors.push('Rerolls row ' + rerollRowNumber + ': invalid rerollName with leading/trailing whitespace: "' + rerollName + '".');
      continue;
    }

    if (isTrimMismatch_(mainKey)) {
      errors.push('Rerolls row ' + rerollRowNumber + ': invalid mainKey with leading/trailing whitespace: "' + mainKey + '".');
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(raiders, rerollName)) {
      errors.push(
        'Rerolls row ' + rerollRowNumber + ': rerollName "' + rerollName + '" must not match a roster key.'
      );
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(rerollRowsByKey, rerollName)) {
      errors.push(
        'Rerolls duplicate rerollName "' + rerollName + '" at rows ' + rerollRowsByKey[rerollName] + ' and ' + rerollRowNumber + '.'
      );
      duplicateReroll = true;
    } else {
      rerollRowsByKey[rerollName] = rerollRowNumber;
    }

    if (!Object.prototype.hasOwnProperty.call(raiders, mainKey)) {
      errors.push(
        'Rerolls row ' + rerollRowNumber + ': mainKey "' + mainKey + '" is not in roster keys.'
      );
      continue;
    }

    // Keep only the first mapping of a duplicated alt; the error already blocks callers.
    if (duplicateReroll) {
      continue;
    }

    rerollToMain[rerollName] = mainKey;
  }

  return {
    raiders: raiders,
    rerollToMain: rerollToMain,
    errors: errors
  };
}

// Reads Roster and Rerolls from the workbook; a missing tab is reported as an error.
function readRosterIndex_() {
  var spreadsheet = SpreadsheetApp.getActive();
  var errors = [];

  var rosterSheet = spreadsheet.getSheetByName('Roster');
  var rerollsSheet = spreadsheet.getSheetByName('Rerolls');

  if (!rosterSheet) {
    errors.push('Missing tab: Roster.');
  }
  if (!rerollsSheet) {
    errors.push('Missing tab: Rerolls.');
  }

  var rosterRows = rosterSheet ? rosterSheet.getDataRange().getValues() : [];
  var rerollRows = rerollsSheet ? rerollsSheet.getDataRange().getValues() : [];
  var index = buildRosterIndex_(rosterRows, rerollRows);

  index.errors = errors.concat(index.errors);
  return index;
}

// For import actions: refuse to write anything while the roster has errors.
function requireRosterIndex_() {
  var index = readRosterIndex_();
  if (index.errors.length) {
    throw new Error('Roster index errors:\n- ' + index.errors.join('\n- '));
  }
  return index;
}

// Award recipients: exact roster key or null.
function findRaiderKey_(index, name) {
  if (!index || !index.raiders) {
    return null;
  }

  if (!Object.prototype.hasOwnProperty.call(index.raiders, name)) {
    return null;
  }

  return name;
}

// Attendance participants: exact roster key, else the main of an exact Rerolls alt, else null.
function resolveAttendanceKey_(index, name) {
  var raiderKey = findRaiderKey_(index, name);
  if (raiderKey) {
    return raiderKey;
  }

  if (!index || !index.rerollToMain) {
    return null;
  }

  if (!Object.prototype.hasOwnProperty.call(index.rerollToMain, name)) {
    return null;
  }

  return index.rerollToMain[name];
}

function normalizeKeyValue_(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

// Leading/trailing spaces are typos that would silently break exact matching.
function isTrimMismatch_(value) {
  return value !== value.trim();
}
