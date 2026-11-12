// Menu action: pre-raid BiS lists of WoW Forever from wowtbc.gg, every listed item set to BIS for its spec.
// Re-runnable: listed items are added once per Objets tab, and BIS only fills empty Statut cells.
var BIS_IMPORT_URL = 'https://wowtbc.gg/page-data/warcraftforever/bis-list/{slug}/page-data.json';
var BIS_IMPORT_LEVEL = '60';
// Items kept per list slot, like the five shown by wowtbc.gg before "Show more".
var BIS_IMPORT_PER_SLOT = 5;

// wowtbc.gg page → sheet spec column (shockadin-paladin has no column).
var BIS_IMPORT_SPECS = {
  'protection-warrior': 'Guerrier Protection',
  'protection-paladin': 'Paladin Protection',
  'feral-tank-druid': 'Druide Combat farouche (ours)',
  'holy-paladin': 'Paladin Sacré',
  'discipline-priest': 'Prêtre Discipline',
  'holy-priest': 'Prêtre Sacré',
  'restoration-shaman': 'Chaman Restauration',
  'restoration-druid': 'Druide Restauration',
  'arms-warrior': 'Guerrier Armes',
  'fury-warrior': 'Guerrier Fureur',
  'retribution-paladin': 'Paladin Vindicte',
  'assassination-rogue': 'Voleur Assassinat',
  'combat-rogue': 'Voleur Combat',
  'subtlety-rogue': 'Voleur Finesse',
  'enhancement-shaman': 'Chaman Amélioration',
  'feral-dps-druid': 'Druide Combat farouche (félin)',
  'beast-mastery-hunter': 'Chasseur Maîtrise des bêtes',
  'marksmanship-hunter': 'Chasseur Précision',
  'survival-hunter': 'Chasseur Survie',
  'arcane-mage': 'Mage Arcanes',
  'fire-mage': 'Mage Feu',
  'frost-mage': 'Mage Givre',
  'affliction-warlock': 'Démoniste Affliction',
  'demonology-warlock': 'Démoniste Démonologie',
  'destruction-warlock': 'Démoniste Destruction',
  'shadow-priest': 'Prêtre Ombre',
  'elemental-shaman': 'Chaman Élémentaire',
  'balance-druid': 'Druide Équilibre'
};

// Item slot (or, failing that, the list slot) → Emplacement.
var BIS_IMPORT_SLOTS = {
  'head': 'Tête', 'neck': 'Cou', 'shoulder': 'Épaules', 'back': 'Dos', 'chest': 'Torse', 'wrist': 'Poignets',
  'hands': 'Mains', 'waist': 'Taille', 'legs': 'Jambes', 'feet': 'Pieds', 'finger': 'Doigt', 'trinket': 'Bijou',
  'two-hand': 'Arme', 'main hand': 'Arme', 'main-hand': 'Arme', 'one-hand': 'Arme',
  'off hand': 'Main gauche', 'off-hand': 'Main gauche', 'held in off-hand': 'Main gauche',
  'ranged': 'Distance', 'thrown': 'Distance', 'relic': 'Relique'
};

function importForeverBis() {
  var ui = SpreadsheetApp.getUi();
  try {
    ui.alert(importForeverBis_());
  } catch (error) {
    ui.alert('Import des BiS impossible :\n' + error.message);
  }
}

function importForeverBis_() {
  var lists = fetchForeverBisLists_();
  var summary = '';
  applyBatch_(function () {
    var built = buildBisImportRequests_(SpreadsheetApp.getActive(), lists);
    summary = built.summary;
    return built.requests;
  });
  return summary;
}

// { items: { id: { name, slot } }, specs: { label: [id, ...] } } read from every spec page.
function fetchForeverBisLists_() {
  var items = Object.create(null);
  var specs = Object.create(null);
  Object.keys(BIS_IMPORT_SPECS).forEach(function (slug) {
    var response = UrlFetchApp.fetch(BIS_IMPORT_URL.replace('{slug}', slug), { muteHttpExceptions: true });
    if (response.getResponseCode() !== 200) {
      throw new Error('wowtbc.gg ne répond pas pour ' + slug + ' (HTTP ' + response.getResponseCode() + ').');
    }
    var context;
    try {
      context = JSON.parse(response.getContentText()).result.pageContext;
    } catch (error) {
      context = null;
    }
    var caps = context && context.bisList && context.bisList.caps && context.bisList.caps[BIS_IMPORT_LEVEL];
    if (!caps || !Array.isArray(context.gearData)) {
      throw new Error('la page wowtbc.gg ' + slug + ' a changé de format, rien n\'a été importé.');
    }
    var gear = Object.create(null);
    context.gearData.forEach(function (entry) { gear[entry.id] = entry; });
    var ids = [];
    Object.keys(caps).forEach(function (listSlot) {
      (Array.isArray(caps[listSlot]) ? caps[listSlot] : []).slice(0, BIS_IMPORT_PER_SLOT).forEach(function (id) {
        var info = gear[id] || {};
        var slot = BIS_IMPORT_SLOTS[info.slot] || BIS_IMPORT_SLOTS[listSlot];
        if (typeof id !== 'number' || !slot) {
          return;
        }
        if (!items[id]) {
          items[id] = { name: normalizeCellString_(info.name).trim(), slot: slot };
        }
        if (ids.indexOf(id) === -1) {
          ids.push(id);
        }
      });
    });
    specs[BIS_IMPORT_SPECS[slug]] = ids;
  });
  return { items: items, specs: specs };
}

// Per Objets tab: new rows below the last item (sorted by slot), and BIS in the empty Statut cells of listed items.
function buildBisImportRequests_(spreadsheet, lists) {
  var requests = [];
  var addedTotal = 0;
  var filledTotal = 0;
  var lines = [];

  ITEM_TABS.forEach(function (itemTab) {
    var sheet = snapshotSheet_(spreadsheet, itemTab.name);
    var sheetId = sheet.getSheetId();
    var rows = sheet.getDataRange().getValues();
    var specs = SPEC_COLUMNS.filter(function (spec) { return spec.role === itemTab.role; });
    var rowIndexById = Object.create(null);
    var last = 2;
    for (var rowIndex = 3; rowIndex < rows.length; rowIndex += 1) {
      var id = parseInteger_((rows[rowIndex] || [])[0]);
      if (id !== null) {
        if (rowIndexById[id] === undefined) {
          rowIndexById[id] = rowIndex;
        }
        last = rowIndex;
      }
    }

    var listedBy = Object.create(null);
    var newIds = [];
    specs.forEach(function (spec, specIndex) {
      (lists.specs[spec.label] || []).forEach(function (id) {
        if (!listedBy[id]) {
          listedBy[id] = [];
          if (rowIndexById[id] === undefined) {
            newIds.push(id);
          }
        }
        listedBy[id].push(specIndex);
      });
    });

    var filled = 0;
    Object.keys(rowIndexById).forEach(function (id) {
      (listedBy[id] || []).forEach(function (specIndex) {
        var row = rowIndexById[id];
        var column = OBJETS_FIRST_SPEC_COLUMN + specIndex * 2;
        if (normalizeCellString_((rows[row] || [])[column]).trim()) {
          return;
        }
        requests.push({
          updateCells: {
            start: { sheetId: sheetId, rowIndex: row, columnIndex: column },
            rows: [{ values: [{ userEnteredValue: { stringValue: 'BIS' } }] }],
            fields: 'userEnteredValue'
          }
        });
        filled += 1;
      });
    });

    var listOrder = newIds.slice();
    newIds.sort(function (left, right) {
      return ITEM_SLOTS.indexOf(lists.items[left].slot) - ITEM_SLOTS.indexOf(lists.items[right].slot) || listOrder.indexOf(left) - listOrder.indexOf(right);
    });
    if (newIds.length) {
      requests.push({
        updateCells: {
          start: { sheetId: sheetId, rowIndex: last + 1, columnIndex: 0 },
          rows: newIds.map(function (id) {
            var values = [
              { userEnteredValue: { numberValue: Number(id) } },
              { userEnteredValue: { stringValue: lists.items[id].name } },
              { userEnteredValue: { stringValue: lists.items[id].slot } }
            ];
            specs.forEach(function (spec, specIndex) {
              values.push(listedBy[id].indexOf(specIndex) !== -1 ? { userEnteredValue: { stringValue: 'BIS' } } : {});
              values.push({});
            });
            return { values: values };
          }),
          fields: 'userEnteredValue'
        }
      });
    }

    addedTotal += newIds.length;
    filledTotal += filled;
    lines.push(itemTab.name + ' : ' + newIds.length + ' objet(s) ajouté(s)' + (filled ? ', ' + filled + ' statut(s) BIS ajouté(s)' : '') + '.');
  });

  return {
    requests: requests,
    summary: 'BiS pré-raid wowtbc.gg (niveau ' + BIS_IMPORT_LEVEL + ') importés : ' + addedTotal + ' objet(s) ajouté(s), ' +
      filledTotal + ' statut(s) BIS ajouté(s) sur des objets déjà listés.\n' + lines.join('\n') +
      '\nLes statuts déjà remplis n\'ont pas été modifiés.'
  };
}
