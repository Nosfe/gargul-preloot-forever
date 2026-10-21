// Simple trigger: builds the owner menu each time the workbook opens.
function onOpen() {
  var ui = SpreadsheetApp.getUi();

  ui
    .createMenu('Loot priority')
    .addItem('Set up / refresh workbook', 'setUpWorkbook')
    .addItem('Sync attendance', 'runAttendanceSync')
    .addItem('Export raid snapshot', 'exportRaidSnapshot')
    .addItem('Import raid ledger', 'importRaidLedger')
    .addItem('Archive tier and activate next', 'archiveTierAndActivateNext')
    .addToUi();
}
