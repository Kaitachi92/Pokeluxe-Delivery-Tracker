const SHEET_NAME = "Pedidos";

function getSheet() {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = spreadsheet.getSheetByName(SHEET_NAME);

    if (!sheet) {
        sheet = spreadsheet.insertSheet(SHEET_NAME);
    }

    return sheet;
}

function doGet() {
    const sheet = getSheet();
    const rawValue = sheet.getRange("A1").getValue();
    const orders = rawValue ? JSON.parse(rawValue) : [];

    return ContentService
        .createTextOutput(JSON.stringify({ orders }))
        .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
    const payload = JSON.parse(e.postData.contents || "{}");
    const orders = Array.isArray(payload.orders) ? payload.orders : [];
    const sheet = getSheet();

    sheet.getRange("A1").setValue(JSON.stringify(orders));

    return ContentService
        .createTextOutput(JSON.stringify({ ok: true, count: orders.length }))
        .setMimeType(ContentService.MimeType.JSON);
}