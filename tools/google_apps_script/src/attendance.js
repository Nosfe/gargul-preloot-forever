var WCL_TOKEN_URL = 'https://www.warcraftlogs.com/oauth/token';
var WCL_API_URL = 'https://www.warcraftlogs.com/api/v2/client';
var WCL_CLIENT_ID_KEY = 'WCL_CLIENT_ID';
var WCL_CLIENT_SECRET_KEY = 'WCL_CLIENT_SECRET';

// Opens the End raid dialog for the currently started raid.
function endRaid() {
  var ui = SpreadsheetApp.getUi();

  try {
    var configRows = requireCurrentLayout_(snapshotSheet_(SpreadsheetApp.getActive(), 'Config').getDataRange().getValues(), 'Config');
    var openRaidId = normalizeCellString_(((configRows[1] || [])[columnOf_(tabByName_('Config'), 'openRaidId')])).trim();
    if (!openRaidId) {
      ui.alert('Start raid first.');
      return;
    }

    showEndRaidDialog_(openRaidId);
  } catch (error) {
    ui.alert('End raid failed:\n' + error.message);
  }
}

// Opens the modal dialog used to save owner-scoped WCL credentials.
function setWclCredentials() {
  var html = HtmlService.createHtmlOutput(
    '<div style="font-family:Verdana,Arial,sans-serif;padding:12px">' +
      '<p style="margin:0 0 10px 0"><strong>Set WCL credentials</strong></p>' +
      '<label style="display:block;margin:0 0 6px 0">Client ID</label>' +
      '<input id="wcl-client-id" style="width:100%;box-sizing:border-box;margin:0 0 10px 0" />' +
      '<label style="display:block;margin:0 0 6px 0">Client secret</label>' +
      '<input id="wcl-client-secret" type="password" style="width:100%;box-sizing:border-box;margin:0 0 10px 0" />' +
      '<div style="display:flex;gap:8px;align-items:center">' +
        '<button onclick="save()">Save</button>' +
        '<span id="status" style="color:#1E7D32"></span>' +
      '</div>' +
      '<script>' +
        'function save(){' +
          'var clientId=document.getElementById("wcl-client-id").value;' +
          'var clientSecret=document.getElementById("wcl-client-secret").value;' +
          'var status=document.getElementById("status");' +
          'status.textContent="Saving...";' +
          'google.script.run.withSuccessHandler(function(message){status.textContent=message;google.script.host.close();})' +
          '.withFailureHandler(function(error){status.textContent="";alert(error&&error.message?error.message:error);})' +
          '.saveWclCredentials(clientId,clientSecret);' +
        '}' +
      '</script>' +
    '</div>'
  ).setWidth(460).setHeight(260);

  SpreadsheetApp.getUi().showModalDialog(html, 'Set WCL credentials');
}

// Stores WCL credentials in owner User Properties.
function saveWclCredentials(clientId, clientSecret) {
  var normalizedClientId = normalizeCellString_(clientId).trim();
  var normalizedClientSecret = normalizeCellString_(clientSecret).trim();
  if (!normalizedClientId || !normalizedClientSecret) {
    throw new Error('Both client ID and client secret are required.');
  }

  PropertiesService.getUserProperties().setProperties({
    WCL_CLIENT_ID: normalizedClientId,
    WCL_CLIENT_SECRET: normalizedClientSecret
  });
  return 'Credentials saved.';
}

// Parses and validates Gargul text for End raid preview.
function previewEndRaidLoot(gargulText) {
  var spreadsheet = SpreadsheetApp.getActive();
  var rosterIndex = requireRosterIndex_();
  var awardsRows = snapshotSheet_(spreadsheet, GRID_TABS.awards.name).getDataRange().getValues();
  var blockNames = readAwardsBlockNames_(awardsRows);
  var parsed = parseGargulExport_(gargulText);
  var validated = validateAwards_(parsed.lines, rosterIndex, blockNames);
  var itemStates = ITEM_TABS.map(function (itemTab) {
    return {
      role: itemTab.role,
      rows: snapshotSheet_(spreadsheet, itemTab.name).getDataRange().getValues()
    };
  });
  var namesById = itemNamesById_(itemStates);

  return {
    awards: validated.lines.map(function (award) {
      return {
        lineNumber: award.lineNumber,
        checksum: award.checksum,
        date: award.date,
        time: award.time,
        winner: award.winner,
        itemID: award.itemID,
        itemName: Object.prototype.hasOwnProperty.call(namesById, String(award.itemID)) ? namesById[String(award.itemID)] : award.itemName,
        os: Number(award.os) === 1 ? 1 : 0,
        treatment: Number(award.os) === 1 ? 'NONE' : award.treatment
      };
    }),
    rejected: parsed.rejected.concat(validated.rejected)
  };
}

// Validates input, fetches WCL data and ends the started raid in one batch.
function submitEndRaid(linkText, gargulText, treatments) {
  var outcome = null;

  applyBatch_(function () {
    var spreadsheet = SpreadsheetApp.getActive();
    var configSheet = snapshotSheet_(spreadsheet, 'Config');
    var raidsSheet = snapshotSheet_(spreadsheet, 'Raids');
    var presenceSheet = snapshotSheet_(spreadsheet, GRID_TABS.presence.name);
    var awardsSheet = snapshotSheet_(spreadsheet, GRID_TABS.awards.name);
    var configRows = requireCurrentLayout_(configSheet.getDataRange().getValues(), 'Config');
    var raidsRows = requireCurrentLayout_(raidsSheet.getDataRange().getValues(), 'Raids');
    var presenceRows = presenceSheet.getDataRange().getValues();
    var awardsRows = awardsSheet.getDataRange().getValues();
    var openRaidId = normalizeCellString_(((configRows[1] || [])[columnOf_(tabByName_('Config'), 'openRaidId')])).trim();

    if (!openRaidId) {
      throw new Error('Start raid first.');
    }

    var rosterIndex = requireRosterIndex_();
    var parsedAwards = parseGargulExport_(gargulText);
    var validatedAwards = validateAwards_(parsedAwards.lines, rosterIndex, readAwardsBlockNames_(awardsRows));
    var rejections = parsedAwards.rejected.concat(validatedAwards.rejected);
    var itemStates = ITEM_TABS.map(function (itemTab) {
      return {
        role: itemTab.role,
        rows: snapshotSheet_(spreadsheet, itemTab.name).getDataRange().getValues()
      };
    });
    var itemNames = itemNamesById_(itemStates);
    var selectedTreatments = (treatments && typeof treatments === 'object') ? treatments : null;
    var importedAwards = validatedAwards.lines.map(function (award) {
      // After a preview the dropdown is authoritative, even when cleared; without one the line's own value is used.
      var chosen = selectedTreatments && Object.prototype.hasOwnProperty.call(selectedTreatments, award.checksum)
        ? normalizeCellString_(selectedTreatments[award.checksum]).trim()
        : award.treatment;
      var treatment = Number(award.os) === 1 ? 'NONE' : (isKnownTreatment_(chosen) ? chosen : '');
      if (!treatment) {
        throw new Error('Choose a Traitement for every award before ending the raid.');
      }
      return {
        lineNumber: award.lineNumber,
        checksum: award.checksum,
        winner: award.winner,
        itemID: award.itemID,
        itemName: Object.prototype.hasOwnProperty.call(itemNames, String(award.itemID)) ? itemNames[String(award.itemID)] : award.itemName,
        treatment: treatment
      };
    });

    var reportCode = extractReportCode_(linkText);
    var report = fetchWarcraftLogsReport_(reportCode, requireWclCredentials_());
    var raidPulls = buildRaidPulls_(report);
    var credits = creditedRaiders_(raidPulls, rosterIndex);
    var timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    var sheetsMetadata = Sheets.Spreadsheets.get(spreadsheet.getId(), {
      fields: 'sheets(properties(sheetId,title),protectedRanges(protectedRangeId,description))'
    });
    var dateSerial = existingPresenceDateSerial_(presenceRows, openRaidId);
    if (dateSerial === null) {
      dateSerial = dateSerialFromReportStart_(raidPulls.startTimeMs);
    }

    outcome = buildEndRaidRequests_({
      configSheet: configSheet,
      configRows: configRows,
      raidsSheet: raidsSheet,
      raidsRows: raidsRows,
      presenceSheet: presenceSheet,
      presenceRows: presenceRows,
      openRaidId: openRaidId,
      reportCode: reportCode,
      raidPulls: raidPulls,
      credits: credits,
      importedAt: timestamp,
      sheetsMetadata: sheetsMetadata
    });

    if (importedAwards.length) {
      outcome.requests = outcome.requests.concat(
        buildAwardRequests_(awardsSheet.getSheetId(), awardsRows, importedAwards, openRaidId, dateSerial)
      );
    }

    outcome.message = outcome.message + '\nLoot awards imported: ' + importedAwards.length + '.';
    if (rejections.length) {
      outcome.message += '\nRejected loot lines:\n' + summarizeRejectedLootLines_(rejections);
    }

    return outcome.requests;
  });

  return outcome ? outcome.message : 'Raid ended.';
}

// Serial of the date already typed on the raid's Présence row, so awards keep the same date; null when empty.
function existingPresenceDateSerial_(presenceRows, raidId) {
  for (var index = PRESENCE_FIRST_RAID_ROW - 1; index < (presenceRows || []).length; index += 1) {
    var row = presenceRows[index] || [];
    if (normalizeCellString_(row[PRESENCE_RAID_ID_COLUMN]).trim() !== raidId) {
      continue;
    }
    var value = row[PRESENCE_DATE_COLUMN];
    if (typeof value === 'number' && isFinite(value)) {
      return value;
    }
    if (value instanceof Date) {
      var parts = Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd').split('-');
      return (Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])) - Date.UTC(1899, 11, 30)) / 86400000;
    }
    return null;
  }
  return null;
}

// One text line per rejected loot line for the End raid result.
function summarizeRejectedLootLines_(rejected) {
  return (rejected || []).map(function (line) {
    var parts = ['line ' + line.lineNumber];
    if (line.checksum) {
      parts.push('checksum ' + line.checksum);
    }
    if (line.date) {
      parts.push('date ' + line.date);
    }
    if (line.time) {
      parts.push('time ' + line.time);
    }
    if (line.winner) {
      parts.push('winner ' + line.winner);
    }
    parts.push('reason: ' + line.reason);
    return '- ' + parts.join(', ');
  }).join('\n');
}

// Extracts one WCL report code from one URL or one bare code; any second link or code is refused.
function extractReportCode_(linksText) {
  var text = normalizeCellString_(linksText).trim();
  if (!text) {
    throw new Error('WCL link required.');
  }

  var codes = [];
  var unrecognized = false;
  text.split(/\s+/).forEach(function (token) {
    var urlMatch = token.match(/\/reports\/([A-Za-z0-9]+)/i);
    var code = urlMatch ? urlMatch[1] : (/^[A-Za-z0-9]+$/.test(token) ? token : '');
    if (!code) {
      unrecognized = true;
    } else if (codes.indexOf(code) === -1) {
      codes.push(code);
    }
  });

  if (codes.length === 0 || unrecognized) {
    throw new Error('WCL link not recognized.');
  }
  if (codes.length > 1) {
    throw new Error('Only one WCL link is allowed.');
  }
  return codes[0];
}

// Builds counted pulls from one WCL report according to the attendance rules.
function buildRaidPulls_(report) {
  var actorsById = Object.create(null);
  ((((report || {}).masterData || {}).actors) || []).forEach(function (actor) {
    actorsById[String(actor.id)] = actor;
  });

  var allFights = (report && report.fights) || [];
  var completedBossPulls = allFights.filter(function (fight) {
    return Number(fight.encounterID) > 0 && fight.inProgress !== true;
  });
  var countedFights = completedBossPulls.length
    ? completedBossPulls
    : allFights.filter(function (fight) { return fight.inProgress !== true; });

  var pulls = countedFights.map(function (fight) {
    var byName = Object.create(null);
    (fight.friendlyPlayers || []).forEach(function (actorId) {
      var actor = actorsById[String(actorId)];
      if (!actor || !actor.name) {
        return;
      }
      byName[actor.name] = true;
    });
    return {
      id: Number(fight.id),
      names: Object.keys(byName)
    };
  });

  return {
    pulls: pulls,
    pullCount: pulls.length,
    zoneName: normalizeCellString_(((report || {}).zone || {}).name).trim(),
    startTimeMs: Number((report || {}).startTime || 0)
  };
}

// Resolves and credits raiders with a strictly-greater-than-25% attendance share.
function creditedRaiders_(raidPulls, rosterIndex) {
  var pullCount = Number((raidPulls || {}).pullCount || 0);
  var creditedCounts = Object.create(null);
  var unmatchedByName = Object.create(null);

  ((raidPulls || {}).pulls || []).forEach(function (pull) {
    var seenForPull = Object.create(null);
    (pull.names || []).forEach(function (name) {
      var resolved = resolveAttendanceKey_(rosterIndex, name);
      if (!resolved) {
        unmatchedByName[name] = true;
        return;
      }
      seenForPull[resolved] = true;
    });

    Object.keys(seenForPull).forEach(function (raiderKey) {
      creditedCounts[raiderKey] = Number(creditedCounts[raiderKey] || 0) + 1;
    });
  });

  var creditedKeys = Object.keys(creditedCounts).filter(function (raiderKey) {
    return pullCount > 0 && (creditedCounts[raiderKey] / pullCount) > 0.25;
  }).sort();

  return {
    pullCount: pullCount,
    creditedKeys: creditedKeys,
    unmatchedNames: Object.keys(unmatchedByName).sort()
  };
}

// Builds one atomic request list to apply credits, write metadata and close the raid.
function buildEndRaidRequests_(context) {
  var openRaidId = String(context.openRaidId);
  var raidsTab = tabByName_('Raids');
  var configTab = tabByName_('Config');
  var raidIdColumn = columnOf_(raidsTab, 'raidId');
  var raidInstanceColumn = columnOf_(raidsTab, 'instance');
  var raidDateColumn = columnOf_(raidsTab, 'raidDate');
  var reportCodesColumn = columnOf_(raidsTab, 'reportCodes');
  var importedAtColumn = columnOf_(raidsTab, 'importedAt');
  var openRaidColumn = columnOf_(configTab, 'openRaidId');
  var requests = [];
  var dateSerial = dateSerialFromReportStart_(context.raidPulls.startTimeMs);
  var raidZoneName = context.raidPulls.zoneName;

  var raidsRows = context.raidsRows || [];
  var raidRowIndex = -1;
  for (var index = 1; index < raidsRows.length; index += 1) {
    if (normalizeCellString_((raidsRows[index] || [])[raidIdColumn]).trim() === openRaidId) {
      raidRowIndex = index;
      break;
    }
  }
  if (raidRowIndex === -1) {
    raidRowIndex = raidsRows.length;
    requests.push({
      appendCells: {
        sheetId: context.raidsSheet.getSheetId(),
        rows: [{ values: [{ userEnteredValue: { numberValue: Number(openRaidId) } }] }],
        fields: 'userEnteredValue'
      }
    });
    raidsRows.push([Number(openRaidId)]);
  }

  var raidRow = raidsRows[raidRowIndex] || [];
  var existingCodes = normalizeCellString_(raidRow[reportCodesColumn]).trim();
  var codeList = existingCodes ? existingCodes.split(/\s+/) : [];
  if (codeList.indexOf(context.reportCode) === -1) {
    codeList.push(context.reportCode);
  }

  requests.push(buildStringCellRequest_(context.raidsSheet.getSheetId(), raidRowIndex, reportCodesColumn, codeList.join(' ')));
  requests.push(buildStringCellRequest_(context.raidsSheet.getSheetId(), raidRowIndex, importedAtColumn, context.importedAt));
  if (!normalizeCellString_(raidRow[raidInstanceColumn]).trim() && raidZoneName) {
    requests.push(buildStringCellRequest_(context.raidsSheet.getSheetId(), raidRowIndex, raidInstanceColumn, raidZoneName));
  }
  if (!normalizeCellString_(raidRow[raidDateColumn]).trim() && dateSerial !== null) {
    requests.push(buildDateCellRequest_(context.raidsSheet.getSheetId(), raidRowIndex, raidDateColumn, dateSerial));
  }

  var presenceRows = context.presenceRows || [];
  var presenceRowIndex = -1;
  for (index = PRESENCE_FIRST_RAID_ROW - 1; index < presenceRows.length; index += 1) {
    if (normalizeCellString_((presenceRows[index] || [])[PRESENCE_RAID_ID_COLUMN]).trim() === openRaidId) {
      presenceRowIndex = index;
      break;
    }
  }
  if (presenceRowIndex === -1) {
    presenceRowIndex = presenceRows.length;
    requests.push({
      appendCells: {
        sheetId: context.presenceSheet.getSheetId(),
        rows: [{ values: [{ userEnteredValue: { numberValue: Number(openRaidId) } }] }],
        fields: 'userEnteredValue'
      }
    });
    presenceRows.push([Number(openRaidId)]);
  }

  var presenceRow = presenceRows[presenceRowIndex] || [];
  if (!normalizeCellString_(presenceRow[1]).trim() && raidZoneName) {
    requests.push(buildStringCellRequest_(context.presenceSheet.getSheetId(), presenceRowIndex, 1, raidZoneName));
  }
  if (!normalizeCellString_(presenceRow[PRESENCE_DATE_COLUMN]).trim() && dateSerial !== null) {
    requests.push(buildDateCellRequest_(context.presenceSheet.getSheetId(), presenceRowIndex, PRESENCE_DATE_COLUMN, dateSerial));
  }

  var presenceHeader = presenceRows[0] || [];
  var presenceColumnByName = Object.create(null);
  for (index = PRESENCE_FIRST_RAIDER_COLUMN; index < presenceHeader.length; index += 1) {
    var headerName = normalizeCellString_(presenceHeader[index]).trim();
    if (headerName) {
      presenceColumnByName[headerName] = index;
    }
  }

  var writtenKeys = [];
  var missingColumns = [];
  (context.credits.creditedKeys || []).forEach(function (raiderKey) {
    if (!Object.prototype.hasOwnProperty.call(presenceColumnByName, raiderKey)) {
      missingColumns.push(raiderKey);
      return;
    }

    var column = presenceColumnByName[raiderKey];
    var currentValue = normalizeCellString_((presenceRow || [])[column]).trim();
    if (currentValue === 'B') {
      return;
    }

    writtenKeys.push(raiderKey);
    requests.push({
      updateCells: {
        start: { sheetId: context.presenceSheet.getSheetId(), rowIndex: presenceRowIndex, columnIndex: column },
        rows: [{ values: [{ userEnteredValue: { numberValue: 1 } }] }],
        fields: 'userEnteredValue'
      }
    });
  });

  requests = requests.concat(buildRaidProtectionDeleteRequests_(context.sheetsMetadata));
  requests.push({
    updateCells: {
      start: { sheetId: context.configSheet.getSheetId(), rowIndex: 1, columnIndex: openRaidColumn },
      rows: [{ values: [{}] }],
      fields: 'userEnteredValue'
    }
  });

  var messageLines = [
    'Raid ' + openRaidId + ' ended.',
    'Pulls counted: ' + context.credits.pullCount + '.',
    'Credited raiders: ' + writtenKeys.length + '.'
  ];
  if ((context.credits.unmatchedNames || []).length) {
    messageLines.push('Unmatched names: ' + context.credits.unmatchedNames.join(', ') + '.');
  }
  if (missingColumns.length) {
    messageLines.push('No Présence column for: ' + missingColumns.join(', ') + '. Run Set up / refresh workbook.');
  }

  return {
    requests: requests,
    message: messageLines.join('\n')
  };
}

// Renders and opens the End raid modal dialog.
function showEndRaidDialog_(openRaidId) {
  var html = HtmlService.createHtmlOutput(
    '<div style="font-family:Verdana,Arial,sans-serif;padding:12px">' +
      '<p style="margin:0 0 10px 0"><strong>End raid</strong> — raid ID ' + snapshotEscapeHtml_(openRaidId) + '</p>' +
      '<label style="display:block;margin:0 0 6px 0">WCL link (one report)</label>' +
      '<input id="wcl-link" style="width:100%;box-sizing:border-box;margin:0 0 10px 0" />' +
      '<label style="display:block;margin:0 0 6px 0">Gargul export</label>' +
      '<textarea id="gargul-text" style="width:100%;height:120px;box-sizing:border-box;margin:0 0 8px 0"></textarea>' +
      '<div style="display:flex;gap:8px;align-items:center;margin:0 0 10px 0">' +
        '<button onclick="previewLoot()">Prévisualiser le loot</button>' +
      '</div>' +
      '<div id="preview-awards" style="margin:0 0 10px 0"></div>' +
      '<div id="preview-rejected" style="margin:0 0 10px 0"></div>' +
      '<div style="display:flex;gap:8px;align-items:center">' +
        '<button onclick="submitEndRaidForm()">End raid</button>' +
        '<span id="status" style="color:#1E7D32"></span>' +
      '</div>' +
      '<script>' +
        'function esc(value){return String(value===undefined||value===null?"":value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;");}' +
        'function currentTreatments(){var map={};var selects=document.querySelectorAll("[data-checksum]");for(var i=0;i<selects.length;i+=1){var select=selects[i];map[select.getAttribute("data-checksum")]=select.value||"";}return map;}' +
        'function renderPreview(data){' +
          'var awards=(data&&data.awards)||[];' +
          'var rejected=(data&&data.rejected)||[];' +
          'var awardHtml="<p style=\\"margin:0 0 6px 0\\"><strong>Awards valides</strong> ("+awards.length+")</p>";' +
          'if(!awards.length){awardHtml+="<p style=\\"margin:0\\">Aucune ligne valide.</p>";}else{' +
            'awardHtml+="<table style=\\"border-collapse:collapse;width:100%\\"><thead><tr><th style=\\"text-align:left;border-bottom:1px solid #d0d0d0;padding:4px\\">Winner</th><th style=\\"text-align:left;border-bottom:1px solid #d0d0d0;padding:4px\\">Objet</th><th style=\\"text-align:left;border-bottom:1px solid #d0d0d0;padding:4px\\">Objet (ID)</th><th style=\\"text-align:left;border-bottom:1px solid #d0d0d0;padding:4px\\">OS</th><th style=\\"text-align:left;border-bottom:1px solid #d0d0d0;padding:4px\\">Traitement</th></tr></thead><tbody>";' +
            'for(var i=0;i<awards.length;i+=1){var row=awards[i];var disabled=row.os===1?" disabled":"";var forced=row.os===1?"NONE":(row.treatment||"");awardHtml+="<tr><td style=\\"padding:4px;border-bottom:1px solid #efefef\\">"+esc(row.winner)+"</td><td style=\\"padding:4px;border-bottom:1px solid #efefef\\">"+esc(row.itemName)+"</td><td style=\\"padding:4px;border-bottom:1px solid #efefef\\">"+esc(row.itemID)+"</td><td style=\\"padding:4px;border-bottom:1px solid #efefef\\">"+(row.os===1?"oui":"")+"</td><td style=\\"padding:4px;border-bottom:1px solid #efefef\\"><select data-checksum=\\""+esc(row.checksum)+"\\""+disabled+"><option value=\\"\\""+(forced===""?" selected":"")+">(choisir)</option><option value=\\"BIS\\""+(forced==="BIS"?" selected":"")+">BIS</option><option value=\\"IMPACT\\""+(forced==="IMPACT"?" selected":"")+">IMPACT</option><option value=\\"NONE\\""+(forced==="NONE"?" selected":"")+">NONE</option></select></td></tr>";}' +
            'awardHtml+="</tbody></table>";' +
          '}' +
          'document.getElementById("preview-awards").innerHTML=awardHtml;' +
          'var rejectedHtml="<p style=\\"margin:10px 0 6px 0\\"><strong>Lignes rejetées</strong> ("+rejected.length+")</p>";' +
          'if(!rejected.length){rejectedHtml+="<p style=\\"margin:0\\">Aucune ligne rejetée.</p>";}else{rejectedHtml+="<ul style=\\"margin:0;padding-left:18px\\">";for(var r=0;r<rejected.length;r+=1){var item=rejected[r];rejectedHtml+="<li>Ligne "+esc(item.lineNumber)+"; checksum: "+esc(item.checksum)+"; date: "+esc(item.date)+"; time: "+esc(item.time)+"; winner: "+esc(item.winner)+"; raison: "+esc(item.reason)+"</li>";}rejectedHtml+="</ul>";}' +
          'document.getElementById("preview-rejected").innerHTML=rejectedHtml;' +
        '}' +
        'function previewLoot(){' +
          'var gargul=document.getElementById("gargul-text").value;' +
          'var status=document.getElementById("status");' +
          'status.textContent="Preview...";' +
          'google.script.run.withSuccessHandler(function(result){status.textContent="";renderPreview(result);})' +
          '.withFailureHandler(function(error){status.textContent="";alert(error&&error.message?error.message:error);})' +
          '.previewEndRaidLoot(gargul);' +
        '}' +
        'function submitEndRaidForm(){' +
          'var link=document.getElementById("wcl-link").value;' +
          'var gargul=document.getElementById("gargul-text").value;' +
          'var treatments=currentTreatments();' +
          'var status=document.getElementById("status");' +
          'status.textContent="Running...";' +
          'google.script.run.withSuccessHandler(function(message){status.textContent="";alert(message);google.script.host.close();})' +
          '.withFailureHandler(function(error){status.textContent="";alert(error&&error.message?error.message:error);})' +
          '.submitEndRaid(link,gargul,treatments);' +
        '}' +
      '</script>' +
    '</div>'
  ).setWidth(760).setHeight(620);

  SpreadsheetApp.getUi().showModalDialog(html, 'End raid');
}

// Reads owner-scoped WCL credentials from User Properties.
function requireWclCredentials_() {
  var properties = PropertiesService.getUserProperties();
  var clientId = normalizeCellString_(properties.getProperty(WCL_CLIENT_ID_KEY)).trim();
  var clientSecret = normalizeCellString_(properties.getProperty(WCL_CLIENT_SECRET_KEY)).trim();
  if (!clientId || !clientSecret) {
    throw new Error('Set WCL credentials first.');
  }
  return {
    clientId: clientId,
    clientSecret: clientSecret
  };
}

// Fetches one OAuth token from WCL using client credentials.
function getWclAccessToken_(credentials) {
  var response = UrlFetchApp.fetch(WCL_TOKEN_URL, {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    headers: {
      Authorization: 'Basic ' + Utilities.base64Encode(credentials.clientId + ':' + credentials.clientSecret)
    },
    payload: { grant_type: 'client_credentials' },
    muteHttpExceptions: true
  });

  var statusCode = response.getResponseCode();
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error('Warcraft Logs authentication failed (HTTP ' + statusCode + ').');
  }
  var payload = safeJsonParse_(response.getContentText());
  if (!payload.access_token) {
    throw new Error('Warcraft Logs authentication failed (HTTP ' + statusCode + ').');
  }
  return payload.access_token;
}

// Fetches one report payload from WCL GraphQL.
function fetchWarcraftLogsReport_(reportCode, credentials) {
  var token = getWclAccessToken_(credentials);
  var query = [
    'query RaidAttendance($code: String!) {',
    '  reportData {',
    '    report(code: $code, allowUnlisted: true) {',
    '      code',
    '      startTime',
    '      endTime',
    '      zone { name }',
    '      masterData(translate: true) {',
    '        actors(type: "Player") { id name }',
    '      }',
    '      fights {',
    '        id',
    '        encounterID',
    '        kill',
    '        inProgress',
    '        startTime',
    '        endTime',
    '        friendlyPlayers',
    '      }',
    '    }',
    '  }',
    '}'
  ].join('\n');

  var response = UrlFetchApp.fetch(WCL_API_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({
      query: query,
      variables: { code: reportCode }
    }),
    muteHttpExceptions: true
  });

  var statusCode = response.getResponseCode();
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error('Warcraft Logs report error (HTTP ' + statusCode + ').');
  }
  var payload = safeJsonParse_(response.getContentText());
  var errors = Array.isArray(payload.errors) ? payload.errors : [];
  if (errors.length) {
    // GraphQL reports an unknown or private code as HTTP 200 with errors[].
    throw new Error('Warcraft Logs report error: ' + normalizeCellString_(errors[0] && errors[0].message) + ' (code ' + reportCode + ').');
  }

  var report = payload && payload.data && payload.data.reportData && payload.data.reportData.report;
  if (!report) {
    throw new Error('Unknown or inaccessible WCL report code.');
  }
  return report;
}

// Parses JSON with a stable error message for malformed payloads.
function safeJsonParse_(text) {
  try {
    return JSON.parse(String(text || '{}'));
  } catch (error) {
    throw new Error('Warcraft Logs returned invalid JSON.');
  }
}

// Builds one updateCells request for a string value.
function buildStringCellRequest_(sheetId, rowIndex, columnIndex, value) {
  return {
    updateCells: {
      start: { sheetId: sheetId, rowIndex: rowIndex, columnIndex: columnIndex },
      rows: [{ values: [{ userEnteredValue: { stringValue: String(value) } }] }],
      fields: 'userEnteredValue'
    }
  };
}

// Builds one updateCells request for a date serial with DATE formatting.
function buildDateCellRequest_(sheetId, rowIndex, columnIndex, serial) {
  return {
    updateCells: {
      start: { sheetId: sheetId, rowIndex: rowIndex, columnIndex: columnIndex },
      rows: [{
        values: [{
          userEnteredValue: { numberValue: serial },
          userEnteredFormat: {
            numberFormat: {
              type: 'DATE'
            }
          }
        }]
      }],
      fields: 'userEnteredValue,userEnteredFormat.numberFormat'
    }
  };
}

// Converts a report start timestamp to a Sheets DATE serial in script time zone.
function dateSerialFromReportStart_(startTimeMs) {
  if (!startTimeMs || !isFinite(startTimeMs)) {
    return null;
  }

  var localDate = Utilities.formatDate(new Date(Number(startTimeMs)), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var parts = localDate.split('-');
  if (parts.length !== 3) {
    return null;
  }

  var year = Number(parts[0]);
  var month = Number(parts[1]);
  var day = Number(parts[2]);
  if (!isFinite(year) || !isFinite(month) || !isFinite(day)) {
    return null;
  }

  var utcMs = Date.UTC(year, month - 1, day);
  var excelEpochUtcMs = Date.UTC(1899, 11, 30);
  return (utcMs - excelEpochUtcMs) / 86400000;
}
