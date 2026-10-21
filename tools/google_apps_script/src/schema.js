var TABS = [
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
  { name: 'RaidReports', sheetId: 1005, headers: ['reportCode', 'raidId', 'importedAt'] },
  { name: 'Attendance', sheetId: 1006, headers: ['raidId', 'raiderKey'] },
  { name: 'Bench', sheetId: 1007, headers: ['raidId', 'raiderKey'] },
  {
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
  { name: 'PatternItems', sheetId: 1010, headers: ['itemID', 'itemName'] }
];

function tabByName_(name) {
  for (var i = 0; i < TABS.length; i += 1) {
    if (TABS[i].name === name) {
      return TABS[i];
    }
  }
  return null;
}

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
