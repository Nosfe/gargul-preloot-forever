// Header contract for every data tab, in creation order. Later stories may only append headers.
// sheetId is used only when setup creates the tab; code finds tabs by name.
var TABS = [
  // Single value row (row 2) for the active tier and BiS window.
  { name: 'Config', sheetId: 1001, headers: ['tierId', 'bisWindowId'] },
  {
    name: 'Roster',
    sheetId: 1002,
    headers: ['raiderKey', 'class', 'spec', 'role', 'tankPriority', 'dpsParse', 'gainFraction']
  },
  { name: 'Rerolls', sheetId: 1003, headers: ['rerollName', 'mainKey'] },
  {
    name: 'Raids',
    sheetId: 1004,
    headers: ['raidId', 'tierId', 'bisWindowId', 'instance', 'raidDate', 'status']
  },
  // Maps a WCL report to the raid it credits; a known reportCode makes a re-import a no-op.
  { name: 'RaidReports', sheetId: 1005, headers: ['reportCode', 'raidId', 'importedAt'] },
  { name: 'Attendance', sheetId: 1006, headers: ['raidId', 'raiderKey'] },
  { name: 'Bench', sheetId: 1007, headers: ['raidId', 'raiderKey'] },
  {
    // tierId and bisWindowId are copied from the raid so loot-count formulas need no join.
    name: 'Awards',
    sheetId: 1008,
    headers: [
      'checksum',
      'raidId',
      'tierId',
      'bisWindowId',
      'raiderKey',
      'itemID',
      'rollType',
      'os',
      'date',
      'time',
      'treatment'
    ]
  },
  {
    name: 'TierItems',
    sheetId: 1009,
    headers: ['tierId', 'itemID', 'itemName', 'slot', 'class', 'spec', 'status', 'simGainFraction']
  },
  // Items whose awards are always treated as NONE.
  { name: 'PatternItems', sheetId: 1010, headers: ['itemID', 'itemName'] }
];

// Contract entry for a tab name, or null.
function tabByName_(name) {
  for (var i = 0; i < TABS.length; i += 1) {
    if (TABS[i].name === name) {
      return TABS[i];
    }
  }
  return null;
}

// 0-based column index of a header; throws on a typo so a wrong column is never read.
function columnOf_(tab, header) {
  if (!tab || !Array.isArray(tab.headers)) {
    throw new Error('columnOf_ requires a tab definition with headers.');
  }

  var index = tab.headers.indexOf(header);
  if (index === -1) {
    throw new Error('Unknown header "' + header + '" in tab "' + tab.name + '".');
  }

  return index;
}
