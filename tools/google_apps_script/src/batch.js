var LOCK_TIMEOUT_MS = 1000;

// Runs fn while holding the document lock. Not re-entrant: take it once per action.
function withDocumentLock_(fn) {
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(LOCK_TIMEOUT_MS)) {
    throw new Error('Another action is already running. Please try again.');
  }

  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// The only write path: builds requests inside the lock, then sends them as one all-or-nothing batchUpdate.
function applyBatch_(buildRequests) {
  return withDocumentLock_(function () {
    var requests = buildRequests();
    if (!Array.isArray(requests)) {
      throw new Error('applyBatch_ request builder must return an array of requests.');
    }
    if (!requests.length) {
      return null;
    }

    return Sheets.Spreadsheets.batchUpdate(
      { requests: requests },
      SpreadsheetApp.getActive().getId()
    );
  });
}
