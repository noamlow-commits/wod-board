// ═══════════════════════════════════════════════════════
// WOD Board - Google Apps Script Backend
// ═══════════════════════════════════════════════════════
//
// SETUP INSTRUCTIONS:
// 1. Open your Google Sheet
// 2. Go to Extensions > Apps Script
// 3. Delete any existing code in Code.gs
// 4. Paste this entire file
// 5. Click Deploy > New deployment
// 6. Select type: Web app
// 7. Set "Execute as": Me
// 8. Set "Who has access": Anyone
// 9. Click Deploy
// 10. Copy the URL and paste it in WOD Board settings (Apps Script URL)
//
// TABS:
// - Results     — daily WOD scores (temporary, auto-purge after 30 days)
// - Lifts       — strength/oly lift entries (permanent)
// - Benchmarks  — benchmark WOD results (permanent)
// - PRs         — one row per athlete×exercise, updated on PR (permanent)
//
// ═══════════════════════════════════════════════════════

var TZ_FALLBACK = 'Asia/Jerusalem';

function getTz_() {
  return SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || TZ_FALLBACK;
}

function todayStr_() {
  return Utilities.formatDate(new Date(), getTz_(), 'yyyy-MM-dd');
}

// ═══════════════════════════════════════════════════════
// Ensure tabs exist with correct headers
// ═══════════════════════════════════════════════════════
function ensureTab_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getResultsSheet_() {
  return ensureTab_('Results', ['Timestamp', 'Name', 'Score', 'ScoreType', 'WorkoutDate', 'RawValue', 'Rx']);
}

function getLiftsSheet_() {
  return ensureTab_('Lifts', ['Timestamp', 'Name', 'Exercise', 'Weight', 'Reps', 'Unit', 'Est1RM', 'IsPR', 'WorkoutDate']);
}

function getBenchmarksSheet_() {
  return ensureTab_('Benchmarks', ['Timestamp', 'Name', 'WOD', 'Score', 'ScoreType', 'RawValue', 'Rx', 'IsPR', 'WorkoutDate']);
}

function getPRsSheet_() {
  return ensureTab_('PRs', ['Name', 'Exercise', 'Type', 'Best', 'BestRaw', 'Reps', 'Date']);
}

// ═══════════════════════════════════════════════════════
// POST handler
// ═══════════════════════════════════════════════════════
function doPost(e) {
  var raw = '';
  if (e.parameter && e.parameter.payload) {
    raw = e.parameter.payload;
  } else if (e.postData && e.postData.contents) {
    raw = e.postData.contents;
  }
  var data = JSON.parse(raw);
  var action = data.action || 'score';

  if (action === 'lift') {
    return handleLiftPost_(data);
  }
  if (action === 'benchmark') {
    return handleBenchmarkPost_(data);
  }
  // Default: daily WOD score (existing behavior)
  return handleScorePost_(data);
}

// --- Daily WOD score ---
function handleScorePost_(data) {
  var sheet = getResultsSheet_();
  // Force plain text
  sheet.getRange('C:C').setNumberFormat('@');
  sheet.getRange('E:E').setNumberFormat('@');

  var newRow = sheet.getLastRow() + 1;
  sheet.getRange(newRow, 1, 1, 7).setNumberFormat('@').setValues([[
    new Date().toISOString(),
    data.name || '',
    data.score || '',
    data.scoreType || 'time',
    data.workoutDate || todayStr_(),
    String(data.rawValue || 0),
    data.rx || 'Rx'
  ]]);

  // Auto-purge old rows (>30 days) from Results only
  try { purgeOldRows_(sheet); } catch (err) {}

  return jsonResponse_({ status: 'ok' });
}

// --- Lift entry ---
function handleLiftPost_(data) {
  var sheet = getLiftsSheet_();
  var prs = getPRsSheet_();

  var weight = Number(data.weight) || 0;
  var reps = Number(data.reps) || 1;
  var unit = data.unit || 'kg';
  var weightKg = (unit === 'lbs') ? weight * 0.453592 : weight;
  // Wendler formula: estimated 1RM = weight × (1 + reps/30)
  var est1RM = (reps === 1) ? weightKg : Math.round(weightKg * (1 + reps / 30) * 10) / 10;

  var isPR = checkAndUpdatePR_(prs, data.name, data.exercise, 'lift', weight + ' ' + unit + ' x' + reps, est1RM, reps, data.workoutDate || todayStr_());

  var newRow = sheet.getLastRow() + 1;
  sheet.getRange(newRow, 1, 1, 9).setNumberFormat('@').setValues([[
    new Date().toISOString(),
    data.name || '',
    data.exercise || '',
    String(weight),
    String(reps),
    unit,
    String(est1RM),
    isPR ? 'TRUE' : 'FALSE',
    data.workoutDate || todayStr_()
  ]]);

  return jsonResponse_({ status: 'ok', isPR: isPR, est1RM: est1RM });
}

// --- Benchmark entry ---
function handleBenchmarkPost_(data) {
  var sheet = getBenchmarksSheet_();
  var prs = getPRsSheet_();

  var rawValue = Number(data.rawValue) || 0;
  var scoreType = data.scoreType || 'time';
  // For time: lower is better (PR = lower rawValue). For others: higher is better.
  var isPR = checkAndUpdatePR_(prs, data.name, data.wod, 'benchmark', data.score, rawValue, 0, data.workoutDate || todayStr_(), scoreType);

  var newRow = sheet.getLastRow() + 1;
  sheet.getRange(newRow, 1, 1, 9).setNumberFormat('@').setValues([[
    new Date().toISOString(),
    data.name || '',
    data.wod || '',
    data.score || '',
    scoreType,
    String(rawValue),
    data.rx || 'Rx',
    isPR ? 'TRUE' : 'FALSE',
    data.workoutDate || todayStr_()
  ]]);

  return jsonResponse_({ status: 'ok', isPR: isPR });
}

// ═══════════════════════════════════════════════════════
// PR check and update
// ═══════════════════════════════════════════════════════
function checkAndUpdatePR_(prSheet, name, exercise, type, bestDisplay, bestRaw, reps, date, scoreType) {
  var data = prSheet.getDataRange().getValues();
  var foundRow = -1;

  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === name && data[i][1] === exercise && data[i][2] === type) {
      foundRow = i + 1; // 1-based
      break;
    }
  }

  var isPR = false;

  if (foundRow === -1) {
    // First entry — it's a PR by definition
    isPR = true;
    var newRow = prSheet.getLastRow() + 1;
    prSheet.getRange(newRow, 1, 1, 7).setNumberFormat('@').setValues([[
      name, exercise, type, String(bestDisplay), String(bestRaw), String(reps || 0), date
    ]]);
  } else {
    var currentBestRaw = Number(data[foundRow - 1][4]) || 0;

    if (type === 'benchmark' && scoreType === 'time') {
      // For time: lower is better
      isPR = bestRaw < currentBestRaw;
    } else {
      // For lifts and other benchmarks: higher is better
      isPR = bestRaw > currentBestRaw;
    }

    if (isPR) {
      prSheet.getRange(foundRow, 4, 1, 4).setNumberFormat('@').setValues([[
        String(bestDisplay), String(bestRaw), String(reps || 0), date
      ]]);
    }
  }

  return isPR;
}

// ═══════════════════════════════════════════════════════
// GET handler
// ═══════════════════════════════════════════════════════
function doGet(e) {
  var action = e.parameter.action || 'scores';

  if (action === 'clear') return handleClear_(e);
  if (action === 'myprs') return handleMyPRs_(e);
  if (action === 'mylifts') return handleMyLifts_(e);
  if (action === 'mybenchmarks') return handleMyBenchmarks_(e);
  if (action === 'todaylifts') return handleTodayLifts_(e);

  // Default: return today's WOD scores (existing behavior)
  return handleGetScores_(e);
}

// --- Get today's WOD scores (existing) ---
function handleGetScores_(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Results');

  if (!sheet) {
    return respondWithCallback_(e, { results: [] });
  }

  var tz = getTz_();
  var dateFilter = e.parameter.date || todayStr_();
  var data = sheet.getDataRange().getValues();
  var results = [];

  for (var i = 1; i < data.length; i++) {
    var rowDate = data[i][4];
    try {
      rowDate = Utilities.formatDate(new Date(rowDate), tz, 'yyyy-MM-dd');
    } catch (err) {
      rowDate = String(rowDate).slice(0, 10);
    }

    if (rowDate === dateFilter) {
      var score = data[i][2];
      var scoreType = String(data[i][3]);
      var rawValue = Number(data[i][5]) || 0;

      if (score instanceof Date || (typeof score === 'object' && score !== null)) {
        if (scoreType === 'time') {
          var min = Math.floor(rawValue / 60);
          var sec = rawValue % 60;
          score = min + ':' + (sec < 10 ? '0' : '') + sec;
        } else if (scoreType === 'amrap') {
          var rounds = Math.floor(rawValue / 1000);
          var reps = rawValue % 1000;
          score = rounds + '+' + reps;
        } else {
          score = String(rawValue);
        }
      } else {
        score = String(score);
      }

      results.push({
        timestamp: data[i][0],
        name: data[i][1],
        score: score,
        scoreType: scoreType,
        rawValue: rawValue,
        rx: data[i][6] || 'Rx'
      });
    }
  }

  return respondWithCallback_(e, { results: results, date: dateFilter });
}

// --- Get athlete's PRs ---
function handleMyPRs_(e) {
  var name = e.parameter.name || '';
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PRs');
  var prs = [];

  if (sheet) {
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === name) {
        prs.push({
          exercise: data[i][1],
          type: data[i][2],
          best: data[i][3],
          bestRaw: Number(data[i][4]) || 0,
          reps: Number(data[i][5]) || 0,
          date: data[i][6]
        });
      }
    }
  }

  return respondWithCallback_(e, { prs: prs, name: name });
}

// --- Get athlete's lift history ---
function handleMyLifts_(e) {
  var name = e.parameter.name || '';
  var exercise = e.parameter.exercise || '';
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Lifts');
  var lifts = [];

  if (sheet) {
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][1] === name && (!exercise || data[i][2] === exercise)) {
        lifts.push({
          exercise: data[i][2],
          weight: Number(data[i][3]) || 0,
          reps: Number(data[i][4]) || 0,
          unit: data[i][5],
          est1RM: Number(data[i][6]) || 0,
          isPR: data[i][7] === 'TRUE',
          date: data[i][8]
        });
      }
    }
  }

  return respondWithCallback_(e, { lifts: lifts, name: name });
}

// --- Get athlete's benchmark history ---
function handleMyBenchmarks_(e) {
  var name = e.parameter.name || '';
  var wod = e.parameter.wod || '';
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Benchmarks');
  var benchmarks = [];

  if (sheet) {
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][1] === name && (!wod || data[i][2] === wod)) {
        benchmarks.push({
          wod: data[i][2],
          score: data[i][3],
          scoreType: data[i][4],
          rawValue: Number(data[i][5]) || 0,
          rx: data[i][6],
          isPR: data[i][7] === 'TRUE',
          date: data[i][8]
        });
      }
    }
  }

  return respondWithCallback_(e, { benchmarks: benchmarks, name: name });
}

// --- Get today's lifts (all athletes) ---
function handleTodayLifts_(e) {
  var tz = getTz_();
  var dateFilter = e.parameter.date || todayStr_();
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Lifts');
  var lifts = [];

  if (sheet) {
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      var rowDate = data[i][8]; // WorkoutDate column (index 8)
      try {
        rowDate = Utilities.formatDate(new Date(rowDate), tz, 'yyyy-MM-dd');
      } catch (err) {
        rowDate = String(rowDate).slice(0, 10);
      }
      if (rowDate === dateFilter) {
        lifts.push({
          name: data[i][1],
          exercise: data[i][2],
          weight: Number(data[i][3]) || 0,
          reps: Number(data[i][4]) || 0,
          unit: data[i][5],
          est1RM: Number(data[i][6]) || 0,
          isPR: data[i][7] === 'TRUE'
        });
      }
    }
  }

  return respondWithCallback_(e, { lifts: lifts, date: dateFilter });
}

// ═══════════════════════════════════════════════════════
// Clear today's scores (Results tab ONLY)
// ═══════════════════════════════════════════════════════
function handleClear_(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Results');
  var deleted = 0;

  if (sheet) {
    var tz = getTz_();
    var targetDate = e.parameter.date || todayStr_();
    var data = sheet.getDataRange().getValues();
    var rowsToDelete = [];

    for (var i = 1; i < data.length; i++) {
      var rowDate = data[i][4];
      try {
        rowDate = Utilities.formatDate(new Date(rowDate), tz, 'yyyy-MM-dd');
      } catch (err) {
        rowDate = String(rowDate).slice(0, 10);
      }
      if (rowDate === targetDate) {
        rowsToDelete.push(i + 1);
      }
    }

    for (var j = rowsToDelete.length - 1; j >= 0; j--) {
      sheet.deleteRow(rowsToDelete[j]);
      deleted++;
    }
  }

  return respondWithCallback_(e, { status: 'ok', deleted: deleted });
}

// ═══════════════════════════════════════════════════════
// Purge old rows (>30 days) from Results tab ONLY
// ═══════════════════════════════════════════════════════
function purgeOldRows_(sheet) {
  var tz = getTz_();
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  var cutoffStr = Utilities.formatDate(cutoff, tz, 'yyyy-MM-dd');

  var data = sheet.getDataRange().getValues();
  var rowsToDelete = [];

  for (var i = 1; i < data.length; i++) {
    var rowDate = data[i][4];
    try {
      rowDate = Utilities.formatDate(new Date(rowDate), tz, 'yyyy-MM-dd');
    } catch (err) {
      rowDate = String(rowDate).slice(0, 10);
    }
    if (rowDate < cutoffStr) {
      rowsToDelete.push(i + 1);
    }
  }

  for (var j = rowsToDelete.length - 1; j >= 0; j--) {
    sheet.deleteRow(rowsToDelete[j]);
  }
}

// ═══════════════════════════════════════════════════════
// Response helpers
// ═══════════════════════════════════════════════════════
function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function respondWithCallback_(e, obj) {
  var json = JSON.stringify(obj);
  var callback = e.parameter.callback;
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}
