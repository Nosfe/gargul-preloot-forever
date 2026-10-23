// Exact-name roster lookup shared by the attendance (4.4) and ledger (4.7) imports.
// Names are compared verbatim: no case-folding, no realm stripping (AD-3).

// Builds the lookup from raw tab values (header row first); collects every problem instead of stopping at the first.
function buildRosterIndex_(rosterRows) {
  // Prototype-free maps so names like "constructor" or "__proto__" are ordinary keys.
  var raiders = Object.create(null);
  var errors = [];

  var rosterTab = tabByName_('Roster');

  var rosterKeyColumn = columnOf_(rosterTab, 'raiderKey');

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

  return {
    raiders: raiders,
    errors: errors
  };
}

// Reads Roster from the workbook; a missing tab is reported as an error.
function readRosterIndex_() {
  var rosterSheet = SpreadsheetApp.getActive().getSheetByName('Roster');
  var index = buildRosterIndex_(rosterSheet ? rosterSheet.getDataRange().getValues() : []);
  if (!rosterSheet) {
    index.errors.unshift('Missing tab: Roster.');
  }
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

// Award recipients and attendance participants: exact roster key or null.
function findRaiderKey_(index, name) {
  if (!index || !index.raiders) {
    return null;
  }

  if (!Object.prototype.hasOwnProperty.call(index.raiders, name)) {
    return null;
  }

  return name;
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
