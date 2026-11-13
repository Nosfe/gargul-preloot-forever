// Read-only raider portal (web app): the workbook's public numbers, never its inputs or settings.
var PORTAL_CACHE_KEY = 'raider-portal-v1';
var PORTAL_CACHE_SECONDS = 60;

// Web app entry point.
function doGet() {
  return HtmlService.createTemplateFromFile('portal').evaluate()
    .setTitle('Parsimonie - Preloot')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// Template helper: the content of another project HTML file (portal.html includes portal-style).
function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

// Called by the page; cached a minute so many raiders opening the page do not each read the workbook.
function getRaiderPortalData() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(PORTAL_CACHE_KEY);
  if (cached) {
    return JSON.parse(cached);
  }
  var data = buildRaiderPortalData_(SpreadsheetApp.getActive());
  // Lets a tab open in a new browser tab (?tab=).
  data.url = ScriptApp.getService().getUrl();
  try {
    cache.put(PORTAL_CACHE_KEY, JSON.stringify(data), PORTAL_CACHE_SECONDS);
  } catch (error) {
    // Over the 100 KB cache limit: serve uncached.
  }
  return data;
}

function buildRaiderPortalData_(spreadsheet) {
  var rowsOf = function (name) {
    var sheet = spreadsheet.getSheetByName(name);
    return sheet ? sheet.getDataRange().getValues() : [];
  };
  var configRow = rowsOf('Config')[1] || [];
  var configTab = tabByName_('Config');
  var tierStart = portalIsoDate_(configRow[columnOf_(configTab, 'bisWindowStart')]);
  var rosterRows = rowsOf('Roster');
  var presenceRows = rowsOf(GRID_TABS.presence.name);
  var raiders = buildSnapshotRaiders_(rosterRows).raiders;

  var groupByName = Object.create(null);
  var rosterTab = tabByName_('Roster');
  rosterRows.slice(1).forEach(function (row) {
    var name = normalizeCellString_(row[columnOf_(rosterTab, 'raiderKey')]).trim();
    if (name) {
      groupByName[name] = normalizeCellString_(row[columnOf_(rosterTab, 'raidGroup')]).trim();
    }
  });

  var parseDetails = wclParseDetails_();
  var raids = portalRaids_(presenceRows, tierStart);
  var raidDateById = Object.create(null);
  portalRaids_(presenceRows, '').forEach(function (raid) {
    raidDateById[raid.raidId] = raid.date;
  });
  var allLoots = portalLoots_(rowsOf(GRID_TABS.awards.name), raidDateById);
  var loots = allLoots.filter(function (loot) {
    return !tierStart || !loot.date || loot.date >= tierStart;
  });
  // Any award of the item, whatever its tier, leaves the raider out of that item's ranking.
  var owned = Object.create(null);
  allLoots.forEach(function (loot) {
    owned[loot.raider + '|' + loot.itemId] = true;
  });

  var itemStates = ITEM_TABS.map(function (itemTab) {
    return { role: itemTab.role, rows: rowsOf(itemTab.name) };
  });
  var items = addImpactScores_(buildSnapshotItems_(itemStates).items, raiders);
  var infoById = portalItemInfo_(itemStates);

  return {
    tierId: normalizeCellString_(configRow[columnOf_(configTab, 'tierId')]).trim(),
    tierStart: tierStart,
    wowhead: wowheadPath_(configRow[columnOf_(configTab, 'wowheadVersion')]),
    wclCharacterUrl: portalWclCharacterUrl_(configRow[columnOf_(configTab, 'wowheadVersion')], configRow[columnOf_(configTab, 'wclRealm')]),
    armoryCharacterUrl: portalArmoryCharacterUrl_(configRow[columnOf_(configTab, 'wowheadVersion')], configRow[columnOf_(configTab, 'wclRealm')]),
    classes: CLASS_SPECS.map(function (entry) {
      return { name: entry.name, color: '#' + classHeaderTextHex_(entry.name), fill: '#' + entry.colorHex, fillText: '#' + entry.textHex };
    }),
    parseColors: WCL_PARSE_COLORS.map(function (band) {
      return { min: band.min, max: band.max, color: '#' + band.hex };
    }),
    roles: ITEM_TABS.map(function (itemTab) {
      return {
        role: itemTab.role,
        specs: SPEC_COLUMNS.filter(function (spec) { return spec.role === itemTab.role; }).map(function (spec) { return spec.label; })
      };
    }),
    raiders: raiders.map(function (raider) {
      var className = raider.classSpec.split(' ')[0];
      // A parse typed by hand after the WCL update no longer matches its best and median.
      var detail = Object.prototype.hasOwnProperty.call(parseDetails, raider.raiderKey) ? parseDetails[raider.raiderKey] : null;
      var fresh = detail && detail.value === raider.dpsParse;
      return {
        name: raider.raiderKey,
        group: groupByName[raider.raiderKey] || '',
        className: className,
        spec: raider.classSpec.slice(className.length + 1),
        role: raider.role,
        tierPresence: raider.tierPresence,
        tierPresenceMax: raider.tierPresenceMax,
        bisLootCount: raider.bisLootCount,
        impactLootCount: raider.impactLootCount,
        bisRatio: raider.bisRatio,
        parse: raider.dpsParse,
        parseBest: fresh ? detail.best : null,
        parseMedian: fresh ? detail.median : null
      };
    }),
    // Sheet row order (the snapshot sorts by ID): the BiS List keeps the order the items were imported in.
    items: items.slice().sort(function (left, right) {
      return ((infoById[String(left.itemID)] || {}).order || 0) - ((infoById[String(right.itemID)] || {}).order || 0);
    }).map(function (item) {
      var info = infoById[String(item.itemID)] || {};
      return {
        itemId: item.itemID,
        name: info.name || '',
        slot: info.slot || '',
        specs: item.specs.map(function (spec) {
          return { classSpec: spec.classSpec, statut: spec.statut, gainDps: spec.gainDps };
        }),
        scores: item.impactScores.map(function (entry) {
          return { name: entry.raiderKey, score: entry.score, owned: !!owned[entry.raiderKey + '|' + item.itemID] };
        }).sort(function (left, right) { return right.score - left.score; })
      };
    }),
    loots: loots,
    raids: raids
  };
}

// WCL character page with a {name} placeholder (filled by the page) from Config; '' when Serveur WCL is not set.
function portalWclCharacterUrl_(versionValue, realmValue) {
  try {
    var realm = parseWclRealm_(realmValue);
    return wclSite_(versionValue) + '/character/' + encodeURIComponent(realm.region) + '/' + encodeURIComponent(realm.slug) + '/{name}';
  } catch (error) {
    return '';
  }
}

// Blizzard Armory character page with a {name} placeholder (lower-case name); '' for versions without a known Armory.
function portalArmoryCharacterUrl_(versionValue, realmValue) {
  var version = wowVersion_(versionValue);
  if (!version.armory) {
    return '';
  }
  if (version.armory.indexOf('{realm}') === -1) {
    var region = normalizeCellString_(realmValue).trim().toLowerCase().split('/')[0].trim() || 'eu';
    return version.armory.replace('{region}', encodeURIComponent(region));
  }
  try {
    var realm = parseWclRealm_(realmValue);
    return version.armory.replace('{region}', encodeURIComponent(realm.region)).replace('{realm}', encodeURIComponent(realm.slug));
  } catch (error) {
    return '';
  }
}

// Raid rows of Présence from the tier start ('' = all): raid ID, instance, date and each raider's 1 or B.
function portalRaids_(presenceRows, tierStart) {
  var header = presenceRows[0] || [];
  var raids = [];
  for (var index = PRESENCE_FIRST_RAID_ROW - 1; index < presenceRows.length; index += 1) {
    var row = presenceRows[index] || [];
    var raidId = normalizeCellString_(row[PRESENCE_RAID_ID_COLUMN]).trim();
    var date = portalIsoDate_(row[PRESENCE_DATE_COLUMN]);
    if (!raidId && !date) {
      continue;
    }
    if (tierStart && date && date < tierStart) {
      continue;
    }
    var presence = {};
    for (var column = PRESENCE_FIRST_RAIDER_COLUMN; column < header.length; column += 1) {
      var name = normalizeCellString_(header[column]).trim();
      var value = normalizeCellString_(row[column]).trim();
      if (name && (value === '1' || value === 'B')) {
        presence[name] = value;
      }
    }
    raids.push({ raidId: raidId, instance: normalizeCellString_(row[1]).trim(), date: date, presence: presence });
  }
  return raids.sort(function (left, right) { return right.date < left.date ? -1 : right.date > left.date ? 1 : 0; });
}

// Every award, newest first; a blank date takes its raid's date, like the Roster counts.
function portalLoots_(awardsRows, raidDateById) {
  var names = readAwardsBlockNames_(awardsRows);
  var loots = [];
  names.forEach(function (name, block) {
    if (!name) {
      return;
    }
    var start = block * AWARDS_BLOCK_WIDTH;
    for (var index = AWARDS_FIRST_ROW - 1; index < awardsRows.length; index += 1) {
      var row = awardsRows[index] || [];
      var itemId = normalizeCellString_(row[start + 2]).trim();
      if (!itemId) {
        continue;
      }
      var raidId = normalizeCellString_(row[start + AWARDS_RAID_ID_OFFSET]).trim();
      var date = portalIsoDate_(row[start + AWARDS_DATE_OFFSET]) || raidDateById[raidId] || '';
      loots.push({
        date: date,
        raider: name,
        itemId: itemId,
        itemName: normalizeCellString_(row[start + 1]).trim(),
        treatment: normalizeCellString_(row[start + AWARDS_TREATMENT_OFFSET]).trim(),
        raidId: raidId
      });
    }
  });
  return loots.sort(function (left, right) { return right.date < left.date ? -1 : right.date > left.date ? 1 : 0; });
}

// Name and slot of each item, first non-empty value across the Objets tabs.
function portalItemInfo_(itemStates) {
  var infoById = Object.create(null);
  var order = 0;
  itemStates.forEach(function (state) {
    (state.rows || []).slice(3).forEach(function (row) {
      var id = normalizeCellString_(row[0]).trim();
      if (!id) {
        return;
      }
      var info = infoById[id] || (infoById[id] = { name: '', slot: '', order: order++ });
      info.name = info.name || normalizeCellString_(row[1]).trim();
      info.slot = info.slot || normalizeCellString_(row[OBJETS_SLOT_COLUMN]).trim();
    });
  });
  return infoById;
}

// yyyy-MM-dd from a sheet date, a date serial or ISO text; '' otherwise.
function portalIsoDate_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  if (typeof value === 'number' && isFinite(value) && value > 0) {
    return new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000).toISOString().slice(0, 10);
  }
  var text = normalizeCellString_(value).trim();
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : '';
}
