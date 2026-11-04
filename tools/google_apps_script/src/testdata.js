// Menu actions: fill the workbook with TBC test data to preview the raider portal, then remove exactly what was added.
// What was added (raiders, items per Objets tab, raids) is kept in the document properties so the clear never touches real rows.

var TEST_DATA_PROPERTY = 'parsimonie-test-data';

// Fantasy names, unlikely to clash with a real guild; the fill refuses if one is already in Roster.
var TEST_RAIDERS = [
  'Aelwynn', 'Brakmor', 'Celesthra', 'Dornak', 'Elyndra', 'Faelith', 'Grimbolt', 'Hestara', 'Ithrion', 'Jorvak',
  'Kaelyss', 'Lunara', 'Morgrim', 'Nymeria', 'Orthak', 'Peryn', 'Quelith', 'Rhogar', 'Sylvanna', 'Thaldrin'
];

// TBC phase 1 loot: Karazhan, Gruul and Magtheridon.
var TEST_ITEMS = [
  { id: 28770, name: 'Nathrezim Mindblade', slot: 'Une main', raid: 'Karazhan' },
  { id: 28772, name: 'Sunfury Bow of the Phoenix', slot: 'Distance', raid: 'Karazhan' },
  { id: 28773, name: 'Gorehowl', slot: 'Deux mains', raid: 'Karazhan' },
  { id: 28749, name: 'King\'s Defender', slot: 'Une main', raid: 'Karazhan' },
  { id: 28802, name: 'Bloodmaw Magus-Blade', slot: 'Main droite', raid: 'Karazhan' },
  { id: 28774, name: 'Glaive of the Pit', slot: 'Deux mains', raid: 'Karazhan' },
  { id: 28767, name: 'The Decapitator', slot: 'Une main', raid: 'Karazhan' },
  { id: 28762, name: 'Adornment of Stolen Souls', slot: 'Cou', raid: 'Karazhan' },
  { id: 28785, name: 'The Lightning Capacitor', slot: 'Bijou', raid: 'Karazhan' },
  { id: 28528, name: 'Moroes\' Lucky Pocket Watch', slot: 'Bijou', raid: 'Karazhan' },
  { id: 28530, name: 'Brooch of Unquenchable Fury', slot: 'Cou', raid: 'Karazhan' },
  { id: 28545, name: 'Edgewalker Longboots', slot: 'Pieds', raid: 'Karazhan' },
  { id: 28570, name: 'Shadow-Cloak of Dalaran', slot: 'Dos', raid: 'Karazhan' },
  { id: 28658, name: 'Terestian\'s Stranglestaff', slot: 'Deux mains', raid: 'Karazhan' },
  { id: 28794, name: 'Axe of the Gronn Lords', slot: 'Deux mains', raid: 'Gruul\'s Lair' },
  { id: 28800, name: 'Hammer of the Naaru', slot: 'Deux mains', raid: 'Gruul\'s Lair' },
  { id: 28823, name: 'Eye of Gruul', slot: 'Bijou', raid: 'Gruul\'s Lair' },
  { id: 28830, name: 'Dragonspine Trophy', slot: 'Bijou', raid: 'Gruul\'s Lair' },
  { id: 28797, name: 'Brute Cloak of the Ogre-Magi', slot: 'Dos', raid: 'Gruul\'s Lair' },
  { id: 28799, name: 'Belt of Divine Inspiration', slot: 'Taille', raid: 'Gruul\'s Lair' },
  { id: 28801, name: 'Maulgar\'s Warhelm', slot: 'Tête', raid: 'Gruul\'s Lair' },
  { id: 28795, name: 'Bladespire Warbands', slot: 'Poignets', raid: 'Gruul\'s Lair' },
  { id: 28804, name: 'Collar of Cho\'gall', slot: 'Tête', raid: 'Gruul\'s Lair' },
  { id: 28810, name: 'Windshear Boots', slot: 'Pieds', raid: 'Gruul\'s Lair' },
  { id: 28824, name: 'Gauntlets of Martial Perfection', slot: 'Mains', raid: 'Gruul\'s Lair' },
  { id: 28825, name: 'Aldori Legacy Defender', slot: 'Bouclier', raid: 'Gruul\'s Lair' },
  { id: 28789, name: 'Eye of Magtheridon', slot: 'Bijou', raid: 'Magtheridon\'s Lair' },
  { id: 29458, name: 'Aegis of the Vindicator', slot: 'Bouclier', raid: 'Magtheridon\'s Lair' },
  { id: 28782, name: 'Crystalheart Pulse-Staff', slot: 'Deux mains', raid: 'Magtheridon\'s Lair' },
  { id: 28781, name: 'Karaborian Talisman', slot: 'Tenu en main gauche', raid: 'Magtheridon\'s Lair' },
  { id: 28777, name: 'Cloak of the Pit Stalker', slot: 'Dos', raid: 'Magtheridon\'s Lair' },
  { id: 28780, name: 'Soul-Eater\'s Handwraps', slot: 'Mains', raid: 'Magtheridon\'s Lair' },
  { id: 28783, name: 'Eredar Wand of Obliteration', slot: 'Distance', raid: 'Magtheridon\'s Lair' },
  { id: 28778, name: 'Terror Pit Girdle', slot: 'Taille', raid: 'Magtheridon\'s Lair' }
];

// Oldest first; the IDs carry a "test-" prefix so they never collide with Raid > Démarrer IDs.
var TEST_RAIDS = ['Karazhan', 'Gruul\'s Lair', 'Karazhan', 'Magtheridon\'s Lair', 'Karazhan', 'Gruul\'s Lair'];

var TEST_STATUTS = ['IMPACT', 'BIS', 'IMPACT', 'NORMAL', 'CLASS_BOUND', ''];
var TEST_TREATMENTS = ['BIS', 'IMPACT', 'NORMAL', 'IMPACT', 'CLASS_BOUND'];

function fillTestData() {
  var ui = SpreadsheetApp.getUi();
  try {
    ui.alert(fillTestData_());
  } catch (error) {
    ui.alert('Données de test impossibles :\n' + error.message);
  }
}

function clearTestData() {
  var ui = SpreadsheetApp.getUi();
  try {
    ui.alert(clearTestData_());
  } catch (error) {
    ui.alert('Effacement des données de test impossible :\n' + error.message);
  }
}

// Three steps, each one batch: input rows, then a refresh (raider columns in Présence/Awards), then raids and loots.
function fillTestData_() {
  var properties = PropertiesService.getDocumentProperties();
  if (properties.getProperty(TEST_DATA_PROPERTY)) {
    throw new Error('Des données de test sont déjà en place. Effacez-les d\'abord (Données de test > Effacer).');
  }

  var record = { raiders: TEST_RAIDERS.slice(), items: {}, raids: [] };
  var raids = [];

  applyBatch_(function () {
    var spreadsheet = SpreadsheetApp.getActive();
    var configTab = tabByName_('Config');
    var configRow = requireCurrentLayout_(snapshotSheet_(spreadsheet, 'Config').getDataRange().getValues(), 'Config')[1] || [];
    if (normalizeCellString_(configRow[columnOf_(configTab, 'openRaidId')]).trim()) {
      throw new Error('Un raid est démarré : terminez-le ou annulez-le d\'abord.');
    }
    var tierId = normalizeCellString_(configRow[columnOf_(configTab, 'tierId')]).trim();
    raids = testRaidPlan_(dateSerialFromCell_(configRow[columnOf_(configTab, 'bisWindowStart')]), dateSerialFromCell_(new Date()));
    record.raids = raids.map(function (raid) { return raid.raidId; });

    return buildTestRosterRequests_(spreadsheet)
      .concat(buildTestItemRequests_(spreadsheet, record.items))
      .concat(buildTestRaidsRequests_(spreadsheet, raids, tierId));
  });

  // Saved before the next steps so a failure there can still be cleared.
  properties.setProperty(TEST_DATA_PROPERTY, JSON.stringify(record));

  refreshWorkbook_();

  var awardCount = 0;
  applyBatch_(function () {
    var spreadsheet = SpreadsheetApp.getActive();
    var built = buildTestRaidRowsRequests_(spreadsheet, raids);
    awardCount = built.awardCount;
    return built.requests;
  });

  return 'Données de test ajoutées : ' + TEST_RAIDERS.length + ' raiders, ' + TEST_ITEMS.length + ' objets TBC, ' +
    raids.length + ' raids et ' + awardCount + ' loots.\nLe portail les montre sous une minute. Données de test > Effacer les retire.';
}

// Removes the recorded raids, the test raiders (Roster rows and their Présence/Awards columns) and the added item rows.
function clearTestData_() {
  var properties = PropertiesService.getDocumentProperties();
  var stored = properties.getProperty(TEST_DATA_PROPERTY);
  if (!stored) {
    return 'Aucune donnée de test à effacer.';
  }
  var record = JSON.parse(stored);

  // One read, one batch: row deletions first, then the raider columns (row deletions never move columns).
  applyBatch_(function () {
    var spreadsheet = SpreadsheetApp.getActive();
    return buildTestRaidDeleteRequests_(spreadsheet, record.raids || [])
      .concat(buildTestClearRequests_(spreadsheet, record));
  });

  refreshWorkbook_();
  properties.deleteProperty(TEST_DATA_PROPERTY);
  return 'Données de test effacées.';
}

// Raid dates spread from the later of the tier start and five weeks ago, up to yesterday.
function testRaidPlan_(tierStartSerial, todaySerial) {
  var start = todaySerial - 35;
  if (tierStartSerial !== null && tierStartSerial > start) {
    start = tierStartSerial;
  }
  var end = Math.max(start, todaySerial - 1);
  return TEST_RAIDS.map(function (instance, index) {
    return {
      raidId: 'test-' + (index + 1),
      instance: instance,
      dateSerial: start + Math.floor((end - start) * index / (TEST_RAIDS.length - 1))
    };
  });
}

// Test raiders below the last Roster name: Raider, Groupe, Classe, Spé, then the parse (Rôle stays a formula).
function buildTestRosterRequests_(spreadsheet) {
  var sheet = snapshotSheet_(spreadsheet, 'Roster');
  var rows = requireCurrentLayout_(sheet.getDataRange().getValues(), 'Roster');
  var tab = tabByName_('Roster');
  var nameColumn = columnOf_(tab, 'raiderKey');
  var lastNamed = 0;
  var existing = Object.create(null);
  for (var rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    var name = normalizeCellString_((rows[rowIndex] || [])[nameColumn]).trim();
    if (name) {
      lastNamed = rowIndex;
      existing[name] = true;
    }
  }
  var clashes = TEST_RAIDERS.filter(function (name) { return existing[name]; });
  if (clashes.length) {
    throw new Error('Ces noms de test sont déjà dans le Roster : ' + clashes.join(', ') + '.');
  }
  // Roster formulas cover rows 2 to 201.
  if (lastNamed + TEST_RAIDERS.length > 200) {
    throw new Error('Pas assez de lignes libres dans le Roster pour ' + TEST_RAIDERS.length + ' raiders de test.');
  }

  var first = lastNamed + 1;
  var identity = TEST_RAIDERS.map(function (name, index) {
    var spec = SPEC_COLUMNS[index % SPEC_COLUMNS.length];
    return { values: [name, RAID_GROUPS[index % 2], spec.className, spec.spec].map(function (value) {
      return { userEnteredValue: { stringValue: value } };
    }) };
  });
  var parses = TEST_RAIDERS.map(function (name, index) {
    return { values: [{ userEnteredValue: { numberValue: 30 + (index * 17) % 70 } }] };
  });
  return [
    { updateCells: { start: { sheetId: sheet.getSheetId(), rowIndex: first, columnIndex: nameColumn }, rows: identity, fields: 'userEnteredValue' } },
    { updateCells: { start: { sheetId: sheet.getSheetId(), rowIndex: first, columnIndex: columnOf_(tab, 'dpsParse') }, rows: parses, fields: 'userEnteredValue' } }
  ];
}

// Test items below the last row of each Objets tab, skipping IDs already listed there; addedByTab records what was written.
function buildTestItemRequests_(spreadsheet, addedByTab) {
  var requests = [];
  ITEM_TABS.forEach(function (itemTab) {
    var sheet = snapshotSheet_(spreadsheet, itemTab.name);
    var rows = sheet.getDataRange().getValues();
    var existing = Object.create(null);
    var last = 2;
    for (var rowIndex = 3; rowIndex < rows.length; rowIndex += 1) {
      var id = parseInteger_((rows[rowIndex] || [])[0]);
      if (id !== null) {
        existing[id] = true;
        last = rowIndex;
      }
    }
    var specs = SPEC_COLUMNS.filter(function (spec) { return spec.role === itemTab.role; });
    var items = TEST_ITEMS.filter(function (item) { return !existing[item.id]; });
    addedByTab[itemTab.name] = items.map(function (item) { return item.id; });
    if (!items.length) {
      return;
    }
    requests.push({
      updateCells: {
        start: { sheetId: sheet.getSheetId(), rowIndex: last + 1, columnIndex: 0 },
        rows: items.map(function (item, itemIndex) {
          var values = [
            { userEnteredValue: { numberValue: item.id } },
            { userEnteredValue: { stringValue: item.name } },
            { userEnteredValue: { stringValue: item.slot } }
          ];
          specs.forEach(function (spec, specIndex) {
            var statut = TEST_STATUTS[(itemIndex + specIndex) % TEST_STATUTS.length];
            values.push(statut ? { userEnteredValue: { stringValue: statut } } : {});
            values.push(statut === 'IMPACT' ? { userEnteredValue: { numberValue: 10 + (itemIndex * 7 + specIndex * 11) % 70 } } : {});
          });
          return { values: values };
        }),
        fields: 'userEnteredValue'
      }
    });
  });
  return requests;
}

// Raids rows: Raid (ID), Instance, Date du raid, then the active tier.
function buildTestRaidsRequests_(spreadsheet, raids, tierId) {
  var sheet = snapshotSheet_(spreadsheet, 'Raids');
  var rows = requireCurrentLayout_(sheet.getDataRange().getValues(), 'Raids');
  var tab = tabByName_('Raids');
  return raids.map(function (raid, index) {
    var values = [];
    values[columnOf_(tab, 'raidId')] = { userEnteredValue: { stringValue: raid.raidId } };
    values[columnOf_(tab, 'instance')] = { userEnteredValue: { stringValue: raid.instance } };
    values[columnOf_(tab, 'raidDate')] = { userEnteredValue: { numberValue: raid.dateSerial }, userEnteredFormat: { numberFormat: { type: 'DATE' } } };
    values[columnOf_(tab, 'raidTier')] = tierId ? { userEnteredValue: { stringValue: tierId } } : {};
    for (var i = 0; i < values.length; i += 1) {
      values[i] = values[i] || {};
    }
    return {
      updateCells: {
        start: { sheetId: sheet.getSheetId(), rowIndex: rows.length + index, columnIndex: 0 },
        rows: [{ values: values }],
        fields: 'userEnteredValue,userEnteredFormat.numberFormat'
      }
    };
  });
}

// Présence rows (1 present, B bench, blank absent) and Awards loots, once the raider columns exist.
function buildTestRaidRowsRequests_(spreadsheet, raids) {
  var presenceSheet = snapshotSheet_(spreadsheet, GRID_TABS.presence.name);
  var presenceRows = presenceSheet.getDataRange().getValues();
  var presenceHeader = presenceRows[0] || [];
  var awardsSheet = snapshotSheet_(spreadsheet, GRID_TABS.awards.name);
  var awardsRows = awardsSheet.getDataRange().getValues();
  var requests = [];

  var awardNames = readAwardsBlockNames_(awardsRows).map(function (name) { return normalizeCellString_(name).trim(); });
  var missing = TEST_RAIDERS.filter(function (name) {
    return awardNames.indexOf(name) === -1 || presenceHeader.map(function (value) { return normalizeCellString_(value).trim(); }).indexOf(name) === -1;
  });
  if (missing.length) {
    throw new Error('Les colonnes Présence/Awards des raiders de test n\'ont pas été créées (' + missing.join(', ') +
      '). Données de test > Effacer, puis Remplir à nouveau.');
  }

  raids.forEach(function (raid, raidIndex) {
    var values = [
      { userEnteredValue: { stringValue: raid.raidId } },
      { userEnteredValue: { stringValue: raid.instance } },
      { userEnteredValue: { numberValue: raid.dateSerial }, userEnteredFormat: { numberFormat: { type: 'DATE' } } }
    ];
    for (var column = PRESENCE_FIRST_RAIDER_COLUMN; column < presenceHeader.length; column += 1) {
      var raiderIndex = TEST_RAIDERS.indexOf(normalizeCellString_(presenceHeader[column]).trim());
      var mark = raiderIndex === -1 ? 0 : (raiderIndex * 3 + raidIndex * 5) % 9;
      values.push(raiderIndex === -1 || mark === 0 ? {} : mark === 1 ? { userEnteredValue: { stringValue: 'B' } } : { userEnteredValue: { numberValue: 1 } });
    }
    requests.push({
      updateCells: {
        start: { sheetId: presenceSheet.getSheetId(), rowIndex: presenceRows.length + raidIndex, columnIndex: 0 },
        rows: [{ values: values }],
        fields: 'userEnteredValue,userEnteredFormat.numberFormat'
      }
    });
  });

  var blockStartByName = Object.create(null);
  readAwardsBlockNames_(awardsRows).forEach(function (name, index) {
    blockStartByName[normalizeCellString_(name).trim()] = index * AWARDS_BLOCK_WIDTH;
  });
  var nextRowByName = Object.create(null);
  var awardCount = 0;
  raids.forEach(function (raid, raidIndex) {
    var loot = TEST_ITEMS.filter(function (item) { return item.raid === raid.instance; });
    for (var k = 0; k < 3; k += 1) {
      var item = loot[(raidIndex * 2 + k) % loot.length];
      var winner = TEST_RAIDERS[(raidIndex * 7 + k * 3) % TEST_RAIDERS.length];
      var blockStart = blockStartByName[winner];
      if (blockStart === undefined) {
        continue;
      }
      if (nextRowByName[winner] === undefined) {
        nextRowByName[winner] = nextAwardRowIndex_(awardsRows, blockStart);
      }
      var award = { itemID: item.id, itemName: item.name, treatment: TEST_TREATMENTS[(raidIndex + k) % TEST_TREATMENTS.length] };
      requests.push(buildAwardRowWriteRequest_(awardsSheet.getSheetId(), nextRowByName[winner], blockStart, award, raid.raidId, raid.dateSerial));
      nextRowByName[winner] += 1;
      awardCount += 1;
    }
  });

  return { requests: requests, awardCount: awardCount };
}

// Rows of the test raids in Raids, Présence (and archive) and every Awards block (and archive), bottom to top.
function buildTestRaidDeleteRequests_(spreadsheet, raidIds) {
  var isTestRaid = function (value) {
    return raidIds.indexOf(normalizeCellString_(value).trim()) !== -1;
  };
  var matching = function (rows, firstIndex, column) {
    var indexes = [];
    for (var rowIndex = firstIndex; rowIndex < rows.length; rowIndex += 1) {
      if (isTestRaid((rows[rowIndex] || [])[column])) {
        indexes.push(rowIndex);
      }
    }
    return indexes;
  };
  var requests = [];

  var raidsSheet = snapshotSheet_(spreadsheet, 'Raids');
  requests = requests.concat(buildDeleteRowRequests_(raidsSheet.getSheetId(),
    matching(raidsSheet.getDataRange().getValues(), 1, columnOf_(tabByName_('Raids'), 'raidId'))));

  [GRID_TABS.presence.name, ARCHIVE_TABS.presence.name].forEach(function (name) {
    var sheet = spreadsheet.getSheetByName(name);
    if (sheet) {
      requests = requests.concat(buildDeleteRowRequests_(sheet.getSheetId(),
        matching(sheet.getDataRange().getValues(), PRESENCE_FIRST_RAID_ROW - 1, PRESENCE_RAID_ID_COLUMN)));
    }
  });

  [GRID_TABS.awards.name, ARCHIVE_TABS.awards.name].forEach(function (name) {
    var sheet = spreadsheet.getSheetByName(name);
    if (!sheet) {
      return;
    }
    var rows = sheet.getDataRange().getValues();
    var width = (rows[0] || []).length;
    for (var start = 0; start < width; start += AWARDS_BLOCK_WIDTH) {
      matching(rows, AWARDS_FIRST_ROW - 1, start + AWARDS_RAID_ID_OFFSET).reverse().forEach(function (rowIndex) {
        requests.push({
          deleteRange: {
            range: { sheetId: sheet.getSheetId(), startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: start, endColumnIndex: start + AWARDS_BLOCK_WIDTH },
            shiftDimension: 'ROWS'
          }
        });
      });
    }
  });

  return requests;
}

// Test raider columns (Présence, Awards and their archives), test Roster rows and the added Objets rows; right to left, bottom to top.
function buildTestClearRequests_(spreadsheet, record) {
  var raiders = record.raiders || [];
  var requests = [];

  [GRID_TABS.presence.name, ARCHIVE_TABS.presence.name].forEach(function (name) {
    var sheet = spreadsheet.getSheetByName(name);
    if (!sheet) {
      return;
    }
    var header = (sheet.getDataRange().getValues()[0] || []);
    for (var column = header.length - 1; column >= PRESENCE_FIRST_RAIDER_COLUMN; column -= 1) {
      if (raiders.indexOf(normalizeCellString_(header[column]).trim()) !== -1) {
        requests.push({ deleteDimension: { range: { sheetId: sheet.getSheetId(), dimension: 'COLUMNS', startIndex: column, endIndex: column + 1 } } });
      }
    }
  });

  [GRID_TABS.awards.name, ARCHIVE_TABS.awards.name].forEach(function (name) {
    var sheet = spreadsheet.getSheetByName(name);
    if (!sheet) {
      return;
    }
    var names = readAwardsBlockNames_(sheet.getDataRange().getValues());
    for (var index = names.length - 1; index >= 0; index -= 1) {
      if (raiders.indexOf(normalizeCellString_(names[index]).trim()) !== -1) {
        var start = index * AWARDS_BLOCK_WIDTH;
        requests.push({ deleteDimension: { range: { sheetId: sheet.getSheetId(), dimension: 'COLUMNS', startIndex: start, endIndex: start + AWARDS_BLOCK_WIDTH } } });
      }
    }
  });

  var rosterSheet = snapshotSheet_(spreadsheet, 'Roster');
  var rosterRows = rosterSheet.getDataRange().getValues();
  var nameColumn = columnOf_(tabByName_('Roster'), 'raiderKey');
  var rosterIndexes = [];
  for (var rowIndex = 1; rowIndex < rosterRows.length; rowIndex += 1) {
    if (raiders.indexOf(normalizeCellString_((rosterRows[rowIndex] || [])[nameColumn]).trim()) !== -1) {
      rosterIndexes.push(rowIndex);
    }
  }
  requests = requests.concat(buildDeleteRowRequests_(rosterSheet.getSheetId(), rosterIndexes));

  ITEM_TABS.forEach(function (itemTab) {
    var added = (record.items || {})[itemTab.name] || [];
    var sheet = spreadsheet.getSheetByName(itemTab.name);
    if (!sheet || !added.length) {
      return;
    }
    var rows = sheet.getDataRange().getValues();
    var indexes = [];
    for (var index = 3; index < rows.length; index += 1) {
      if (added.indexOf(parseInteger_((rows[index] || [])[0])) !== -1) {
        indexes.push(index);
      }
    }
    requests = requests.concat(buildDeleteRowRequests_(sheet.getSheetId(), indexes));
  });

  return requests;
}
