// Character rankings for Fresh realms live on the Fresh API host; the token from WCL_TOKEN_URL works there too.
var WCL_CHARACTER_API_URL = 'https://fresh.warcraftlogs.com/api/v2/client';
var WCL_PARSE_BATCH_SIZE = 25;

// Menu action: fills Parse WCL moyen for Roster and Rerolls with (best + median performance average) / 2.
function updateWclParses() {
  var ui = SpreadsheetApp.getUi();

  try {
    var summary = '';
    applyBatch_(function () {
      var spreadsheet = SpreadsheetApp.getActive();
      var configRow = requireCurrentLayout_(snapshotSheet_(spreadsheet, 'Config').getDataRange().getValues(), 'Config')[1] || [];
      var configTab = tabByName_('Config');
      if (normalizeCellString_(configRow[columnOf_(configTab, 'openRaidId')]).trim()) {
        throw new Error('Un raid est démarré : le parse compte dans les scores, mettez-le à jour après la fin du raid.');
      }
      var realm = parseWclRealm_(configRow[columnOf_(configTab, 'wclRealm')]);
      var targets = [];
      ['Roster', 'Rerolls'].forEach(function (tabName) {
        var sheet = snapshotSheet_(spreadsheet, tabName);
        targets = targets.concat(parseTargets_(sheet, requireCurrentLayout_(sheet.getDataRange().getValues(), tabName), tabByName_(tabName)));
      });
      if (!targets.length) {
        throw new Error('Aucun personnage dans Roster ou Rerolls.');
      }

      var token = getWclAccessToken_(requireWclCredentials_());
      var results = [];
      for (var start = 0; start < targets.length; start += WCL_PARSE_BATCH_SIZE) {
        results = results.concat(fetchCharacterParses_(token, realm, targets.slice(start, start + WCL_PARSE_BATCH_SIZE)));
      }

      var built = buildParseUpdateRequests_(targets, results);
      summary = built.summary;
      return built.requests;
    });
    ui.alert(summary);
  } catch (error) {
    ui.alert('Update WCL parses failed:\n' + error.message);
  }
}

// "eu/thunderstrike" → { region: 'eu', slug: 'thunderstrike' }.
function parseWclRealm_(value) {
  var parts = normalizeCellString_(value).trim().toLowerCase().split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error('Config : Serveur WCL attendu au format région/serveur, ex. eu/thunderstrike.');
  }
  return { region: parts[0].trim(), slug: parts[1].trim().replace(/\s+/g, '-') };
}

// One target per named row: where to write and which metric to read (healers HPS, others DPS).
function parseTargets_(sheet, rows, tab) {
  var nameColumn = columnOf_(tab, tab.name === 'Roster' ? 'raiderKey' : 'rerollName');
  var roleColumn = columnOf_(tab, 'role');
  var targets = [];
  for (var rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    var name = normalizeCellString_((rows[rowIndex] || [])[nameColumn]).trim();
    if (name) {
      targets.push({
        name: name,
        metric: snapshotRole_(normalizeCellString_(rows[rowIndex][roleColumn]).trim()) === 'HEALER' ? 'hps' : 'dps',
        sheetId: sheet.getSheetId(),
        rowIndex: rowIndex,
        columnIndex: columnOf_(tab, 'dpsParse')
      });
    }
  }
  return targets;
}

// One GraphQL request for a batch of characters (aliased c0, c1, ...); returns zoneRankings or null per target.
function fetchCharacterParses_(token, realm, targets) {
  var fields = targets.map(function (target, index) {
    return 'c' + index + ': character(name: ' + JSON.stringify(target.name) + ', serverSlug: ' + JSON.stringify(realm.slug) +
      ', serverRegion: ' + JSON.stringify(realm.region) + ') { zoneRankings(metric: ' + target.metric + ') }';
  });
  var response = UrlFetchApp.fetch(WCL_CHARACTER_API_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({ query: '{ characterData { ' + fields.join(' ') + ' } }' }),
    muteHttpExceptions: true
  });

  var statusCode = response.getResponseCode();
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error('Warcraft Logs character error (HTTP ' + statusCode + ').');
  }
  var payload = safeJsonParse_(response.getContentText());
  var characters = (payload.data && payload.data.characterData) || null;
  if (!characters) {
    var errors = Array.isArray(payload.errors) ? payload.errors : [];
    throw new Error('Warcraft Logs character error: ' + normalizeCellString_(errors[0] && errors[0].message) + '.');
  }
  return targets.map(function (target, index) {
    var character = characters['c' + index];
    return character ? character.zoneRankings : null;
  });
}

// Writes rounded (best + median) / 2 where both averages exist; others keep their value and are listed.
function buildParseUpdateRequests_(targets, results) {
  var requests = [];
  var skipped = [];
  targets.forEach(function (target, index) {
    var rankings = results[index] || {};
    var best = rankings.bestPerformanceAverage;
    var median = rankings.medianPerformanceAverage;
    if (typeof best !== 'number' || typeof median !== 'number' || !isFinite(best) || !isFinite(median)) {
      skipped.push(target.name);
      return;
    }
    var value = Math.min(100, Math.max(1, Math.round(((best + median) / 2) * 10) / 10));
    requests.push({
      updateCells: {
        start: { sheetId: target.sheetId, rowIndex: target.rowIndex, columnIndex: target.columnIndex },
        rows: [{ values: [{ userEnteredValue: { numberValue: value } }] }],
        fields: 'userEnteredValue'
      }
    });
  });

  return {
    requests: requests,
    summary: 'Parses mis à jour : ' + requests.length + '.' +
      (skipped.length ? '\nSans classement WCL (inchangés) : ' + skipped.join(', ') + '.' : '')
  };
}
