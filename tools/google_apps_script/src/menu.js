// Simple trigger: builds the owner menu each time the workbook opens.
function onOpen() {
  var ui = SpreadsheetApp.getUi();

  ui
    .createMenu('Loot priority')
    .addSubMenu(
      ui.createMenu('Raid')
        .addItem('Start (export snapshot)', 'exportRaidSnapshot')
        .addItem('End', 'endRaid')
        .addItem('Cancel', 'cancelOpenRaid')
        .addItem('Delete', 'deleteRaid')
    )
    .addSubMenu(
      ui.createMenu('Setup')
        .addItem('Refresh workbook', 'setUpWorkbook')
        .addItem('WCL credentials', 'setWclCredentials')
        .addItem('Update WCL parses', 'updateWclParses')
        .addItem('Show Gargul export format', 'showGargulExportFormat')
        .addItem('Archive tier and activate next', 'archiveTierAndActivateNext')
    )
    .addToUi();
}
