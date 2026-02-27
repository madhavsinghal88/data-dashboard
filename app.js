/* ============================================================
   SAP EVENTS DASHBOARD — Live Google Sheets Integration
   Fetches data via Google Visualization API, auto-refreshes
   ============================================================ */

(() => {
  "use strict";

  // ---- Configuration ----
  const SHEET_ID = "1ZqRy6ualEQZ9EN3tgNVE-Dx5ad2alD3KQkoqJ35cdCU";
  const REFRESH_INTERVAL_MS = 60_000; // 60 seconds
  
  // ---- DOM refs ----
  const groupTabs = document.getElementById("groupTabs");
  const tabBtns = document.querySelectorAll(".tab-btn");
  const controlsBar = document.getElementById("controlsBar");
  const searchInput = document.getElementById("searchInput");
  const filterGroup = document.getElementById("filterGroup");
  const sortSelect = document.getElementById("sortSelect");
  const sortDirBtn = document.getElementById("sortDir");
  const rowCount = document.getElementById("rowCount");
  const dataOutput = document.getElementById("dataOutput");
  const cardsGrid = document.getElementById("cardsGrid");
  
  // Shortlist stuff
  const shortlistSection = document.getElementById("shortlistSection");
  const gridApplied = document.getElementById("gridApplied");
  const gridToBeApplied = document.getElementById("gridToBeApplied");
  const countApplied = document.getElementById("countApplied");
  const countToBeApplied = document.getElementById("countToBeApplied");
  const emptyApplied = document.getElementById("emptyApplied");
  const emptyToBeApplied = document.getElementById("emptyToBeApplied");
  const btnClearShortlist = document.getElementById("btnClearShortlist");

  const tableHead = document.getElementById("tableHead");
  const tableBody = document.getElementById("tableBody");
  const emptyState = document.getElementById("emptyState");
  const btnCards = document.getElementById("btnCards");
  const btnTable = document.getElementById("btnTable");
  const btnRefresh = document.getElementById("btnRefresh");
  const btnRetry = document.getElementById("btnRetry");
  const syncIndicator = document.getElementById("syncIndicator");
  const loadingState = document.getElementById("loadingState");
  const errorState = document.getElementById("errorState");
  const statsBar = document.getElementById("statsBar");
  const dashboardFooter = document.getElementById("dashboardFooter");
  const lastSyncEl = document.getElementById("lastSync");

  // Stats
  const statTotal = document.getElementById("statTotal");
  const statUpcoming = document.getElementById("statUpcoming");
  const statCountries = document.getElementById("statCountries");
  const statMonths = document.getElementById("statMonths");

  let currentSheet = tabBtns[0].dataset.sheet;
  let headers = [];
  let rows = [];
  let filtered = [];
  let sortCol = -1;
  let sortAsc = true;
  let currentView = "cards";
  let activeFilter = null;
  let refreshTimer = null;
  // Status Map: id -> "applied" | "tobe" | "none"
  let eventStatus = JSON.parse(localStorage.getItem("eventStatus") || "{}");

  // Month short names for filter chips
  const MONTH_NAMES = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];

  const MONTH_COLORS = {
    "Jan": "#67e8f9", "Feb": "#f472b6", "Mar": "#a78bfa",
    "Apr": "#60a5fa", "May": "#34d399", "Jun": "#fbbf24",
    "Jul": "#fb923c", "Aug": "#f87171", "Sep": "#e879f9",
    "Oct": "#2dd4bf", "Nov": "#94a3b8", "Dec": "#818cf8"
  };

  // ---- CSV Parser ----
  function parseCSV(text) {
    const rows = [];
    let current = [];
    let cell = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const next = text[i + 1];

      if (inQuotes) {
        if (ch === '"' && next === '"') {
          cell += '"';
          i++; // skip escaped quote
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          cell += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          current.push(cell.trim());
          cell = "";
        } else if (ch === '\n' || (ch === '\r' && next === '\n')) {
          current.push(cell.trim());
          if (current.some(c => c !== "")) rows.push(current);
          current = [];
          cell = "";
          if (ch === '\r') i++; // skip \n after \r
        } else {
          cell += ch;
        }
      }
    }
    // Last cell
    current.push(cell.trim());
    if (current.some(c => c !== "")) rows.push(current);

    return rows;
  }

  // ---- Fetch Data from Google Sheets ----
  async function fetchSheetData(sheet = currentSheet) {
    setSyncState("syncing");
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheet)}`;

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();

      const allRows = parseCSV(text);
      if (allRows.length < 2) throw new Error("Sheet appears empty");

      headers = allRows[0];
      rows = allRows.slice(1);

      // Deduplicate rows based on Event Name + Date + Location
      const seen = new Set();
      rows = rows.filter(row => {
        const key = `${(row[0]||"").trim()}|${(row[1]||"").trim()}|${(row[2]||"").trim()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // Normalize row lengths
      rows = rows.map(r => {
        while (r.length < headers.length) r.push("");
        return r.slice(0, headers.length);
      });

      sortCol = -1;
      sortAsc = true;
      filtered = [...rows];

      showDashboard();
      buildSortOptions();
      buildFilters();
      updateStats();
      applyFilters();

      setSyncState("synced");
      updateLastSync();

    } catch (err) {
      console.error("Fetch error:", err);
      if (rows.length > 0) {
        // We have previous data — just show error indicator
        setSyncState("error");
      } else {
        // No data at all — show error state
        showError(err.message);
      }
    }
  }

  // ---- UI State Management ----
  function showLoading() {
    loadingState.classList.remove("hidden");
    errorState.classList.add("hidden");
    controlsBar.classList.add("hidden");
    dataOutput.classList.add("hidden");
    statsBar.classList.add("hidden");
    dashboardFooter.classList.add("hidden");
    emptyState.classList.add("hidden");
  }

  function showError(msg) {
    loadingState.classList.add("hidden");
    errorState.classList.remove("hidden");
    controlsBar.classList.add("hidden");
    dataOutput.classList.add("hidden");
    statsBar.classList.add("hidden");
    dashboardFooter.classList.add("hidden");
    if (msg) document.getElementById("errorMessage").textContent = msg;
    setSyncState("error");
  }

  function showDashboard() {
    loadingState.classList.add("hidden");
    errorState.classList.add("hidden");
    controlsBar.classList.remove("hidden");
    dataOutput.classList.remove("hidden");
    statsBar.classList.remove("hidden");
    dashboardFooter.classList.remove("hidden");
  }

  function setSyncState(state) {
    syncIndicator.className = "sync-indicator";
    const dot = syncIndicator.querySelector(".sync-dot");
    const text = syncIndicator.querySelector(".sync-text");

    if (state === "syncing") {
      syncIndicator.classList.add("syncing");
      text.textContent = "Syncing…";
      btnRefresh.classList.add("spinning");
    } else if (state === "error") {
      syncIndicator.classList.add("error");
      text.textContent = "Sync Error";
      btnRefresh.classList.remove("spinning");
    } else {
      text.textContent = "Synced";
      btnRefresh.classList.remove("spinning");
    }
  }

  function updateLastSync() {
    const now = new Date();
    lastSyncEl.textContent = now.toLocaleTimeString([], {
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    });
  }

  // ---- Stats ----
  function updateStats() {
    statTotal.textContent = rows.length;

    // Upcoming: events with dates in the future
    const now = new Date();
    let upcoming = 0;
    const countriesSet = new Set();
    const monthsSet = new Set();

    rows.forEach(row => {
      const dateStr = (row[0] || "").trim();
      const location = (row[2] || "").trim();
      const parsedDate = parseDateString(dateStr);

      if (parsedDate && parsedDate >= now) upcoming++;

      // Extract country (last part of location)
      if (location) {
        const parts = location.split(",").map(s => s.trim());
        const country = parts[parts.length - 1];
        if (country) countriesSet.add(country);
      }

      // Extract month
      const monthMatch = dateStr.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/i);
      if (monthMatch) monthsSet.add(monthMatch[1]);
    });

    statUpcoming.textContent = upcoming;
    statCountries.textContent = countriesSet.size;
    statMonths.textContent = monthsSet.size;

    // Animate stat numbers
    document.querySelectorAll(".stat-number").forEach(el => {
      el.style.animation = "none";
      el.offsetHeight;
      el.style.animation = "fadeSlideUp 0.5s ease forwards";
    });
  }

  // ---- Date Parsing ----
  function parseDateString(dateStr) {
    if (!dateStr) return null;
    // Handle ranges like "2–3 March, 2026" → use first date
    const cleaned = dateStr.replace(/\d+\s*[–-]\s*/, "");
    // Also handle "2–3 March, 2026" → "2 March, 2026"
    const singleDate = dateStr.replace(/(\d+)\s*[–-]\s*\d+/, "$1");
    const d = new Date(singleDate);
    if (!isNaN(d.getTime())) return d;
    const d2 = new Date(cleaned);
    if (!isNaN(d2.getTime())) return d2;
    return null;
  }

  function getMonthFromDate(dateStr) {
    if (!dateStr) return "";
    const match = dateStr.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/i);
    if (match) {
      const full = match[1];
      const idx = new Date(full + " 1, 2026").getMonth();
      return MONTH_NAMES[idx];
    }
    return "";
  }

  function getMonthColor(month) {
    return MONTH_COLORS[month] || "#6366f1";
  }

  // ---- HTML escape ----
  function escHtml(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  // ---- Render Cards ----
  function renderCards(data) {
    cardsGrid.innerHTML = "";
    if (!data.length) return;

    const frag = document.createDocumentFragment();
    data.forEach((row, ri) => {
      const card = createCardElement(row, ri);
      frag.appendChild(card);
    });
    cardsGrid.appendChild(frag);
  }

  function createCardElement(row, ri, isShortlist = false) {
    const card = document.createElement("div");
    const date = (row[0] || "").trim();
    const eventName = (row[1] || "").trim();
    const location = (row[2] || "").trim();
    const link = (row[3] || "").trim();
    const rowId = `${eventName}|${date}|${location}`;
    const status = eventStatus[rowId] || "none";

    card.className = "data-card status-" + status;
    card.style.animationDelay = `${Math.min(ri * 35, 600)}ms`;

    const month = getMonthFromDate(date);
    const color = getMonthColor(month);

    let html = `
        <div class="card-accent-bar" style="background: linear-gradient(90deg, ${color}, ${color}88);"></div>
        <div class="status-toggle" data-id="${escHtml(rowId)}">
          <div class="status-opt ${status === 'applied' ? 'active' : ''}" data-status="applied" title="Applied">A</div>
          <div class="status-opt ${status === 'tobe' ? 'active' : ''}" data-status="tobe" title="To Be Applied">T</div>
          <div class="status-opt ${status === 'none' ? 'active' : ''}" data-status="none" title="Not Applied">N</div>
        </div>
        <div class="card-body">
          <div class="card-date-badge" style="background: ${color}18; color: ${color};">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="3" width="12" height="11" rx="2" stroke="currentColor" stroke-width="1.5"/>
              <line x1="5" y1="1" x2="5" y2="5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              <line x1="11" y1="1" x2="11" y2="5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              <rect x="2" y="7" width="12" height="1" fill="currentColor"/>
            </svg>
            ${escHtml(date)}
          </div>
          <div class="card-title">${escHtml(eventName)}</div>
          <div class="card-location">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M8 1C5.24 1 3 3.24 3 6c0 3.75 5 9 5 9s5-5.25 5-9c0-2.76-2.24-5-5-5z" stroke="currentColor" stroke-width="1.3" fill="none"/>
              <circle cx="8" cy="6" r="1.5" stroke="currentColor" stroke-width="1.3" fill="none"/>
            </svg>
            <span>${escHtml(location || "—")}</span>
          </div>
          ${link ? `<a class="card-link" href="${escHtml(link)}" target="_blank" rel="noopener">
            View Event
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M6 3h7v7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M13 3L6 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </a>` : ""}
        </div>`;

    card.innerHTML = html;

    // Attach listeners
    card.querySelectorAll(".status-opt").forEach(opt => {
      opt.addEventListener("click", () => setStatus(rowId, row, opt.dataset.status));
    });

    return card;
  }

  // ---- Render Table ----
  function renderTable(data) {
    const displayHeaders = ["Status", "Date", "Event Name", "Location", "Link"];
    tableHead.innerHTML = `<tr>${displayHeaders.map((h, i) => {
      let cls = "";
      if (i > 0 && i - 1 === sortCol) cls = sortAsc ? "sorted-asc" : "sorted-desc";
      return `<th class="${cls}" data-col="${i - 1}">${escHtml(h)}</th>`;
    }).join("")}</tr>`;

    tableBody.innerHTML = "";
    const frag = document.createDocumentFragment();
    data.forEach((row, ri) => {
      const date = (row[0] || "").trim();
      const eventName = (row[1] || "").trim();
      const location = (row[2] || "").trim();
      const rowId = `${eventName}|${date}|${location}`;
      const status = eventStatus[rowId] || "none";

      const tr = document.createElement("tr");
      if (status !== 'none') tr.classList.add("status-" + status);
      tr.style.animationDelay = `${Math.min(ri * 20, 400)}ms`;

      let cells = [
        `<td class="table-status-cell">
           <div class="table-toggle">
            <div class="status-opt ${status === 'applied' ? 'active' : ''}" data-status="applied">A</div>
            <div class="status-opt ${status === 'tobe' ? 'active' : ''}" data-status="tobe">T</div>
            <div class="status-opt ${status === 'none' ? 'active' : ''}" data-status="none">N</div>
           </div>
         </td>`
      ];

      row.forEach((cell, ci) => {
        if (ci === 3 && cell) {
          cells.push(`<td><a href="${escHtml(cell)}" target="_blank" rel="noopener">View →</a></td>`);
        } else {
          cells.push(`<td>${escHtml(cell || "—")}</td>`);
        }
      });

      tr.innerHTML = cells.join("");

      tr.querySelectorAll(".status-opt").forEach(opt => {
        opt.addEventListener("click", () => setStatus(rowId, row, opt.dataset.status));
      });

      frag.appendChild(tr);
    });
    tableBody.appendChild(frag);
  }

  // ---- Status Management ----
  function setStatus(id, rowData, status) {
    eventStatus[id] = status;
    
    // Save to localStorage
    localStorage.setItem("eventStatus", JSON.stringify(eventStatus));
    
    if (status !== "none") {
      saveRowData(id, rowData);
    } else {
      delete eventStatus[id];
      localStorage.setItem("eventStatus", JSON.stringify(eventStatus));
      removeRowData(id);
    }
    
    render(); 
    updateShortlist();
  }

  function saveRowData(id, row) {
    const data = JSON.parse(localStorage.getItem("shortlistDataMap") || "{}");
    data[id] = row;
    localStorage.setItem("shortlistDataMap", JSON.stringify(data));
  }

  function removeRowData(id) {
    const data = JSON.parse(localStorage.getItem("shortlistDataMap") || "{}");
    delete data[id];
    localStorage.setItem("shortlistDataMap", JSON.stringify(data));
  }

  function updateShortlist() {
    const dataMap = JSON.parse(localStorage.getItem("shortlistDataMap") || "{}");
    
    const applied = [];
    const tobe = [];
    
    Object.keys(eventStatus).forEach(id => {
      const s = eventStatus[id];
      if (s === "applied") applied.push(id);
      if (s === "tobe") tobe.push(id);
    });
    
    shortlistSection.classList.remove("hidden");
    countApplied.textContent = applied.length;
    countToBeApplied.textContent = tobe.length;
    
    // Render Applied
    gridApplied.innerHTML = "";
    if (applied.length === 0) {
      emptyApplied.classList.remove("hidden");
    } else {
      emptyApplied.classList.add("hidden");
      applied.forEach((id, ri) => {
        const row = dataMap[id];
        if (row) gridApplied.appendChild(createCardElement(row, ri, true));
      });
    }

    // Render ToBe
    gridToBeApplied.innerHTML = "";
    if (tobe.length === 0) {
      emptyToBeApplied.classList.remove("hidden");
    } else {
      emptyToBeApplied.classList.add("hidden");
      tobe.forEach((id, ri) => {
        const row = dataMap[id];
        if (row) gridToBeApplied.appendChild(createCardElement(row, ri, true));
      });
    }
  }

  btnClearShortlist.addEventListener("click", () => {
    if (confirm("Reset all status progress?")) {
      eventStatus = {};
      localStorage.setItem("eventStatus", "{}");
      localStorage.setItem("shortlistDataMap", "{}");
      render();
      updateShortlist();
    }
  });

  // ---- Build Month Filter Chips ----
  function buildFilters() {
    filterGroup.innerHTML = "";

    // Build month counts
    const monthCounts = {};
    rows.forEach(r => {
      const m = getMonthFromDate(r[0]);
      if (m) monthCounts[m] = (monthCounts[m] || 0) + 1;
    });

    // "All" chip
    const allChip = document.createElement("button");
    allChip.className = "filter-chip" + (activeFilter === null ? " active" : "");
    allChip.textContent = "All";
    allChip.addEventListener("click", () => { activeFilter = null; applyFilters(); });
    filterGroup.appendChild(allChip);

    // Month chips in calendar order
    const order = MONTH_NAMES;
    order.forEach(m => {
      if (!monthCounts[m]) return;
      const chip = document.createElement("button");
      chip.className = "filter-chip" + (activeFilter === m ? " active" : "");
      const color = getMonthColor(m);

      if (activeFilter === m) {
        chip.style.background = color;
        chip.style.borderColor = color;
        chip.style.color = "#0a0a0f";
        chip.style.boxShadow = `0 0 16px ${color}40`;
      }

      chip.innerHTML = `${m} <span class="chip-count">${monthCounts[m]}</span>`;
      chip.addEventListener("click", () => {
        activeFilter = m;
        applyFilters();
      });
      filterGroup.appendChild(chip);
    });
  }

  // ---- Build Sort Options ----
  function buildSortOptions() {
    sortSelect.innerHTML = `<option value="">—</option>`;
    const displayHeaders = ["Date", "Event Name", "Location", "Link"];
    displayHeaders.forEach((h, i) => {
      if (i === 3) return; // Don't sort by link
      const opt = document.createElement("option");
      opt.value = i;
      opt.textContent = h;
      sortSelect.appendChild(opt);
    });
  }

  // ---- Apply Filters + Search + Sort ----
  function applyFilters() {
    const query = searchInput.value.trim().toLowerCase();

    filtered = rows.filter(row => {
      // Month filter
      if (activeFilter) {
        const m = getMonthFromDate(row[0]);
        if (m !== activeFilter) return false;
      }
      // Search
      if (query) {
        return row.some(cell => (cell || "").toLowerCase().includes(query));
      }
      return true;
    });

    // Sort
    if (sortCol >= 0) {
      filtered.sort((a, b) => {
        if (sortCol === 0) {
          // Date sort
          const da = parseDateString(a[0]);
          const db = parseDateString(b[0]);
          if (da && db) return sortAsc ? da - db : db - da;
        }
        const va = (a[sortCol] || "").toLowerCase();
        const vb = (b[sortCol] || "").toLowerCase();
        return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      });
    }

    render();
    buildFilters();
  }

  // ---- Master Render ----
  function render() {
    if (!filtered.length) {
      dataOutput.classList.add("hidden");
      emptyState.classList.remove("hidden");
    } else {
      dataOutput.classList.remove("hidden");
      emptyState.classList.add("hidden");
    }
    renderCards(filtered);
    renderTable(filtered);
    rowCount.textContent = `${filtered.length} of ${rows.length} events`;
  }

  // Tab switching
  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.classList.contains("active")) return;
      
      // Update UI
      tabBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      
      // Update State
      currentSheet = btn.dataset.sheet;
      
      // Reset filters and views
      activeFilter = null;
      searchInput.value = "";
      
      showLoading();
      fetchSheetData(currentSheet);
    });
  });

  // Refresh button
  btnRefresh.addEventListener("click", () => fetchSheetData(currentSheet));

  // Retry button
  btnRetry.addEventListener("click", () => {
    showLoading();
    fetchSheetData(currentSheet);
  });

  // Search
  searchInput.addEventListener("input", debounce(applyFilters, 200));

  // Sort select
  sortSelect.addEventListener("change", () => {
    const v = sortSelect.value;
    sortCol = v === "" ? -1 : parseInt(v, 10);
    applyFilters();
  });

  // Sort direction
  sortDirBtn.addEventListener("click", () => {
    sortAsc = !sortAsc;
    sortDirBtn.textContent = sortAsc ? "↑" : "↓";
    applyFilters();
  });

  // Table header click sort
  tableHead.addEventListener("click", e => {
    const th = e.target.closest("th");
    if (!th) return;
    const ci = parseInt(th.dataset.col, 10);
    if (ci === 3) return; // Don't sort by link
    if (sortCol === ci) {
      sortAsc = !sortAsc;
    } else {
      sortCol = ci;
      sortAsc = true;
    }
    sortSelect.value = ci;
    sortDirBtn.textContent = sortAsc ? "↑" : "↓";
    applyFilters();
  });

  // View toggle
  btnCards.addEventListener("click", () => switchView("cards"));
  btnTable.addEventListener("click", () => switchView("table"));

  function switchView(view) {
    currentView = view;
    btnCards.classList.toggle("active", view === "cards");
    btnTable.classList.toggle("active", view === "table");
    dataOutput.classList.toggle("table-view", view === "table");
  }

  // ---- Utility ----
  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  // ---- Auto-refresh ----
  function startAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      fetchSheetData(currentSheet);
    }, REFRESH_INTERVAL_MS);
  }

  // ---- Init ----
  showLoading();
  fetchSheetData(currentSheet).then(() => {
    startAutoRefresh();
    updateShortlist();
  });

})();
