/* ============================================================
   DATA DASHBOARD — App Engine
   Parses pasted Excel / CSV / TSV data → renders cards + table
   ============================================================ */

(() => {
  "use strict";

  // ---- DOM refs ----
  const dataInput = document.getElementById("dataInput");
  const btnParse = document.getElementById("btnParse");
  const btnClear = document.getElementById("btnClear");
  const btnSample = document.getElementById("btnSample");
  const controlsBar = document.getElementById("controlsBar");
  const searchInput = document.getElementById("searchInput");
  const filterGroup = document.getElementById("filterGroup");
  const sortSelect = document.getElementById("sortSelect");
  const sortDirBtn = document.getElementById("sortDir");
  const rowCount = document.getElementById("rowCount");
  const dataOutput = document.getElementById("dataOutput");
  const cardsGrid = document.getElementById("cardsGrid");
  const tableHead = document.getElementById("tableHead");
  const tableBody = document.getElementById("tableBody");
  const emptyState = document.getElementById("emptyState");
  const inputArea = document.getElementById("inputArea");
  const btnCards = document.getElementById("btnCards");
  const btnTable = document.getElementById("btnTable");
  const btnChangeData = document.getElementById("btnChangeData");

  // ---- State ----
  let headers = [];
  let rows = [];        // original parsed rows (array of arrays)
  let filtered = [];        // currently visible rows
  let sortCol = -1;
  let sortAsc = true;
  let currentView = "cards";   // "cards" | "table"
  let activeFilter = null;     // { colIndex, value } or null
  let tagColorMap = {};       // globalValue -> colorIndex
  let tagColorCounter = 0;

  // Columns whose values look like comma-separated tags
  let tagColumns = new Set();
  // Columns whose values look like a status keyword
  let statusColumns = new Set();

  const STATUS_KEYWORDS = new Set([
    "active", "inactive", "pending", "hired", "interviewing",
    "rejected", "completed", "open", "closed", "yes", "no",
    "approved", "declined", "in progress", "on hold"
  ]);

  const TAG_COLOR_COUNT = 8;

  // ---- Sample Data ----
  const SAMPLE = `Name\tCompany\tRole\tSkills\tStatus\tLocation
Aarav Sharma\tGoogle\tSDE-III\tPython, ML, Kubernetes\tActive\tBangalore
Priya Mehta\tMcKinsey\tConsultant\tStrategy, Data Analytics\tInterviewing\tMumbai
Rahul Verma\tRazorpay\tProduct Manager\tProduct, SQL, Agile\tHired\tDelhi
Sneha Iyer\tMicrosoft\tML Engineer\tPyTorch, NLP, AWS\tActive\tHyderabad
Karan Singh\tFlipkart\tSDE-II\tJava, Spring, Redis\tPending\tBangalore
Ananya Reddy\tDeloitte\tAnalyst\tExcel, Power BI, SQL\tActive\tChennai
Vikram Joshi\tAmazon\tSDE-I\tJavaScript, React, Node.js\tInterviewing\tPune
Meera Nair\tBCG\tSenior Associate\tStrategy, M&A, Valuation\tHired\tMumbai
Arjun Kapoor\tUber\tBackend Engineer\tGo, gRPC, Postgres\tActive\tBangalore
Divya Gupta\tGoldman Sachs\tVP\tRisk, Python, Quant\tActive\tMumbai
Rohan Patel\tZerodha\tFull Stack Dev\tReact, Django, Docker\tPending\tBangalore
Ishita Das\tMeta\tResearch Scientist\tComputer Vision, PyTorch\tInterviewing\tRemote`;

  // ---- Detect delimiter ----
  function detectDelimiter(text) {
    const lines = text.trim().split(/\r?\n/).slice(0, 5);
    if (!lines.length) return "\t";

    // Check pipe first (common in user prompt example)
    const pipeCount = lines.reduce((s, l) => s + (l.split("|").length - 1), 0);
    const tabCount = lines.reduce((s, l) => s + (l.split("\t").length - 1), 0);
    const commaCount = lines.reduce((s, l) => s + (l.split(",").length - 1), 0);

    const avg = lines.length;
    if (tabCount / avg >= 1) return "\t";
    if (pipeCount / avg >= 1) return "|";
    if (commaCount / avg >= 1) return ",";
    return "\t";
  }

  // ---- Parse Input ----
  function parseInput(text) {
    const raw = text.trim();
    if (!raw) return { headers: [], rows: [] };

    const delim = detectDelimiter(raw);
    let lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    // Remove separator lines like "---" or "---|---"
    lines = lines.filter(l => !/^[-|\s:]+$/.test(l));

    if (lines.length < 2) return { headers: [], rows: [] };

    const splitLine = line =>
      line.split(delim).map(c => c.trim()).filter((_, i, a) => !(delim === "|" && (i === 0 || i === a.length) && _ === ""));

    // For pipe-delimited, remove surrounding empty cells
    const splitPipe = line => {
      let parts = line.split("|").map(c => c.trim());
      if (parts[0] === "") parts = parts.slice(1);
      if (parts[parts.length - 1] === "") parts = parts.slice(0, -1);
      return parts;
    };

    const splitter = delim === "|" ? splitPipe : splitLine;

    const h = splitter(lines[0]);
    const r = lines.slice(1).map(l => {
      const cells = splitter(l);
      // Normalize row length to match headers
      while (cells.length < h.length) cells.push("");
      return cells.slice(0, h.length);
    });

    return { headers: h, rows: r };
  }

  // ---- Analyse columns for tag / status heuristics ----
  function analyseColumns(h, r) {
    tagColumns = new Set();
    statusColumns = new Set();
    tagColorMap = {};
    tagColorCounter = 0;

    h.forEach((_, ci) => {
      const vals = r.map(row => (row[ci] || "").trim().toLowerCase());

      // Check status
      const statusLike = vals.filter(v => STATUS_KEYWORDS.has(v));
      if (statusLike.length > vals.length * 0.4 && vals.length > 0) {
        statusColumns.add(ci);
        return;
      }

      // Check if it contains comma-separated tokens (tags)
      const hasCommas = vals.filter(v => v.includes(","));
      if (hasCommas.length > vals.length * 0.3 && vals.length > 0) {
        tagColumns.add(ci);
      }
    });

    // Also treat columns named "skills", "tags", "tech", "stack", "technologies" as tag columns
    const TAG_NAMES = ["skills", "tags", "tech", "stack", "technologies", "tools", "keywords"];
    h.forEach((name, ci) => {
      if (TAG_NAMES.includes(name.trim().toLowerCase())) tagColumns.add(ci);
    });

    const STATUS_NAMES = ["status", "state", "stage", "result"];
    h.forEach((name, ci) => {
      if (STATUS_NAMES.includes(name.trim().toLowerCase())) statusColumns.add(ci);
    });
  }

  // ---- Tag color assignment ----
  function getTagColor(value) {
    const key = value.trim().toLowerCase();
    if (!(key in tagColorMap)) {
      tagColorMap[key] = (tagColorCounter % TAG_COLOR_COUNT) + 1;
      tagColorCounter++;
    }
    return tagColorMap[key];
  }

  // ---- Render Tags ----
  function renderTags(value) {
    const tags = value.split(",").map(t => t.trim()).filter(Boolean);
    return tags.map(t => {
      const c = getTagColor(t);
      return `<span class="tag tag-${c}">${escHtml(t)}</span>`;
    }).join("");
  }

  // ---- Render Status ----
  function renderStatus(value) {
    const v = value.trim();
    const key = v.toLowerCase().replace(/\s+/g, "");
    let cls = "status-default";
    if (["active", "completed", "yes", "approved", "hired"].includes(key)) cls = "status-active";
    else if (["interviewing", "inprogress", "open"].includes(key)) cls = "status-interviewing";
    else if (["pending", "onhold"].includes(key)) cls = "status-pending";
    else if (["inactive", "closed", "no"].includes(key)) cls = "status-inactive";
    else if (["rejected", "declined"].includes(key)) cls = "status-rejected";
    return `<span class="status-badge ${cls}"><span class="status-dot"></span>${escHtml(v)}</span>`;
  }

  // ---- Render cell value (auto-detect) ----
  function renderCellValue(value, colIndex) {
    if (!value) return `<span class="card-field-value">—</span>`;
    if (statusColumns.has(colIndex)) return renderStatus(value);
    if (tagColumns.has(colIndex)) return `<span class="tags-container">${renderTags(value)}</span>`;
    return `<span class="card-field-value">${escHtml(value)}</span>`;
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
      const card = document.createElement("div");
      card.className = "data-card";
      card.style.animationDelay = `${Math.min(ri * 40, 600)}ms`;

      // First column = title
      let html = `<div class="card-title">${escHtml(row[0] || "—")}</div><div class="card-fields">`;

      for (let ci = 1; ci < headers.length; ci++) {
        html += `
          <div class="card-field">
            <span class="card-field-label">${escHtml(headers[ci])}</span>
            ${renderCellValue(row[ci], ci)}
          </div>`;
      }
      html += `</div>`;
      card.innerHTML = html;
      frag.appendChild(card);
    });
    cardsGrid.appendChild(frag);
  }

  // ---- Render Table ----
  function renderTable(data) {
    // Head
    tableHead.innerHTML = `<tr>${headers.map((h, i) => {
      let cls = "";
      if (i === sortCol) cls = sortAsc ? "sorted-asc" : "sorted-desc";
      return `<th class="${cls}" data-col="${i}">${escHtml(h)}</th>`;
    }).join("")}</tr>`;

    // Body
    tableBody.innerHTML = "";
    const frag = document.createDocumentFragment();
    data.forEach((row, ri) => {
      const tr = document.createElement("tr");
      tr.style.animationDelay = `${Math.min(ri * 25, 500)}ms`;
      tr.innerHTML = row.map((cell, ci) => {
        if (statusColumns.has(ci)) return `<td>${renderStatus(cell)}</td>`;
        if (tagColumns.has(ci)) return `<td><span class="tags-container">${renderTags(cell)}</span></td>`;
        return `<td>${escHtml(cell || "—")}</td>`;
      }).join("");
      frag.appendChild(tr);
    });
    tableBody.appendChild(frag);
  }

  // ---- Build Filter Chips ----
  function buildFilters() {
    filterGroup.innerHTML = "";

    // Find a good column for filters (status column first, then small-cardinality columns)
    let filterCol = -1;
    for (const ci of statusColumns) { filterCol = ci; break; }

    if (filterCol === -1) {
      // Pick first column with ≤ 10 unique values (excluding first column = name)
      for (let ci = 1; ci < headers.length; ci++) {
        if (tagColumns.has(ci)) continue;
        const uniq = new Set(rows.map(r => (r[ci] || "").trim().toLowerCase()));
        if (uniq.size >= 2 && uniq.size <= 10) { filterCol = ci; break; }
      }
    }

    if (filterCol === -1) return;

    // Count values
    const counts = {};
    rows.forEach(r => {
      const v = (r[filterCol] || "").trim();
      if (v) counts[v] = (counts[v] || 0) + 1;
    });

    // "All" chip
    const allChip = document.createElement("button");
    allChip.className = "filter-chip" + (activeFilter === null ? " active" : "");
    allChip.textContent = "All";
    allChip.addEventListener("click", () => { activeFilter = null; applyFilters(); });
    filterGroup.appendChild(allChip);

    Object.keys(counts).sort().forEach(val => {
      const chip = document.createElement("button");
      chip.className = "filter-chip" + (activeFilter && activeFilter.value === val ? " active" : "");
      chip.innerHTML = `${escHtml(val)} <span class="chip-count">${counts[val]}</span>`;
      chip.addEventListener("click", () => {
        activeFilter = { colIndex: filterCol, value: val };
        applyFilters();
      });
      filterGroup.appendChild(chip);
    });
  }

  // ---- Build Sort Options ----
  function buildSortOptions() {
    sortSelect.innerHTML = `<option value="">—</option>`;
    headers.forEach((h, i) => {
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
      // Filter
      if (activeFilter) {
        const val = (row[activeFilter.colIndex] || "").trim();
        if (val !== activeFilter.value) return false;
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
        const va = (a[sortCol] || "").toLowerCase();
        const vb = (b[sortCol] || "").toLowerCase();
        // Try numeric
        const na = parseFloat(va), nb = parseFloat(vb);
        if (!isNaN(na) && !isNaN(nb)) return sortAsc ? na - nb : nb - na;
        return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      });
    }

    render();
    buildFilters(); // refresh active state
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
    rowCount.textContent = `${filtered.length} of ${rows.length} rows`;
  }

  // ---- Main Parse + Render ----
  function processData() {
    const result = parseInput(dataInput.value);
    if (!result.headers.length) return;

    headers = result.headers;
    rows = result.rows;
    sortCol = -1;
    sortAsc = true;
    activeFilter = null;
    filtered = [...rows];

    analyseColumns(headers, rows);
    buildSortOptions();
    buildFilters();

    controlsBar.classList.remove("hidden");
    dataOutput.classList.remove("hidden");
    emptyState.classList.add("hidden");

    // Collapse input & show Change Data button
    inputArea.classList.add("collapsed");
    btnChangeData.classList.remove("hidden");

    render();
    searchInput.focus();
  }

  // ---- Event Listeners ----

  // Parse button
  btnParse.addEventListener("click", processData);

  // Also parse on Ctrl+Enter or Cmd+Enter
  dataInput.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      processData();
    }
  });

  // Auto-detect paste and render
  dataInput.addEventListener("paste", () => {
    setTimeout(() => {
      if (dataInput.value.trim().split(/\r?\n/).length >= 2) {
        processData();
      }
    }, 100);
  });

  // Clear
  btnClear.addEventListener("click", () => {
    dataInput.value = "";
    headers = [];
    rows = [];
    filtered = [];
    controlsBar.classList.add("hidden");
    dataOutput.classList.add("hidden");
    emptyState.classList.add("hidden");
    filterGroup.innerHTML = "";
    searchInput.value = "";

    inputArea.classList.remove("collapsed");
    btnChangeData.classList.add("hidden");
    dataInput.focus();
  });

  // Sample
  btnSample.addEventListener("click", () => {
    dataInput.value = SAMPLE;
    processData();
  });

  // Search
  searchInput.addEventListener("input", debounce(applyFilters, 150));

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

  // Change Data button — re-open input area
  btnChangeData.addEventListener("click", () => {
    inputArea.classList.remove("collapsed");
    dataInput.focus();
    // Scroll to top so user sees the input
    inputArea.scrollIntoView({ behavior: "smooth", block: "start" });
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

})();
