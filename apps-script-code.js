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
// - Reactions   — emoji reactions on PRs/lifts (permanent)
// - Challenges  — coach-created challenges (permanent)
// - Badges      — earned badges per athlete (permanent)
//
// COACH SETUP:
// Run this once in Apps Script console to set coach password:
//   PropertiesService.getScriptProperties().setProperty('COACH_PASSWORD', 'your-password-here');
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

function getReactionsSheet_() {
  return ensureTab_('Reactions', ['Timestamp', 'FromName', 'ToName', 'Exercise', 'Type', 'Emoji', 'Date']);
}

function getChallengesSheet_() {
  return ensureTab_('Challenges', ['ID', 'Title', 'Description', 'Type', 'Duration', 'StartDate', 'EndDate', 'Metric', 'TargetValue', 'CreatedBy', 'CreatedAt', 'Status']);
}

function getBadgesSheet_() {
  return ensureTab_('Badges', ['Timestamp', 'AthleteName', 'BadgeID', 'BadgeName', 'Description', 'EarnedDate', 'Data']);
}

// ═══════════════════════════════════════════════════════
// Coach authentication
// ═══════════════════════════════════════════════════════
function verifyCoach_(password) {
  var stored = PropertiesService.getScriptProperties().getProperty('COACH_PASSWORD');
  return stored && password === stored;
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
  if (action === 'reaction') {
    return handleReactionPost_(data);
  }
  if (action === 'createChallenge') {
    return handleCreateChallenge_(data);
  }
  if (action === 'updateChallenge') {
    return handleUpdateChallenge_(data);
  }
  if (action === 'deleteChallenge') {
    return handleDeleteChallenge_(data);
  }
  if (action === 'awardBadge') {
    return handleAwardBadge_(data);
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

  // Auto-check badges after PR
  if (isPR) checkBadgesAfterPR_(data.name);

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

  // Auto-check badges after PR
  if (isPR) checkBadgesAfterPR_(data.name);

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
  if (action === 'todaybenchmarks') return handleTodayBenchmarks_(e);
  if (action === 'feed') return handleFeed_(e);
  if (action === 'leaderboard') return handleLeaderboard_(e);
  if (action === 'allprs') return handleAllPRs_(e);
  if (action === 'coachLogin') return handleCoachLogin_(e);
  if (action === 'getChallenges') return handleGetChallenges_(e);
  if (action === 'getAllChallenges') return handleGetAllChallenges_(e);
  if (action === 'getChallengeLeaderboard') return handleChallengeLeaderboard_(e);
  if (action === 'getBadges') return handleGetBadges_(e);
  if (action === 'getAllAthletes') return handleGetAllAthletes_(e);
  if (action === 'recalcBadges') return handleRecalcBadges_(e);

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

// --- Get today's benchmarks (all athletes) ---
function handleTodayBenchmarks_(e) {
  var tz = getTz_();
  var dateFilter = e.parameter.date || todayStr_();
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Benchmarks');
  var benchmarks = [];

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
        benchmarks.push({
          name: data[i][1],
          wod: data[i][2],
          score: data[i][3],
          scoreType: data[i][4],
          rawValue: Number(data[i][5]) || 0,
          rx: data[i][6],
          isPR: data[i][7] === 'TRUE'
        });
      }
    }
  }

  return respondWithCallback_(e, { benchmarks: benchmarks, date: dateFilter });
}

// ═══════════════════════════════════════════════════════
// Reaction POST handler
// ═══════════════════════════════════════════════════════
function handleReactionPost_(data) {
  var sheet = getReactionsSheet_();
  var from = data.fromName || '';
  var to = data.toName || '';
  var exercise = data.exercise || '';
  var type = data.type || 'lift';
  var emoji = data.emoji || '💪';
  var date = data.date || todayStr_();

  // Duplicate check: same from→to+exercise+date = already reacted
  var existing = sheet.getDataRange().getValues();
  for (var i = 1; i < existing.length; i++) {
    if (existing[i][1] === from && existing[i][2] === to && existing[i][3] === exercise && existing[i][6] === date) {
      return jsonResponse_({ status: 'already', message: 'כבר הגבת על זה' });
    }
  }

  var newRow = sheet.getLastRow() + 1;
  sheet.getRange(newRow, 1, 1, 7).setNumberFormat('@').setValues([[
    new Date().toISOString(), from, to, exercise, type, emoji, date
  ]]);

  return jsonResponse_({ status: 'ok' });
}

// ═══════════════════════════════════════════════════════
// Activity Feed — recent PRs with reaction counts
// ═══════════════════════════════════════════════════════
function handleFeed_(e) {
  var prsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PRs');
  var reactSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Reactions');
  var liftsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Lifts');
  var benchSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Benchmarks');
  var limit = Number(e.parameter.limit) || 30;

  var feed = [];

  // Collect recent lifts (last 100 rows as candidates)
  if (liftsSheet) {
    var lData = liftsSheet.getDataRange().getValues();
    var start = Math.max(1, lData.length - 100);
    for (var i = lData.length - 1; i >= start; i--) {
      if (lData[i][7] === 'TRUE') { // isPR
        feed.push({
          name: lData[i][1],
          exercise: lData[i][2],
          display: lData[i][3] + ' ' + lData[i][5] + ' x' + lData[i][4],
          type: 'lift',
          date: String(lData[i][8]).slice(0, 10),
          timestamp: lData[i][0]
        });
      }
    }
  }

  // Collect recent benchmarks PRs
  if (benchSheet) {
    var bData = benchSheet.getDataRange().getValues();
    var bStart = Math.max(1, bData.length - 100);
    for (var j = bData.length - 1; j >= bStart; j--) {
      if (bData[j][7] === 'TRUE') {
        feed.push({
          name: bData[j][1],
          exercise: bData[j][2],
          display: bData[j][3],
          type: 'benchmark',
          date: String(bData[j][8]).slice(0, 10),
          timestamp: bData[j][0]
        });
      }
    }
  }

  // Sort by timestamp descending, limit
  feed.sort(function(a, b) { return a.timestamp < b.timestamp ? 1 : -1; });
  feed = feed.slice(0, limit);

  // Count reactions per item
  var reactionMap = {};
  if (reactSheet) {
    var rData = reactSheet.getDataRange().getValues();
    for (var k = 1; k < rData.length; k++) {
      var key = rData[k][2] + '|' + rData[k][3] + '|' + rData[k][6]; // to|exercise|date
      if (!reactionMap[key]) reactionMap[key] = { count: 0, emojis: [], fromNames: [] };
      reactionMap[key].count++;
      reactionMap[key].emojis.push(rData[k][5]);
      reactionMap[key].fromNames.push(rData[k][1]);
    }
  }

  // Attach reaction counts to feed items
  for (var m = 0; m < feed.length; m++) {
    var rKey = feed[m].name + '|' + feed[m].exercise + '|' + feed[m].date;
    var reactions = reactionMap[rKey] || { count: 0, emojis: [], fromNames: [] };
    feed[m].reactions = reactions.count;
    feed[m].reactionEmojis = reactions.emojis;
    feed[m].reactionFromNames = reactions.fromNames;
  }

  return respondWithCallback_(e, { feed: feed });
}

// ═══════════════════════════════════════════════════════
// Leaderboard — top est1RM per exercise
// ═══════════════════════════════════════════════════════
function handleLeaderboard_(e) {
  var exercise = e.parameter.exercise || '';
  var prsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PRs');
  var entries = [];

  if (prsSheet) {
    var data = prsSheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][2] === 'lift' && (!exercise || data[i][1] === exercise)) {
        entries.push({
          name: data[i][0],
          exercise: data[i][1],
          best: data[i][3],
          bestRaw: Number(data[i][4]) || 0,
          reps: Number(data[i][5]) || 0,
          date: data[i][6]
        });
      }
    }
  }

  // Group by exercise, sort each by bestRaw descending
  var byExercise = {};
  var exercises = [];
  for (var j = 0; j < entries.length; j++) {
    var ex = entries[j].exercise;
    if (!byExercise[ex]) { byExercise[ex] = []; exercises.push(ex); }
    byExercise[ex].push(entries[j]);
  }
  for (var k = 0; k < exercises.length; k++) {
    byExercise[exercises[k]].sort(function(a, b) { return b.bestRaw - a.bestRaw; });
  }

  return respondWithCallback_(e, { leaderboard: byExercise, exercises: exercises });
}

// ═══════════════════════════════════════════════════════
// All PRs — for community view
// ═══════════════════════════════════════════════════════
function handleAllPRs_(e) {
  var prsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PRs');
  var prs = [];

  if (prsSheet) {
    var data = prsSheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      prs.push({
        name: data[i][0],
        exercise: data[i][1],
        type: data[i][2],
        best: data[i][3],
        bestRaw: Number(data[i][4]) || 0,
        reps: Number(data[i][5]) || 0,
        date: data[i][6]
      });
    }
  }

  return respondWithCallback_(e, { prs: prs });
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
// Coach Login
// ═══════════════════════════════════════════════════════
function handleCoachLogin_(e) {
  var password = e.parameter.password || '';
  var valid = verifyCoach_(password);
  return respondWithCallback_(e, { valid: valid });
}

// ═══════════════════════════════════════════════════════
// Challenge CRUD
// ═══════════════════════════════════════════════════════
function handleCreateChallenge_(data) {
  if (!verifyCoach_(data.coachKey)) return jsonResponse_({ status: 'error', message: 'Unauthorized' });

  var sheet = getChallengesSheet_();
  var id = 'ch_' + new Date().getTime();
  var newRow = sheet.getLastRow() + 1;
  sheet.getRange(newRow, 1, 1, 12).setNumberFormat('@').setValues([[
    id,
    data.title || '',
    data.description || '',
    data.type || 'exercise_pr',       // exercise_pr | attendance | custom
    data.duration || 'monthly',       // weekly | biweekly | monthly
    data.startDate || todayStr_(),
    data.endDate || '',
    data.metric || '',                // exercise name or custom metric
    String(data.targetValue || ''),
    data.createdBy || 'Coach',
    new Date().toISOString(),
    'active'
  ]]);

  return jsonResponse_({ status: 'ok', id: id });
}

function handleUpdateChallenge_(data) {
  if (!verifyCoach_(data.coachKey)) return jsonResponse_({ status: 'error', message: 'Unauthorized' });

  var sheet = getChallengesSheet_();
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.id) {
      var r = i + 1;
      if (data.title) sheet.getRange(r, 2).setValue(data.title);
      if (data.description) sheet.getRange(r, 3).setValue(data.description);
      if (data.type) sheet.getRange(r, 4).setValue(data.type);
      if (data.duration) sheet.getRange(r, 5).setValue(data.duration);
      if (data.startDate) sheet.getRange(r, 6).setValue(data.startDate);
      if (data.endDate) sheet.getRange(r, 7).setValue(data.endDate);
      if (data.metric) sheet.getRange(r, 8).setValue(data.metric);
      if (data.targetValue !== undefined) sheet.getRange(r, 9).setValue(String(data.targetValue));
      if (data.status) sheet.getRange(r, 12).setValue(data.status);
      return jsonResponse_({ status: 'ok' });
    }
  }
  return jsonResponse_({ status: 'error', message: 'Challenge not found' });
}

function handleDeleteChallenge_(data) {
  if (!verifyCoach_(data.coachKey)) return jsonResponse_({ status: 'error', message: 'Unauthorized' });

  var sheet = getChallengesSheet_();
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.id) {
      sheet.getRange(i + 1, 12).setValue('deleted');
      return jsonResponse_({ status: 'ok' });
    }
  }
  return jsonResponse_({ status: 'error', message: 'Challenge not found' });
}

// --- Get active challenges (public) ---
function handleGetChallenges_(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Challenges');
  var challenges = [];
  var today = todayStr_();

  if (sheet) {
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][11] === 'active' && data[i][6] >= today) {
        challenges.push({
          id: data[i][0], title: data[i][1], description: data[i][2],
          type: data[i][3], duration: data[i][4],
          startDate: data[i][5], endDate: data[i][6],
          metric: data[i][7], targetValue: data[i][8]
        });
      }
    }
  }

  return respondWithCallback_(e, { challenges: challenges });
}

// --- Get ALL challenges (coach only) ---
function handleGetAllChallenges_(e) {
  if (!verifyCoach_(e.parameter.coachKey)) return respondWithCallback_(e, { error: 'Unauthorized' });

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Challenges');
  var challenges = [];

  if (sheet) {
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][11] !== 'deleted') {
        challenges.push({
          id: data[i][0], title: data[i][1], description: data[i][2],
          type: data[i][3], duration: data[i][4],
          startDate: data[i][5], endDate: data[i][6],
          metric: data[i][7], targetValue: data[i][8],
          createdBy: data[i][9], createdAt: data[i][10], status: data[i][11]
        });
      }
    }
  }

  return respondWithCallback_(e, { challenges: challenges });
}

// --- Challenge Leaderboard ---
function handleChallengeLeaderboard_(e) {
  var challengeId = e.parameter.challengeId || '';
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Challenges');
  if (!sheet) return respondWithCallback_(e, { leaderboard: [] });

  // Find challenge
  var challenge = null;
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === challengeId) {
      challenge = { type: data[i][3], startDate: data[i][5], endDate: data[i][6], metric: data[i][7] };
      break;
    }
  }
  if (!challenge) return respondWithCallback_(e, { leaderboard: [] });

  var leaderboard = [];

  if (challenge.type === 'exercise_pr') {
    // Rank by best PR for the exercise within date range
    var prsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PRs');
    var liftsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Lifts');
    var athleteBest = {};

    if (liftsSheet) {
      var lData = liftsSheet.getDataRange().getValues();
      for (var j = 1; j < lData.length; j++) {
        var lDate = String(lData[j][8]).slice(0, 10);
        if (lData[j][2] === challenge.metric && lDate >= challenge.startDate && lDate <= challenge.endDate) {
          var est = Number(lData[j][6]) || 0;
          var name = lData[j][1];
          if (!athleteBest[name] || est > athleteBest[name].value) {
            athleteBest[name] = { value: est, display: lData[j][3] + ' ' + lData[j][5] + ' x' + lData[j][4], date: lDate };
          }
        }
      }
    }

    var names = Object.keys(athleteBest);
    names.sort(function(a, b) { return athleteBest[b].value - athleteBest[a].value; });
    for (var k = 0; k < names.length; k++) {
      leaderboard.push({ name: names[k], value: athleteBest[names[k]].value, display: athleteBest[names[k]].display, date: athleteBest[names[k]].date });
    }

  } else if (challenge.type === 'attendance') {
    // Count unique workout dates per athlete
    var athleteDays = {};
    var sheets = ['Lifts', 'Results', 'Benchmarks'];
    var dateCols = { 'Lifts': 8, 'Results': 4, 'Benchmarks': 8 };

    for (var s = 0; s < sheets.length; s++) {
      var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheets[s]);
      if (!sh) continue;
      var sData = sh.getDataRange().getValues();
      var dateCol = dateCols[sheets[s]];
      for (var r = 1; r < sData.length; r++) {
        var rDate = String(sData[r][dateCol]).slice(0, 10);
        if (rDate >= challenge.startDate && rDate <= challenge.endDate) {
          var aName = sData[r][1];
          if (!athleteDays[aName]) athleteDays[aName] = {};
          athleteDays[aName][rDate] = true;
        }
      }
    }

    var aNames = Object.keys(athleteDays);
    aNames.sort(function(a, b) { return Object.keys(athleteDays[b]).length - Object.keys(athleteDays[a]).length; });
    for (var m = 0; m < aNames.length; m++) {
      var days = Object.keys(athleteDays[aNames[m]]).length;
      leaderboard.push({ name: aNames[m], value: days, display: days + ' ימים', date: '' });
    }

  } else {
    // Custom: use PRs count in period
    var allLifts = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Lifts');
    var allBench = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Benchmarks');
    var prCount = {};

    if (allLifts) {
      var ld = allLifts.getDataRange().getValues();
      for (var li = 1; li < ld.length; li++) {
        var liDate = String(ld[li][8]).slice(0, 10);
        if (ld[li][7] === 'TRUE' && liDate >= challenge.startDate && liDate <= challenge.endDate) {
          prCount[ld[li][1]] = (prCount[ld[li][1]] || 0) + 1;
        }
      }
    }
    if (allBench) {
      var bd = allBench.getDataRange().getValues();
      for (var bi = 1; bi < bd.length; bi++) {
        var biDate = String(bd[bi][8]).slice(0, 10);
        if (bd[bi][7] === 'TRUE' && biDate >= challenge.startDate && biDate <= challenge.endDate) {
          prCount[bd[bi][1]] = (prCount[bd[bi][1]] || 0) + 1;
        }
      }
    }

    var pNames = Object.keys(prCount);
    pNames.sort(function(a, b) { return prCount[b] - prCount[a]; });
    for (var pi = 0; pi < pNames.length; pi++) {
      leaderboard.push({ name: pNames[pi], value: prCount[pNames[pi]], display: prCount[pNames[pi]] + ' שיאים', date: '' });
    }
  }

  return respondWithCallback_(e, { leaderboard: leaderboard, challengeId: challengeId });
}

// ═══════════════════════════════════════════════════════
// Badges
// ═══════════════════════════════════════════════════════
var BADGE_DEFINITIONS = [
  { id: 'first_pr', name: 'שיא ראשון! 🎯', desc: 'שברת את השיא האישי הראשון שלך', icon: '🎯',
    check: function(prs) { return prs.length >= 1; } },
  { id: 'prs_5', name: '5 שיאים 🌟', desc: '5 שיאים אישיים', icon: '🌟',
    check: function(prs) { return prs.length >= 5; } },
  { id: 'prs_10', name: '10 שיאים ⭐', desc: '10 שיאים אישיים', icon: '⭐',
    check: function(prs) { return prs.length >= 10; } },
  { id: 'prs_20', name: '20 שיאים 💫', desc: '20 שיאים אישיים', icon: '💫',
    check: function(prs) { return prs.length >= 20; } },
  { id: 'squat_100', name: 'מועדון 100 ק"ג סקוואט 🏋️', desc: 'Back Squat מעל 100 ק"ג', icon: '🏋️',
    check: function(prs) { return prs.some(function(p) { return p.exercise === 'Back Squat' && p.bestRaw >= 100; }); } },
  { id: 'squat_140', name: 'מועדון 140 ק"ג סקוואט 💪', desc: 'Back Squat מעל 140 ק"ג', icon: '💪',
    check: function(prs) { return prs.some(function(p) { return p.exercise === 'Back Squat' && p.bestRaw >= 140; }); } },
  { id: 'deadlift_140', name: 'מועדון 140 ק"ג מתים 🔥', desc: 'Deadlift מעל 140 ק"ג', icon: '🔥',
    check: function(prs) { return prs.some(function(p) { return p.exercise === 'Deadlift' && p.bestRaw >= 140; }); } },
  { id: 'deadlift_180', name: 'מועדון 180 ק"ג מתים 👑', desc: 'Deadlift מעל 180 ק"ג', icon: '👑',
    check: function(prs) { return prs.some(function(p) { return p.exercise === 'Deadlift' && p.bestRaw >= 180; }); } },
  { id: 'clean_100', name: 'מועדון 100 ק"ג קלין 🎖️', desc: 'Clean מעל 100 ק"ג', icon: '🎖️',
    check: function(prs) { return prs.some(function(p) { return p.exercise === 'Clean' && p.bestRaw >= 100; }); } },
  { id: 'snatch_80', name: 'מועדון 80 ק"ג סנאצ\' 🏅', desc: 'Snatch מעל 80 ק"ג', icon: '🏅',
    check: function(prs) { return prs.some(function(p) { return p.exercise === 'Snatch' && p.bestRaw >= 80; }); } },
  { id: 'bench_100', name: 'מועדון 100 ק"ג לחיצת חזה 💎', desc: 'Bench Press מעל 100 ק"ג', icon: '💎',
    check: function(prs) { return prs.some(function(p) { return p.exercise === 'Bench Press' && p.bestRaw >= 100; }); } }
];

function calculateBadgesForAthlete_(athleteName) {
  var prsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PRs');
  var prs = [];
  if (prsSheet) {
    var data = prsSheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === athleteName) {
        prs.push({ exercise: data[i][1], type: data[i][2], bestRaw: Number(data[i][4]) || 0 });
      }
    }
  }

  var earned = [];
  for (var j = 0; j < BADGE_DEFINITIONS.length; j++) {
    if (BADGE_DEFINITIONS[j].check(prs)) {
      earned.push({ id: BADGE_DEFINITIONS[j].id, name: BADGE_DEFINITIONS[j].name, desc: BADGE_DEFINITIONS[j].desc, icon: BADGE_DEFINITIONS[j].icon });
    }
  }
  return earned;
}

function persistNewBadges_(athleteName) {
  var earned = calculateBadgesForAthlete_(athleteName);
  var badgesSheet = getBadgesSheet_();
  var existing = badgesSheet.getDataRange().getValues();
  var existingIds = {};
  for (var i = 1; i < existing.length; i++) {
    if (existing[i][1] === athleteName) existingIds[existing[i][2]] = true;
  }

  var newBadges = [];
  for (var j = 0; j < earned.length; j++) {
    if (!existingIds[earned[j].id]) {
      var newRow = badgesSheet.getLastRow() + 1;
      badgesSheet.getRange(newRow, 1, 1, 7).setNumberFormat('@').setValues([[
        new Date().toISOString(), athleteName, earned[j].id, earned[j].name, earned[j].desc, todayStr_(), ''
      ]]);
      newBadges.push(earned[j]);
    }
  }
  return newBadges;
}

// --- Get badges for athlete ---
function handleGetBadges_(e) {
  var name = e.parameter.name || '';
  // Calculate live + persist any new ones
  var earned = calculateBadgesForAthlete_(name);

  // Also get manually awarded badges from sheet
  var badgesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Badges');
  var manual = [];
  if (badgesSheet) {
    var data = badgesSheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][1] === name) {
        // Check if it's a manual badge (not in BADGE_DEFINITIONS)
        var isAuto = false;
        for (var j = 0; j < BADGE_DEFINITIONS.length; j++) {
          if (BADGE_DEFINITIONS[j].id === data[i][2]) { isAuto = true; break; }
        }
        if (!isAuto) {
          manual.push({ id: data[i][2], name: data[i][3], desc: data[i][4], icon: '🏅', earnedDate: data[i][5] });
        }
      }
    }
  }

  var allBadges = earned.concat(manual);
  return respondWithCallback_(e, { badges: allBadges, name: name });
}

// --- Manually award badge (coach) ---
function handleAwardBadge_(data) {
  if (!verifyCoach_(data.coachKey)) return jsonResponse_({ status: 'error', message: 'Unauthorized' });

  var sheet = getBadgesSheet_();
  var newRow = sheet.getLastRow() + 1;
  var badgeId = 'manual_' + new Date().getTime();
  sheet.getRange(newRow, 1, 1, 7).setNumberFormat('@').setValues([[
    new Date().toISOString(), data.athleteName || '', badgeId,
    data.badgeName || '', data.description || '', todayStr_(), data.data || ''
  ]]);
  return jsonResponse_({ status: 'ok', badgeId: badgeId });
}

// --- Recalculate badges for all athletes (coach) ---
function handleRecalcBadges_(e) {
  if (!verifyCoach_(e.parameter.coachKey)) return respondWithCallback_(e, { error: 'Unauthorized' });

  var prsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PRs');
  if (!prsSheet) return respondWithCallback_(e, { recalculated: 0 });

  var data = prsSheet.getDataRange().getValues();
  var athletes = {};
  for (var i = 1; i < data.length; i++) {
    athletes[data[i][0]] = true;
  }

  var totalNew = 0;
  var names = Object.keys(athletes);
  for (var j = 0; j < names.length; j++) {
    var newBadges = persistNewBadges_(names[j]);
    totalNew += newBadges.length;
  }

  return respondWithCallback_(e, { recalculated: names.length, newBadges: totalNew });
}

// --- Get all athletes (coach) ---
function handleGetAllAthletes_(e) {
  if (!verifyCoach_(e.parameter.coachKey)) return respondWithCallback_(e, { error: 'Unauthorized' });

  var athleteMap = {};

  // Scan PRs
  var prsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PRs');
  if (prsSheet) {
    var pData = prsSheet.getDataRange().getValues();
    for (var i = 1; i < pData.length; i++) {
      var n = pData[i][0];
      if (!athleteMap[n]) athleteMap[n] = { prs: 0, lifts: 0, lastActive: '' };
      athleteMap[n].prs++;
      if (pData[i][6] > athleteMap[n].lastActive) athleteMap[n].lastActive = pData[i][6];
    }
  }

  // Scan Lifts for count
  var liftsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Lifts');
  if (liftsSheet) {
    var lData = liftsSheet.getDataRange().getValues();
    for (var j = 1; j < lData.length; j++) {
      var ln = lData[j][1];
      if (!athleteMap[ln]) athleteMap[ln] = { prs: 0, lifts: 0, lastActive: '' };
      athleteMap[ln].lifts++;
      var ld = String(lData[j][8]).slice(0, 10);
      if (ld > athleteMap[ln].lastActive) athleteMap[ln].lastActive = ld;
    }
  }

  var athletes = [];
  var names = Object.keys(athleteMap);
  for (var k = 0; k < names.length; k++) {
    athletes.push({
      name: names[k],
      prs: athleteMap[names[k]].prs,
      lifts: athleteMap[names[k]].lifts,
      lastActive: athleteMap[names[k]].lastActive
    });
  }

  athletes.sort(function(a, b) { return a.lastActive < b.lastActive ? 1 : -1; });
  return respondWithCallback_(e, { athletes: athletes });
}

// ═══════════════════════════════════════════════════════
// Auto-badge check on PR (called after lift/benchmark POST)
// ═══════════════════════════════════════════════════════
function checkBadgesAfterPR_(athleteName) {
  try { persistNewBadges_(athleteName); } catch(err) {}
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
