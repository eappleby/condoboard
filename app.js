/* 372 12th board tracker.
   Runs against Supabase when config.js is filled in, otherwise runs in demo
   mode with in-memory sample data so the interface can be previewed. */

(function () {
  "use strict";

  const CFG = window.CONDOBOARD_CONFIG || {};
  const CATEGORIES = [
    "Maintenance", "Inspections", "Financial", "Insurance",
    "Legal & Compliance", "Meetings", "Vendors & Contracts", "Other",
  ];
  const RECUR_LABEL = {
    none: "", monthly: "Monthly", quarterly: "Quarterly",
    semiannual: "Every 6 months", annual: "Yearly",
    biennial: "Every 2 years", three_year: "Every 3 years", five_year: "Every 5 years",
  };
  const RECUR_MONTHS = {
    monthly: 1, quarterly: 3, semiannual: 6, annual: 12,
    biennial: 24, three_year: 36, five_year: 60,
  };
  const STATUS_LABEL = { open: "Open", in_progress: "In progress", done: "Done" };
  const VENDOR_STATUS_LABEL = { contracted: "Under contract", recommended: "Recommended", past: "No longer used" };

  // ------------------------------------------------------------------
  // Data stores
  // ------------------------------------------------------------------
  const demoMode = !CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY;

  function demoData() {
    const uid = () => crypto.randomUUID();
    const today = new Date();
    const d = (offsetDays) => {
      const x = new Date(today);
      x.setDate(x.getDate() + offsetDays);
      return x.toISOString().slice(0, 10);
    };
    const members = [
      { id: uid(), name: "Sample President", position: "President", email: "president@example.com", phone: "", apartment: "1" },
      { id: uid(), name: "Sample Treasurer", position: "Treasurer", email: "treasurer@example.com", phone: "", apartment: "2" },
    ];
    const vendors = [
      { id: uid(), name: "Sample Cleaning Co", service: "Janitorial", contact_name: "", email: "office@example.com", phone: "(555) 010-4411", website: "", notes: "", status: "contracted", cost: 500, cost_period: "monthly" },
      { id: uid(), name: "Sample Electric", service: "Electrician", contact_name: "", email: "info@example.com", phone: "", website: "", notes: "", status: "recommended", cost: null, cost_period: null },
    ];
    const accounts = [
      { id: uid(), name: "Sample Water Account", category: "Utilities", account_number: "0000000000", portal_url: "https://example.com", username: "building@example.com", notes: "" },
      { id: uid(), name: "Sample City Portal", category: "City portal", account_number: null, portal_url: "https://example.com", username: "board@example.com", notes: "" },
    ];
    const m = (i) => members[i].id, v = (i) => vendors[i].id;
    const tasks = [
      { id: uid(), title: "Sample overdue project", description: "This is demo data.", category: "Maintenance", status: "open", priority: "high", due_date: d(-40), last_completed_on: "2019-01-01", recurrence: "none", estimated_cost: 4000, assignee_id: m(0), vendor_id: null, completed_at: null },
      { id: uid(), title: "Sample inspection", description: "", category: "Inspections", status: "open", priority: "normal", due_date: d(12), last_completed_on: null, recurrence: "annual", estimated_cost: 1500, assignee_id: m(1), vendor_id: v(0), completed_at: null },
      { id: uid(), title: "Sample filing", description: "", category: "Legal & Compliance", status: "in_progress", priority: "high", due_date: d(60), last_completed_on: null, recurrence: "annual", estimated_cost: null, assignee_id: m(0), vendor_id: null, completed_at: null },
      { id: uid(), title: "Sample completed item", description: "", category: "Financial", status: "done", priority: "normal", due_date: d(-90), last_completed_on: null, recurrence: "annual", estimated_cost: null, assignee_id: m(1), vendor_id: null, completed_at: new Date(today.getTime() - 88 * 864e5).toISOString() },
      { id: uid(), title: "Sample item with no date", description: "", category: "Financial", status: "open", priority: "normal", due_date: null, last_completed_on: null, recurrence: "annual", estimated_cost: 150, assignee_id: null, vendor_id: null, completed_at: null },
    ];
    const links = [
      { id: uid(), title: "Sample document", url: "https://example.com", kind: "document", responsibility_id: tasks[0].id, vendor_id: null, account_id: null },
    ];
    return { members, vendors, tasks, links, accounts };
  }

  const TABLE = {
    members: "board_members", vendors: "vendors",
    tasks: "responsibilities", links: "links", accounts: "accounts",
  };

  function makeDemoStore() {
    // In demo mode the app state (S) is the only copy of the data and the UI
    // maintains it after each operation, so the store just hands back rows.
    return {
      async load() { return demoData(); },
      async insert(_kind, row) { return Object.assign({ id: crypto.randomUUID() }, row); },
      async update(_kind, _id, patch) { return patch; },
      async remove(_kind, _id) {},
    };
  }

  function makeSupabaseStore() {
    const client = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
    async function q(promise) {
      const { data, error } = await promise;
      if (error) throw new Error(error.message);
      return data;
    }
    return {
      async load() {
        const [members, vendors, tasks, links, accounts] = await Promise.all([
          q(client.from(TABLE.members).select("*").order("name")),
          q(client.from(TABLE.vendors).select("*").order("name")),
          q(client.from(TABLE.tasks).select("*").order("due_date", { ascending: true, nullsFirst: false })),
          q(client.from(TABLE.links).select("*")),
          q(client.from(TABLE.accounts).select("*").order("name")),
        ]);
        return { members, vendors, tasks, links, accounts };
      },
      async insert(kind, row) {
        return (await q(client.from(TABLE[kind]).insert(row).select()))[0];
      },
      async update(kind, id, patch) {
        return (await q(client.from(TABLE[kind]).update(patch).eq("id", id).select()))[0];
      },
      async remove(kind, id) {
        await q(client.from(TABLE[kind]).delete().eq("id", id));
      },
    };
  }

  // Built lazily so nothing is fetched before the password gate is passed.
  let store = null;
  function getStore() {
    if (!store) store = demoMode ? makeDemoStore() : makeSupabaseStore();
    return store;
  }

  // ------------------------------------------------------------------
  // State and helpers
  // ------------------------------------------------------------------
  let S = { members: [], vendors: [], tasks: [], links: [], accounts: [] };
  const $ = (id) => document.getElementById(id);

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function todayStr() { return new Date().toISOString().slice(0, 10); }
  function daysUntil(dateStr) {
    if (!dateStr) return null;
    const a = new Date(todayStr() + "T00:00:00");
    const b = new Date(dateStr + "T00:00:00");
    return Math.round((b - a) / 864e5);
  }
  function fmtDate(dateStr) {
    if (!dateStr) return "";
    return new Date(dateStr + "T00:00:00")
      .toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }
  function fmtMoney(n) {
    if (n == null || n === "") return "";
    return Number(n).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
  }
  function dueText(t) {
    if (t.status === "done") {
      const when = t.completed_at ? t.completed_at.slice(0, 10) : t.due_date;
      return { text: when ? "Completed " + fmtDate(when) : "Completed", cls: "" };
    }
    const n = daysUntil(t.due_date);
    if (n == null) return { text: "No date set", cls: "" };
    if (n < 0) {
      const yrs = Math.floor(Math.abs(n) / 365);
      const how = yrs >= 1 ? yrs + (yrs === 1 ? " year" : " years") + " overdue"
                           : Math.abs(n) + " days overdue";
      return { text: how + ", was due " + fmtDate(t.due_date), cls: "overdue" };
    }
    if (n === 0) return { text: "Due today", cls: "soon" };
    if (n === 1) return { text: "Due tomorrow", cls: "soon" };
    if (n <= 30) return { text: "Due in " + n + " days, " + fmtDate(t.due_date), cls: "soon" };
    return { text: "Due " + fmtDate(t.due_date), cls: "" };
  }
  function memberById(id) { return S.members.find((m) => m.id === id); }
  function vendorById(id) { return S.vendors.find((v) => v.id === id); }
  function accountById(id) { return S.accounts.find((a) => a.id === id); }
  function initials(name) {
    return name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  }
  function advanceDate(dateStr, recurrence) {
    const months = RECUR_MONTHS[recurrence];
    if (!months || !dateStr) return null;
    const d = new Date(dateStr + "T00:00:00");
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + months);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, lastDay));
    return d.toISOString().slice(0, 10);
  }
  function safeUrl(u) {
    const s = String(u || "").trim();
    return /^https?:\/\//i.test(s) ? s : "https://" + s;
  }

  let toastTimer = null;
  function toast(msg, isErr) {
    const el = $("toast");
    el.textContent = msg;
    el.className = "toast" + (isErr ? " err" : "");
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 4000);
  }
  function fail(err) {
    console.error(err);
    toast("Something went wrong. " + err.message, true);
  }

  // ------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------
  function assigneeChip(t) {
    const m = memberById(t.assignee_id);
    if (!m) return '<span class="assignee-chip"><span class="avatar avatar-none" aria-hidden="true">NA</span>Unassigned</span>';
    return '<span class="assignee-chip"><span class="avatar" aria-hidden="true">' +
      esc(initials(m.name)) + "</span>" + esc(m.name) + "</span>";
  }

  function taskCard(t) {
    const due = dueText(t);
    const v = vendorById(t.vendor_id);
    const bits = ['<span class="badge badge-cat">' + esc(t.category || "Other") + "</span>"];
    if (t.priority === "high" && t.status !== "done") bits.push('<span class="badge badge-high">High priority</span>');
    if (t.recurrence && t.recurrence !== "none") bits.push("<span>Repeats " + RECUR_LABEL[t.recurrence].toLowerCase() + "</span>");
    if (t.estimated_cost != null) bits.push('<span class="badge badge-cost">' + esc(fmtMoney(t.estimated_cost)) + "</span>");
    if (v) bits.push("<span>" + esc(v.name) + "</span>");
    const mod = t.status === "done" ? " is-done" : due.cls ? " is-" + due.cls : "";
    return '<button type="button" class="task-card' + mod + '" data-task="' + t.id + '">' +
      '<span class="row1"><span class="title">' + esc(t.title) + "</span>" +
      '<span class="due ' + due.cls + '">' + esc(due.text) + "</span></span>" +
      '<span class="meta">' + assigneeChip(t) + " " + bits.join(" ") + "</span></button>";
  }

  function renderList(elId, tasks, emptyMsg) {
    $(elId).innerHTML = tasks.length
      ? tasks.map(taskCard).join("")
      : '<p class="none">' + emptyMsg + "</p>";
  }

  function renderDashboard() {
    const open = S.tasks.filter((t) => t.status !== "done");
    const overdue = open.filter((t) => daysUntil(t.due_date) != null && daysUntil(t.due_date) < 0)
      .sort((a, b) => a.due_date.localeCompare(b.due_date));
    const soon = open.filter((t) => { const n = daysUntil(t.due_date); return n != null && n >= 0 && n <= 30; })
      .sort((a, b) => a.due_date.localeCompare(b.due_date));
    const later = open.filter((t) => { const n = daysUntil(t.due_date); return n != null && n > 30; })
      .sort((a, b) => a.due_date.localeCompare(b.due_date));
    const nodate = open.filter((t) => !t.due_date);
    const inprog = S.tasks.filter((t) => t.status === "in_progress");
    const done = S.tasks.filter((t) => t.status === "done")
      .sort((a, b) => (b.completed_at || "").localeCompare(a.completed_at || "")).slice(0, 6);

    const upcomingCost = open.reduce((sum, t) => sum + (Number(t.estimated_cost) || 0), 0);
    $("stats").innerHTML =
      '<div class="stat stat-red"><div class="num">' + overdue.length + '</div><div class="lbl">Overdue</div></div>' +
      '<div class="stat stat-amber"><div class="num">' + soon.length + '</div><div class="lbl">Due in 30 days</div></div>' +
      '<div class="stat stat-blue"><div class="num">' + open.length + '</div><div class="lbl">Open responsibilities</div></div>' +
      '<div class="stat stat-green"><div class="num">' + S.vendors.filter((v) => v.status !== "past").length +
        '</div><div class="lbl">Vendors on file</div></div>' +
      '<div class="stat stat-blue"><div class="num">' + esc(fmtMoney(upcomingCost) || "$0") +
        '</div><div class="lbl">Estimated cost of open work</div></div>';

    renderList("list-overdue", overdue, "Nothing is overdue.");
    renderList("list-soon", soon, "Nothing is due in the next 30 days.");
    renderList("list-later", later.slice(0, 8), "Nothing scheduled further out.");
    renderList("list-inprogress", inprog, "Nothing is in progress.");
    renderList("list-done", done, "Nothing completed yet.");
    renderList("list-nodate", nodate, "Everything has a date.");
  }

  function linksFor(kind, id) {
    const key = kind === "task" ? "responsibility_id" : kind === "vendor" ? "vendor_id" : "account_id";
    return S.links.filter((l) => l[key] === id);
  }

  function linkChips(links) {
    if (!links.length) return "";
    return '<span class="link-chips">' + links.map((l) =>
      '<a class="link-chip" href="' + esc(safeUrl(l.url)) + '" target="_blank" rel="noopener" ' +
      'onclick="event.stopPropagation()">' + esc(l.title || l.kind) + "</a>").join("") + "</span>";
  }

  function renderTaskTable() {
    const search = $("task-search").value.trim().toLowerCase();
    const fStatus = $("filter-status").value;
    const fCat = $("filter-category").value;
    const fAss = $("filter-assignee").value;

    let rows = S.tasks.slice();
    if (search) rows = rows.filter((t) => (t.title + " " + (t.description || "")).toLowerCase().includes(search));
    if (fStatus) rows = rows.filter((t) => t.status === fStatus);
    if (fCat) rows = rows.filter((t) => (t.category || "Other") === fCat);
    if (fAss) rows = rows.filter((t) => fAss === "none" ? !t.assignee_id : t.assignee_id === fAss);

    const rank = { open: 0, in_progress: 0, done: 1 };
    rows.sort((a, b) => (rank[a.status] - rank[b.status]) ||
      ((a.due_date || "9999").localeCompare(b.due_date || "9999")));

    $("task-tbody").innerHTML = rows.map((t) => {
      const due = dueText(t);
      const rowCls = t.status === "done" ? "row-plain" : due.cls ? "row-" + due.cls : "row-plain";
      return '<tr class="' + rowCls + '" data-task="' + t.id + '">' +
        '<td><div class="t-title">' + esc(t.title) + "</div>" +
          (t.description ? '<div class="t-desc">' + esc(t.description) + "</div>" : "") +
          linkChips(linksFor("task", t.id)) + "</td>" +
        '<td><span class="badge badge-cat">' + esc(t.category || "Other") + "</span></td>" +
        "<td>" + assigneeChip(t) + "</td>" +
        '<td class="' + (due.cls ? "due-" + due.cls : "") + '">' + esc(due.text) + "</td>" +
        "<td>" + (t.last_completed_on ? esc(fmtDate(t.last_completed_on)) : "Not recorded") + "</td>" +
        "<td>" + (t.estimated_cost != null ? esc(fmtMoney(t.estimated_cost)) : "") + "</td>" +
        '<td><span class="badge badge-' + t.status + '">' + STATUS_LABEL[t.status] + "</span></td>" +
        '<td class="t-actions">' + (t.status !== "done"
          ? '<button type="button" class="btn-done" data-done="' + t.id + '">Mark done</button>' : "") +
        "</td></tr>";
    }).join("");
    $("task-empty").hidden = rows.length > 0;
  }

  function vendorCard(v) {
    const lines = [];
    if (v.contact_name) lines.push('<div class="contact-line"><span class="lbl">Contact:</span> ' + esc(v.contact_name) + "</div>");
    if (v.phone) lines.push('<div class="contact-line"><span class="lbl">Phone:</span> <a href="tel:' + esc(v.phone) + '" onclick="event.stopPropagation()">' + esc(v.phone) + "</a></div>");
    if (v.email) lines.push('<div class="contact-line"><span class="lbl">Email:</span> <a href="mailto:' + esc(v.email) + '" onclick="event.stopPropagation()">' + esc(v.email) + "</a></div>");
    if (v.website) lines.push('<div class="contact-line"><span class="lbl">Website:</span> <a href="' + esc(safeUrl(v.website)) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">' + esc(v.website.replace(/^https?:\/\//, "")) + "</a></div>");
    if (v.cost != null) {
      lines.push('<div class="contact-line"><span class="lbl">Cost:</span> ' + esc(fmtMoney(v.cost)) +
        (v.cost_period ? " " + esc(v.cost_period) : "") + "</div>");
    }
    return '<button type="button" class="info-card" data-vendor="' + v.id + '">' +
      "<h3>" + esc(v.name) + "</h3>" +
      '<div class="sub">' + esc(v.service || VENDOR_STATUS_LABEL[v.status] || "") + "</div>" +
      lines.join("") +
      (v.notes ? '<div class="notes">' + esc(v.notes) + "</div>" : "") +
      linkChips(linksFor("vendor", v.id)) + "</button>";
  }

  function renderVendors() {
    const contracted = S.vendors.filter((v) => v.status !== "recommended");
    const recommended = S.vendors.filter((v) => v.status === "recommended");
    $("vendor-grid-contracted").innerHTML = contracted.length
      ? contracted.map(vendorCard).join("")
      : '<p class="none">No vendors under contract yet.</p>';
    $("vendor-grid-recommended").innerHTML = recommended.length
      ? recommended.map(vendorCard).join("")
      : '<p class="none">No recommended vendors yet.</p>';
    $("vendor-empty").hidden = S.vendors.length > 0;
  }

  function renderAccounts() {
    $("account-grid").innerHTML = S.accounts.map((a) => {
      const lines = [];
      if (a.account_number) lines.push('<div class="contact-line"><span class="lbl">Account number:</span> ' + esc(a.account_number) + "</div>");
      if (a.username) lines.push('<div class="contact-line"><span class="lbl">Username:</span> ' + esc(a.username) + "</div>");
      if (a.portal_url) lines.push('<div class="contact-line"><span class="lbl">Portal:</span> <a href="' + esc(safeUrl(a.portal_url)) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">Open site</a></div>');
      return '<button type="button" class="info-card" data-account="' + a.id + '">' +
        "<h3>" + esc(a.name) + "</h3>" +
        '<div class="sub">' + esc(a.category || "Account") + "</div>" +
        lines.join("") +
        (a.notes ? '<div class="notes">' + esc(a.notes) + "</div>" : "") +
        linkChips(linksFor("account", a.id)) + "</button>";
    }).join("");
    $("account-empty").hidden = S.accounts.length > 0;
  }

  function renderMembers() {
    $("member-grid").innerHTML = S.members.map((m) => {
      const count = S.tasks.filter((t) => t.assignee_id === m.id && t.status !== "done").length;
      const sub = [m.position || "Board member"];
      if (m.apartment) sub.push("Apartment " + m.apartment);
      return '<button type="button" class="info-card" data-member="' + m.id + '">' +
        "<h3>" + esc(m.name) + "</h3>" +
        '<div class="sub">' + esc(sub.join(", ")) + "</div>" +
        (m.email ? '<div class="contact-line"><span class="lbl">Email:</span> <a href="mailto:' + esc(m.email) + '" onclick="event.stopPropagation()">' + esc(m.email) + "</a></div>" : "") +
        (m.phone ? '<div class="contact-line"><span class="lbl">Phone:</span> <a href="tel:' + esc(m.phone) + '" onclick="event.stopPropagation()">' + esc(m.phone) + "</a></div>" : "") +
        '<div class="contact-line"><span class="lbl">Open items:</span> ' + count + "</div></button>";
    }).join("");
    $("member-empty").hidden = S.members.length > 0;
  }

  function renderFilterOptions() {
    $("filter-category").innerHTML = '<option value="">All categories</option>' +
      CATEGORIES.map((c) => "<option>" + esc(c) + "</option>").join("");
    $("filter-assignee").innerHTML =
      '<option value="">Everyone</option><option value="none">Unassigned</option>' +
      S.members.map((m) => '<option value="' + m.id + '">' + esc(m.name) + "</option>").join("");
  }

  function renderAll() {
    renderDashboard();
    renderTaskTable();
    renderVendors();
    renderAccounts();
    renderMembers();
  }

  // ------------------------------------------------------------------
  // Completing a responsibility
  // ------------------------------------------------------------------
  async function completeTask(t) {
    try {
      const now = new Date().toISOString();
      await getStore().update("tasks", t.id, { status: "done", completed_at: now });
      Object.assign(t, { status: "done", completed_at: now });
      if (t.recurrence && t.recurrence !== "none" && t.due_date) {
        const created = await getStore().insert("tasks", {
          title: t.title, description: t.description, category: t.category,
          status: "open", priority: t.priority,
          due_date: advanceDate(t.due_date, t.recurrence),
          last_completed_on: now.slice(0, 10),
          recurrence: t.recurrence, estimated_cost: t.estimated_cost,
          assignee_id: t.assignee_id, vendor_id: t.vendor_id, completed_at: null,
        });
        S.tasks.push(created);
        toast("Marked done. The next one is scheduled for " + fmtDate(created.due_date) + ".");
      } else {
        toast("Marked done.");
      }
      renderAll();
    } catch (e) { fail(e); }
  }

  // ------------------------------------------------------------------
  // Modals
  // ------------------------------------------------------------------
  let lastFocused = null;
  function openModal(id) {
    lastFocused = document.activeElement;
    $(id).hidden = false;
  }
  function closeModal(id) {
    $(id).hidden = true;
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }
  document.querySelectorAll("[data-close]").forEach((b) =>
    b.addEventListener("click", () => closeModal(b.dataset.close)));
  document.querySelectorAll(".modal-backdrop").forEach((bd) =>
    bd.addEventListener("mousedown", (e) => { if (e.target === bd) closeModal(bd.id); }));
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    let closedAny = false;
    document.querySelectorAll(".modal-backdrop").forEach((bd) => {
      if (!bd.hidden) { closeModal(bd.id); closedAny = true; }
    });
    // Only fall through to the menu when no dialog was open.
    if (!closedAny && !$("sidebar").hidden) { closeSidebar(); $("menu-open").focus(); }
  });

  // Link editors shared by the task and vendor modals.
  function makeLinkEditor(containerId, titleId, urlId, kindId, addBtnId) {
    let draft = [];
    let removed = [];
    function render() {
      $(containerId).innerHTML = draft.length
        ? draft.map((l, i) =>
            '<div class="link-row"><span class="kind">' + esc(l.kind) + "</span>" +
            '<a href="' + esc(safeUrl(l.url)) + '" target="_blank" rel="noopener">' + esc(l.title || l.url) + "</a>" +
            '<button type="button" class="rm" data-rm="' + i + '">Remove</button></div>').join("")
        : '<p class="link-none">Nothing added yet.</p>';
      $(containerId).querySelectorAll("[data-rm]").forEach((b) =>
        b.addEventListener("click", () => {
          const i = Number(b.dataset.rm);
          if (draft[i].id) removed.push(draft[i].id);
          draft.splice(i, 1);
          render();
        }));
    }
    $(addBtnId).addEventListener("click", () => {
      const url = $(urlId).value.trim();
      if (!url) { toast("Enter a web address for the link.", true); return; }
      draft.push({ title: $(titleId).value.trim() || url, url: safeUrl(url), kind: $(kindId).value });
      $(titleId).value = ""; $(urlId).value = "";
      render();
    });
    return {
      reset(existing) { draft = existing.map((l) => ({ id: l.id, title: l.title, url: l.url, kind: l.kind })); removed = []; render(); },
      draft: () => draft,
      removed: () => removed,
    };
  }

  const taskLinkEditor = makeLinkEditor("tf-links", "tf-link-title", "tf-link-url", "tf-link-kind", "tf-link-add");
  const vendorLinkEditor = makeLinkEditor("vf-links", "vf-link-title", "vf-link-url", "vf-link-kind", "vf-link-add");

  async function saveLinks(editor, ownerKey, ownerId) {
    for (const id of editor.removed()) {
      await getStore().remove("links", id);
      S.links = S.links.filter((l) => l.id !== id);
    }
    for (const l of editor.draft()) {
      if (l.id) continue;
      const row = { title: l.title, url: l.url, kind: l.kind, responsibility_id: null, vendor_id: null, account_id: null };
      row[ownerKey] = ownerId;
      S.links.push(await getStore().insert("links", row));
    }
  }

  function fillSelect(sel, items, current, emptyLabel) {
    sel.innerHTML = '<option value="">' + emptyLabel + "</option>" +
      items.map((x) => '<option value="' + x.id + '"' + (x.id === current ? " selected" : "") + ">" +
        esc(x.name) + "</option>").join("");
  }

  // ---------------- task modal ----------------
  function openTaskModal(t) {
    $("task-modal-title").textContent = t ? "Edit responsibility" : "New responsibility";
    $("tf-id").value = t ? t.id : "";
    $("tf-title").value = t ? t.title : "";
    $("tf-desc").value = t ? (t.description || "") : "";
    $("tf-category").innerHTML = CATEGORIES.map((c) =>
      "<option" + (t && t.category === c ? " selected" : "") + ">" + esc(c) + "</option>").join("");
    if (!t) $("tf-category").value = "Maintenance";
    $("tf-priority").value = t ? t.priority : "normal";
    $("tf-due").value = t ? (t.due_date || "") : "";
    $("tf-lastdone").value = t ? (t.last_completed_on || "") : "";
    $("tf-cost").value = t && t.estimated_cost != null ? t.estimated_cost : "";
    $("tf-recurrence").value = t ? (t.recurrence || "none") : "none";
    fillSelect($("tf-assignee"), S.members, t ? t.assignee_id : "", "Unassigned");
    fillSelect($("tf-vendor"), S.vendors, t ? t.vendor_id : "", "None");
    $("tf-status").value = t ? t.status : "open";
    $("tf-delete").hidden = !t;
    taskLinkEditor.reset(t ? linksFor("task", t.id) : []);
    openModal("task-modal");
    $("tf-title").focus();
  }

  $("task-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = $("tf-id").value;
    const existing = id ? S.tasks.find((t) => t.id === id) : null;
    const wasDone = existing && existing.status === "done";
    const nowDone = $("tf-status").value === "done";
    const costVal = $("tf-cost").value.trim();
    const row = {
      title: $("tf-title").value.trim(),
      description: $("tf-desc").value.trim() || null,
      category: $("tf-category").value,
      priority: $("tf-priority").value,
      due_date: $("tf-due").value || null,
      last_completed_on: $("tf-lastdone").value || null,
      estimated_cost: costVal === "" ? null : Number(costVal),
      recurrence: $("tf-recurrence").value,
      assignee_id: $("tf-assignee").value || null,
      vendor_id: $("tf-vendor").value || null,
      status: $("tf-status").value,
      completed_at: nowDone ? (existing && existing.completed_at) || new Date().toISOString() : null,
    };
    try {
      let saved;
      if (existing) {
        const patch = await getStore().update("tasks", id, row);
        Object.assign(existing, patch || row);
        saved = existing;
      } else {
        saved = await getStore().insert("tasks", row);
        S.tasks.push(saved);
      }
      await saveLinks(taskLinkEditor, "responsibility_id", saved.id);
      closeModal("task-modal");
      if (!wasDone && nowDone && row.recurrence !== "none" && row.due_date) {
        const created = await getStore().insert("tasks", Object.assign({}, row, {
          status: "open", completed_at: null,
          last_completed_on: todayStr(),
          due_date: advanceDate(row.due_date, row.recurrence),
        }));
        S.tasks.push(created);
        toast("Saved. The next one is scheduled for " + fmtDate(created.due_date) + ".");
      } else {
        toast("Saved.");
      }
      renderAll();
    } catch (err) { fail(err); }
  });

  $("tf-delete").addEventListener("click", async () => {
    const id = $("tf-id").value;
    if (!id || !confirm("Delete this responsibility? This cannot be undone.")) return;
    try {
      await getStore().remove("tasks", id);
      S.tasks = S.tasks.filter((t) => t.id !== id);
      S.links = S.links.filter((l) => l.responsibility_id !== id);
      closeModal("task-modal");
      toast("Deleted.");
      renderAll();
    } catch (e) { fail(e); }
  });

  // ---------------- vendor modal ----------------
  function openVendorModal(v) {
    $("vendor-modal-title").textContent = v ? "Edit vendor" : "Add vendor";
    $("vf-id").value = v ? v.id : "";
    $("vf-name").value = v ? v.name : "";
    $("vf-service").value = v ? (v.service || "") : "";
    $("vf-status").value = v ? (v.status || "contracted") : "contracted";
    $("vf-contact").value = v ? (v.contact_name || "") : "";
    $("vf-cost").value = v && v.cost != null ? v.cost : "";
    $("vf-costperiod").value = v ? (v.cost_period || "") : "";
    $("vf-phone").value = v ? (v.phone || "") : "";
    $("vf-email").value = v ? (v.email || "") : "";
    $("vf-website").value = v ? (v.website || "") : "";
    $("vf-notes").value = v ? (v.notes || "") : "";
    $("vf-delete").hidden = !v;
    vendorLinkEditor.reset(v ? linksFor("vendor", v.id) : []);
    openModal("vendor-modal");
    $("vf-name").focus();
  }

  $("vendor-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = $("vf-id").value;
    const costVal = $("vf-cost").value.trim();
    const row = {
      name: $("vf-name").value.trim(),
      service: $("vf-service").value.trim() || null,
      status: $("vf-status").value,
      contact_name: $("vf-contact").value.trim() || null,
      cost: costVal === "" ? null : Number(costVal),
      cost_period: $("vf-costperiod").value.trim() || null,
      phone: $("vf-phone").value.trim() || null,
      email: $("vf-email").value.trim() || null,
      website: $("vf-website").value.trim() || null,
      notes: $("vf-notes").value.trim() || null,
    };
    try {
      let saved;
      if (id) {
        const existing = S.vendors.find((v) => v.id === id);
        const patch = await getStore().update("vendors", id, row);
        Object.assign(existing, patch || row);
        saved = existing;
      } else {
        saved = await getStore().insert("vendors", row);
        S.vendors.push(saved);
      }
      await saveLinks(vendorLinkEditor, "vendor_id", saved.id);
      closeModal("vendor-modal");
      toast("Saved.");
      renderAll();
    } catch (err) { fail(err); }
  });

  $("vf-delete").addEventListener("click", async () => {
    const id = $("vf-id").value;
    if (!id || !confirm("Delete this vendor? Responsibilities linked to it stay, but lose the link.")) return;
    try {
      await getStore().remove("vendors", id);
      S.vendors = S.vendors.filter((v) => v.id !== id);
      S.links = S.links.filter((l) => l.vendor_id !== id);
      S.tasks.forEach((t) => { if (t.vendor_id === id) t.vendor_id = null; });
      closeModal("vendor-modal");
      toast("Deleted.");
      renderAll();
    } catch (e) { fail(e); }
  });

  // ---------------- account modal ----------------
  function openAccountModal(a) {
    $("account-modal-title").textContent = a ? "Edit account" : "Add account";
    $("af-id").value = a ? a.id : "";
    $("af-name").value = a ? a.name : "";
    $("af-category").value = a ? (a.category || "") : "";
    $("af-number").value = a ? (a.account_number || "") : "";
    $("af-username").value = a ? (a.username || "") : "";
    $("af-url").value = a ? (a.portal_url || "") : "";
    $("af-notes").value = a ? (a.notes || "") : "";
    $("af-delete").hidden = !a;
    openModal("account-modal");
    $("af-name").focus();
  }

  $("account-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = $("af-id").value;
    const row = {
      name: $("af-name").value.trim(),
      category: $("af-category").value.trim() || null,
      account_number: $("af-number").value.trim() || null,
      username: $("af-username").value.trim() || null,
      portal_url: $("af-url").value.trim() || null,
      notes: $("af-notes").value.trim() || null,
    };
    try {
      if (id) {
        const existing = accountById(id);
        const patch = await getStore().update("accounts", id, row);
        Object.assign(existing, patch || row);
      } else {
        S.accounts.push(await getStore().insert("accounts", row));
      }
      closeModal("account-modal");
      toast("Saved.");
      renderAll();
    } catch (err) { fail(err); }
  });

  $("af-delete").addEventListener("click", async () => {
    const id = $("af-id").value;
    if (!id || !confirm("Delete this account? This cannot be undone.")) return;
    try {
      await getStore().remove("accounts", id);
      S.accounts = S.accounts.filter((a) => a.id !== id);
      S.links = S.links.filter((l) => l.account_id !== id);
      closeModal("account-modal");
      toast("Deleted.");
      renderAll();
    } catch (e) { fail(e); }
  });

  // ---------------- member modal ----------------
  function openMemberModal(m) {
    $("member-modal-title").textContent = m ? "Edit board member" : "Add board member";
    $("mf-id").value = m ? m.id : "";
    $("mf-name").value = m ? m.name : "";
    $("mf-position").value = m ? (m.position || "") : "";
    $("mf-apartment").value = m ? (m.apartment || "") : "";
    $("mf-email").value = m ? (m.email || "") : "";
    $("mf-phone").value = m ? (m.phone || "") : "";
    $("mf-delete").hidden = !m;
    openModal("member-modal");
    $("mf-name").focus();
  }

  $("member-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = $("mf-id").value;
    const row = {
      name: $("mf-name").value.trim(),
      position: $("mf-position").value.trim() || null,
      apartment: $("mf-apartment").value.trim() || null,
      email: $("mf-email").value.trim() || null,
      phone: $("mf-phone").value.trim() || null,
    };
    try {
      if (id) {
        const existing = memberById(id);
        const patch = await getStore().update("members", id, row);
        Object.assign(existing, patch || row);
      } else {
        S.members.push(await getStore().insert("members", row));
      }
      closeModal("member-modal");
      toast("Saved.");
      renderFilterOptions();
      renderAll();
    } catch (err) { fail(err); }
  });

  $("mf-delete").addEventListener("click", async () => {
    const id = $("mf-id").value;
    if (!id || !confirm("Remove this board member? Their assignments become unassigned.")) return;
    try {
      await getStore().remove("members", id);
      S.members = S.members.filter((m) => m.id !== id);
      S.tasks.forEach((t) => { if (t.assignee_id === id) t.assignee_id = null; });
      closeModal("member-modal");
      toast("Removed.");
      renderFilterOptions();
      renderAll();
    } catch (e) { fail(e); }
  });

  // ------------------------------------------------------------------
  // Global events
  // ------------------------------------------------------------------
  const VIEWS = ["dashboard", "tasks", "vendors", "accounts", "board"];

  // The tabs appear twice, once in the top bar and once in the mobile
  // sidebar, so both copies are kept in step.
  function showView(name) {
    document.querySelectorAll(".tab").forEach((t) => {
      const on = t.dataset.tab === name;
      t.classList.toggle("active", on);
      if (on) t.setAttribute("aria-current", "page");
      else t.removeAttribute("aria-current");
    });
    VIEWS.forEach((v) => { $("view-" + v).hidden = v !== name; });
  }

  document.querySelectorAll(".tab").forEach((tab) =>
    tab.addEventListener("click", () => {
      showView(tab.dataset.tab);
      closeSidebar();
      window.scrollTo(0, 0);
    }));

  // ---------------- mobile sidebar ----------------
  function openSidebar() {
    $("sidebar-backdrop").hidden = false;
    $("sidebar").hidden = false;
    // Let the element render before animating it in.
    requestAnimationFrame(() => $("sidebar").classList.add("open"));
    $("menu-open").setAttribute("aria-expanded", "true");
    $("menu-close").focus();
  }
  function closeSidebar() {
    const sb = $("sidebar");
    if (sb.hidden) return;
    sb.classList.remove("open");
    $("menu-open").setAttribute("aria-expanded", "false");
    $("sidebar-backdrop").hidden = true;
    const finish = () => { sb.hidden = true; };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) finish();
    else setTimeout(finish, 220);
  }
  $("menu-open").addEventListener("click", openSidebar);
  $("menu-close").addEventListener("click", () => { closeSidebar(); $("menu-open").focus(); });
  $("sidebar-backdrop").addEventListener("click", () => { closeSidebar(); $("menu-open").focus(); });
  // Keep the sidebar from being left open and hidden when rotating to a wide screen.
  window.addEventListener("resize", () => { if (window.innerWidth > 860) closeSidebar(); });

  document.body.addEventListener("click", (e) => {
    const doneBtn = e.target.closest("[data-done]");
    if (doneBtn) {
      e.stopPropagation();
      const t = S.tasks.find((x) => x.id === doneBtn.dataset.done);
      if (t) completeTask(t);
      return;
    }
    if (e.target.closest("a")) return;
    const card = e.target.closest("[data-task]");
    if (card) { const t = S.tasks.find((x) => x.id === card.dataset.task); if (t) openTaskModal(t); return; }
    const vc = e.target.closest("[data-vendor]");
    if (vc) { const v = vendorById(vc.dataset.vendor); if (v) openVendorModal(v); return; }
    const ac = e.target.closest("[data-account]");
    if (ac) { const a = accountById(ac.dataset.account); if (a) openAccountModal(a); return; }
    const mc = e.target.closest("[data-member]");
    if (mc) { const m = memberById(mc.dataset.member); if (m) openMemberModal(m); return; }
  });

  $("btn-new-task").addEventListener("click", () => openTaskModal(null));
  $("btn-new-task-side").addEventListener("click", () => { closeSidebar(); openTaskModal(null); });
  $("btn-new-vendor").addEventListener("click", () => openVendorModal(null));
  $("btn-new-account").addEventListener("click", () => openAccountModal(null));
  $("btn-new-member").addEventListener("click", () => openMemberModal(null));

  ["task-search", "filter-status", "filter-category", "filter-assignee"].forEach((id) =>
    $(id).addEventListener("input", renderTaskTable));

  // ------------------------------------------------------------------
  // Password gate.
  //
  // A doorstop, not a lock: the password lives in config.js, which every
  // visitor's browser downloads. It stops a stray link from being walked
  // into. It does not stop anyone determined. See the README.
  // ------------------------------------------------------------------
  const PASSWORD = (CFG.SITE_PASSWORD || "").trim();
  const UNLOCK_KEY = "condoboard-unlock";

  function token(pw) {
    let h = 5381;
    for (let i = 0; i < pw.length; i++) h = ((h << 5) + h + pw.charCodeAt(i)) >>> 0;
    return "v1-" + h.toString(36);
  }
  function safeGet(storage, key) {
    try { return storage.getItem(key); } catch (e) { return null; }
  }
  function isUnlocked() {
    const want = token(PASSWORD.toLowerCase());
    return safeGet(localStorage, UNLOCK_KEY) === want || safeGet(sessionStorage, UNLOCK_KEY) === want;
  }
  function rememberUnlock(persist) {
    try { (persist ? localStorage : sessionStorage).setItem(UNLOCK_KEY, token(PASSWORD.toLowerCase())); }
    catch (e) { /* private browsing */ }
  }

  $("gate-form").addEventListener("submit", (e) => {
    e.preventDefault();
    if ($("gate-input").value.trim().toLowerCase() !== PASSWORD.toLowerCase()) {
      $("gate-err").hidden = false;
      $("gate-input").value = "";
      $("gate-input").focus();
      return;
    }
    rememberUnlock($("gate-remember").checked);
    $("gate-err").hidden = true;
    $("gate").hidden = true;
    document.body.classList.remove("locked");
    start();
  });

  // ------------------------------------------------------------------
  // Boot
  // ------------------------------------------------------------------
  async function start() {
    $("demo-banner").hidden = !demoMode;
    try {
      S = await getStore().load();
      S.accounts = S.accounts || [];
      renderFilterOptions();
      renderAll();
    } catch (e) {
      fail(e);
      $("stats").innerHTML = '<div class="stat" style="grid-column:1/-1"><div class="lbl">' +
        "Could not load the data. Check the Supabase address and key in config.js, and make sure the " +
        "migrations have been applied. See the README. Error: " + esc(e.message) + "</div></div>";
    }
  }

  function boot() {
    const name = CFG.BUILDING_NAME || "372 12th";
    $("brand-name").textContent = name;
    $("gate-title").textContent = name;
    document.title = name;
    if (PASSWORD && !isUnlocked()) {
      document.body.classList.add("locked");
      $("gate").hidden = false;
      $("gate-input").focus();
    } else {
      start();
    }
  }
  boot();
})();
