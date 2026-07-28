'use strict';

/* =============================================================
   BUDŻET+ — script.js
   Aplikacja PWA do zarządzania budżetem miesięcznym.
   Moduły (w jednym pliku, podzielone sekcjami dla czytelności):
     1. Stałe i konfiguracja
     2. Warstwa danych (localStorage)
     3. Logika obliczeniowa (budżet, dni, statystyki)
     4. Pomocnicze funkcje UI (formatowanie, toast, modal)
     5. Renderowanie widoków
     6. Obsługa zdarzeń (formularz, filtry, nawigacja)
     7. Wykres kategorii (Canvas, bez bibliotek)
     8. Eksport / Import danych
     9. Inicjalizacja aplikacji + Service Worker
   ============================================================= */

/* ---------------------------------------------------------
   1. STAŁE I KONFIGURACJA
   --------------------------------------------------------- */
const STORAGE_KEYS = {
  expenses: 'budgetplus_expenses_v1',
  budget: 'budgetplus_budget_v1',
  theme: 'budgetplus_theme_v1',
  year: 'budgetplus_year_v1',
};

const DEFAULT_BUDGET = 800;

/* Okres budżetowy jest STAŁY: zawsze 1–31 sierpnia. Jedyną zmienną jest rok,
   który użytkownik ustawia ręcznie w Ustawieniach — miesiąc nigdy nie zmienia
   się automatycznie względem bieżącej daty systemowej. */
const BUDGET_MONTH_INDEX = 7; // sierpień (styczeń = 0)
const BUDGET_MONTH_DAYS = 31;

const CATEGORIES = [
  { id: 'jedzenie', icon: '🍔', name: 'Jedzenie' },
  { id: 'transport', icon: '🚗', name: 'Transport' },
  { id: 'dom', icon: '🏠', name: 'Dom' },
  { id: 'zakupy', icon: '🛒', name: 'Zakupy' },
  { id: 'rozrywka', icon: '🎮', name: 'Rozrywka' },
  { id: 'zdrowie', icon: '💊', name: 'Zdrowie' },
  { id: 'elektronika', icon: '📱', name: 'Elektronika' },
  { id: 'inne', icon: '🎁', name: 'Inne' },
];

const CHART_COLORS = ['#FFD700', '#C9A227', '#F2A65A', '#E5484D', '#5B8DEF', '#2FAE60', '#9B7EDE', '#77777E'];

const categoryById = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1];

/* ---------------------------------------------------------
   2. WARSTWA DANYCH (localStorage)
   --------------------------------------------------------- */
const Store = {
  getExpenses() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.expenses);
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      console.error('Błąd odczytu wydatków:', err);
      return [];
    }
  },
  saveExpenses(list) {
    localStorage.setItem(STORAGE_KEYS.expenses, JSON.stringify(list));
  },
  getBudget() {
    const raw = localStorage.getItem(STORAGE_KEYS.budget);
    const val = raw ? parseFloat(raw) : DEFAULT_BUDGET;
    return Number.isFinite(val) && val >= 0 ? val : DEFAULT_BUDGET;
  },
  saveBudget(amount) {
    localStorage.setItem(STORAGE_KEYS.budget, String(amount));
  },
  getTheme() {
    return localStorage.getItem(STORAGE_KEYS.theme);
  },
  saveTheme(theme) {
    localStorage.setItem(STORAGE_KEYS.theme, theme);
  },
  getYear() {
    const raw = localStorage.getItem(STORAGE_KEYS.year);
    const val = raw ? parseInt(raw, 10) : new Date().getFullYear();
    return Number.isFinite(val) && val >= 2000 && val <= 2100 ? val : new Date().getFullYear();
  },
  saveYear(year) {
    localStorage.setItem(STORAGE_KEYS.year, String(year));
  },
};

/* Stan aplikacji trzymany w pamięci, zsynchronizowany z localStorage */
const state = {
  expenses: Store.getExpenses(),
  budget: Store.getBudget(),
  year: Store.getYear(),
  editingId: null,
};

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);

/* ---------------------------------------------------------
   3. LOGIKA OBLICZENIOWA
   --------------------------------------------------------- */

/** Zwraca stałe granice okresu budżetowego: zawsze 1–31 sierpnia wybranego roku.
 *  Miesiąc NIGDY nie jest wyliczany z bieżącej daty systemowej — tylko rok jest
 *  parametrem (ustawianym ręcznie w Ustawieniach). */
function getBudgetPeriod(year = state.year) {
  const start = new Date(year, BUDGET_MONTH_INDEX, 1);
  const end = new Date(year, BUDGET_MONTH_INDEX, BUDGET_MONTH_DAYS);
  return { year, daysInMonth: BUDGET_MONTH_DAYS, start, end };
}

/** Porównuje rzeczywistą dzisiejszą datę z granicami okresu i zwraca jego status:
 *  'before'  — dzisiaj jest przed 1 sierpnia danego roku
 *  'active'  — dzisiaj mieści się w okresie 1–31 sierpnia
 *  'after'   — dzisiaj jest po 31 sierpnia danego roku */
function getPeriodStatus(period = getBudgetPeriod()) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (today < period.start) return 'before';
  if (today > period.end) return 'after';
  return 'active';
}

/** Wydatki należące do skonfigurowanego okresu budżetowego (sierpień + rok). */
function expensesInPeriod(period = getBudgetPeriod()) {
  return state.expenses.filter((e) => {
    const d = new Date(e.date + 'T00:00:00');
    return d >= period.start && d <= period.end;
  });
}

/** Główne obliczenia budżetowe wyświetlane na dashboardzie. */
function computeBudgetSummary() {
  const period = getBudgetPeriod();
  const status = getPeriodStatus(period);
  const periodExpenses = expensesInPeriod(period);

  const spent = periodExpenses.reduce((sum, e) => sum + e.amount, 0);
  const remaining = state.budget - spent;
  const percentUsed = state.budget > 0 ? (spent / state.budget) * 100 : 0;
  const isOverBudget = spent > state.budget;

  let daysLeft = 0;
  let todayLimit = 0;
  let avgDaily = 0;

  if (status === 'active') {
    const todayOfMonth = new Date().getDate();
    daysLeft = Math.max(period.daysInMonth - todayOfMonth + 1, 0); // wliczając dzisiaj
    todayLimit = remaining > 0 && daysLeft > 0 ? remaining / daysLeft : 0;
    avgDaily = spent / Math.max(todayOfMonth, 1);
  } else if (status === 'before') {
    daysLeft = period.daysInMonth; // cały okres jeszcze przed nami
    todayLimit = 0;
    avgDaily = 0;
  } else {
    // 'after' — okres zakończony, prezentujemy podsumowanie końcowe
    daysLeft = 0;
    todayLimit = 0;
    avgDaily = spent / period.daysInMonth;
  }

  return { status, period, spent, remaining, daysLeft, daysInMonth: period.daysInMonth, todayLimit, avgDaily, percentUsed, isOverBudget };
}

/** Statystyki opisowe (sekcja Statystyki) — liczone na WSZYSTKICH wydatkach. */
function computeStats() {
  const list = state.expenses;
  if (list.length === 0) {
    return { count: 0, avg: 0, max: 0, min: 0, byCategory: [] };
  }
  const amounts = list.map((e) => e.amount);
  const total = amounts.reduce((a, b) => a + b, 0);
  const byCategoryMap = new Map();
  for (const e of list) {
    byCategoryMap.set(e.category, (byCategoryMap.get(e.category) || 0) + e.amount);
  }
  const byCategory = [...byCategoryMap.entries()]
    .map(([id, amount]) => ({ id, amount, ...categoryById(id) }))
    .sort((a, b) => b.amount - a.amount);

  return {
    count: list.length,
    avg: total / list.length,
    max: Math.max(...amounts),
    min: Math.min(...amounts),
    byCategory,
  };
}

/* ---------------------------------------------------------
   4. POMOCNICZE FUNKCJE UI
   --------------------------------------------------------- */
const currencyFormatter = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' });
const formatCurrency = (n) => currencyFormatter.format(n || 0);

const dateFormatter = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' });
const formatDate = (isoDate) => dateFormatter.format(new Date(isoDate + 'T00:00:00'));

const todayIso = () => {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
};

/** Konwertuje obiekt Date (lokalny) na string 'YYYY-MM-DD', bez przesunięć strefy czasowej. */
const dateToIso = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/** Sensowna domyślna data dla formularza dodawania wydatku, ograniczona do okresu sierpniowego:
 *  - w trakcie okresu -> dzisiaj
 *  - przed okresem -> 1 sierpnia (najwcześniejsza dozwolona data)
 *  - po okresie -> 31 sierpnia (ostatnia dozwolona data) */
function getDefaultExpenseDate() {
  const period = getBudgetPeriod();
  const status = getPeriodStatus(period);
  if (status === 'active') return todayIso();
  if (status === 'before') return dateToIso(period.start);
  return dateToIso(period.end);
}

/** Ogranicza pola dat (dodawanie wydatku + filtr historii) do granic okresu
 *  1–31 sierpnia skonfigurowanego roku, aby nie dało się przypadkowo dodać
 *  wydatku spoza śledzonego budżetu. Wywoływana przy starcie i po zmianie roku. */
function applyPeriodDateConstraints() {
  const period = getBudgetPeriod();
  const min = dateToIso(period.start);
  const max = dateToIso(period.end);
  const fieldDate = document.getElementById('fieldDate');
  const filterDate = document.getElementById('filterDate');
  fieldDate.setAttribute('min', min);
  fieldDate.setAttribute('max', max);
  filterDate.setAttribute('min', min);
  filterDate.setAttribute('max', max);
}

/** Odświeża podpowiedź w Ustawieniach pokazującą aktualnie skonfigurowany okres. */
function updatePeriodRangeHint() {
  const period = getBudgetPeriod();
  const hint = document.getElementById('periodRangeHint');
  if (hint) hint.textContent = `Śledzony okres: 01.08.${period.year} – 31.08.${period.year}`;
}

let toastTimeout = null;
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 2400);
}

/** Generyczny modal potwierdzenia — zwraca Promise<boolean>. */
function confirmModal(message, title = 'Czy na pewno?') {
  const overlay = document.getElementById('confirmOverlay');
  const titleEl = document.getElementById('confirmTitle');
  const msgEl = document.getElementById('confirmMessage');
  const okBtn = document.getElementById('confirmOkBtn');
  const cancelBtn = document.getElementById('confirmCancelBtn');

  titleEl.textContent = title;
  msgEl.textContent = message;
  overlay.classList.remove('hidden');

  return new Promise((resolve) => {
    const cleanup = (result) => {
      overlay.classList.add('hidden');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      overlay.removeEventListener('click', onOverlay);
      resolve(result);
    };
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    const onOverlay = (e) => { if (e.target === overlay) cleanup(false); };

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    overlay.addEventListener('click', onOverlay);
  });
}

/* ---------------------------------------------------------
   5. RENDEROWANIE WIDOKÓW
   --------------------------------------------------------- */

function renderDashboard() {
  const s = computeBudgetSummary();

  // Etykieta stałego okresu (1–31 sierpnia wybranego roku)
  document.getElementById('periodLabel').textContent = `Sierpień ${s.period.year} · 01.08 – 31.08`;

  // Komunikat przed / po okresie budżetowym (okres nigdy nie zmienia się automatycznie)
  const periodBanner = document.getElementById('periodBanner');
  const periodBannerIcon = document.getElementById('periodBannerIcon');
  const periodBannerText = document.getElementById('periodBannerText');
  if (s.status === 'before') {
    periodBannerIcon.textContent = '📅';
    periodBannerText.textContent = 'Budżet zacznie się 1 sierpnia';
    periodBanner.classList.remove('hidden');
  } else if (s.status === 'after') {
    periodBannerIcon.textContent = '🏁';
    periodBannerText.textContent = 'Budżet sierpniowy zakończony';
    periodBanner.classList.remove('hidden');
  } else {
    periodBanner.classList.add('hidden');
  }

  document.getElementById('remainingAmount').textContent = formatCurrency(s.remaining);
  document.getElementById('progressOfTotal').textContent = `z ${formatCurrency(state.budget)}`;
  document.getElementById('statInitialBudget').textContent = formatCurrency(state.budget);
  document.getElementById('statSpent').textContent = formatCurrency(s.spent);
  document.getElementById('statDaysLeft').textContent = s.daysLeft;
  document.getElementById('statTodayLimit').textContent = s.status === 'active' ? formatCurrency(s.todayLimit) : '—';
  document.getElementById('statAvgDaily').textContent = formatCurrency(s.avgDaily);
  document.getElementById('statPercentUsed').textContent = `${Math.min(s.percentUsed, 999).toFixed(0)}%`;

  const pct = Math.max(0, Math.min(s.percentUsed, 100));
  const fill = document.getElementById('progressFill');
  fill.style.width = `${pct}%`;
  fill.classList.toggle('is-danger', s.isOverBudget);
  document.getElementById('progressBar').setAttribute('aria-valuenow', pct.toFixed(0));
  document.getElementById('progressPercent').textContent = `${s.percentUsed.toFixed(0)}%`;

  const banner = document.getElementById('warningBanner');
  const warningText = document.getElementById('warningText');
  if (s.isOverBudget) {
    const over = s.spent - state.budget;
    warningText.textContent = `Przekroczono budżet o ${formatCurrency(over)}!`;
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }

  // Ostatnie 5 wydatków
  const recent = [...state.expenses]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 5);
  renderExpenseList(recent, 'recentList', 'recentEmpty');
}

function expenseItemHtml(expense) {
  const cat = categoryById(expense.category);
  return `
    <div class="expense-item" data-id="${expense.id}">
      <div class="expense-item__icon" aria-hidden="true">${cat.icon}</div>
      <div class="expense-item__body">
        <p class="expense-item__desc">${escapeHtml(expense.description)}</p>
        <p class="expense-item__meta">${cat.name} · ${formatDate(expense.date)}</p>
      </div>
      <p class="expense-item__amount">${formatCurrency(expense.amount)}</p>
      <div class="expense-item__actions">
        <button type="button" class="edit-btn" data-id="${expense.id}" aria-label="Edytuj wydatek" title="Edytuj">✏️</button>
        <button type="button" class="delete-btn" data-id="${expense.id}" aria-label="Usuń wydatek" title="Usuń">🗑️</button>
      </div>
    </div>`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderExpenseList(list, containerId, emptyId) {
  const container = document.getElementById(containerId);
  const empty = document.getElementById(emptyId);
  if (list.length === 0) {
    container.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  container.innerHTML = list.map(expenseItemHtml).join('');
}

function renderHistory() {
  const search = document.getElementById('searchInput').value.trim().toLowerCase();
  const category = document.getElementById('filterCategory').value;
  const dateFilter = document.getElementById('filterDate').value;
  const sortBy = document.getElementById('sortSelect').value;

  let list = [...state.expenses];

  if (search) {
    list = list.filter((e) => e.description.toLowerCase().includes(search));
  }
  if (category) {
    list = list.filter((e) => e.category === category);
  }
  if (dateFilter) {
    list = list.filter((e) => e.date === dateFilter);
  }

  switch (sortBy) {
    case 'oldest': list.sort((a, b) => a.createdAt - b.createdAt); break;
    case 'highest': list.sort((a, b) => b.amount - a.amount); break;
    case 'lowest': list.sort((a, b) => a.amount - b.amount); break;
    default: list.sort((a, b) => b.createdAt - a.createdAt); break; // newest
  }

  renderExpenseList(list, 'historyList', 'historyEmpty');
}

function populateCategoryFilter() {
  const select = document.getElementById('filterCategory');
  select.innerHTML = '<option value="">Wszystkie</option>' +
    CATEGORIES.map((c) => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');
}

function renderCategoryPicker(selectedId = CATEGORIES[0].id) {
  const picker = document.getElementById('categoryPicker');
  picker.innerHTML = CATEGORIES.map((c) => `
    <button type="button" class="category-chip" role="radio" aria-checked="${c.id === selectedId}" data-category="${c.id}">
      <span class="category-chip__icon" aria-hidden="true">${c.icon}</span>
      <span>${c.name}</span>
    </button>`).join('');
}

function getSelectedCategory() {
  const active = document.querySelector('#categoryPicker .category-chip[aria-checked="true"]');
  return active ? active.dataset.category : CATEGORIES[0].id;
}

function renderStats() {
  const stats = computeStats();
  document.getElementById('statCount').textContent = stats.count;
  document.getElementById('statAvg').textContent = formatCurrency(stats.avg);
  document.getElementById('statMax').textContent = formatCurrency(stats.max);
  document.getElementById('statMin').textContent = formatCurrency(stats.min);
  renderCategoryChart(stats.byCategory);
}

function renderAll() {
  renderDashboard();
  renderHistory();
  renderStats();
}

/* ---------------------------------------------------------
   6. NAWIGACJA MIĘDZY WIDOKAMI
   --------------------------------------------------------- */
function switchView(target) {
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('view--active', v.dataset.view === target));
  document.querySelectorAll('.bottom-nav__item').forEach((btn) =>
    btn.classList.toggle('bottom-nav__item--active', btn.dataset.target === target)
  );
  document.getElementById('views').scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  window.scrollTo(0, 0);
  if (target === 'history') renderHistory();
  if (target === 'stats') renderStats();
}

/* ---------------------------------------------------------
   7. WYKRES KATEGORII (Canvas, bez bibliotek)
   --------------------------------------------------------- */
function renderCategoryChart(byCategory) {
  const canvas = document.getElementById('categoryChart');
  const ctx = canvas.getContext('2d');
  const emptyMsg = document.getElementById('chartEmpty');
  const legend = document.getElementById('chartLegend');

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  legend.innerHTML = '';

  if (!byCategory || byCategory.length === 0) {
    emptyMsg.classList.remove('hidden');
    canvas.classList.add('hidden');
    return;
  }
  emptyMsg.classList.add('hidden');
  canvas.classList.remove('hidden');

  const total = byCategory.reduce((sum, c) => sum + c.amount, 0);
  const cx = canvas.width / 2;
  const cy = canvas.height / 2 - 6;
  const radius = Math.min(cx, cy) - 10;
  const innerRadius = radius * 0.58;

  let startAngle = -Math.PI / 2;
  const isDark = document.documentElement.dataset.theme === 'dark';
  ctx.strokeStyle = isDark ? '#18181B' : '#FFFFFF';
  ctx.lineWidth = 2;

  byCategory.forEach((cat, i) => {
    const sliceAngle = (cat.amount / total) * Math.PI * 2;
    const endAngle = startAngle + sliceAngle;
    const color = CHART_COLORS[i % CHART_COLORS.length];

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.stroke();

    startAngle = endAngle;
  });

  // Wycięcie środka -> efekt "donut"
  ctx.beginPath();
  ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2);
  ctx.fillStyle = isDark ? '#232327' : '#FFFFFF';
  ctx.fill();

  ctx.fillStyle = isDark ? '#F5F5F7' : '#1C1C1E';
  ctx.font = '700 15px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(formatCurrency(total).replace('\u00A0', ' '), cx, cy);

  // Legenda
  legend.innerHTML = byCategory.map((cat, i) => {
    const color = CHART_COLORS[i % CHART_COLORS.length];
    const pct = ((cat.amount / total) * 100).toFixed(0);
    return `
      <div class="chart-legend__item">
        <span class="chart-legend__swatch" style="background:${color}"></span>
        <span class="chart-legend__label">${cat.icon} ${cat.name} (${pct}%)</span>
        <span class="chart-legend__value">${formatCurrency(cat.amount)}</span>
      </div>`;
  }).join('');
}

/* ---------------------------------------------------------
   8. EKSPORT / IMPORT DANYCH
   --------------------------------------------------------- */
function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportJson() {
  const payload = { budget: state.budget, expenses: state.expenses, exportedAt: new Date().toISOString() };
  downloadFile(`budzet-plus-${todayIso()}.json`, JSON.stringify(payload, null, 2), 'application/json');
  showToast('Wyeksportowano dane do JSON 📦');
}

function exportCsv() {
  const header = ['Data', 'Opis', 'Kategoria', 'Kwota'];
  const rows = state.expenses.map((e) => [
    e.date,
    `"${e.description.replace(/"/g, '""')}"`,
    categoryById(e.category).name,
    e.amount.toFixed(2),
  ]);
  const csv = [header.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
  downloadFile(`budzet-plus-${todayIso()}.csv`, '\uFEFF' + csv, 'text/csv;charset=utf-8');
  showToast('Wyeksportowano dane do CSV 📄');
}

async function importJson(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const imported = Array.isArray(data) ? data : data.expenses;

    if (!Array.isArray(imported)) throw new Error('Nieprawidłowy format pliku.');

    const valid = imported.filter((e) => e && typeof e.amount === 'number' && e.description && e.date && e.category);
    if (valid.length === 0) throw new Error('Plik nie zawiera prawidłowych wydatków.');

    const ok = await confirmModal(
      `Zaimportować ${valid.length} wydatków z pliku? Zostaną dodane do obecnej listy (dane nie zostaną usunięte).`,
      'Import danych'
    );
    if (!ok) return;

    const withNewIds = valid.map((e) => ({
      id: uid(),
      amount: parseFloat(e.amount),
      description: String(e.description).slice(0, 80),
      category: CATEGORIES.some((c) => c.id === e.category) ? e.category : 'inne',
      date: e.date,
      createdAt: e.createdAt || Date.now(),
    }));

    state.expenses = [...state.expenses, ...withNewIds];
    Store.saveExpenses(state.expenses);

    if (data.budget && typeof data.budget === 'number') {
      const applyBudget = await confirmModal(
        `Plik zawiera też budżet: ${formatCurrency(data.budget)}. Czy zastosować go jako aktualny budżet miesięczny?`,
        'Zaimportowano budżet'
      );
      if (applyBudget) {
        state.budget = data.budget;
        Store.saveBudget(state.budget);
        document.getElementById('budgetInput').value = state.budget;
      }
    }

    renderAll();
    showToast(`Zaimportowano ${valid.length} wydatków ✅`);
  } catch (err) {
    console.error(err);
    showToast('Błąd importu — sprawdź plik JSON ⚠️');
  }
}

/* ---------------------------------------------------------
   9. OBSŁUGA ZDARZEŃ
   --------------------------------------------------------- */
function setupEventListeners() {
  // Nawigacja dolna
  document.querySelectorAll('.bottom-nav__item').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.target === 'add') resetForm();
      switchView(btn.dataset.target);
    });
  });

  // Motyw
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);
  document.getElementById('darkModeSwitch').addEventListener('change', (e) => {
    setTheme(e.target.checked ? 'dark' : 'light');
  });

  // Wybór kategorii (delegacja zdarzeń)
  document.getElementById('categoryPicker').addEventListener('click', (e) => {
    const chip = e.target.closest('.category-chip');
    if (!chip) return;
    document.querySelectorAll('#categoryPicker .category-chip').forEach((c) => c.setAttribute('aria-checked', 'false'));
    chip.setAttribute('aria-checked', 'true');
  });

  // Formularz dodawania/edycji wydatku
  document.getElementById('expenseForm').addEventListener('submit', handleExpenseSubmit);
  document.getElementById('cancelEditBtn').addEventListener('click', resetForm);

  // Listy wydatków — edycja / usuwanie (delegacja)
  document.getElementById('recentList').addEventListener('click', handleListClick);
  document.getElementById('historyList').addEventListener('click', handleListClick);

  // Filtry historii
  document.getElementById('searchInput').addEventListener('input', renderHistory);
  document.getElementById('filterCategory').addEventListener('change', renderHistory);
  document.getElementById('filterDate').addEventListener('change', renderHistory);
  document.getElementById('sortSelect').addEventListener('change', renderHistory);
  document.getElementById('clearFiltersBtn').addEventListener('click', () => {
    document.getElementById('searchInput').value = '';
    document.getElementById('filterCategory').value = '';
    document.getElementById('filterDate').value = '';
    document.getElementById('sortSelect').value = 'newest';
    renderHistory();
  });

  // Ustawienia — budżet (kwota + rok okresu sierpniowego)
  document.getElementById('saveBudgetBtn').addEventListener('click', () => {
    const budgetVal = parseFloat(document.getElementById('budgetInput').value);
    const yearVal = parseInt(document.getElementById('yearInput').value, 10);

    if (!Number.isFinite(budgetVal) || budgetVal < 0) {
      showToast('Podaj prawidłową kwotę budżetu ⚠️');
      return;
    }
    if (!Number.isFinite(yearVal) || yearVal < 2000 || yearVal > 2100) {
      showToast('Podaj prawidłowy rok (2000–2100) ⚠️');
      return;
    }

    state.budget = budgetVal;
    state.year = yearVal;
    Store.saveBudget(budgetVal);
    Store.saveYear(yearVal);

    applyPeriodDateConstraints();
    updatePeriodRangeHint();
    renderAll();
    showToast('Zapisano ustawienia budżetu 💾');
  });

  // Ustawienia — dane
  document.getElementById('exportJsonBtn').addEventListener('click', exportJson);
  document.getElementById('exportCsvBtn').addEventListener('click', exportCsv);
  document.getElementById('importFileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) importJson(file);
    e.target.value = '';
  });
  document.getElementById('resetDataBtn').addEventListener('click', async () => {
    const ok = await confirmModal('Spowoduje to trwałe usunięcie wszystkich wydatków. Tej operacji nie można cofnąć.', 'Wyczyścić wszystkie dane?');
    if (!ok) return;
    state.expenses = [];
    Store.saveExpenses([]);
    renderAll();
    showToast('Wyczyszczono dane 🗑️');
  });
}

function handleExpenseSubmit(e) {
  e.preventDefault();
  const amount = parseFloat(document.getElementById('fieldAmount').value);
  const description = document.getElementById('fieldDescription').value.trim();
  const date = document.getElementById('fieldDate').value;
  const category = getSelectedCategory();

  if (!Number.isFinite(amount) || amount <= 0) { showToast('Podaj prawidłową kwotę ⚠️'); return; }
  if (!description) { showToast('Podaj opis wydatku ⚠️'); return; }
  if (!date) { showToast('Wybierz datę ⚠️'); return; }

  if (state.editingId) {
    const idx = state.expenses.findIndex((x) => x.id === state.editingId);
    if (idx !== -1) {
      state.expenses[idx] = { ...state.expenses[idx], amount, description, category, date };
    }
    showToast('Zaktualizowano wydatek ✏️');
  } else {
    state.expenses.push({ id: uid(), amount, description, category, date, createdAt: Date.now() });
    showToast('Dodano wydatek 🎉');
  }

  Store.saveExpenses(state.expenses);
  resetForm();
  renderAll();
  switchView('dashboard');

  const heroCard = document.getElementById('heroCard');
  heroCard.classList.remove('pulse');
  void heroCard.offsetWidth; // restart animacji
  heroCard.classList.add('pulse');
}

function resetForm() {
  state.editingId = null;
  document.getElementById('expenseForm').reset();
  document.getElementById('expenseId').value = '';
  document.getElementById('fieldDate').value = getDefaultExpenseDate();
  renderCategoryPicker();
  document.getElementById('submitBtn').innerHTML = '<span aria-hidden="true">➕</span> Dodaj wydatek';
  document.getElementById('cancelEditBtn').classList.add('hidden');
}

function startEdit(id) {
  const expense = state.expenses.find((x) => x.id === id);
  if (!expense) return;
  state.editingId = id;
  document.getElementById('fieldAmount').value = expense.amount;
  document.getElementById('fieldDescription').value = expense.description;
  document.getElementById('fieldDate').value = expense.date;
  renderCategoryPicker(expense.category);
  document.getElementById('submitBtn').innerHTML = '<span aria-hidden="true">💾</span> Zapisz zmiany';
  document.getElementById('cancelEditBtn').classList.remove('hidden');
  switchView('add');
}

async function deleteExpense(id) {
  const ok = await confirmModal('Czy na pewno chcesz usunąć ten wydatek?', 'Usuń wydatek');
  if (!ok) return;
  state.expenses = state.expenses.filter((x) => x.id !== id);
  Store.saveExpenses(state.expenses);
  renderAll();
  showToast('Usunięto wydatek 🗑️');
}

function handleListClick(e) {
  const editBtn = e.target.closest('.edit-btn');
  const deleteBtn = e.target.closest('.delete-btn');
  if (editBtn) startEdit(editBtn.dataset.id);
  if (deleteBtn) deleteExpense(deleteBtn.dataset.id);
}

/* ---------------------------------------------------------
   MOTYW (jasny / ciemny)
   --------------------------------------------------------- */
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.getElementById('themeIcon').textContent = theme === 'dark' ? '☀️' : '🌙';
  document.getElementById('darkModeSwitch').checked = theme === 'dark';
  document.querySelector('meta[name="theme-color"]').setAttribute('content', theme === 'dark' ? '#18181B' : '#FFD700');
  Store.saveTheme(theme);
  if (state.expenses.length) renderStats(); // przerysuj wykres z nowymi kolorami tła
}

function toggleTheme() {
  const current = document.documentElement.dataset.theme;
  setTheme(current === 'dark' ? 'light' : 'dark');
}

function initTheme() {
  const saved = Store.getTheme();
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  setTheme(saved || (prefersDark ? 'dark' : 'light'));
}

/* ---------------------------------------------------------
   INICJALIZACJA APLIKACJI
   --------------------------------------------------------- */
function initApp() {
  initTheme();
  populateCategoryFilter();
  renderCategoryPicker();

  document.getElementById('yearInput').value = state.year;
  document.getElementById('budgetInput').value = state.budget;
  applyPeriodDateConstraints();
  updatePeriodRangeHint();
  document.getElementById('fieldDate').value = getDefaultExpenseDate();

  setupEventListeners();
  renderAll();
}

document.addEventListener('DOMContentLoaded', initApp);

/* Rejestracja Service Workera dla trybu offline / instalacji PWA */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => {
      console.error('Rejestracja Service Workera nie powiodła się:', err);
    });
  });
}
