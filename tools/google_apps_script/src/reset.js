// Only the salted SHA-256 of the reset password is stored, never the password itself.
var RESET_PASSWORD_SALT = 'preloot-reset:';
var RESET_PASSWORD_SHA256 = '51bafccafa2874216f83111802ee849817217ec533f8b9329647ff2c81ca8ce2';

// Menu action: password dialog for the full workbook reset.
function openResetWorkbookDialog() {
  var html = HtmlService.createHtmlOutput(
    '<div style="font-family:Verdana,Arial,sans-serif;padding:12px">' +
      '<p style="margin:0 0 8px 0"><strong>Tout sera effacé</strong> : tous les onglets, le Roster, la présence, les loots, les archives et la configuration. Les onglets sont recréés vides.</p>' +
      '<label style="display:block;margin:0 0 6px 0">Mot de passe</label>' +
      '<input id="password" type="password" style="width:100%;box-sizing:border-box;margin:0 0 10px 0" />' +
      '<div style="display:flex;gap:8px;align-items:center">' +
        '<button id="go" onclick="confirmReset()">Tout effacer</button>' +
        '<button onclick="google.script.host.close()">Annuler</button>' +
        '<span id="status"></span>' +
      '</div>' +
      '<script>' +
        'function confirmReset(){' +
          'if(!window.confirm("Effacer d\\u00e9finitivement tout le classeur ?")){return;}' +
          'document.getElementById("go").disabled=true;' +
          'document.getElementById("status").textContent="R\\u00e9initialisation...";' +
          'google.script.run' +
            '.withSuccessHandler(function(message){alert(message);google.script.host.close();})' +
            '.withFailureHandler(function(error){document.getElementById("go").disabled=false;document.getElementById("status").textContent="";alert("R\\u00e9initialisation impossible :\\n"+error.message);})' +
            '.submitResetWorkbook(document.getElementById("password").value);' +
        '}' +
      '</script>' +
    '</div>'
  ).setWidth(480).setHeight(220);

  SpreadsheetApp.getUi().showModalDialog(html, 'Réinitialiser le classeur');
}

// Deletes every tab, then rebuilds the empty layout. WCL credentials (user properties) are kept.
function submitResetWorkbook(password) {
  if (!resetPasswordMatches_(password)) {
    throw new Error('mot de passe incorrect, rien n\'a été effacé.');
  }

  withDocumentLock_(function () {
    var spreadsheet = SpreadsheetApp.getActive();
    var spreadsheetId = spreadsheet.getId();
    // A spreadsheet needs at least one tab: a blank one stands in until the layout is rebuilt.
    // Done through SpreadsheetApp: after a Sheets API delete it still sees the old tabs ("Feuille 1001 introuvable").
    var blank = spreadsheet.insertSheet('_reinitialisation_' + new Date().getTime());
    var blankSheetId = blank.getSheetId();
    spreadsheet.getSheets().forEach(function (sheet) {
      if (sheet.getSheetId() !== blankSheetId) {
        spreadsheet.deleteSheet(sheet);
      }
    });
    SpreadsheetApp.flush();
    var properties = PropertiesService.getDocumentProperties();
    properties.deleteProperty(TEST_DATA_PROPERTY);
    properties.deleteProperty(WCL_PARSE_DETAILS_PROPERTY);

    var sheetsMetadata = Sheets.Spreadsheets.get(spreadsheetId, {
      fields: 'sheets(properties.sheetId,conditionalFormats,bandedRanges.bandedRangeId,protectedRanges(protectedRangeId,description))'
    });
    var requests = buildSetupPlan_(readExistingHeadersByName_(), sheetsMetadata, formulaArgSeparator_()).requests;
    requests.push({ deleteSheet: { sheetId: blankSheetId } });
    Sheets.Spreadsheets.batchUpdate({ requests: requests }, spreadsheetId);
  });

  return 'Classeur réinitialisé : tous les onglets ont été recréés vides.';
}

function resetPasswordMatches_(password) {
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    RESET_PASSWORD_SALT + normalizeCellString_(password),
    Utilities.Charset.UTF_8
  );
  var hex = digest.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
  return hex === RESET_PASSWORD_SHA256;
}
