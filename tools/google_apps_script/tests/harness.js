(function (global) {
  var previous = {};
  var state = null;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function buildNameIndex(storeById) {
    var index = {};
    Object.keys(storeById).forEach(function (id) {
      index[storeById[id].title] = Number(id);
    });
    return index;
  }

  function ensureSheetMeta_(sheet) {
    if (!sheet.meta) {
      sheet.meta = {
        frozenRowCount: 0,
        frozenColumnCount: 0,
        tabColorStyle: null,
        dataValidations: [],
        conditionalFormatRules: [],
        bandedRanges: [],
        columnWidths: {},
        notes: {},
        merges: [],
        borders: [],
        hidden: false
      };
    }
    if (!Array.isArray(sheet.meta.dataValidations)) {
      sheet.meta.dataValidations = [];
    }
    if (!Array.isArray(sheet.meta.conditionalFormatRules)) {
      sheet.meta.conditionalFormatRules = [];
    }
    if (!Array.isArray(sheet.meta.bandedRanges)) {
      sheet.meta.bandedRanges = [];
    }
    if (!Array.isArray(sheet.meta.protectedRanges)) {
      sheet.meta.protectedRanges = [];
    }
    if (!sheet.meta.columnWidths) {
      sheet.meta.columnWidths = {};
    }
    if (!sheet.meta.notes) {
      sheet.meta.notes = {};
    }
    if (!Array.isArray(sheet.meta.merges)) {
      sheet.meta.merges = [];
    }
    if (!Array.isArray(sheet.meta.borders)) {
      sheet.meta.borders = [];
    }
    if (typeof sheet.meta.hidden !== 'boolean') {
      sheet.meta.hidden = false;
    }
  }

  function createSheetRecord_(id, title, rows, frozenRowCount, frozenColumnCount) {
    return {
      id: id,
      title: title,
      rows: clone(rows || []),
      meta: {
        frozenRowCount: Number(frozenRowCount || 0),
        frozenColumnCount: Number(frozenColumnCount || 0),
        // New Sheets tabs have 26 columns (A-Z); writes beyond the grid are rejected like the real API.
        columnCount: 26,
        tabColorStyle: null,
        dataValidations: [],
        conditionalFormatRules: [],
        bandedRanges: [],
        protectedRanges: [],
        columnWidths: {},
        notes: {},
        merges: [],
        borders: [],
        hidden: false
      }
    };
  }

  function toCellValue_(cellData) {
    if (!cellData || !cellData.userEnteredValue) {
      return '';
    }
    if (Object.prototype.hasOwnProperty.call(cellData.userEnteredValue, 'stringValue')) {
      return cellData.userEnteredValue.stringValue;
    }
    if (Object.prototype.hasOwnProperty.call(cellData.userEnteredValue, 'numberValue')) {
      return cellData.userEnteredValue.numberValue;
    }
    if (Object.prototype.hasOwnProperty.call(cellData.userEnteredValue, 'boolValue')) {
      return cellData.userEnteredValue.boolValue;
    }
    if (Object.prototype.hasOwnProperty.call(cellData.userEnteredValue, 'formulaValue')) {
      return cellData.userEnteredValue.formulaValue;
    }
    return '';
  }

  function ensureRowLength_(row, minLength) {
    while (row.length < minLength) {
      row.push('');
    }
  }

  function applyAddSheet_(request, storeById, nameIndex) {
    var properties = (request.addSheet && request.addSheet.properties) || {};
    var title = properties.title;
    var requestedId = properties.sheetId;
    var gridProperties = properties.gridProperties || {};

    if (!title) {
      throw new Error('addSheet requires properties.title');
    }
    if (Object.prototype.hasOwnProperty.call(nameIndex, title)) {
      throw new Error('Sheet already exists: ' + title);
    }

    var newId = requestedId;
    if (typeof newId !== 'number') {
      newId = state.nextSheetId;
      state.nextSheetId += 1;
    }

    if (Object.prototype.hasOwnProperty.call(storeById, String(newId))) {
      throw new Error('Sheet id already exists: ' + newId);
    }

    storeById[String(newId)] = createSheetRecord_(
      newId,
      title,
      [],
      Number(gridProperties.frozenRowCount || 0),
      Number(gridProperties.frozenColumnCount || 0)
    );
    if (typeof gridProperties.columnCount === 'number') {
      storeById[String(newId)].meta.columnCount = gridProperties.columnCount;
    }
    nameIndex[title] = newId;

    return {
      addSheet: {
        properties: {
          sheetId: newId,
          title: title,
          gridProperties: {
            frozenRowCount: Number(gridProperties.frozenRowCount || 0),
            frozenColumnCount: Number(gridProperties.frozenColumnCount || 0)
          }
        }
      }
    };
  }

  function applyAppendCells_(request, storeById) {
    var appendCells = request.appendCells || {};
    var sheetId = appendCells.sheetId;
    var rowDefs = appendCells.rows || [];
    var sheet = storeById[String(sheetId)];

    if (!sheet) {
      throw new Error('Unknown sheet id in appendCells: ' + sheetId);
    }

    rowDefs.forEach(function (rowDef) {
      var values = (rowDef && rowDef.values) || [];
      var row = values.map(toCellValue_);
      sheet.rows.push(row);
    });

    return {};
  }

  function applyUpdateCells_(request, storeById) {
    var updateCells = request.updateCells || {};
    var start = updateCells.start || {};
    // A request targets either `start` (write) or `range` (clear).
    var sheetId = updateCells.range ? updateCells.range.sheetId : start.sheetId;
    var rowIndex = Number(start.rowIndex || 0);
    var columnIndex = Number(start.columnIndex || 0);
    var rows = updateCells.rows || [];
    var sheet = storeById[String(sheetId)];

    if (!sheet) {
      throw new Error('Unknown sheet id in updateCells: ' + sheetId);
    }

    ensureSheetMeta_(sheet);

    if (updateCells.range && updateCells.fields === '*' && !updateCells.rows) {
      sheet.rows = [];
      sheet.meta.notes = {};
      sheet.meta.borders = [];
      return {};
    }

    rows.forEach(function (rowDef) {
      var width = ((rowDef && rowDef.values) || []).length;
      if (columnIndex + width > (sheet.meta.columnCount || 26)) {
        throw new Error('updateCells beyond grid in ' + sheet.title + ': column ' + (columnIndex + width));
      }
    });

    rows.forEach(function (rowDef, rowOffset) {
      var targetRowIndex = rowIndex + rowOffset;
      while (sheet.rows.length <= targetRowIndex) {
        sheet.rows.push([]);
      }

      var targetRow = sheet.rows[targetRowIndex];
      var values = (rowDef && rowDef.values) || [];
      ensureRowLength_(targetRow, columnIndex + values.length);

      values.forEach(function (cellData, colOffset) {
        var colIndex = columnIndex + colOffset;
        targetRow[colIndex] = toCellValue_(cellData);
        if (Object.prototype.hasOwnProperty.call(cellData || {}, 'note')) {
          sheet.meta.notes[targetRowIndex + ':' + colIndex] = String(cellData.note || '');
        }
      });
    });

    return {};
  }

  // True when two GridRanges share a cell; a missing bound is unbounded.
  function rangesOverlap_(a, b) {
    function axis(aStart, aEnd, bStart, bEnd) {
      var lo = Math.max(aStart || 0, bStart || 0);
      var hi = Math.min(aEnd === undefined ? Infinity : aEnd, bEnd === undefined ? Infinity : bEnd);
      return lo < hi;
    }
    return axis(a.startRowIndex, a.endRowIndex, b.startRowIndex, b.endRowIndex) &&
      axis(a.startColumnIndex, a.endColumnIndex, b.startColumnIndex, b.endColumnIndex);
  }

  function applySetDataValidation_(request, storeById) {
    var setDataValidation = request.setDataValidation || {};
    var range = setDataValidation.range || {};
    var sheetId = range.sheetId;
    var sheet = storeById[String(sheetId)];

    if (!sheet) {
      throw new Error('Unknown sheet id in setDataValidation: ' + sheetId);
    }

    ensureSheetMeta_(sheet);
    // Like the real API: a new rule replaces the one on the same range; a clear (no rule) removes every overlapping rule.
    var isClear = !setDataValidation.rule;
    sheet.meta.dataValidations = sheet.meta.dataValidations.filter(function (entry) {
      if (isClear) {
        return !rangesOverlap_(entry.range, range);
      }
      return JSON.stringify(entry.range) !== JSON.stringify(range);
    });
    if (isClear) {
      return {};
    }
    sheet.meta.dataValidations.push({
      range: clone(range),
      rule: clone(setDataValidation.rule || null)
    });

    return {};
  }

  function applyAddConditionalFormatRule_(request, storeById) {
    var addConditionalFormatRule = request.addConditionalFormatRule || {};
    var rule = addConditionalFormatRule.rule || {};
    var ranges = rule.ranges || [];
    var index = Number(addConditionalFormatRule.index || 0);

    if (!ranges.length || typeof ranges[0].sheetId !== 'number') {
      throw new Error('addConditionalFormatRule requires a range with sheetId');
    }

    var sheetId = ranges[0].sheetId;
    var sheet = storeById[String(sheetId)];
    if (!sheet) {
      throw new Error('Unknown sheet id in addConditionalFormatRule: ' + sheetId);
    }

    ensureSheetMeta_(sheet);
    if (index < 0 || index > sheet.meta.conditionalFormatRules.length) {
      throw new Error('Conditional format index out of bounds: ' + index);
    }

    sheet.meta.conditionalFormatRules.splice(index, 0, clone(rule));
    return {};
  }

  function applyDeleteConditionalFormatRule_(request, storeById) {
    var payload = request.deleteConditionalFormatRule || {};
    var sheetId = payload.sheetId;
    var index = Number(payload.index);
    var sheet = storeById[String(sheetId)];

    if (!sheet) {
      throw new Error('Unknown sheet id in deleteConditionalFormatRule: ' + sheetId);
    }

    ensureSheetMeta_(sheet);
    if (index < 0 || index >= sheet.meta.conditionalFormatRules.length) {
      throw new Error('Conditional format delete index out of bounds: ' + index);
    }

    sheet.meta.conditionalFormatRules.splice(index, 1);
    return {};
  }

  function applyUpdateSheetProperties_(request, storeById) {
    var updateSheetProperties = request.updateSheetProperties || {};
    var properties = updateSheetProperties.properties || {};
    var sheetId = properties.sheetId;
    var sheet = storeById[String(sheetId)];

    if (!sheet) {
      throw new Error('Unknown sheet id in updateSheetProperties: ' + sheetId);
    }

    ensureSheetMeta_(sheet);
    if (properties.gridProperties && typeof properties.gridProperties.frozenRowCount === 'number') {
      sheet.meta.frozenRowCount = properties.gridProperties.frozenRowCount;
    }
    if (properties.gridProperties && typeof properties.gridProperties.frozenColumnCount === 'number') {
      sheet.meta.frozenColumnCount = properties.gridProperties.frozenColumnCount;
    }
    if (properties.gridProperties && typeof properties.gridProperties.columnCount === 'number') {
      sheet.meta.columnCount = properties.gridProperties.columnCount;
    }
    if (Object.prototype.hasOwnProperty.call(properties, 'tabColorStyle')) {
      sheet.meta.tabColorStyle = clone(properties.tabColorStyle || null);
    }
    if (Object.prototype.hasOwnProperty.call(properties, 'hidden')) {
      sheet.meta.hidden = Boolean(properties.hidden);
    }

    return {};
  }

  // Fake deleteSheet request: removes the sheet record and its name.
  function applyDeleteSheet_(request, storeById, nameIndex) {
    var payload = request.deleteSheet || {};
    var sheetId = payload.sheetId;
    var key = String(sheetId);
    var sheet = storeById[key];

    if (!sheet) {
      throw new Error('Unknown sheet id in deleteSheet: ' + sheetId);
    }

    delete storeById[key];
    if (Object.prototype.hasOwnProperty.call(nameIndex, sheet.title)) {
      delete nameIndex[sheet.title];
    }

    return {};
  }

  function applyRepeatCell_(request, storeById) {
    var repeatCell = request.repeatCell || {};
    var range = repeatCell.range || {};
    var sheetId = range.sheetId;
    var sheet = storeById[String(sheetId)];
    if (!sheet) {
      throw new Error('Unknown sheet id in repeatCell: ' + sheetId);
    }
    ensureSheetMeta_(sheet);
    sheet.meta.lastRepeatCell = clone(repeatCell);
    return {};
  }

  function applyUpdateDimensionProperties_(request, storeById) {
    var payload = request.updateDimensionProperties || {};
    var range = payload.range || {};
    var properties = payload.properties || {};
    var sheetId = range.sheetId;
    var sheet = storeById[String(sheetId)];

    if (!sheet) {
      throw new Error('Unknown sheet id in updateDimensionProperties: ' + sheetId);
    }

    ensureSheetMeta_(sheet);
    if (range.dimension === 'COLUMNS' && typeof properties.pixelSize === 'number') {
      var start = Number(range.startIndex || 0);
      var end = Number(range.endIndex || start);
      for (var col = start; col < end; col += 1) {
        sheet.meta.columnWidths[String(col)] = properties.pixelSize;
      }
    }

    return {};
  }

  function applyAddBanding_(request, storeById) {
    var payload = request.addBanding || {};
    var bandedRange = payload.bandedRange || {};
    var range = bandedRange.range || {};
    var sheetId = range.sheetId;
    var sheet = storeById[String(sheetId)];

    if (!sheet) {
      throw new Error('Unknown sheet id in addBanding: ' + sheetId);
    }

    ensureSheetMeta_(sheet);
    var bandedRangeId = state.nextBandingId;
    state.nextBandingId += 1;
    var record = clone(bandedRange);
    record.bandedRangeId = bandedRangeId;
    sheet.meta.bandedRanges.push(record);

    return {
      addBanding: {
        bandedRange: {
          bandedRangeId: bandedRangeId
        }
      }
    };
  }

  function applyDeleteBanding_(request, storeById) {
    var payload = request.deleteBanding || {};
    var targetId = payload.bandedRangeId;
    var found = false;

    Object.keys(storeById).forEach(function (id) {
      var sheet = storeById[id];
      ensureSheetMeta_(sheet);
      var remaining = [];
      sheet.meta.bandedRanges.forEach(function (entry) {
        if (entry.bandedRangeId === targetId) {
          found = true;
        } else {
          remaining.push(entry);
        }
      });
      sheet.meta.bandedRanges = remaining;
    });

    if (!found) {
      throw new Error('Unknown bandedRangeId in deleteBanding: ' + targetId);
    }

    return {};
  }

  function applyAddProtectedRange_(request, storeById) {
    var payload = request.addProtectedRange || {};
    var protectedRange = clone(payload.protectedRange || {});
    var range = protectedRange.range || {};
    var sheetId = range.sheetId;
    var sheet = storeById[String(sheetId)];

    if (!sheet) {
      throw new Error('Unknown sheet id in addProtectedRange: ' + sheetId);
    }

    ensureSheetMeta_(sheet);
    protectedRange.protectedRangeId = state.nextProtectedRangeId;
    state.nextProtectedRangeId += 1;
    sheet.meta.protectedRanges.push(protectedRange);

    return {
      addProtectedRange: {
        protectedRange: {
          protectedRangeId: protectedRange.protectedRangeId
        }
      }
    };
  }

  function applyDeleteProtectedRange_(request, storeById) {
    var payload = request.deleteProtectedRange || {};
    var id = payload.protectedRangeId;
    var removed = false;

    Object.keys(storeById).forEach(function (sheetId) {
      var sheet = storeById[sheetId];
      ensureSheetMeta_(sheet);
      sheet.meta.protectedRanges = sheet.meta.protectedRanges.filter(function (entry) {
        if (entry.protectedRangeId === id) {
          removed = true;
          return false;
        }
        return true;
      });
    });

    if (!removed) {
      throw new Error('Unknown protectedRangeId in deleteProtectedRange: ' + id);
    }

    return {};
  }

  // Fake deleteRange with shiftDimension ROWS: cells below move up inside the column range only.
  function applyDeleteRange_(request, storeById) {
    var payload = request.deleteRange || {};
    var range = payload.range || {};
    var sheet = storeById[String(range.sheetId)];
    if (!sheet) {
      throw new Error('Unknown sheet id in deleteRange: ' + range.sheetId);
    }
    if (payload.shiftDimension !== 'ROWS') {
      throw new Error('Fake deleteRange supports only ROWS.');
    }
    var count = range.endRowIndex - range.startRowIndex;
    for (var rowIndex = range.startRowIndex; rowIndex < sheet.rows.length; rowIndex += 1) {
      var row = sheet.rows[rowIndex];
      ensureRowLength_(row, range.endColumnIndex);
      var source = sheet.rows[rowIndex + count] || [];
      for (var column = range.startColumnIndex; column < range.endColumnIndex; column += 1) {
        row[column] = source[column] === undefined ? '' : source[column];
      }
    }
    return {};
  }

  function applyDeleteDimension_(request, storeById) {
    var payload = request.deleteDimension || {};
    var range = payload.range || {};
    var sheetId = range.sheetId;
    var sheet = storeById[String(sheetId)];
    if (!sheet) {
      throw new Error('Unknown sheet id in deleteDimension: ' + sheetId);
    }

    if (range.dimension === 'ROWS') {
      var rowStart = Number(range.startIndex || 0);
      var rowEnd = Number(range.endIndex || rowStart);
      sheet.rows.splice(rowStart, Math.max(0, rowEnd - rowStart));
      return {};
    }

    if (range.dimension !== 'COLUMNS') {
      throw new Error('Fake deleteDimension currently supports only COLUMNS.');
    }

    var start = Number(range.startIndex || 0);
    var end = Number(range.endIndex || start);
    var deleteCount = Math.max(0, end - start);

    if (deleteCount <= 0) {
      return {};
    }

    sheet.rows = sheet.rows.map(function (row) {
      var next = (row || []).slice();
      next.splice(start, deleteCount);
      return next;
    });

    ensureSheetMeta_(sheet);
    if (end > (sheet.meta.columnCount || 26)) {
      throw new Error('deleteDimension beyond grid in ' + sheet.title + ': column ' + end);
    }
    sheet.meta.columnCount = Number(sheet.meta.columnCount || 26) - deleteCount;
    // Like Sheets: a rule whose ranges all sit in the deleted columns disappears; later ranges shift left.
    sheet.meta.conditionalFormatRules = sheet.meta.conditionalFormatRules.map(function (rule) {
      rule.ranges = (rule.ranges || []).filter(function (r) {
        return !(r.startColumnIndex >= start && r.endColumnIndex <= end);
      }).map(function (r) {
        var shifted = clone(r);
        if (shifted.startColumnIndex >= end) {
          shifted.startColumnIndex -= deleteCount;
          shifted.endColumnIndex -= deleteCount;
        } else if (shifted.endColumnIndex > start) {
          shifted.endColumnIndex -= Math.min(deleteCount, shifted.endColumnIndex - start);
        }
        return shifted;
      });
      return rule;
    }).filter(function (rule) {
      return rule.ranges.length > 0;
    });
    var nextWidths = {};
    Object.keys(sheet.meta.columnWidths).forEach(function (key) {
      var index = Number(key);
      if (index < start) {
        nextWidths[String(index)] = sheet.meta.columnWidths[key];
      } else if (index >= end) {
        nextWidths[String(index - deleteCount)] = sheet.meta.columnWidths[key];
      }
    });
    sheet.meta.columnWidths = nextWidths;

    return {};
  }

  // Fake findReplace: exact, case-sensitive whole-cell match within range rows (columns unbounded).
  function applyFindReplace_(request, storeById) {
    var payload = request.findReplace || {};
    var range = payload.range || {};
    var sheet = storeById[String(range.sheetId)];
    if (!sheet) {
      throw new Error('Unknown sheet id in findReplace: ' + range.sheetId);
    }
    if (!payload.matchEntireCell || !payload.matchCase) {
      throw new Error('Fake findReplace supports only matchEntireCell + matchCase.');
    }
    var start = Number(range.startRowIndex || 0);
    var end = range.endRowIndex === undefined ? sheet.rows.length : Number(range.endRowIndex);
    var changed = 0;
    for (var r = start; r < Math.min(end, sheet.rows.length); r += 1) {
      var row = sheet.rows[r] || [];
      for (var c = 0; c < row.length; c += 1) {
        if (row[c] === payload.find) {
          row[c] = payload.replacement;
          changed += 1;
        }
      }
    }
    return { findReplace: { occurrencesChanged: changed } };
  }

  function applyInsertDimension_(request, storeById) {
    var payload = request.insertDimension || {};
    var range = payload.range || {};
    var sheetId = range.sheetId;
    var sheet = storeById[String(sheetId)];
    if (!sheet) {
      throw new Error('Unknown sheet id in insertDimension: ' + sheetId);
    }

    if (range.dimension !== 'COLUMNS') {
      throw new Error('Fake insertDimension currently supports only COLUMNS.');
    }

    var start = Number(range.startIndex || 0);
    var end = Number(range.endIndex || start);
    var insertCount = Math.max(0, end - start);

    if (insertCount <= 0) {
      return {};
    }

    sheet.rows = sheet.rows.map(function (row) {
      var next = (row || []).slice();
      var blanks = [];
      for (var i = 0; i < insertCount; i += 1) {
        blanks.push('');
      }
      Array.prototype.splice.apply(next, [start, 0].concat(blanks));
      return next;
    });

    ensureSheetMeta_(sheet);
    sheet.meta.columnCount = Number(sheet.meta.columnCount || 26) + insertCount;

    var nextWidths = {};
    Object.keys(sheet.meta.columnWidths).forEach(function (key) {
      var index = Number(key);
      if (index < start) {
        nextWidths[String(index)] = sheet.meta.columnWidths[key];
      } else {
        nextWidths[String(index + insertCount)] = sheet.meta.columnWidths[key];
      }
    });
    sheet.meta.columnWidths = nextWidths;

    return {};
  }

  // Fake moveDimension (COLUMNS): destinationIndex is in coordinates before the source is removed, like the API.
  function applyMoveDimension_(request, storeById) {
    var payload = request.moveDimension || {};
    var source = payload.source || {};
    var sheet = storeById[String(source.sheetId)];
    if (!sheet) {
      throw new Error('Unknown sheet id in moveDimension: ' + source.sheetId);
    }
    if (source.dimension !== 'COLUMNS') {
      throw new Error('Fake moveDimension currently supports only COLUMNS.');
    }
    ensureSheetMeta_(sheet);
    var start = source.startIndex;
    var end = source.endIndex;
    var count = end - start;
    var destination = payload.destinationIndex;
    if (end > (sheet.meta.columnCount || 26) || destination > (sheet.meta.columnCount || 26)) {
      throw new Error('moveDimension beyond grid in ' + sheet.title);
    }
    var insertAt = destination > start ? destination - count : destination;
    sheet.rows = sheet.rows.map(function (row) {
      var next = (row || []).slice();
      ensureRowLength_(next, end);
      var moved = next.splice(start, count);
      Array.prototype.splice.apply(next, [insertAt, 0].concat(moved));
      return next;
    });
    return {};
  }

  function applyMergeCells_(request, storeById) {
    var payload = request.mergeCells || {};
    var range = payload.range || {};
    var sheetId = range.sheetId;
    var sheet = storeById[String(sheetId)];

    if (!sheet) {
      throw new Error('Unknown sheet id in mergeCells: ' + sheetId);
    }

    ensureSheetMeta_(sheet);
    if (Number(range.endColumnIndex) > (sheet.meta.columnCount || 26)) {
      throw new Error('mergeCells beyond grid in ' + sheet.title + ': column ' + range.endColumnIndex);
    }
    sheet.meta.merges.push(clone(range));
    return {};
  }

  function applyUnmergeCells_(request, storeById) {
    var payload = request.unmergeCells || {};
    var range = payload.range || {};
    var sheetId = range.sheetId;
    var sheet = storeById[String(sheetId)];

    if (!sheet) {
      throw new Error('Unknown sheet id in unmergeCells: ' + sheetId);
    }

    ensureSheetMeta_(sheet);
    sheet.meta.merges = [];
    return {};
  }

  function applyUpdateBorders_(request, storeById) {
    var payload = request.updateBorders || {};
    var range = payload.range || {};
    var sheetId = range.sheetId;
    var sheet = storeById[String(sheetId)];

    if (!sheet) {
      throw new Error('Unknown sheet id in updateBorders: ' + sheetId);
    }

    ensureSheetMeta_(sheet);
    var key = JSON.stringify(payload.range || {});
    var existingIndex = -1;
    for (var i = 0; i < sheet.meta.borders.length; i += 1) {
      var current = sheet.meta.borders[i] || {};
      if (JSON.stringify(current.range || {}) === key) {
        existingIndex = i;
        break;
      }
    }
    if (existingIndex >= 0) {
      sheet.meta.borders[existingIndex] = clone(payload);
    } else {
      sheet.meta.borders.push(clone(payload));
    }
    return {};
  }

  // Fake copyPaste: whole-column ranges, values only (formats, notes and validations are not modelled).
  function applyCopyPaste_(request, storeById) {
    var payload = request.copyPaste || {};
    var source = payload.source || {};
    var destination = payload.destination || {};
    var from = storeById[String(source.sheetId)];
    var to = storeById[String(destination.sheetId)];
    if (!from || !to) {
      throw new Error('Unknown sheet id in copyPaste.');
    }
    ensureSheetMeta_(from);
    ensureSheetMeta_(to);
    var width = source.endColumnIndex - source.startColumnIndex;
    if (destination.endColumnIndex - destination.startColumnIndex !== width) {
      throw new Error('Fake copyPaste needs same-size ranges.');
    }
    if (source.endColumnIndex > (from.meta.columnCount || 26) || destination.endColumnIndex > (to.meta.columnCount || 26)) {
      throw new Error('copyPaste beyond grid.');
    }
    var values = from.rows.map(function (row) {
      return (row || []).slice(source.startColumnIndex, source.endColumnIndex);
    });
    while (to.rows.length < values.length) {
      to.rows.push([]);
    }
    to.rows.forEach(function (row, rowIndex) {
      ensureRowLength_(row, destination.endColumnIndex);
      for (var offset = 0; offset < width; offset += 1) {
        var value = values[rowIndex] ? values[rowIndex][offset] : '';
        row[destination.startColumnIndex + offset] = value === undefined ? '' : value;
      }
    });
    // Like PASTE_NORMAL: rules lying inside the source columns are added to the destination.
    var shift = destination.startColumnIndex - source.startColumnIndex;
    from.meta.conditionalFormatRules.slice().forEach(function (rule) {
      var inside = (rule.ranges || []).filter(function (r) {
        return r.startColumnIndex >= source.startColumnIndex && r.endColumnIndex <= source.endColumnIndex;
      });
      if (inside.length) {
        var copy = clone(rule);
        copy.ranges = inside.map(function (r) {
          var moved = clone(r);
          moved.sheetId = destination.sheetId;
          moved.startColumnIndex += shift;
          moved.endColumnIndex += shift;
          return moved;
        });
        to.meta.conditionalFormatRules.push(copy);
      }
    });
    return {};
  }

  function batchUpdate_(body, spreadsheetId) {
    if (spreadsheetId !== state.spreadsheetId) {
      throw new Error('Unexpected spreadsheet id: ' + spreadsheetId);
    }

    var requests = (body && body.requests) || [];
    var workingStore = clone(state.storeById);
    var workingNameIndex = buildNameIndex(workingStore);
    var replies = [];

    requests.forEach(function (request) {
      if (request.addSheet) {
        replies.push(applyAddSheet_(request, workingStore, workingNameIndex));
        return;
      }
      if (request.appendCells) {
        replies.push(applyAppendCells_(request, workingStore));
        return;
      }
      if (request.updateCells) {
        replies.push(applyUpdateCells_(request, workingStore));
        return;
      }
      if (request.setDataValidation) {
        replies.push(applySetDataValidation_(request, workingStore));
        return;
      }
      if (request.addConditionalFormatRule) {
        replies.push(applyAddConditionalFormatRule_(request, workingStore));
        return;
      }
      if (request.deleteConditionalFormatRule) {
        replies.push(applyDeleteConditionalFormatRule_(request, workingStore));
        return;
      }
      if (request.updateSheetProperties) {
        replies.push(applyUpdateSheetProperties_(request, workingStore));
        return;
      }
      if (request.deleteSheet) {
        replies.push(applyDeleteSheet_(request, workingStore, workingNameIndex));
        return;
      }
      if (request.repeatCell) {
        replies.push(applyRepeatCell_(request, workingStore));
        return;
      }
      if (request.updateDimensionProperties) {
        replies.push(applyUpdateDimensionProperties_(request, workingStore));
        return;
      }
      if (request.addBanding) {
        replies.push(applyAddBanding_(request, workingStore));
        return;
      }
      if (request.deleteBanding) {
        replies.push(applyDeleteBanding_(request, workingStore));
        return;
      }
      if (request.addProtectedRange) {
        replies.push(applyAddProtectedRange_(request, workingStore));
        return;
      }
      if (request.deleteProtectedRange) {
        replies.push(applyDeleteProtectedRange_(request, workingStore));
        return;
      }
      if (request.deleteRange) {
        replies.push(applyDeleteRange_(request, workingStore));
        return;
      }
      if (request.deleteDimension) {
        replies.push(applyDeleteDimension_(request, workingStore));
        return;
      }
      if (request.insertDimension) {
        replies.push(applyInsertDimension_(request, workingStore));
        return;
      }
      if (request.findReplace) {
        replies.push(applyFindReplace_(request, workingStore));
        return;
      }
      if (request.mergeCells) {
        replies.push(applyMergeCells_(request, workingStore));
        return;
      }
      if (request.unmergeCells) {
        replies.push(applyUnmergeCells_(request, workingStore));
        return;
      }
      if (request.updateBorders) {
        replies.push(applyUpdateBorders_(request, workingStore));
        return;
      }
      if (request.copyPaste) {
        replies.push(applyCopyPaste_(request, workingStore));
        return;
      }
      if (request.moveDimension) {
        replies.push(applyMoveDimension_(request, workingStore));
        return;
      }

      throw new Error('Unsupported request type in fake batchUpdate.');
    });

    state.storeById = workingStore;
    state.nameIndex = workingNameIndex;

    return {
      spreadsheetId: spreadsheetId,
      replies: replies
    };
  }

  function sheetsGet_(spreadsheetId, options) {
    if (spreadsheetId !== state.spreadsheetId) {
      throw new Error('Unexpected spreadsheet id in get: ' + spreadsheetId);
    }

    var sheets = Object.keys(state.storeById).map(function (id) {
      var sheet = state.storeById[id];
      ensureSheetMeta_(sheet);
      return {
        properties: {
          sheetId: sheet.id,
          title: sheet.title
        },
        conditionalFormats: clone(sheet.meta.conditionalFormatRules),
        protectedRanges: clone(sheet.meta.protectedRanges),
        bandedRanges: clone(sheet.meta.bandedRanges).map(function (entry) {
          return { bandedRangeId: entry.bandedRangeId };
        })
      };
    });

    return { sheets: sheets, fields: options && options.fields ? String(options.fields) : '' };
  }

  function createMenuBuilder(caption) {
    var data = {
      caption: caption,
      items: []
    };

    return {
      _data: data,
      addItem: function (label, functionName) {
        data.items.push({
          type: 'item',
          label: label,
          functionName: functionName
        });
        return this;
      },
      addSubMenu: function (subMenu) {
        data.items.push({
          type: 'submenu',
          menu: subMenu._data
        });
        return this;
      },
      addToUi: function () {
        state.lastMenu = clone(data);
      }
    };
  }

  function buildSpreadsheetFacade() {
    return {
      getId: function () {
        return state.spreadsheetId;
      },
      getSpreadsheetLocale: function () {
        return state.locale;
      },
      getSheetByName: function (name) {
        if (!Object.prototype.hasOwnProperty.call(state.nameIndex, name)) {
          return null;
        }

        var sheetId = state.nameIndex[name];
        var sheetRecord = state.storeById[String(sheetId)];
        return {
          getSheetId: function () {
            return sheetRecord.id;
          },
          getName: function () {
            return sheetRecord.title;
          },
          getLastColumn: function () {
            var max = 0;
            sheetRecord.rows.forEach(function (row) {
              if (Array.isArray(row) && row.length > max) {
                max = row.length;
              }
            });
            return max;
          },
          getDataRange: function () {
            return {
              getValues: function () {
                return clone(sheetRecord.rows);
              }
            };
          },
          // Grid width (columnCount), 26 by default like a new Sheets tab.
          getMaxColumns: function () {
            ensureSheetMeta_(sheetRecord);
            return Number(sheetRecord.meta.columnCount || 26);
          }
        };
      }
    };
  }

  function createPropertiesStore_(backing) {
    return {
      getProperty: function (key) {
        if (!Object.prototype.hasOwnProperty.call(backing, key)) {
          return null;
        }
        return backing[key];
      },
      setProperty: function (key, value) {
        backing[String(key)] = String(value);
        return this;
      },
      setProperties: function (pairs, deleteAllOthers) {
        if (deleteAllOthers) {
          Object.keys(backing).forEach(function (key) {
            delete backing[key];
          });
        }
        Object.keys(pairs || {}).forEach(function (key) {
          backing[String(key)] = String(pairs[key]);
        });
        return this;
      },
      getProperties: function () {
        return clone(backing);
      },
      deleteProperty: function (key) {
        delete backing[String(key)];
        return this;
      },
      deleteAllProperties: function () {
        Object.keys(backing).forEach(function (key) {
          delete backing[key];
        });
        return this;
      }
    };
  }

  function buildHttpResponse_(entry) {
    var bodyText = '';
    if (entry && Object.prototype.hasOwnProperty.call(entry, 'contentText')) {
      bodyText = String(entry.contentText);
    } else if (entry && Object.prototype.hasOwnProperty.call(entry, 'body')) {
      bodyText = typeof entry.body === 'string' ? entry.body : JSON.stringify(entry.body);
    }
    var headers = (entry && entry.headers) || {};

    return {
      getResponseCode: function () {
        return Number((entry && entry.statusCode) || 200);
      },
      getContentText: function () {
        return bodyText;
      },
      getHeaders: function () {
        return clone(headers);
      },
      getAllHeaders: function () {
        return clone(headers);
      }
    };
  }

  function urlFetch_(url, params) {
    state.fetchLog.push({
      url: String(url),
      params: clone(params || {})
    });

    if (!state.fetchResponses.length) {
      throw new Error('No fake UrlFetchApp response queued for ' + url + '.');
    }

    return buildHttpResponse_(state.fetchResponses.shift());
  }

  function install() {
    previous.SpreadsheetApp = global.SpreadsheetApp;
    previous.LockService = global.LockService;
    previous.Sheets = global.Sheets;
    previous.HtmlService = global.HtmlService;
    previous.Utilities = global.Utilities;
    previous.Session = global.Session;
    previous.UrlFetchApp = global.UrlFetchApp;
    previous.PropertiesService = global.PropertiesService;

    state = {
      spreadsheetId: 'test-spreadsheet-id',
      locale: 'en_US',
      nextSheetId: 60000,
      nextBandingId: 9000,
      nextProtectedRangeId: 12000,
      lockHeld: false,
      forceLockBusy: false,
      alerts: [],
      lastMenu: null,
      modalDialogs: [],
      fetchResponses: [],
      promptResponses: [],
      fetchLog: [],
      userProperties: {},
      storeById: {},
      nameIndex: {}
    };

    var lock = {
      tryLock: function () {
        if (state.forceLockBusy || state.lockHeld) {
          return false;
        }
        state.lockHeld = true;
        return true;
      },
      releaseLock: function () {
        state.lockHeld = false;
      }
    };

    var ui = {
      Button: { OK: 'OK', CANCEL: 'CANCEL' },
      ButtonSet: { OK_CANCEL: 'OK_CANCEL' },
      createMenu: function (caption) {
        return createMenuBuilder(caption);
      },
      // Scripted answers from setPromptResponses; none left means the owner pressed Cancel.
      prompt: function (title, message) {
        state.alerts.push(String(message));
        var answer = state.promptResponses.length ? state.promptResponses.shift() : null;
        return {
          getSelectedButton: function () { return answer === null ? 'CANCEL' : 'OK'; },
          getResponseText: function () { return answer === null ? '' : String(answer); }
        };
      },
      alert: function (message) {
        state.alerts.push(String(message));
      },
      showModalDialog: function (userInterface, title) {
        state.modalDialogs.push({
          title: String(title || ''),
          html: userInterface && typeof userInterface.getContent === 'function'
            ? String(userInterface.getContent())
            : '',
          width: userInterface && typeof userInterface.getWidth === 'function' ? userInterface.getWidth() : null,
          height: userInterface && typeof userInterface.getHeight === 'function' ? userInterface.getHeight() : null
        });
      }
    };

    global.SpreadsheetApp = {
      getActive: function () {
        return buildSpreadsheetFacade();
      },
      getUi: function () {
        return ui;
      }
    };

    global.LockService = {
      getDocumentLock: function () {
        return lock;
      }
    };

    global.Sheets = {
      Spreadsheets: {
        batchUpdate: batchUpdate_,
        get: sheetsGet_
      }
    };

    global.HtmlService = {
      createHtmlOutput: function (html) {
        var content = html === undefined || html === null ? '' : String(html);
        var width = null;
        var height = null;
        return {
          setWidth: function (value) {
            width = Number(value);
            return this;
          },
          setHeight: function (value) {
            height = Number(value);
            return this;
          },
          getContent: function () {
            return content;
          },
          getWidth: function () {
            return width;
          },
          getHeight: function () {
            return height;
          }
        };
      }
    };

    global.Session = {
      getScriptTimeZone: function () {
        return 'Europe/Paris';
      }
    };

    global.UrlFetchApp = {
      fetch: urlFetch_
    };

    global.PropertiesService = {
      getUserProperties: function () {
        return createPropertiesStore_(state.userProperties);
      }
    };

    global.Utilities = {
      Charset: {
        UTF_8: 'UTF_8'
      },
      formatDate: function (date, timeZone, pattern) {
        if (pattern !== 'yyyy-MM-dd HH:mm:ss' && pattern !== 'yyyy-MM-dd') {
          throw new Error('Unsupported formatDate pattern in fake: ' + pattern);
        }
        function pad(n) {
          return (n < 10 ? '0' : '') + n;
        }
        var day = date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
        if (pattern === 'yyyy-MM-dd') {
          return day;
        }
        return day + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds());
      },
      base64Encode: function (data, charset) {
        if (charset && charset !== 'UTF_8') {
          throw new Error('Unsupported charset in fake base64Encode: ' + charset);
        }
        var text = String(data === undefined || data === null ? '' : data);
        var bytes = new TextEncoder().encode(text);
        var binary = '';
        for (var i = 0; i < bytes.length; i += 1) {
          binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
      },
      base64Decode: function (encoded, charset) {
        if (charset && charset !== 'UTF_8') {
          throw new Error('Unsupported charset in fake base64Decode: ' + charset);
        }
        var binary = atob(String(encoded || ''));
        var bytes = [];
        for (var index = 0; index < binary.length; index += 1) {
          bytes.push(binary.charCodeAt(index));
        }
        return bytes;
      },
      newBlob: function (data) {
        var bytes;
        if (Array.isArray(data)) {
          bytes = data.slice();
        } else {
          bytes = Array.from(new TextEncoder().encode(String(data === undefined || data === null ? '' : data)));
        }
        return {
          getDataAsString: function () {
            return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
          },
          getBytes: function () {
            return bytes.slice();
          }
        };
      }
    };
  }

  function uninstall() {
    global.SpreadsheetApp = previous.SpreadsheetApp;
    global.LockService = previous.LockService;
    global.Sheets = previous.Sheets;
    global.HtmlService = previous.HtmlService;
    global.Utilities = previous.Utilities;
    global.Session = previous.Session;
    global.UrlFetchApp = previous.UrlFetchApp;
    global.PropertiesService = previous.PropertiesService;
    state = null;
  }

  function getRows(sheetName) {
    if (!Object.prototype.hasOwnProperty.call(state.nameIndex, sheetName)) {
      return [];
    }
    var sheetId = state.nameIndex[sheetName];
    return clone(state.storeById[String(sheetId)].rows);
  }

  function getAlerts() {
    return state.alerts.slice();
  }

  function clearAlerts() {
    state.alerts = [];
  }

  function getLastMenu() {
    return clone(state.lastMenu);
  }

  function seedSheet(name, rows, options) {
    // Re-seeding an existing tab replaces its rows and keeps its id, so one sheet never has two records.
    if (Object.prototype.hasOwnProperty.call(state.nameIndex, name)) {
      state.storeById[String(state.nameIndex[name])].rows = clone(rows || []);
      return;
    }

    var id = options && typeof options.sheetId === 'number' ? options.sheetId : state.nextSheetId;
    if (Object.prototype.hasOwnProperty.call(state.storeById, String(id))) {
      throw new Error('seedSheet id already exists: ' + id);
    }
    if (!options || typeof options.sheetId !== 'number') {
      state.nextSheetId += 1;
    } else if (id >= state.nextSheetId) {
      state.nextSheetId = id + 1;
    }

    var frozen = options && typeof options.frozenRowCount === 'number'
      ? options.frozenRowCount
      : 0;

    var frozenColumns = options && typeof options.frozenColumnCount === 'number'
      ? options.frozenColumnCount
      : 0;

    state.storeById[String(id)] = createSheetRecord_(id, name, rows || [], frozen, frozenColumns);
    state.nameIndex[name] = id;
  }

  function getLastModalDialog() {
    if (!state.modalDialogs.length) {
      return null;
    }
    return clone(state.modalDialogs[state.modalDialogs.length - 1]);
  }

  function getModalDialogs() {
    return clone(state.modalDialogs);
  }

  function clearModalDialogs() {
    state.modalDialogs = [];
  }

  function getSheetMeta(name) {
    if (!Object.prototype.hasOwnProperty.call(state.nameIndex, name)) {
      return null;
    }
    var sheetId = state.nameIndex[name];
    var sheet = state.storeById[String(sheetId)];
    ensureSheetMeta_(sheet);
    return clone(sheet.meta);
  }

  function setLocale(locale) {
    state.locale = locale;
  }

  function isLockHeld() {
    return state.lockHeld;
  }

  function setLockBusy(value) {
    state.forceLockBusy = Boolean(value);
  }

  function setPromptResponses(responses) {
    state.promptResponses = (responses || []).slice();
  }

  function setFetchResponses(responses) {
    state.fetchResponses = clone(responses || []);
    state.fetchLog = [];
  }

  function getFetchLog() {
    return clone(state.fetchLog);
  }

  function getUserProperties() {
    return clone(state.userProperties);
  }

  global.TracerHarness = {
    install: install,
    uninstall: uninstall,
    getRows: getRows,
    getAlerts: getAlerts,
    clearAlerts: clearAlerts,
    getLastMenu: getLastMenu,
    seedSheet: seedSheet,
    getLastModalDialog: getLastModalDialog,
    getModalDialogs: getModalDialogs,
    clearModalDialogs: clearModalDialogs,
    getSheetMeta: getSheetMeta,
    setLocale: setLocale,
    isLockHeld: isLockHeld,
    setLockBusy: setLockBusy,
    setPromptResponses: setPromptResponses,
    setFetchResponses: setFetchResponses,
    getFetchLog: getFetchLog,
    getUserProperties: getUserProperties
  };
})(window);
