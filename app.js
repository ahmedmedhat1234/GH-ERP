// ================================================================
//  Golden Hands Factory ERP — app.js
//  مصنع الأيدي الذهبية — منطق التطبيق
// ================================================================

// ── إعداد الـ API ────────────────────────────────────────────
// ⚠️ بعد نشر الـ Apps Script، ضع الرابط هنا:
const API_URL = "https://script.google.com/macros/s/AKfycbxEs4n3fnHEJNDRXEnhNl8Q3BeHF1ST8kAAJTbBIBv2gflIBy67LduL-vUumil3BqEUfw/exec";
const API_KEY = "GH_FACTORY_2024_SECRET"; // نفس المفتاح في Code.gs

// ── حالة التطبيق ─────────────────────────────────────────────
let currentUser  = null;  // المستخدم الحالي
let currentPage  = null;  // الصفحة الحالية
let currentData  = [];    // البيانات المحمّلة
let editingId    = null;  // id السجل الذي يُعدَّل

// ── تعريف الصفحات (الشيتات) ──────────────────────────────────
const PAGES = {
  dashboard  : { title: "لوحة التحكم",         icon: "📊" },
  orders     : { title: "الأوردرات",            icon: "📋", sheet: "orders"     },
  clients    : { title: "حسابات العملاء",       icon: "👥", sheet: "clients"    },
  invoices   : { title: "الفواتير",             icon: "🧾", sheet: "invoices"   },
  inventory  : { title: "المخزن",               icon: "📦", sheet: "inventory"  },
  stages     : { title: "مراحل الإنتاج",        icon: "⚙️", sheet: "stages"     },
  bom        : { title: "BOM",                  icon: "📐", sheet: "bom"        },
  attendance : { title: "الحضور والانصراف",     icon: "🕐", sheet: "attendance" },
  salaries   : { title: "المرتبات",             icon: "💰", sheet: "salaries"   },
  workerKPIs : { title: "أداء العمال",           icon: "📈", sheet: "workerKPIs" },
  accounts   : { title: "الحسابات",             icon: "📒", sheet: "accounts"   },
  purchases  : { title: "فواتير الشراء",        icon: "🛒", sheet: "purchases"  },
  profit     : { title: "الأرباح",              icon: "💹", sheet: "profit"     },
  users      : { title: "إدارة المستخدمين",     icon: "🔐"                      },
};

// ================================================================
//  تسجيل الدخول / الخروج
// ================================================================

/** معالجة نموذج تسجيل الدخول */
async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value;
  const errEl    = document.getElementById("login-error");
  const btn      = document.getElementById("login-btn");
  const btnText  = document.getElementById("login-btn-text");
  const spinner  = document.getElementById("login-spinner");

  errEl.classList.add("hidden");
  btn.disabled = true;
  btnText.textContent = "جارٍ التحقق…";
  spinner.classList.remove("hidden");

  try {
    const res = await apiPost({ action: "login", username, password });
    if (res.success) {
      currentUser = res.user;
      localStorage.setItem("erp_user", JSON.stringify(currentUser));
      showApp();
    } else {
      errEl.textContent = res.error || "بيانات غير صحيحة";
      errEl.classList.remove("hidden");
    }
  } catch {
    errEl.textContent = "تعذّر الاتصال بالخادم. تحقق من الرابط في app.js";
    errEl.classList.remove("hidden");
  } finally {
    btn.disabled = false;
    btnText.textContent = "تسجيل الدخول";
    spinner.classList.add("hidden");
  }
}

/** عرض التطبيق بعد الدخول */
function showApp() {
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");

  // تحديث معلومات المستخدم في الواجهة
  document.getElementById("sidebar-username").textContent = currentUser.username;
  document.getElementById("sidebar-role").textContent =
    currentUser.role === "admin" ? "مدير النظام" : "مستخدم";
  document.getElementById("top-username").textContent = `👤 ${currentUser.username}`;

  // إظهار قسم إدارة المستخدمين للـ admin فقط
  if (currentUser.role === "admin") {
    document.querySelectorAll(".admin-only").forEach(el => el.classList.remove("hidden"));
  }

  navigateTo("dashboard");
}

/** تسجيل الخروج */
function handleLogout() {
  currentUser = null;
  localStorage.removeItem("erp_user");
  document.getElementById("app").classList.add("hidden");
  document.getElementById("login-screen").classList.remove("hidden");
  document.getElementById("login-username").value = "";
  document.getElementById("login-password").value = "";
  closeSidebarMobile();
}

// ── تحقق من جلسة محفوظة ──────────────────────────────────────
(function checkSavedSession() {
  const saved = localStorage.getItem("erp_user");
  if (saved) {
    try { currentUser = JSON.parse(saved); showApp(); return; } catch {}
  }
})();

// ================================================================
//  التنقل بين الصفحات
// ================================================================

function navigateTo(page) {
  currentPage = page;
  const info  = PAGES[page] || {};

  // تحديث العنوان
  document.getElementById("page-title").textContent = `${info.icon || ""} ${info.title || page}`;

  // تحديث الـ nav
  document.querySelectorAll(".nav-item").forEach(el => {
    el.classList.toggle("active", el.dataset.page === page);
  });

  closeSidebarMobile();

  // عرض المحتوى
  if (page === "dashboard") renderDashboard();
  else if (page === "users")     renderUsersPage();
  else renderSheetPage(page, info.sheet);
}

// ================================================================
//  لوحة التحكم
// ================================================================

async function renderDashboard() {
  const area = document.getElementById("content-area");
  area.innerHTML = `<div class="loading-state"><div class="spinner"></div> جارٍ تحميل البيانات…</div>`;

  try {
    const res = await apiGet({ action: "dashboard" });
    if (!res.success) throw new Error(res.error);

    const s = res.stats;
    area.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon">📋</div>
          <div class="stat-value">${s.totalOrders}</div>
          <div class="stat-label">إجمالي الأوردرات</div>
        </div>
        <div class="stat-card green">
          <div class="stat-icon">⚙️</div>
          <div class="stat-value">${s.activeOrders}</div>
          <div class="stat-label">أوردرات قيد التنفيذ</div>
        </div>
        <div class="stat-card red">
          <div class="stat-icon">⚠️</div>
          <div class="stat-value">${s.lowStockItems}</div>
          <div class="stat-label">أصناف مخزن منخفضة</div>
        </div>
        <div class="stat-card orange">
          <div class="stat-icon">💰</div>
          <div class="stat-value">${formatNum(s.totalSalaries)}</div>
          <div class="stat-label">إجمالي المرتبات</div>
        </div>
        <div class="stat-card purple">
          <div class="stat-icon">💳</div>
          <div class="stat-value">${formatNum(s.totalDue)}</div>
          <div class="stat-label">إجمالي المدفوعات</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title">🔗 روابط سريعة</div>
        </div>
        <div class="stats-grid" style="margin:0">
          ${Object.entries(PAGES).filter(([k]) => k !== "dashboard").map(([k,v]) => `
            <a onclick="navigateTo('${k}')" class="stat-card" style="cursor:pointer;border-color:#e2e8f0;padding:.9rem;gap:.3rem">
              <div style="font-size:1.6rem">${v.icon || "📄"}</div>
              <div style="font-size:.88rem;font-weight:600">${v.title}</div>
            </a>
          `).join("")}
        </div>
      </div>
    `;
  } catch (err) {
    area.innerHTML = errorBlock(err.message);
  }
}

// ================================================================
//  صفحة شيت عامة (قراءة + إضافة + تعديل + حذف)
// ================================================================

async function renderSheetPage(page, sheetKey) {
  const area = document.getElementById("content-area");
  area.innerHTML = `<div class="loading-state"><div class="spinner"></div> جارٍ التحميل…</div>`;

  try {
    const res = await apiGet({ action: "read", sheet: sheetKey });
    if (!res.success) throw new Error(res.error);

    currentData = res.rows || [];
    const headers = res.headers || [];

    area.innerHTML = `
      <div class="card">
        <div class="toolbar">
          <button class="btn btn-primary" onclick="openAddModal('${page}','${sheetKey}',${JSON.stringify(headers).replace(/"/g,"'")})">
            ＋ إضافة سجل
          </button>
          <input type="text" class="search-input" placeholder="🔍 بحث…" oninput="filterTable(this.value)" />
        </div>
        <div class="table-wrapper" id="table-wrapper">
          ${renderTable(headers, currentData, page, sheetKey)}
        </div>
      </div>
    `;
  } catch (err) {
    area.innerHTML = errorBlock(err.message);
  }
}

/** رسم الجدول */
function renderTable(headers, rows, page, sheetKey) {
  if (!rows.length) {
    return `<div class="empty-state">
      <div class="empty-icon">📭</div>
      <p>لا توجد بيانات حتى الآن</p>
      <button class="btn btn-primary" onclick="openAddModal('${page}','${sheetKey}',${JSON.stringify(headers).replace(/"/g,"'")})">
        أضف أول سجل
      </button>
    </div>`;
  }

  // نعرض أول 12 عمود فقط لتجنب فيض الجدول
  const visibleHeaders = headers.filter(h => h && !h.startsWith("_")).slice(0, 12);

  return `<table id="data-table">
    <thead>
      <tr>
        ${visibleHeaders.map(h => `<th>${h}</th>`).join("")}
        <th>الإجراءات</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map(row => `
        <tr>
          ${visibleHeaders.map(h => `<td>${formatCell(row[h])}</td>`).join("")}
          <td>
            <div class="actions-cell">
              <button class="btn btn-warning btn-sm" onclick="openEditModal('${page}','${sheetKey}',${JSON.stringify(headers).replace(/"/g,"'")},${JSON.stringify(row).replace(/"/g,"'")},${JSON.stringify(row[headers[0]])})">
                ✏️ تعديل
              </button>
              <button class="btn btn-danger btn-sm" onclick="confirmDelete('${page}','${sheetKey}',${JSON.stringify(row[headers[0]])})">
                🗑️ حذف
              </button>
            </div>
          </td>
        </tr>
      `).join("")}
    </tbody>
  </table>`;
}

/** فلترة الجدول */
function filterTable(query) {
  const rows = document.querySelectorAll("#data-table tbody tr");
  const q    = query.toLowerCase();
  rows.forEach(tr => {
    tr.style.display = tr.textContent.toLowerCase().includes(q) ? "" : "none";
  });
}

// ================================================================
//  Modal الإضافة / التعديل
// ================================================================

/** فتح modal إضافة */
function openAddModal(page, sheetKey, headers) {
  editingId = null;
  openFormModal("إضافة سجل جديد", headers, {}, page, sheetKey);
}

/** فتح modal تعديل */
function openEditModal(page, sheetKey, headers, row, id) {
  // openEditModal يُستدعى من HTML ويأخذ البيانات من JSON مُنظَّف
  editingId = id;
  openFormModal("تعديل السجل", headers, row, page, sheetKey);
}

/** بناء وعرض modal النموذج */
function openFormModal(title, headers, defaults, page, sheetKey) {
  const filteredHeaders = headers.filter(h => h && !h.startsWith("_"));

  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-body").innerHTML = `
    <div class="form-grid">
      ${filteredHeaders.map(h => `
        <div class="form-group">
          <label>${h}</label>
          <input type="text" id="field-${safeName(h)}" value="${escHtml(defaults[h] ?? "")}" placeholder="${h}" />
        </div>
      `).join("")}
    </div>
    <div id="form-error" class="error-msg hidden"></div>
    <div class="form-actions">
      <button class="btn btn-primary" onclick="submitForm('${page}','${sheetKey}',${JSON.stringify(filteredHeaders).replace(/"/g,"'")})">
        <span id="submit-text">${editingId ? "💾 حفظ التعديلات" : "✅ إضافة"}</span>
        <span class="spinner hidden" id="submit-spinner"></span>
      </button>
      <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
    </div>
  `;
  document.getElementById("modal-overlay").classList.remove("hidden");
}

/** إرسال النموذج (إضافة أو تعديل) */
async function submitForm(page, sheetKey, headers) {
  const errEl   = document.getElementById("form-error");
  const btnText = document.getElementById("submit-text");
  const spinner = document.getElementById("submit-spinner");
  errEl.classList.add("hidden");
  btnText.classList.add("hidden");
  spinner.classList.remove("hidden");

  // جمع بيانات النموذج
  const data = {};
  headers.forEach(h => {
    const el = document.getElementById(`field-${safeName(h)}`);
    if (el) data[h] = el.value.trim();
  });

  try {
    let res;
    if (editingId) {
      res = await apiPost({ action: "update", sheet: sheetKey, id: editingId, data });
    } else {
      res = await apiPost({ action: "create", sheet: sheetKey, data });
    }

    if (res.success) {
      closeModal();
      showToast(res.message || "تمت العملية بنجاح", "success");
      navigateTo(page); // إعادة تحميل الصفحة
    } else {
      errEl.textContent = res.error || "حدث خطأ";
      errEl.classList.remove("hidden");
    }
  } catch (err) {
    errEl.textContent = "خطأ في الاتصال: " + err.message;
    errEl.classList.remove("hidden");
  } finally {
    btnText.classList.remove("hidden");
    spinner.classList.add("hidden");
  }
}

/** تأكيد الحذف */
function confirmDelete(page, sheetKey, id) {
  document.getElementById("modal-title").textContent = "⚠️ تأكيد الحذف";
  document.getElementById("modal-body").innerHTML = `
    <p style="margin-bottom:1.2rem;font-size:.95rem">هل أنت متأكد من حذف هذا السجل؟ لا يمكن التراجع عن هذا الإجراء.</p>
    <div class="form-actions">
      <button class="btn btn-danger" onclick="doDelete('${page}','${sheetKey}',${JSON.stringify(id)})">🗑️ نعم، احذف</button>
      <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
    </div>
  `;
  document.getElementById("modal-overlay").classList.remove("hidden");
}

async function doDelete(page, sheetKey, id) {
  closeModal();
  try {
    const res = await apiPost({ action: "delete", sheet: sheetKey, id });
    if (res.success) {
      showToast(res.message || "تم الحذف بنجاح", "success");
      navigateTo(page);
    } else {
      showToast(res.error || "فشل الحذف", "error");
    }
  } catch (err) {
    showToast("خطأ: " + err.message, "error");
  }
}

function closeModal() {
  document.getElementById("modal-overlay").classList.add("hidden");
  editingId = null;
}

// ================================================================
//  إدارة المستخدمين
// ================================================================

async function renderUsersPage() {
  if (!currentUser || currentUser.role !== "admin") {
    document.getElementById("content-area").innerHTML = errorBlock("غير مصرح لك بالوصول لهذه الصفحة");
    return;
  }

  const area = document.getElementById("content-area");
  area.innerHTML = `<div class="loading-state"><div class="spinner"></div> جارٍ التحميل…</div>`;

  try {
    const res = await apiPost({ action: "getUsers", requestedBy: currentUser.username });
    if (!res.success) throw new Error(res.error);

    area.innerHTML = `
      <div class="card">
        <div class="toolbar">
          <button class="btn btn-primary" onclick="openUserModal()">＋ إضافة مستخدم</button>
        </div>
        <div class="table-wrapper">
          ${renderUsersTable(res.users)}
        </div>
      </div>
    `;
  } catch (err) {
    area.innerHTML = errorBlock(err.message);
  }
}

function renderUsersTable(users) {
  if (!users.length) {
    return `<div class="empty-state"><div class="empty-icon">👥</div><p>لا يوجد مستخدمون</p></div>`;
  }
  return `<table>
    <thead>
      <tr>
        <th>#</th>
        <th>اسم المستخدم</th>
        <th>الصلاحية</th>
        <th>الحالة</th>
        <th>تاريخ الإنشاء</th>
        <th>الإجراءات</th>
      </tr>
    </thead>
    <tbody>
      ${users.map(u => `
        <tr>
          <td>${u.id}</td>
          <td><strong>${escHtml(u.username)}</strong></td>
          <td>
            <span class="badge ${u.role === 'admin' ? 'badge-info' : 'badge-neutral'}">
              ${u.role === "admin" ? "🔑 مدير" : "👤 مستخدم"}
            </span>
          </td>
          <td>
            <span class="badge ${u.active ? 'badge-success' : 'badge-danger'}">
              ${u.active ? "✅ نشط" : "❌ معطّل"}
            </span>
          </td>
          <td>${u.createdAt ? u.createdAt.split("T")[0] : "—"}</td>
          <td>
            <div class="actions-cell">
              <button class="btn btn-warning btn-sm" onclick="openUserModal(${JSON.stringify(u).replace(/"/g,"'")})">✏️ تعديل</button>
              <button class="btn btn-danger btn-sm" onclick="confirmDeleteUser(${u.id},'${escHtml(u.username)}')">🗑️ حذف</button>
            </div>
          </td>
        </tr>
      `).join("")}
    </tbody>
  </table>`;
}

/** modal إضافة/تعديل مستخدم */
function openUserModal(user = null) {
  const isEdit = !!user;
  document.getElementById("modal-title").textContent = isEdit ? "تعديل المستخدم" : "إضافة مستخدم جديد";
  document.getElementById("modal-body").innerHTML = `
    <div class="form-group">
      <label>اسم المستخدم</label>
      <input type="text" id="u-username" value="${user ? escHtml(user.username) : ""}" placeholder="اسم المستخدم" />
    </div>
    <div class="form-group">
      <label>${isEdit ? "كلمة المرور الجديدة (اتركها فارغة للإبقاء)" : "كلمة المرور"}</label>
      <input type="password" id="u-password" placeholder="كلمة المرور" />
    </div>
    <div class="form-group">
      <label>الصلاحية</label>
      <select id="u-role">
        <option value="viewer" ${user?.role === "viewer" ? "selected" : ""}>مستخدم عادي</option>
        <option value="admin"  ${user?.role === "admin"  ? "selected" : ""}>مدير النظام</option>
      </select>
    </div>
    ${isEdit ? `
    <div class="form-group">
      <label>الحالة</label>
      <select id="u-active">
        <option value="true"  ${user?.active ? "selected" : ""}>نشط</option>
        <option value="false" ${!user?.active ? "selected" : ""}>معطّل</option>
      </select>
    </div>` : ""}
    <div id="user-form-error" class="error-msg hidden"></div>
    <div class="form-actions">
      <button class="btn btn-primary" onclick="submitUserForm(${user ? user.id : "null"})">
        ${isEdit ? "💾 حفظ" : "✅ إضافة"}
      </button>
      <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
    </div>
  `;
  document.getElementById("modal-overlay").classList.remove("hidden");
}

async function submitUserForm(userId) {
  const errEl    = document.getElementById("user-form-error");
  const username = document.getElementById("u-username")?.value.trim();
  const password = document.getElementById("u-password")?.value;
  const role     = document.getElementById("u-role")?.value;
  const activeEl = document.getElementById("u-active");
  const active   = activeEl ? activeEl.value === "true" : true;

  errEl.classList.add("hidden");

  if (!username) { errEl.textContent = "اسم المستخدم مطلوب"; errEl.classList.remove("hidden"); return; }
  if (!userId && !password) { errEl.textContent = "كلمة المرور مطلوبة"; errEl.classList.remove("hidden"); return; }

  const userData = { username, role, active };
  if (password) userData.password = password;

  try {
    let res;
    if (userId) {
      res = await apiPost({ action: "updateUser", userId, userData, requestedBy: currentUser.username });
    } else {
      res = await apiPost({ action: "createUser", userData, requestedBy: currentUser.username });
    }

    if (res.success) {
      closeModal();
      showToast(res.message || "تمت العملية بنجاح", "success");
      renderUsersPage();
    } else {
      errEl.textContent = res.error;
      errEl.classList.remove("hidden");
    }
  } catch (err) {
    errEl.textContent = "خطأ: " + err.message;
    errEl.classList.remove("hidden");
  }
}

function confirmDeleteUser(id, username) {
  document.getElementById("modal-title").textContent = "⚠️ تأكيد حذف المستخدم";
  document.getElementById("modal-body").innerHTML = `
    <p style="margin-bottom:1.2rem">هل تريد حذف المستخدم <strong>${escHtml(username)}</strong>؟</p>
    <div class="form-actions">
      <button class="btn btn-danger" onclick="doDeleteUser(${id})">🗑️ حذف</button>
      <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
    </div>
  `;
  document.getElementById("modal-overlay").classList.remove("hidden");
}

async function doDeleteUser(id) {
  closeModal();
  try {
    const res = await apiPost({ action: "deleteUser", userId: id, requestedBy: currentUser.username });
    if (res.success) {
      showToast(res.message || "تم الحذف", "success");
      renderUsersPage();
    } else {
      showToast(res.error || "فشل الحذف", "error");
    }
  } catch (err) {
    showToast("خطأ: " + err.message, "error");
  }
}

// ================================================================
//  طبقة الـ API
// ================================================================

/** GET request */
async function apiGet(params = {}) {
  params.apiKey = API_KEY;
  const qs  = new URLSearchParams(params).toString();
  const url = `${API_URL}?${qs}`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** POST request */
async function apiPost(body = {}) {
  body.apiKey = API_KEY;
  const res = await fetch(API_URL, {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ================================================================
//  مساعدات UI
// ================================================================

/** الشريط الجانبي على الموبايل */
function toggleSidebar() {
  const sidebar  = document.getElementById("sidebar");
  const overlay  = document.getElementById("sidebar-overlay");
  const isOpen   = sidebar.classList.contains("open");
  sidebar.classList.toggle("open", !isOpen);
  overlay.classList.toggle("open", !isOpen);
}
function closeSidebarMobile() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebar-overlay").classList.remove("open");
}

/** Toast إشعارات */
function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  const icons = { success: "✅", error: "❌", info: "ℹ️" };
  el.innerHTML = `<span>${icons[type] || "ℹ️"}</span> <span>${message}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.style.animation = "slideOut .3s ease forwards";
    setTimeout(() => el.remove(), 300);
  }, 3500);
}

/** تنسيق الأرقام */
function formatNum(n) {
  const num = parseFloat(n);
  if (isNaN(num)) return "—";
  return num.toLocaleString("ar-EG");
}

/** تنسيق قيمة خلية للعرض */
function formatCell(val) {
  if (val === null || val === undefined || val === "") return "—";
  if (typeof val === "number") return val.toLocaleString("ar-EG");
  const s = String(val);
  if (s.includes("قيد التنفيذ"))  return `<span class="badge badge-warning">${s}</span>`;
  if (s.includes("مكتمل"))         return `<span class="badge badge-success">${s}</span>`;
  if (s.includes("ملغي"))          return `<span class="badge badge-danger">${s}</span>`;
  if (s.includes("✅"))            return `<span class="badge badge-success">${s}</span>`;
  if (s.includes("⚠️"))           return `<span class="badge badge-warning">${s}</span>`;
  return escHtml(s);
}

/** كتلة خطأ */
function errorBlock(msg) {
  return `<div class="card">
    <div class="empty-state">
      <div class="empty-icon">🔌</div>
      <p>حدث خطأ: ${escHtml(msg)}</p>
      <p style="font-size:.82rem;color:#94a3b8;margin-top:.5rem">
        تأكد من ضبط رابط الـ API في app.js وأن الـ Spreadsheet ID صحيح في Code.gs
      </p>
    </div>
  </div>`;
}

/** تحويل اسم العمود لـ id صالح */
function safeName(h) { return h.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, "_"); }

/** HTML escape */
function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── إغلاق الـ modal بضغط Escape ──
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });
