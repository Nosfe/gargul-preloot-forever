// Simple trigger: builds the owner menu each time the workbook opens.
function onOpen() {
  var ui = SpreadsheetApp.getUi();

  ui
    .createMenu('Preloot')
    .addSubMenu(
      ui.createMenu('Raid')
        .addItem('Démarrer (exporter le snapshot)', 'exportRaidSnapshot')
        .addItem('Terminer', 'endRaid')
        .addItem('Annuler', 'cancelOpenRaid')
        .addItem('Supprimer', 'deleteRaid')
    )
    .addSubMenu(
      ui.createMenu('Configuration')
        .addItem('Rafraîchir le classeur', 'setUpWorkbook')
        .addItem('Identifiants WCL', 'setWclCredentials')
        .addItem('Mettre à jour les parses WCL', 'updateWclParses')
        .addItem('Afficher le format d\'export Gargul', 'showGargulExportFormat')
        .addItem('Nouveau palier', 'openNewTierDialog')
    )
    .addToUi();
}
