// ================================================================
// Golden Hands Factory ERP - Google Apps Script Backend
// نظام إدارة مصنع الأيدي الذهبية - الواجهة الخلفية
// ================================================================

// ── إعدادات عامة ──────────────────────────────────────────────
const SPREADSHEET_ID = "19vs2X21rcEAazTFmlfLcgT2hdieIuYsuV_-_k-_K7Hk"; // ضع هنا ID الـ Google Sheet
const API_KEY        = "GH_FACTORY_2026_X9K2L";    // مفتاح الـ API - غيّره لشيء أقوى

// أسماء الشيتات كما هي في الـ Spreadsheet
const SHEETS = {
  orders    : "اوردرات",
  clients   : "حسابات العملاء ",
  accounts  : "الحسابات",
  inventory : "المخزن",
  attendance: "الحضور",
  salaries  : "المرتبات",
  invoices  : "فواتير",
  purchases : "فواتير الشراء",
  profit    : "الربح",
  stages    : "راحل الانا ",
  bom       : "BOM",
  workerKPIs: "Worker_KPIs",
  users     : "Users"          // شيت المستخدمين - يُنشأ تلقائياً
};

// ── نقطة الدخول GET ───────────────────────────────────────────
function doGet(e) {
  if (!e || !e.parameter) {
    return jsonResponse({
      success: false,
      error: "طلب GET غير صالح. شغّل الـ Web App عبر الرابط وليس من زر Run داخل المحرر."
    }, 400);
  }

  const params = e.parameter || {};

  // التحقق من مفتاح API
  if (!isValidApiKey(extractApiKey(params))) {
    return jsonResponse({ success: false, error: "مفتاح API غير صحيح" }, 403);
  }

  const action = params.action || "read";
  const sheet  = params.sheet  || "orders";

  try {
    switch (action) {
      case "read":         return jsonResponse(readSheet(sheet));
      case "dashboard":    return jsonResponse(getDashboardData());
      default:              return jsonResponse({ success: false, error: "إجراء غير معروف" }, 400);
    }
  } catch (err) {
    return jsonResponse({ success: false, error: err.message || String(err) }, 500);
  }
}

// ── نقطة الدخول POST ──────────────────────────────────────────
function doPost(e) {
  if (!e) {
    return jsonResponse({
      success: false,
      error: "طلب POST غير صالح. شغّل الـ Web App عبر الرابط وليس من زر Run داخل المحرر."
    }, 400);
  }

  try {
    const parsed = parseRequestPayload(e);

    if (!parsed.success) {
      return jsonResponse({ success: false, error: parsed.error }, 400);
    }

    const body = parsed.data || {};

    // التحقق من مفتاح API
    if (!isValidApiKey(extractApiKey(body))) {
      return jsonResponse({ success: false, error: "مفتاح API غير صحيح" }, 403);
    }

    const { action, sheet, data, id } = body;

    switch (action) {
      case "create":
        if (!sheet || !data || typeof data !== "object") {
          return jsonResponse({ success: false, error: "بيانات create غير مكتملة" }, 400);
        }
        return jsonResponse(createRow(sheet, data));

      case "update":
        if (!sheet || id === undefined || !data || typeof data !== "object") {
          return jsonResponse({ success: false, error: "بيانات update غير مكتملة" }, 400);
        }
        return jsonResponse(updateRow(sheet, id, data));

      case "delete":
        if (!sheet || id === undefined) {
          return jsonResponse({ success: false, error: "بيانات delete غير مكتملة" }, 400);
        }
        return jsonResponse(deleteRow(sheet, id));

      case "login":
        return jsonResponse(loginUser(body.username, body.password));

      case "createUser":
        return jsonResponse(createUser(body.userData, body.requestedBy));

      case "updateUser":
        return jsonResponse(updateUser(body.userId, body.userData, body.requestedBy));

      case "deleteUser":
        return jsonResponse(deleteUser(body.userId, body.requestedBy));

      case "getUsers":
        return jsonResponse(getUsers(body.requestedBy));

      default:
        return jsonResponse({ success: false, error: "إجراء غير معروف" }, 400);
    }
  } catch (err) {
    return jsonResponse({ success: false, error: err.message || String(err) }, 500);
  }
}

// فك طلبات POST بأمان (JSON أولاً، ثم fallback على parameter)
function parseRequestPayload(e) {
  if (!e) {
    return { success: false, error: "الطلب فارغ" };
  }

  const postData = e.postData || {};
  const raw = typeof postData.contents === "string" ? postData.contents.trim() : "";

  // الحالة الأساسية: جسم JSON
  if (raw) {
    try {
      // إزالة BOM لو موجود
      const cleaned = raw.replace(/^\uFEFF/, "");
      const parsed = JSON.parse(cleaned);

      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { success: false, error: "JSON يجب أن يكون كائن object" };
      }

      // بعض العملاء يرسلون payload كنص JSON داخل حقل payload
      if (typeof parsed.payload === "string") {
        try {
          const nested = JSON.parse(parsed.payload);
          if (nested && typeof nested === "object" && !Array.isArray(nested)) {
            return { success: true, data: nested };
          }
        } catch (_) {
          // تجاهل وكمّل بالـ parsed العادي
        }
      }

      return { success: true, data: parsed };
    } catch (err) {
      return { success: false, error: "JSON غير صالح" };
    }
  }

  // fallback: بعض العملاء يرسلون form-data / query params
  if (e.parameter && Object.keys(e.parameter).length > 0) {
    return { success: true, data: e.parameter };
  }

  return { success: false, error: "لا توجد بيانات في الطلب" };
}

function isValidApiKey(candidate) {
  return String(candidate || "").trim() === String(API_KEY).trim();
}

function extractApiKey(obj) {
  if (!obj || typeof obj !== "object") return "";
  return obj.apiKey || obj.api_key || obj.key || "";
}

// ================================================================
// CRUD الأساسي
// ================================================================

// قراءة كل البيانات من شيت معيّن
function readSheet(sheetName) {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh    = ss.getSheetByName(SHEETS[sheetName] || sheetName);
  if (!sh) return { success: false, error: `الشيت "${sheetName}" غير موجود` };

  const data  = sh.getDataRange().getValues();
  if (data.length < 2) return { success: true, headers: data[0] || [], rows: [] };

  const headers = data[0].map(String);
  const rows    = data.slice(1)
    .filter(r => r.some(c => c !== "" && c !== null))
    .map((r, i) => {
      const obj = { _rowIndex: i + 2 }; // 1-indexed, نبدأ من صف 2
      headers.forEach((h, j) => {
        const val = r[j];
        obj[h] = val instanceof Date ? val.toISOString().split("T")[0] : val;
      });
      return obj;
    });

  return { success: true, headers, rows };
}

// إضافة صف جديد
function createRow(sheetName, data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = ss.getSheetByName(SHEETS[sheetName] || sheetName);
  if (!sh) return { success: false, error: `الشيت "${sheetName}" غير موجود` };

  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];

  // توليد id تلقائي إذا كان العمود الأول "id" أو يحتوي على "رقم"
  const idCol = headers[0];
  if (!data[idCol] && (String(idCol).includes("رقم") || String(idCol).toLowerCase() === "id")) {
    const lastRow = sh.getLastRow();
    if (lastRow > 1) {
      const lastId = sh.getRange(lastRow, 1).getValue();
      data[idCol] = (parseFloat(lastId) || 0) + 1;
    } else {
      data[idCol] = 1;
    }
  }

  const row = headers.map(h => data[h] !== undefined ? data[h] : "");
  sh.appendRow(row);

  return { success: true, message: "تمت الإضافة بنجاح", newId: data[idCol] };
}

// تحديث صف بناءً على id في العمود الأول
function updateRow(sheetName, id, data) {
  const ss   = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh   = ss.getSheetByName(SHEETS[sheetName] || sheetName);
  if (!sh) return { success: false, error: `الشيت "${sheetName}" غير موجود` };

  const allData = sh.getDataRange().getValues();
  const headers = allData[0];

  for (let i = 1; i < allData.length; i++) {
    if (String(allData[i][0]) === String(id)) {
      const updatedRow = headers.map((h, j) => data[h] !== undefined ? data[h] : allData[i][j]);
      sh.getRange(i + 1, 1, 1, headers.length).setValues([updatedRow]);
      return { success: true, message: "تم التحديث بنجاح" };
    }
  }
  return { success: false, error: "السجل غير موجود" };
}

// حذف صف بناءً على id في العمود الأول
function deleteRow(sheetName, id) {
  const ss   = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh   = ss.getSheetByName(SHEETS[sheetName] || sheetName);
  if (!sh) return { success: false, error: `الشيت "${sheetName}" غير موجود` };

  const allData = sh.getDataRange().getValues();

  for (let i = 1; i < allData.length; i++) {
    if (String(allData[i][0]) === String(id)) {
      sh.deleteRow(i + 1);
      return { success: true, message: "تم الحذف بنجاح" };
    }
  }
  return { success: false, error: "السجل غير موجود" };
}

// ================================================================
// بيانات الداشبورد
// ================================================================

function getDashboardData() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // اوردرات
  const ordersSh   = ss.getSheetByName(SHEETS.orders);
  const ordersData = ordersSh ? ordersSh.getDataRange().getValues() : [];
  const orders     = ordersData.slice(1).filter(r => r[0]);

  // المخزن
  const invSh   = ss.getSheetByName(SHEETS.inventory);
  const invData = invSh ? invSh.getDataRange().getValues() : [];
  const invRows = invData.slice(1).filter(r => r[0]);
  const lowStock = invRows.filter(r => String(r[6]).includes("منخفض")).length;

  // المرتبات
  const salSh   = ss.getSheetByName(SHEETS.salaries);
  const salData = salSh ? salSh.getDataRange().getValues() : [];
  const salRows = salData.slice(1).filter(r => r[0]);
  const totalSalaries = salRows.reduce((s, r) => s + (parseFloat(r[10]) || 0), 0);

  // حسابات العملاء
  const clientSh   = ss.getSheetByName(SHEETS.clients);
  const clientData = clientSh ? clientSh.getDataRange().getValues() : [];
  const clientRows = clientData.slice(1).filter(r => r[0]);
  const totalDue   = clientRows.reduce((s, r) => s + (parseFloat(r[4]) || 0), 0);

  return {
    success: true,
    stats: {
      totalOrders    : orders.length,
      activeOrders   : orders.filter(r => r[13] === "قيد التنفيذ").length,
      lowStockItems  : lowStock,
      totalSalaries  : totalSalaries,
      totalDue       : totalDue
    }
  };
}

// ================================================================
// إدارة المستخدمين
// ================================================================

function ensureUsersSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh   = ss.getSheetByName(SHEETS.users);

  if (!sh) {
    sh = ss.insertSheet(SHEETS.users);
    // رأس الأعمدة
    sh.appendRow(["id", "username", "password", "role", "createdAt", "active"]);
    // مستخدم admin افتراضي
    sh.appendRow([1, "mahmoud", "admin", "admin", new Date().toISOString(), true]);
    // مستخدم ثانٍ
    sh.appendRow([2, "user2", "user123", "viewer", new Date().toISOString(), true]);
    // تأمين الشيت من المشاهدة العادية
    sh.hideSheet();
  }
  return sh;
}

function loginUser(username, password) {
  const sh      = ensureUsersSheet();
  const data    = sh.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[1]) === username && String(row[2]) === password && row[5] !== false) {
      return {
        success  : true,
        user     : {
          id      : row[0],
          username: row[1],
          role    : row[3]
        }
      };
    }
  }
  return { success: false, error: "اسم المستخدم أو كلمة المرور غير صحيحة" };
}

function getUsers(requestedBy) {
  if (!isAdmin(requestedBy)) return { success: false, error: "صلاحيات غير كافية" };

  const sh   = ensureUsersSheet();
  const data = sh.getDataRange().getValues();

  const users = data.slice(1).filter(r => r[0]).map(r => ({
    id       : r[0],
    username : r[1],
    role     : r[3],
    createdAt: r[4],
    active   : r[5]
  }));

  return { success: true, users };
}

function createUser(userData, requestedBy) {
  if (!isAdmin(requestedBy)) return { success: false, error: "صلاحيات غير كافية" };

  const sh   = ensureUsersSheet();
  const data = sh.getDataRange().getValues();

  // تحقق أن اسم المستخدم غير مكرر
  const exists = data.slice(1).some(r => String(r[1]) === userData.username);
  if (exists) return { success: false, error: "اسم المستخدم موجود مسبقاً" };

  const lastId = data.slice(1).reduce((max, r) => Math.max(max, parseFloat(r[0]) || 0), 0);
  const newId  = lastId + 1;

  sh.appendRow([newId, userData.username, userData.password, userData.role || "viewer", new Date().toISOString(), true]);
  return { success: true, message: "تم إنشاء المستخدم بنجاح", id: newId };
}

function updateUser(userId, userData, requestedBy) {
  if (!isAdmin(requestedBy)) return { success: false, error: "صلاحيات غير كافية" };

  const sh   = ensureUsersSheet();
  const data = sh.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(userId)) {
      if (userData.username) sh.getRange(i + 1, 2).setValue(userData.username);
      if (userData.password) sh.getRange(i + 1, 3).setValue(userData.password);
      if (userData.role)     sh.getRange(i + 1, 4).setValue(userData.role);
      if (userData.active !== undefined) sh.getRange(i + 1, 6).setValue(userData.active);
      return { success: true, message: "تم تحديث المستخدم بنجاح" };
    }
  }
  return { success: false, error: "المستخدم غير موجود" };
}

function deleteUser(userId, requestedBy) {
  if (!isAdmin(requestedBy)) return { success: false, error: "صلاحيات غير كافية" };

  const sh   = ensureUsersSheet();
  const data = sh.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(userId)) {
      // لا نحذف المستخدم الأول (mahmoud/admin)
      if (data[i][1] === "mahmoud") return { success: false, error: "لا يمكن حذف المستخدم الرئيسي" };
      sh.deleteRow(i + 1);
      return { success: true, message: "تم حذف المستخدم بنجاح" };
    }
  }
  return { success: false, error: "المستخدم غير موجود" };
}

// التحقق إذا كان المستخدم admin
function isAdmin(username) {
  if (!username) return false;
  const sh   = ensureUsersSheet();
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]) === username && data[i][3] === "admin") return true;
  }
  return false;
}

// ================================================================
// مساعد JSON
// ================================================================
function jsonResponse(data, statusCode) {
  // Google Apps Script Web App لا يدعم تغيير HTTP status عبر ContentService مباشرة.
  // نُعيد statusCode داخل JSON للحفاظ على التشخيص من جهة العميل.
  const payload = (data && typeof data === "object") ? data : { success: false, error: "استجابة غير صالحة" };
  if (statusCode !== undefined && payload.statusCode === undefined) {
    payload.statusCode = statusCode;
  }

  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
