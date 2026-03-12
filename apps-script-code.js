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
// ═══════════════════════════════════════════════════════

function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Results');

  // Create Results tab if it doesn't exist
  if (!sheet) {
    sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet('Results');
    sheet.appendRow(['Timestamp', 'Name', 'Score', 'ScoreType', 'WorkoutDate', 'RawValue', 'Rx']);
    // Format header row
    sheet.getRange(1, 1, 1, 7).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  // Support both JSON body (fetch) and form-encoded payload (form submit)
  var raw = '';
  if (e.parameter && e.parameter.payload) {
    raw = e.parameter.payload;
  } else if (e.postData && e.postData.contents) {
    raw = e.postData.contents;
  }
  var data = JSON.parse(raw);

  sheet.appendRow([
    new Date().toISOString(),
    data.name || '',
    data.score || '',
    data.scoreType || 'time',
    data.workoutDate || new Date().toISOString().slice(0, 10),
    data.rawValue || 0,
    data.rx || 'Rx'
  ]);

  return ContentService.createTextOutput(JSON.stringify({ status: 'ok' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Results');

  if (!sheet) {
    var json = JSON.stringify({ results: [] });
    var callback = e.parameter.callback;
    if (callback) {
      return ContentService.createTextOutput(callback + '(' + json + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(json)
      .setMimeType(ContentService.MimeType.JSON);
  }

  var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  var dateFilter = e.parameter.date || Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var data = sheet.getDataRange().getValues();
  var results = [];

  // Skip header row (i=0)
  for (var i = 1; i < data.length; i++) {
    var rowDate = data[i][4]; // WorkoutDate column
    // Use spreadsheet timezone (not UTC) to avoid date shift
    if (rowDate instanceof Date) {
      rowDate = Utilities.formatDate(rowDate, tz, 'yyyy-MM-dd');
    }
    if (String(rowDate) === dateFilter) {
      results.push({
        timestamp: data[i][0],
        name: data[i][1],
        score: data[i][2],
        scoreType: data[i][3],
        rawValue: data[i][5],
        rx: data[i][6] || 'Rx'
      });
    }
  }

  var json = JSON.stringify({ results: results, date: dateFilter });
  var callback = e.parameter.callback;
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}
