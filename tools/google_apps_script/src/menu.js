// Simple trigger: builds the owner menu each time the workbook opens.
function onOpen() {
  var ui = SpreadsheetApp.getUi();

  ui
    .createMenu('Loot priority')
    .addItem('Set up / refresh workbook', 'setUpWorkbook')
    .addItem('Start raid (export snapshot)', 'exportRaidSnapshot')
    .addItem('Cancel started raid', 'cancelOpenRaid')
    .addItem('End raid', 'endRaid')
    .addItem('Delete raid', 'deleteRaid')
    .addItem('Set WCL credentials', 'setWclCredentials')
    .addItem('Archive tier and activate next', 'archiveTierAndActivateNext')
    .addToUi();
}
