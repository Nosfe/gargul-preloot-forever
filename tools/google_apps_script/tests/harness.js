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
    return '';
  }

  function applyAddSheet_(request, storeById, nameIndex) {
    var properties = (request.addSheet && request.addSheet.properties) || {};
    var title = properties.title;
    var requestedId = properties.sheetId;

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

    storeById[String(newId)] = {
      id: newId,
      title: title,
      rows: []
    };
    nameIndex[title] = newId;

    return {
      addSheet: {
        properties: {
          sheetId: newId,
          title: title
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

      throw new Error('Unsupported request type in fake batchUpdate.');
    });

    state.storeById = workingStore;
    state.nameIndex = workingNameIndex;

    return {
      spreadsheetId: spreadsheetId,
      replies: replies
    };
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
          }
        };
      }
    };
  }

  function install() {
    previous.SpreadsheetApp = global.SpreadsheetApp;
    previous.LockService = global.LockService;
    previous.Sheets = global.Sheets;
    previous.Utilities = global.Utilities;
    previous.Session = global.Session;

    state = {
      spreadsheetId: 'test-spreadsheet-id',
      nextSheetId: 60000,
      lockHeld: false,
      forceLockBusy: false,
      alerts: [],
      lastMenu: null,
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
      createMenu: function (caption) {
        return createMenuBuilder(caption);
      },
      alert: function (message) {
        state.alerts.push(String(message));
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
        batchUpdate: batchUpdate_
      }
    };

    global.Session = {
      getScriptTimeZone: function () {
        return 'Europe/Paris';
      }
    };

    // Only the yyyy-MM-dd HH:mm:ss pattern used by menu.js is supported.
    global.Utilities = {
      formatDate: function (date, timeZone, pattern) {
        if (pattern !== 'yyyy-MM-dd HH:mm:ss') {
          throw new Error('Unsupported formatDate pattern in fake: ' + pattern);
        }
        function pad(n) {
          return (n < 10 ? '0' : '') + n;
        }
        return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
          ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds());
      }
    };
  }

  function uninstall() {
    global.SpreadsheetApp = previous.SpreadsheetApp;
    global.LockService = previous.LockService;
    global.Sheets = previous.Sheets;
    global.Utilities = previous.Utilities;
    global.Session = previous.Session;
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

  function isLockHeld() {
    return state.lockHeld;
  }

  function setLockBusy(value) {
    state.forceLockBusy = Boolean(value);
  }

  global.TracerHarness = {
    install: install,
    uninstall: uninstall,
    getRows: getRows,
    getAlerts: getAlerts,
    clearAlerts: clearAlerts,
    getLastMenu: getLastMenu,
    isLockHeld: isLockHeld,
    setLockBusy: setLockBusy
  };
})(window);
