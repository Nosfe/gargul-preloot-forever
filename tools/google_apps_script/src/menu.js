// Simple trigger: builds the owner menu each time the workbook opens; raid actions match the raid state.
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  var raidMenu = ui.createMenu('Raid');

  if (isRaidStarted_()) {
    raidMenu
      .addItem('Export snapshot again', 'exportRaidSnapshot')
      .addItem('End', 'endRaid')
      .addItem('Cancel', 'cancelOpenRaid');
  } else {
    raidMenu.addItem('Start (export snapshot)', 'exportRaidSnapshot');
  }
  raidMenu.addItem('Delete', 'deleteRaid');

  ui
    .createMenu('Loot priority')
    .addSubMenu(raidMenu)
    .addSubMenu(
      ui.createMenu('Setup')
        .addItem('Refresh workbook', 'setUpWorkbook')
        .addItem('WCL credentials', 'setWclCredentials')
        .addItem('Archive tier and activate next', 'archiveTierAndActivateNext')
    )
    .addToUi();
}

// True when Config's Raid ouvert holds an ID; any read problem counts as no started raid.
function isRaidStarted_() {
  try {
    var sheet = SpreadsheetApp.getActive().getSheetByName('Config');
    var row = sheet ? (sheet.getDataRange().getValues()[1] || []) : [];
    return normalizeCellString_(row[columnOf_(tabByName_('Config'), 'openRaidId')]).trim() !== '';
  } catch (error) {
    return false;
  }
}

// Rebuilds the menu after a raid action changed the raid state.
function refreshMenu_() {
  try {
    onOpen();
  } catch (error) {
    // The data change already succeeded; a stale menu only lasts until the next reload.
  }
}
