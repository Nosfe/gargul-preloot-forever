// Allowed award treatments from Gargul custom export and End raid dropdown.
// CLASS_BOUND counts like ALT (neither BiS nor Impact loot); it only colours the row differently.
var AWARD_TREATMENTS = ['IMPACT', 'BIS', 'CLASS_BOUND', 'ALT'];

// Line to paste into Gargul's Custom export format; @GPRAID/@GPTREATMENT are filled by the companion.
var GARGUL_EXPORT_TEMPLATE = '{"checksum":"@CHECKSUM","winner":"@WINNER","itemID":@ID,"itemName":"@ITEM","rollType":"@ROLLTYPE","os":@OS,"date":"@DATE","time":"@TIME","raidId":"@GPRAID","treatment":"@GPTREATMENT"},';

// The Objets tabs are the source of truth for an award's Traitement: the winner's spec Statut for the item wins.
// Without one, a given CLASS_BOUND or ALT is kept and anything else becomes ALT; an off-spec loot is always ALT.
// Returns treatmentFor(winner, itemID, os, given).
function buildTreatmentLookup_(spreadsheet) {
	var rosterSheet = spreadsheet.getSheetByName('Roster');
	var rosterRows = rosterSheet ? rosterSheet.getDataRange().getValues() : [];
	var rosterTab = tabByName_('Roster');
	var classSpecByName = Object.create(null);
	for (var rowIndex = 1; rowIndex < rosterRows.length; rowIndex += 1) {
		var row = rosterRows[rowIndex] || [];
		var name = normalizeCellString_(row[columnOf_(rosterTab, 'raiderKey')]).trim();
		if (name) {
			classSpecByName[name] = rosterClassSpec_(
				normalizeCellString_(row[columnOf_(rosterTab, 'class')]).trim(),
				normalizeCellString_(row[columnOf_(rosterTab, 'spec')]).trim(),
				normalizeCellString_(row[columnOf_(rosterTab, 'role')]).trim()
			);
		}
	}

	var itemStates = ITEM_TABS.map(function (itemTab) {
		var sheet = spreadsheet.getSheetByName(itemTab.name);
		return { role: itemTab.role, rows: sheet ? sheet.getDataRange().getValues() : [] };
	});
	var statutByKey = Object.create(null);
	buildSnapshotItems_(itemStates).items.forEach(function (item) {
		item.specs.forEach(function (spec) {
			statutByKey[item.itemID + '|' + spec.classSpec] = spec.statut;
		});
	});

	return function (winner, itemID, os, given) {
		if (Number(os) === 1) {
			return 'ALT';
		}
		var classSpec = classSpecByName[normalizeCellString_(winner).trim()];
		var statut = classSpec && statutByKey[itemID + '|' + classSpec];
		if (statut) {
			return statut;
		}
		var kept = normalizeCellString_(given).trim();
		return kept === 'CLASS_BOUND' ? kept : 'ALT';
	};
}

// Objets spec label from the Roster class and spec; the role only settles specs that exist for two roles (feral).
function rosterClassSpec_(className, specCell, roleCell) {
	var spec = specDisplayValue_(className, specCell);
	var matches = SPEC_COLUMNS.filter(function (entry) {
		return entry.className === className && entry.spec === spec;
	});
	if (matches.length > 1) {
		matches = matches.filter(function (entry) {
			return snapshotRole_(entry.role) === snapshotRole_(roleCell);
		});
	}
	return matches.length === 1 ? matches[0].label : null;
}

// Simple trigger: an award row typed or changed by hand in Awards gets its Traitement from the Objets tabs.
function onEdit(e) {
	var range = e && e.range;
	if (!range || range.getSheet().getName() !== GRID_TABS.awards.name || range.getLastRow() < AWARDS_FIRST_ROW) {
		return;
	}
	var sheet = range.getSheet();
	var treatmentFor = buildTreatmentLookup_(sheet.getParent());
	var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
	var firstRow = Math.max(range.getRow(), AWARDS_FIRST_ROW);
	var rowCount = range.getLastRow() - firstRow + 1;
	var lastBlock = Math.floor((range.getLastColumn() - 1) / AWARDS_BLOCK_WIDTH);
	for (var block = Math.floor((range.getColumn() - 1) / AWARDS_BLOCK_WIDTH); block <= lastBlock; block += 1) {
		var start = block * AWARDS_BLOCK_WIDTH;
		var winner = normalizeCellString_(header[start]).trim();
		if (!winner) {
			continue;
		}
		var values = sheet.getRange(firstRow, start + 1, rowCount, AWARDS_BLOCK_WIDTH).getValues();
		values.forEach(function (row, index) {
			var itemID = parseInteger_(row[AWARDS_ITEM_ID_OFFSET]);
			if (itemID === null) {
				return;
			}
			var expected = treatmentFor(winner, itemID, 0, row[AWARDS_TREATMENT_OFFSET]);
			if (row[AWARDS_TREATMENT_OFFSET] !== expected) {
				sheet.getRange(firstRow + index, start + AWARDS_TREATMENT_OFFSET + 1).setValue(expected);
			}
		});
	}
}

// Setup menu: shows the Gargul custom export format with a copy button.
function showGargulExportFormat() {
	var html = HtmlService.createHtmlOutput(
		'<div style="font-family:Verdana,Arial,sans-serif;padding:12px">' +
			'<p style="margin:0 0 8px 0">Gargul : Export loot &gt; format <strong>Custom</strong>. Décocher <em>Include offspec items</em> et <em>Include disenchanted items</em>, puis coller cette ligne :</p>' +
			'<textarea id="gargul-format" readonly style="width:100%;height:110px">' + snapshotEscapeHtml_(GARGUL_EXPORT_TEMPLATE) + '</textarea>' +
			'<div style="margin-top:10px;display:flex;gap:8px;align-items:center">' +
				'<button onclick="copyFormat()">Copier</button>' +
				'<span id="copy-status" style="color:#1E7D32"></span>' +
			'</div>' +
			'<script>' +
				'function copyFormat(){' +
					'var textarea=document.getElementById("gargul-format");' +
					'var status=document.getElementById("copy-status");' +
					'textarea.focus();textarea.select();' +
					'try{document.execCommand("copy");status.textContent="Copié";}' +
					'catch(error){status.textContent="Copie impossible : Ctrl+C";}' +
				'}' +
			'</script>' +
		'</div>'
	).setWidth(760).setHeight(260);

	SpreadsheetApp.getUi().showModalDialog(html, 'Format d\'export Gargul');
}

// Parses Gargul custom-export text line by line into valid entries and rejected rows.
function parseGargulExport_(text) {
	var lines = [];
	var rejected = [];
	var checksumCounts = Object.create(null);

	var sourceLines = String(text || '').split(/\r?\n/);
	sourceLines.forEach(function (rawLine) {
		var candidate = normalizeCellString_(rawLine).trim().replace(/,$/, '');
		try {
			var value = JSON.parse(candidate);
			var key = value && typeof value === 'object' ? normalizeCellString_(value.checksum) : '';
			if (key) {
				checksumCounts[key] = (checksumCounts[key] || 0) + 1;
			}
		} catch (error) {
			// Counted lines only; bad JSON is reported below.
		}
	});

	sourceLines.forEach(function (rawLine, index) {
		var lineNumber = index + 1;
		var line = normalizeCellString_(rawLine).trim();
		if (!line) {
			return;
		}

		if (line.charAt(line.length - 1) === ',') {
			line = line.slice(0, -1).trim();
		}

		var parsed = null;
		try {
			parsed = JSON.parse(line);
		} catch (error) {
			parsed = null;
		}
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			rejected.push({
				lineNumber: lineNumber,
				checksum: '',
				date: '',
				time: '',
				winner: '',
				reason: 'JSON invalide.'
			});
			return;
		}

		var checksum = normalizeCellString_(parsed.checksum).trim();
		// Exact winner (AD-3): no trimming, so "Ana " never matches "Ana".
		var winner = normalizeCellString_(parsed.winner);
		var date = normalizeCellString_(parsed.date).trim();
		var time = normalizeCellString_(parsed.time).trim();

		if (!checksum) {
			rejected.push({
				lineNumber: lineNumber,
				checksum: checksum,
				date: date,
				time: time,
				winner: winner,
				reason: 'Checksum obligatoire.'
			});
			return;
		}

		// Every copy of a repeated checksum is rejected: which one is right cannot be told.
		if (checksumCounts[normalizeCellString_(parsed.checksum)] > 1) {
			rejected.push({
				lineNumber: lineNumber,
				checksum: checksum,
				date: date,
				time: time,
				winner: winner,
				reason: 'Checksum en double.'
			});
			return;
		}

		var itemID = typeof parsed.itemID === 'number' ? parseInteger_(parsed.itemID) : null;
		if (itemID === null || itemID < 1) {
			rejected.push({
				lineNumber: lineNumber,
				checksum: checksum,
				date: date,
				time: time,
				winner: winner,
				reason: 'itemID doit être un entier.'
			});
			return;
		}

		var treatment = normalizeCellString_(parsed.treatment).trim();
		// Older companion versions wrote NORMAL, now ALT.
		if (treatment === 'NORMAL') {
			treatment = 'ALT';
		}
		if (!isKnownTreatment_(treatment)) {
			treatment = '';
		}

		lines.push({
			lineNumber: lineNumber,
			checksum: checksum,
			winner: winner,
			itemID: itemID,
			itemName: typeof parsed.itemName === 'string' ? parsed.itemName.trim() : '',
			rollType: normalizeCellString_(parsed.rollType).trim(),
			os: Number(parsed.os) === 1 ? 1 : 0,
			date: date,
			time: time,
			raidId: normalizeCellString_(parsed.raidId).trim(),
			treatment: treatment
		});
	});

	return { lines: lines, rejected: rejected };
}

// AD-6: only the open raid's awards are imported; empty or unfilled @GPRAID lines are rejected too.
function validateRaidIds_(lines, openRaidId) {
	var kept = [];
	var rejected = [];
	var expected = normalizeCellString_(openRaidId).trim();

	(lines || []).forEach(function (line) {
		if (line.raidId === expected) {
			kept.push(line);
			return;
		}

		var found = line.raidId === '' || line.raidId === '@GPRAID' ? 'non rempli' : '"' + line.raidId + '" au lieu du raid en cours ' + expected;
		rejected.push(buildRejectedFromLine_(
			line,
			'raidId ' + found + '. Tapez ' + expected + ' dans la ligne ou supprimez-la.'
		));
	});

	return { lines: kept, rejected: rejected };
}

// Moves invalid awards to rejected when winner resolution fails against roster and Awards headers.
function validateAwards_(lines, rosterIndex, blockNames) {
	var kept = [];
	var rejected = [];
	var blockNameSet = Object.create(null);

	(blockNames || []).forEach(function (name) {
		var key = normalizeCellString_(name).trim();
		if (key) {
			blockNameSet[key] = true;
		}
	});

	(lines || []).forEach(function (line) {
		var winner = normalizeCellString_(line.winner);
		if (!findRaiderKey_(rosterIndex, winner)) {
			rejected.push(buildRejectedFromLine_(line, 'Gagnant absent du Roster (nom exact).'));
			return;
		}

		if (!Object.prototype.hasOwnProperty.call(blockNameSet, winner)) {
			rejected.push(buildRejectedFromLine_(line, 'Gagnant sans bloc Awards. Lancez Configuration > Rafraîchir le classeur.'));
			return;
		}

		kept.push(line);
	});

	return { lines: kept, rejected: rejected };
}

// Builds an item-id to item-name lookup from every Objets tab data row.
function itemNamesById_(itemStates) {
	var namesById = Object.create(null);

	(itemStates || []).forEach(function (state) {
		var rows = (state && state.rows) || [];
		for (var rowIndex = 3; rowIndex < rows.length; rowIndex += 1) {
			var row = rows[rowIndex] || [];
			var itemID = parseInteger_(row[0]);
			if (itemID === null) {
				continue;
			}
			var key = String(itemID);
			var itemName = normalizeCellString_(row[1]);
			if (!Object.prototype.hasOwnProperty.call(namesById, key) || !namesById[key]) {
				namesById[key] = itemName;
			}
		}
	});

	return namesById;
}

// Builds sheet requests that append awards below each winner's existing 5-column block rows.
function buildAwardRequests_(awardsSheetId, awardsRows, awards, raidId, dateSerial) {
	var blockNames = readAwardsBlockNames_(awardsRows || []);
	var blockStartByWinner = Object.create(null);
	var nextRowByWinner = Object.create(null);
	var requests = [];

	blockNames.forEach(function (name, index) {
		var winner = normalizeCellString_(name).trim();
		if (!winner) {
			return;
		}
		var blockStart = index * AWARDS_BLOCK_WIDTH;
		blockStartByWinner[winner] = blockStart;
		nextRowByWinner[winner] = nextAwardRowIndex_(awardsRows || [], blockStart);
	});

	(awards || []).forEach(function (award) {
		var winner = normalizeCellString_(award.winner);
		var blockStart = blockStartByWinner[winner];
		if (blockStart === undefined) {
			return;
		}

		var rowIndex = nextRowByWinner[winner];
		nextRowByWinner[winner] = rowIndex + 1;
		requests.push(buildAwardRowWriteRequest_(awardsSheetId, rowIndex, blockStart, award, raidId, dateSerial));
	});

	return requests;
}

// One rejected-line record carrying the identifying fields shown to the owner.
function buildRejectedFromLine_(line, reason) {
	return {
		lineNumber: Number(line.lineNumber || 0),
		checksum: normalizeCellString_(line.checksum).trim(),
		date: normalizeCellString_(line.date).trim(),
		time: normalizeCellString_(line.time).trim(),
		winner: normalizeCellString_(line.winner).trim(),
		reason: String(reason)
	};
}

// Whole number from a number or digit-only text, else null.
function parseInteger_(value) {
	if (typeof value === 'number' && isFinite(value) && Math.floor(value) === value) {
		return value;
	}
	if (typeof value === 'string' && /^\s*-?\d+\s*$/.test(value)) {
		var parsed = Number(value);
		if (isFinite(parsed) && Math.floor(parsed) === parsed) {
			return parsed;
		}
	}
	return null;
}

// True for IMPACT, BIS, CLASS_BOUND or ALT.
function isKnownTreatment_(value) {
	return AWARD_TREATMENTS.indexOf(normalizeCellString_(value).trim()) !== -1;
}

// Row index just below the last non-empty row of one 5-column Awards block.
function nextAwardRowIndex_(rows, blockStart) {
	var firstDataRow = AWARDS_FIRST_ROW - 1;
	var lastNonEmpty = firstDataRow - 1;

	for (var rowIndex = firstDataRow; rowIndex < (rows || []).length; rowIndex += 1) {
		var row = rows[rowIndex] || [];
		var hasAnyValue = false;
		for (var offset = 0; offset < AWARDS_BLOCK_WIDTH; offset += 1) {
			var value = row[blockStart + offset];
			if (!(value === '' || value === null || value === undefined)) {
				hasAnyValue = true;
				break;
			}
		}
		if (hasAnyValue) {
			lastNonEmpty = rowIndex;
		}
	}

	return lastNonEmpty + 1;
}

// One updateCells request writing Date, Objet, Objet (ID), Traitement and Raid (ID).
function buildAwardRowWriteRequest_(sheetId, rowIndex, blockStart, award, raidId, dateSerial) {
	var raidIdValue = parseInteger_(raidId);
	var raidCellValue = raidIdValue === null
		? { stringValue: String(raidId) }
		: { numberValue: raidIdValue };

	var dateCell = {};
	if (dateSerial !== null && dateSerial !== undefined) {
		dateCell.userEnteredValue = { numberValue: Number(dateSerial) };
		dateCell.userEnteredFormat = { numberFormat: { type: 'DATE' } };
	}

	return {
		updateCells: {
			start: {
				sheetId: sheetId,
				rowIndex: rowIndex,
				columnIndex: blockStart
			},
			rows: [{
				values: [
					dateCell,
					{ userEnteredValue: { stringValue: normalizeCellString_(award.itemName) } },
					{ userEnteredValue: { numberValue: Number(award.itemID) } },
					{ userEnteredValue: { stringValue: normalizeCellString_(award.treatment) } },
					{ userEnteredValue: raidCellValue }
				]
			}],
			fields: 'userEnteredValue,userEnteredFormat.numberFormat'
		}
	};
}

