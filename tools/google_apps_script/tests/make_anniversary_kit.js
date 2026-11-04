// Writes paste-ready TSV test data for a TBC Anniversary trial of the workbook + companion.
// Run from tools/google_apps_script: node tests/make_anniversary_kit.js
// Same raiders and item IDs as tests/addon/make_test_snapshot.lua; specs and roles come from src/schema.js.
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var context = {};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'schema.js'), 'utf8'), context);
var SPEC_COLUMNS = vm.runInContext('SPEC_COLUMNS', context);
var ITEM_TABS = vm.runInContext('ITEM_TABS', context);

var NAMES = [
  'Pepitasse', 'Scodruid', 'Inmyzoo', 'Izù', 'Krungski', 'Jüice', 'Stooner', 'Priayks', 'Noxcius', 'Pørtoss',
  'Holychrìs', 'Samblà', 'Carpëdiem', 'Meuhmeuh', 'Göblar', 'Ouestlgoret', 'Aznorsh', 'Krãkotte', 'Olafe', 'Zykö',
  'Willhona', 'Sokachaman', 'Yajiru', 'Pøchità', 'Ambroisy', 'Mitiati', 'Narvalo', 'Mïtchelline'
];

var ITEM_IDS = [
  19019, 17182, 18814, 19137, 17076, 18832, 17063, 19364, 19363, 19360, 19356, 19405, 19406, 19431, 19379,
  21126, 23054, 22798, 23577, 22691,
  28830, 28789, 28770, 28772, 28773, 28749, 28802, 28774, 28767, 28794, 28800, 28823, 29458, 28782, 28781,
  28657, 28658, 29348, 30627, 32483, 29996, 30311, 30312, 30090, 32500, 32471
];

var STATUTS = ['IMPACT', 'IMPACT', 'BIS', 'CLASS_BOUND', 'ALT', ''];

var outDir = path.join(__dirname, 'anniversary-kit');
fs.mkdirSync(outDir, { recursive: true });

function write(name, rows) {
  fs.writeFileSync(path.join(outDir, name), rows.map(function (row) { return row.join('\t'); }).join('\r\n') + '\r\n', 'utf8');
}

// Roster A:D (Rôle in E is a formula, so the parse goes in its own paste at F2).
write('roster-A2.tsv', NAMES.map(function (name, index) {
  var spec = SPEC_COLUMNS[index % SPEC_COLUMNS.length];
  return [name, 'Raid 1', spec.className, spec.spec];
}));
write('roster-parse-F2.tsv', NAMES.map(function (name, index) {
  return [String(35 + ((index + 1) * 13) % 65)];
}));

// Objets tabs from A4: ID, Objet, Emplacement, then Statut | Gain (DPS) per spec of the tab.
ITEM_TABS.forEach(function (tab) {
  var specs = SPEC_COLUMNS.filter(function (spec) { return spec.role === tab.role; });
  write('objets-' + tab.role.toLowerCase().replace(/ /g, '-') + '-A4.tsv', ITEM_IDS.map(function (itemID, itemIndex) {
    var row = [String(itemID), '', ''];
    specs.forEach(function (spec, specIndex) {
      var statut = STATUTS[(itemIndex + specIndex) % STATUTS.length];
      row.push(statut, statut === 'IMPACT' ? String(5 + (itemIndex * 7 + specIndex * 3) % 30) : '');
    });
    return row;
  }));
});

console.log('OK: ' + NAMES.length + ' raiders, ' + ITEM_IDS.length + ' items x ' + ITEM_TABS.length + ' Objets tabs -> ' + outDir);
