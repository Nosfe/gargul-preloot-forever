// Allowed award treatments from Gargul custom export and End raid dropdown.
// CLASS_BOUND counts like NORMAL (neither BiS nor Impact loot); it only colours the row differently.
var AWARD_TREATMENTS = ['BIS', 'IMPACT', 'CLASS_BOUND', 'NORMAL'];

// Line to paste into Gargul's Custom export format; @GPRAID/@GPTREATMENT are filled by the companion.
var GARGUL_EXPORT_TEMPLATE = '{"checksum":"@CHECKSUM","winner":"@WINNER","itemID":@ID,"itemName":"@ITEM","rollType":"@ROLLTYPE","os":@OS,"date":"@DATE","time":"@TIME","raidId":"@GPRAID","treatment":"@GPTREATMENT"},';

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

	SpreadsheetApp.getUi().showModalDialog(html, 'Gargul custom export format');
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
				reason: 'Invalid JSON.'
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
				reason: 'Checksum is required.'
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
				reason: 'Duplicate checksum.'
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
				reason: 'itemID must be an integer.'
			});
			return;
		}

		var treatment = normalizeCellString_(parsed.treatment).trim();
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

		var found = line.raidId === '' || line.raidId === '@GPRAID' ? 'not filled' : '"' + line.raidId + '", not the open raid ' + expected;
		rejected.push(buildRejectedFromLine_(
			line,
			'raidId is ' + found + '. Type ' + expected + ' in the line or delete it.'
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
			rejected.push(buildRejectedFromLine_(line, 'Winner is not an exact Roster key.'));
			return;
		}

		if (!Object.prototype.hasOwnProperty.call(blockNameSet, winner)) {
			rejected.push(buildRejectedFromLine_(line, 'Winner has no Awards block. Run Configuration > Rafraîchir le classeur.'));
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

// True for BIS, IMPACT, CLASS_BOUND or NORMAL.
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

