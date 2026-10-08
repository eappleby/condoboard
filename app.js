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
    biennial: "Every 2 years", three_year: "Every 3 years",
    four_year: "Every 4 years", five_year: "Every 5 years", ongoing: "Ongoing",
  };
  const RECUR_MONTHS = {
    monthly: 1, quarterly: 3, semiannual: 6, annual: 12,
    biennial: 24, three_year: 36, four_year: 48, five_year: 60,
  };
  // Stored values are open, done and canceled. The board sees them as
  // Active, Complete and Canceled. in_progress is a retired value that a
  // migration folds into open, and it reads as Active until then.
  const STATUS_LABEL = { open: "Active", in_progress: "Active", done: "Complete", canceled: "Canceled" };
  function isActive(t) { return t.status === "open" || t.status === "in_progress"; }
  // Ongoing work has no due date and is never marked done, only ended by
  // completing or canceling it in its dialog.
  function isOngoing(t) { return t.recurrence === "ongoing"; }
  const VENDOR_STATUS_LABEL = { contracted: "Under contract", recommended: "Recommended", past: "No longer used" };

  // ------------------------------------------------------------------
  // Data stores
  // ------------------------------------------------------------------
  const demoMode = !CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY;
  const MONTHS_SEED = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

  function demoData() {
    const uid = () => crypto.randomUUID();
    const today = new Date();
    const d = (offsetDays) => {
      const x = new Date(today);
      x.setDate(x.getDate() + offsetDays);
      return ymd(x);
    };
    const members = [
      { id: uid(), name: "Sample President", email: "president@example.com", phone: "", apartment: "1" },
      { id: uid(), name: "Sample Treasurer", email: "treasurer@example.com", phone: "", apartment: "2" },
    ];
    const vendors = [
      { id: uid(), name: "Sample Cleaning Co", service: "Janitorial", website: "", notes: "", status: "contracted", cost: 500, cost_period: "monthly" },
      { id: uid(), name: "Sample Electric", service: "Electrician", website: "", notes: "", status: "recommended", cost: null, cost_period: null },
    ];
    const accounts = [
      { id: uid(), name: "Sample Water Account", category: "Utilities", account_number: "0000000000", portal_url: "https://example.com", username: "building@example.com", notes: "" },
      { id: uid(), name: "Sample City Portal", category: "City portal", account_number: null, portal_url: "https://example.com", username: "board@example.com", notes: "" },
    ];
    const roles = [
      { id: uid(), name: "President", member_id: members[0].id, position: 0 },
      { id: uid(), name: "Treasurer", member_id: members[1].id, position: 1 },
    ];
    const m = (i) => roles[i].id, v = (i) => vendors[i].id;
    const tasks = [
      { id: uid(), title: "Sample overdue project", description: "This is demo data.", category: "Maintenance", status: "open", priority: "high", due_date: d(-40), last_completed_on: "2019-01-01", recurrence: "none", estimated_cost: 4000, role_id: m(0), vendor_id: null, completed_at: null },
      { id: uid(), title: "Sample inspection", description: "", category: "Inspections", status: "open", priority: "normal", due_date: d(12), last_completed_on: null, recurrence: "annual", estimated_cost: 1500, role_id: m(1), vendor_id: v(0), completed_at: null },
      { id: uid(), title: "Sample filing", description: "", category: "Legal & Compliance", status: "open", priority: "high", due_date: d(60), last_completed_on: null, recurrence: "annual", estimated_cost: null, role_id: m(0), vendor_id: null, account_id: null, completed_at: null },
      { id: uid(), title: "Sample completed item", description: "", category: "Financial", status: "done", priority: "normal", due_date: d(-90), last_completed_on: null, recurrence: "none", estimated_cost: null, role_id: m(1), vendor_id: null, completed_at: new Date(today.getTime() - 88 * 864e5).toISOString() },
      { id: uid(), title: "Sample canceled item", description: "", category: "Maintenance", status: "canceled", priority: "normal", due_date: d(20), last_completed_on: null, recurrence: "none", estimated_cost: null, role_id: null, vendor_id: null, completed_at: null },
      { id: uid(), title: "Sample item with no date", description: "", category: "Financial", status: "open", priority: "normal", due_date: null, last_completed_on: null, recurrence: "annual", estimated_cost: 150, role_id: null, vendor_id: null, completed_at: null },
    ];
    const links = [
      { id: uid(), title: "Sample document", url: "https://example.com", kind: "document", responsibility_id: tasks[0].id, vendor_id: null, account_id: null },
    ];
    const settings = { id: 1, reminders_enabled: false, frequency: "monthly", send_weekday: 1,
      send_day_of_month: 1, delivery_mode: "digest", digest_email: "board@example.com", last_sent_at: null };
    const schedules = [{ id: uid(), name: "Trash and recycling", description: "Sample rotation.", position: 0 }];
    const scheduleSlots = [1, 3, 5, 7, 9, 11].map((mo, i) => ({
      id: uid(), schedule_id: schedules[0].id,
      label: MONTHS_SEED[mo - 1] + "/" + MONTHS_SEED[mo],
      responsible: String(i + 1), month_start: mo, month_end: mo + 1, position: i,
    }));
    const fixtures = [
      { id: uid(), name: "Sample Paint", category: "Paint", brand: "Sample Brand", code: "123",
        location: "Walls", url: "https://example.com", image_url: null, color_hex: "#E0DFD7", notes: "", position: 0 },
      { id: uid(), name: "Sample Light", category: "Lighting", brand: "Sample Brand", code: null,
        location: "Hallway", url: "https://example.com", color_hex: null, notes: "", position: 1 },
    ];
    const contacts = [
      { id: uid(), vendor_id: vendors[0].id, name: "Sample Manager", email: "office@example.com", phone: "(555) 010-4411", is_primary: true, position: 0 },
      { id: uid(), vendor_id: vendors[0].id, name: "Sample Billing", label: "Billing", email: "billing@example.com", phone: null, is_primary: false, position: 1 },
      { id: uid(), vendor_id: vendors[1].id, name: "Sample Electrician", email: "info@example.com", phone: null, is_primary: true, position: 0 },
    ];
    tasks[2].account_id = accounts[1].id;
    return { members, roles, vendors, contacts, tasks, links, accounts, settings, schedules, scheduleSlots, fixtures };
  }

  const TABLE = {
    members: "board_members", roles: "board_roles", vendors: "vendors",
    tasks: "responsibilities", links: "links", accounts: "accounts",
    settings: "reminder_settings",
    schedules: "schedules", scheduleSlots: "schedule_slots", fixtures: "fixtures",
    contacts: "vendor_contacts",
  };

  function makeDemoStore() {
    // In demo mode the app state (S) is the only copy of the data and the UI
    // maintains it after each operation, so the store just hands back rows.
    return {
      async load() { return demoData(); },
      async insert(_kind, row) { return Object.assign({ id: crypto.randomUUID() }, row); },
      async update(_kind, _id, patch) { return patch; },
      async remove(_kind, _id) {},
      // Nothing is stored in demo mode, so the picture lives for this page only.
      async upload(_bucket, file) { return URL.createObjectURL(file); },
    };
  }

  function makeSupabaseStore() {
    if (!window.supabase || !window.supabase.createClient) {
      throw new Error("The Supabase library did not load. Check the network connection, " +
        "or whether the script tag at the bottom of index.html is being blocked.");
    }
    const client = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
    async function q(promise) {
      const { data, error } = await promise;
      if (error) throw new Error(error.message);
      return data;
    }
    return {
      async load() {
        const [members, vendors, tasks, links, accounts, settings, schedules, scheduleSlots, fixtures, roles, contacts] = await Promise.all([
          q(client.from(TABLE.members).select("*").order("name")),
          q(client.from(TABLE.vendors).select("*").order("name")),
          q(client.from(TABLE.tasks).select("*").order("due_date", { ascending: true, nullsFirst: false })),
          q(client.from(TABLE.links).select("*")),
          q(client.from(TABLE.accounts).select("*").order("name")),
          // Non fatal: if the settings migration has not been applied yet the
          // rest of the app should still load, with defaults in the form.
          q(client.from(TABLE.settings).select("*").eq("id", 1)).catch(() => []),
          q(client.from(TABLE.schedules).select("*").order("position")).catch(() => []),
          q(client.from(TABLE.scheduleSlots).select("*").order("position")).catch(() => []),
          q(client.from(TABLE.fixtures).select("*").order("position")).catch(() => []),
          q(client.from(TABLE.roles).select("*").order("position")).catch(() => []),
          q(client.from(TABLE.contacts).select("*").order("position")).catch(() => []),
        ]);
        return {
          members, roles, vendors, contacts, tasks, links, accounts,
          settings: settings[0] || null, schedules, scheduleSlots, fixtures,
        };
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
      // Puts a file in a public Storage bucket and returns its address.
      async upload(bucket, file) {
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
        const path = crypto.randomUUID() + "." + ext;
        const { error } = await client.storage.from(bucket).upload(path, file, { contentType: file.type });
        if (error) throw new Error(error.message);
        return client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
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
  let S = { members: [], roles: [], vendors: [], contacts: [], tasks: [], links: [], accounts: [],
    settings: null, schedules: [], scheduleSlots: [], fixtures: [] };
  const $ = (id) => document.getElementById(id);

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  // Dates are local, so "today" does not roll over early in the evening.
  function ymd(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
      "-" + String(d.getDate()).padStart(2, "0");
  }
  function todayStr() { return ymd(new Date()); }
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
    if (t.status === "canceled") return { text: "Canceled", cls: "" };
    if (isOngoing(t) && isActive(t)) return { text: "Ongoing", cls: "" };
    if (t.status === "done") {
      const when = t.completed_at ? ymd(new Date(t.completed_at)) : t.due_date;
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
  function roleById(id) { return S.roles.find((r) => r.id === id); }
  function sortedRoles() {
    return S.roles.slice().sort((a, b) =>
      (a.position || 0) - (b.position || 0) || a.name.localeCompare(b.name));
  }
  function roleLabel(r) {
    const m = memberById(r.member_id);
    return r.name + ", " + (m ? m.name : "vacant");
  }
  function rolesOf(memberId) { return sortedRoles().filter((r) => r.member_id === memberId); }
  function tasksOfMember(memberId) {
    const ids = rolesOf(memberId).map((r) => r.id);
    return S.tasks.filter((t) => isActive(t) && ids.includes(t.role_id));
  }
  function vendorById(id) { return S.vendors.find((v) => v.id === id); }
  function accountById(id) { return S.accounts.find((a) => a.id === id); }
  // People's pictures come from Gravatar, keyed by a SHA-256 of the email.
  // The first letter of the first name sits underneath and shows whenever
  // there is no picture, the request fails, or hashing is unavailable.
  const gravatar = new Map();     // email -> hash
  const noGravatar = new Set();   // hashes that came back with no picture
  function emailKey(m) { return String((m && m.email) || "").trim().toLowerCase(); }
  async function hashEmails() {
    if (!window.crypto || !crypto.subtle) return;
    for (const m of S.members) {
      const key = emailKey(m);
      if (!key || gravatar.has(key)) continue;
      try {
        const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
        gravatar.set(key, Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join(""));
      } catch (e) { return; }
    }
  }
  function avatar(m, cls) {
    const hash = gravatar.get(emailKey(m));
    const img = hash && !noGravatar.has(hash)
      ? '<img src="https://gravatar.com/avatar/' + hash + '?s=128&d=404" data-h="' + hash +
        '" alt="" loading="lazy" referrerpolicy="no-referrer">'
      : "";
    return '<span class="avatar' + (cls ? " " + cls : "") + '" aria-hidden="true">' +
      esc(String(m.name || "").trim().charAt(0).toUpperCase()) + img + "</span>";
  }
  // Error events do not bubble, so this listens in the capture phase.
  document.addEventListener("error", (e) => {
    const el = e.target;
    if (el && el.tagName === "IMG" && el.dataset.h) { noGravatar.add(el.dataset.h); el.remove(); }
  }, true);
  function advanceDate(dateStr, recurrence, steps) {
    const months = RECUR_MONTHS[recurrence];
    if (!months || !dateStr) return null;
    const d = new Date(dateStr + "T00:00:00");
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + months * (steps || 1));
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, lastDay));
    return ymd(d);
  }
  // The next due date after completing a repeating item today. Steps from the
  // old due date so the day of the month holds, and skips any cycles already
  // in the past. With no due date it counts from today.
  function nextDue(dueDate, recurrence) {
    const from = dueDate || todayStr();
    for (let k = 1; k < 600; k++) {
      const d = advanceDate(from, recurrence, k);
      if (!d || d > todayStr()) return d;
    }
    return null;
  }
  function isRecurring(t) { return !!RECUR_MONTHS[t.recurrence]; }
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
    const r = roleById(t.role_id);
    if (!r) return '<span class="assignee-chip"><span class="avatar avatar-none" aria-hidden="true">NA</span>Unassigned</span>';
    const m = memberById(r.member_id);
    const pic = m ? avatar(m) : '<span class="avatar avatar-none" aria-hidden="true">' +
      esc(r.name.trim().charAt(0).toUpperCase()) + "</span>";
    return '<span class="assignee-chip">' + pic + '<span><span class="role-name">' + esc(r.name) +
      "</span>, " + esc(m ? m.name : "vacant") + "</span></span>";
  }

  // doneOn is set when the card sits in the completed list. A repeating item
  // stays open after it is done, so there the card shows when it was done.
  function taskCard(t, doneOn) {
    const due = doneOn ? { text: "Done " + fmtDate(doneOn), cls: "" } : dueText(t);
    const v = vendorById(t.vendor_id);
    const bits = ['<span class="badge badge-cat">' + esc(t.category || "Other") + "</span>"];
    if (t.priority === "high" && isActive(t)) bits.push('<span class="badge badge-high">High priority</span>');
    if (isRecurring(t)) bits.push("<span>Repeats " + RECUR_LABEL[t.recurrence].toLowerCase() + "</span>");
    if (t.estimated_cost != null) bits.push('<span class="badge badge-cost">' + esc(fmtMoney(t.estimated_cost)) + "</span>");
    if (v) bits.push("<span>" + esc(v.name) + "</span>");
    const acct = accountById(t.account_id);
    if (acct) bits.push("<span>" + esc(acct.name) + "</span>");
    if (doneOn && isActive(t) && t.due_date) bits.push("<span>Next due " + esc(fmtDate(t.due_date)) + "</span>");
    const mod = (doneOn || t.status === "done") ? " is-done" : due.cls ? " is-" + due.cls : "";
    return '<button type="button" class="task-card' + mod + '" data-task="' + t.id + '">' +
      '<span class="row1"><span class="title">' + esc(t.title) + "</span>" +
      '<span class="due ' + due.cls + '">' + esc(due.text) + "</span></span>" +
      '<span class="meta">' + assigneeChip(t) + " " + bits.join(" ") + "</span></button>";
  }

  function renderList(elId, tasks, emptyMsg) {
    $(elId).innerHTML = tasks.length
      ? tasks.map((t) => taskCard(t)).join("")
      : '<p class="none">' + emptyMsg + "</p>";
  }

  function renderDashboard() {
    const open = S.tasks.filter(isActive);
    const overdue = open.filter((t) => daysUntil(t.due_date) != null && daysUntil(t.due_date) < 0)
      .sort((a, b) => a.due_date.localeCompare(b.due_date));
    const soon = open.filter((t) => { const n = daysUntil(t.due_date); return n != null && n >= 0 && n <= 30; })
      .sort((a, b) => a.due_date.localeCompare(b.due_date));
    const later = open.filter((t) => { const n = daysUntil(t.due_date); return n != null && n > 30; })
      .sort((a, b) => a.due_date.localeCompare(b.due_date));
    const nodate = open.filter((t) => !t.due_date && !isOngoing(t));
    const ongoing = open.filter(isOngoing).sort((a, b) => a.title.localeCompare(b.title));
    const done = S.tasks.map((t) => ({
      t: t,
      on: t.status === "done" ? (t.completed_at ? ymd(new Date(t.completed_at)) : t.due_date)
        : isActive(t) && isRecurring(t) ? t.last_completed_on : null,
    })).filter((x) => x.on).sort((a, b) => b.on.localeCompare(a.on)).slice(0, 6);

    const upcomingCost = open.reduce((sum, t) => sum + (Number(t.estimated_cost) || 0), 0);
    $("stats").innerHTML =
      '<div class="stat stat-red"><div class="num">' + overdue.length + '</div><div class="lbl">Overdue</div></div>' +
      '<div class="stat stat-amber"><div class="num">' + soon.length + '</div><div class="lbl">Due in 30 days</div></div>' +
      '<div class="stat stat-blue"><div class="num">' + open.length + '</div><div class="lbl">Active responsibilities</div></div>' +
      '<div class="stat stat-green"><div class="num">' + S.vendors.filter((v) => v.status !== "past").length +
        '</div><div class="lbl">Vendors on file</div></div>' +
      '<div class="stat stat-blue"><div class="num">' + esc(fmtMoney(upcomingCost) || "$0") +
        '</div><div class="lbl">Estimated cost of active work</div></div>';

    renderList("list-overdue", overdue, "Nothing is overdue.");
    renderList("list-soon", soon, "Nothing is due in the next 30 days.");
    renderList("list-later", later.slice(0, 8), "Nothing scheduled further out.");
    $("list-done").innerHTML = done.length
      ? done.map((x) => taskCard(x.t, x.on)).join("")
      : '<p class="none">Nothing completed yet.</p>';
    renderList("list-nodate", nodate, "Everything has a date.");
    renderList("list-ongoing", ongoing, "Nothing ongoing.");
  }

  function linksFor(kind, id) {
    const key = kind === "task" ? "responsibility_id"
      : kind === "vendor" ? "vendor_id"
      : kind === "fixture" ? "fixture_id" : "account_id";
    return S.links.filter((l) => l[key] === id)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }

  function linkChips(links) {
    if (!links.length) return "";
    return '<span class="link-chips">' + links.map((l) =>
      '<a class="link-chip" href="' + esc(safeUrl(l.url)) + '" target="_blank" rel="noopener" ' +
      'onclick="event.stopPropagation()">' + esc(l.title || l.kind) + "</a>").join("") + "</span>";
  }

  // Table dates stay short: the day in the current year, otherwise the year.
  function shortDate(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr + "T00:00:00");
    return d.getFullYear() === new Date().getFullYear()
      ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
      : String(d.getFullYear());
  }
  // The person behind a responsibility, through its role. Null when it is
  // unassigned or the role is vacant.
  function memberOfTask(t) {
    const r = roleById(t.role_id);
    return (r && memberById(r.member_id) && r.member_id) || null;
  }
  function firstName(t) {
    const r = roleById(t.role_id);
    const m = r && memberById(r.member_id);
    return m ? m.name.trim().split(/\s+/)[0] : "";
  }
  // Clicking a column heading sorts by it, then reverses. With no key the
  // table keeps its usual order: open items by due date, then done ones.
  const taskSort = { key: null, dir: 1 };
  const SORT_VALUE = {
    title: (t) => t.title.toLowerCase(),
    assignee: (t) => firstName(t).toLowerCase() || null,
    due: (t) => t.due_date || null,
    last: (t) => t.last_completed_on || null,
    cost: (t) => (t.estimated_cost == null ? null : Number(t.estimated_cost)),
    status: (t) => ({ open: 0, in_progress: 0, done: 1, canceled: 2 })[t.status],
  };

  function renderTaskTable() {
    const search = $("task-search").value.trim().toLowerCase();
    const fStatus = $("filter-status").value;
    const fCat = $("filter-category").value;
    const fAss = $("filter-assignee").value;

    let rows = S.tasks.slice();
    if (search) rows = rows.filter((t) => (t.title + " " + (t.description || "")).toLowerCase().includes(search));
    if (fStatus === "open") rows = rows.filter(isActive);
    else if (fStatus !== "all") rows = rows.filter((t) => t.status === fStatus);
    if (fCat) rows = rows.filter((t) => (t.category || "Other") === fCat);
    if (fAss) rows = rows.filter((t) => (memberOfTask(t) || "none") === fAss);
    // Active is the default, so only another status counts as a filter.
    const active = [fStatus !== "open", fCat, fAss].filter(Boolean).length;
    $("filter-toggle").textContent = active ? "Filter (" + active + ")" : "Filter";

    // The status badge only appears when every status is listed, since
    // otherwise each row has the status the filter names. The last column
    // then holds just the done button, and goes away entirely for the
    // complete and canceled lists.
    const showStatus = fStatus === "all";
    $("task-table").dataset.view = fStatus;
    $("th-status-sort").hidden = !showStatus;
    $("th-status-plain").hidden = showStatus;
    if (!showStatus && taskSort.key === "status") taskSort.key = null;

    const rank = { open: 0, in_progress: 0, done: 1, canceled: 2 };
    if (taskSort.key) {
      // Empty values go last whichever way the column is sorted.
      const val = SORT_VALUE[taskSort.key];
      rows.sort((a, b) => {
        const x = val(a), y = val(b);
        if (x == null || y == null) return (x == null) - (y == null);
        return (typeof x === "number" ? x - y : String(x).localeCompare(String(y))) * taskSort.dir;
      });
    } else {
      rows.sort((a, b) => (rank[a.status] - rank[b.status]) ||
        ((a.due_date || "9999").localeCompare(b.due_date || "9999")));
    }
    document.querySelectorAll("#task-table th[data-sort]").forEach((th) => {
      const on = th.dataset.sort === taskSort.key;
      th.setAttribute("aria-sort", on ? (taskSort.dir > 0 ? "ascending" : "descending") : "none");
    });

    $("task-tbody").innerHTML = rows.map((t) => {
      const due = dueText(t);
      const done = !isActive(t);
      const rowCls = done ? "row-plain" : due.cls ? "row-" + due.cls : "row-plain";
      const when = t.status === "done" && t.completed_at ? ymd(new Date(t.completed_at)) : t.due_date;
      const flag = !done && due.cls === "overdue" ? '<span class="visually-hidden">Overdue </span>' : "";
      return '<tr class="' + rowCls + '" data-task="' + t.id + '">' +
        '<td><div class="t-title">' + esc(t.title) + "</div>" +
          (t.description ? '<div class="t-desc">' + esc(t.description) + "</div>" : "") +
          linkChips(linksFor("task", t.id)) + "</td>" +
        "<td>" + esc(firstName(t)) + "</td>" +
        '<td class="t-date ' + (!done && due.cls ? "due-" + due.cls : "") + '" title="' + esc(due.text) + '">' +
          flag + esc(isOngoing(t) && !done ? "Ongoing" : shortDate(when)) + "</td>" +
        '<td class="t-date">' + esc(shortDate(t.last_completed_on)) + "</td>" +
        "<td>" + (t.estimated_cost != null ? esc(fmtMoney(t.estimated_cost)) : "") + "</td>" +
        '<td class="t-status">' + (showStatus ? '<span class="badge badge-' + (isActive(t) ? "open" : t.status) + '">' +
          STATUS_LABEL[t.status] + "</span>" : "") +
          (!done && !isOngoing(t) ? '<button type="button" class="btn-done" data-done="' + t.id + '" aria-label="Mark done">' +
            '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">' +
            '<path d="M2.5 8.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" stroke-width="2.2" ' +
            'stroke-linecap="round" stroke-linejoin="round"/></svg>Done</button>' : "") +
        "</td></tr>";
    }).join("");
    $("task-empty").hidden = rows.length > 0;
  }

  // Section colours, from the same palette as the dashboard. Red is left
  // out because it means overdue.
  const ACCOUNT_TONE = { "utilities": "amber", "city portal": "blue", "financial": "green",
    "communications": "purple", "building systems": "slate" };
  const FIXTURE_TONE = { "paint": "purple", "lighting": "amber", "hardware": "slate",
    "intercom": "blue", "appliances": "green" };
  function toneFor(map, key) { return map[String(key || "").trim().toLowerCase()] || "blue"; }

  // A vendor's contacts, the primary one first.
  function contactsFor(vendorId) {
    return S.contacts.filter((c) => c.vendor_id === vendorId).sort((a, b) =>
      (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0) || (a.position || 0) - (b.position || 0));
  }

  // Cards carry only what identifies the record. Everything else is in the
  // dialog the card opens.
  function siteLink(url) {
    return '<div class="contact-line"><a href="' + esc(safeUrl(url)) + '" target="_blank" rel="noopener">' +
      esc(String(url).trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "")) + "</a></div>";
  }

  function vendorCard(v) {
    const primary = contactsFor(v.id)[0];
    const tone = v.status === "recommended" ? "blue" : v.status === "past" ? "slate" : "green";
    return '<button type="button" class="info-card tone-' + tone + '" data-vendor="' + v.id + '">' +
      "<h3>" + esc(v.name) + "</h3>" +
      '<div class="sub">' + esc(v.service || VENDOR_STATUS_LABEL[v.status] || "") + "</div>" +
      (v.website ? siteLink(v.website) : "") +
      (primary && primary.email ? '<div class="contact-line"><a href="mailto:' + esc(primary.email) + '">' +
        esc(primary.email) + "</a></div>" : "") + "</button>";
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
    $("account-grid").innerHTML = S.accounts.map((a) =>
      '<button type="button" class="info-card tone-' + toneFor(ACCOUNT_TONE, a.category) + '" data-account="' + a.id + '">' +
        "<h3>" + esc(a.name) + "</h3>" +
        '<div class="sub">' + esc(a.category || "Account") + "</div>" +
        (a.portal_url ? siteLink(a.portal_url) : "") + "</button>").join("");
    $("account-empty").hidden = S.accounts.length > 0;
  }

  function renderMembers() {
    $("role-grid").innerHTML = sortedRoles().map((r) => {
      const m = memberById(r.member_id);
      return '<button type="button" class="info-card tone-purple" data-role="' + r.id + '">' +
        "<h3>" + esc(r.name) + "</h3>" +
        '<div class="sub">' + esc(m ? m.name : "Vacant") + "</div></button>";
    }).join("") || '<p class="none">No roles yet.</p>';

    // The whole tile opens the member through the name button, whose hit area
    // is stretched over the card. The email and phone links sit above it.
    $("member-grid").innerHTML = S.members.map((m) =>
      '<div class="info-card card-stretch tone-blue">' +
        '<div class="member-head">' + avatar(m, "avatar-lg") +
        '<div><h3><button type="button" class="card-open" data-member="' + m.id + '">' + esc(m.name) + "</button></h3>" +
        (m.apartment ? '<div class="sub">Apartment ' + esc(m.apartment) + "</div>" : "") + "</div></div>" +
        (m.email ? '<div class="contact-line"><a href="mailto:' + esc(m.email) + '">' + esc(m.email) + "</a></div>" : "") +
        (m.phone ? '<div class="contact-line"><a href="tel:' + esc(m.phone) + '">' + esc(m.phone) + "</a></div>" : "") +
        "</div>").join("");
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
    renderFixtures();
    renderSchedules();
    renderSettings();
  }

  // ------------------------------------------------------------------
  // Completing a responsibility
  // ------------------------------------------------------------------
  // A repeating item is never left done. Completing it records today as the
  // last time it was done and moves the due date to the next cycle.
  function rollForward(dueDate, recurrence) {
    return {
      status: "open", completed_at: null,
      last_completed_on: todayStr(),
      due_date: nextDue(dueDate, recurrence),
    };
  }

  async function completeTask(t) {
    try {
      const patch = isRecurring(t)
        ? rollForward(t.due_date, t.recurrence)
        : { status: "done", completed_at: new Date().toISOString() };
      await getStore().update("tasks", t.id, patch);
      Object.assign(t, patch);
      toast(isRecurring(t) ? "Marked done. Next due " + fmtDate(t.due_date) + "." : "Marked done.");
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

  // Document editor, shared by the responsibility, vendor and account modals.
  // Rows can be edited in place, reordered by dragging the handle or with the
  // up and down buttons, and removed. The buttons exist because dragging is
  // not usable with a keyboard or a screen reader.
  function makeLinkEditor(containerId, addBtnId) {
    let draft = [];
    let removed = [];
    let dragFrom = null;

    function move(from, to) {
      if (to < 0 || to >= draft.length) return;
      draft.splice(to, 0, draft.splice(from, 1)[0]);
      render(to);
    }

    function render(focusIndex) {
      const el = $(containerId);
      if (!draft.length) {
        el.innerHTML = '<p class="link-none">Nothing added yet.</p>';
        return;
      }
      el.innerHTML = draft.map((l, i) =>
        '<div class="doc-row" draggable="true" data-i="' + i + '">' +
          '<span class="doc-grip" aria-hidden="true" title="Drag to reorder">' +
            '<svg viewBox="0 0 16 16" width="16" height="16"><circle cx="6" cy="4" r="1.4" fill="currentColor"/>' +
            '<circle cx="10" cy="4" r="1.4" fill="currentColor"/><circle cx="6" cy="8" r="1.4" fill="currentColor"/>' +
            '<circle cx="10" cy="8" r="1.4" fill="currentColor"/><circle cx="6" cy="12" r="1.4" fill="currentColor"/>' +
            '<circle cx="10" cy="12" r="1.4" fill="currentColor"/></svg></span>' +
          '<div class="doc-fields">' +
            '<label class="field"><span class="visually-hidden">Document label</span>' +
              '<input class="input" data-f="title" data-i="' + i + '" placeholder="Label" value="' + esc(l.title || "") + '"></label>' +
            '<label class="field"><span class="visually-hidden">Web address</span>' +
              '<input class="input" data-f="url" data-i="' + i + '" placeholder="https://" value="' + esc(l.url || "") + '"></label>' +
          "</div>" +
          '<div class="doc-buttons">' +
            '<button type="button" class="doc-btn" data-move="up" data-i="' + i + '" ' +
              (i === 0 ? "disabled " : "") + 'aria-label="Move up">Up</button>' +
            '<button type="button" class="doc-btn" data-move="down" data-i="' + i + '" ' +
              (i === draft.length - 1 ? "disabled " : "") + 'aria-label="Move down">Down</button>' +
            '<button type="button" class="doc-btn doc-rm" data-rm="' + i + '" aria-label="Remove">Remove</button>' +
            ((l.url || "").trim() ? '<a class="doc-btn doc-open" href="' + esc(safeUrl(l.url)) +
              '" target="_blank" rel="noopener">Open</a>' : "") +
          "</div></div>").join("");

      el.querySelectorAll("input[data-f]").forEach((input) =>
        input.addEventListener("input", () => {
          draft[Number(input.dataset.i)][input.dataset.f] = input.value;
        }));
      el.querySelectorAll("[data-move]").forEach((b) =>
        b.addEventListener("click", () => {
          const i = Number(b.dataset.i);
          move(i, b.dataset.move === "up" ? i - 1 : i + 1);
        }));
      el.querySelectorAll("[data-rm]").forEach((b) =>
        b.addEventListener("click", () => {
          const i = Number(b.dataset.rm);
          if (draft[i].id) removed.push(draft[i].id);
          draft.splice(i, 1);
          render();
        }));

      el.querySelectorAll(".doc-row").forEach((row) => {
        row.addEventListener("dragstart", (e) => {
          dragFrom = Number(row.dataset.i);
          row.classList.add("dragging");
          e.dataTransfer.effectAllowed = "move";
          // Firefox will not start a drag without data set.
          e.dataTransfer.setData("text/plain", String(dragFrom));
        });
        row.addEventListener("dragend", () => { row.classList.remove("dragging"); dragFrom = null; });
        row.addEventListener("dragover", (e) => { e.preventDefault(); row.classList.add("drag-over"); });
        row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
        row.addEventListener("drop", (e) => {
          e.preventDefault();
          row.classList.remove("drag-over");
          const to = Number(row.dataset.i);
          if (dragFrom != null && dragFrom !== to) move(dragFrom, to);
        });
      });

      if (focusIndex != null) {
        const btn = el.querySelector('.doc-row[data-i="' + focusIndex + '"] [data-move]:not([disabled])');
        if (btn) btn.focus();
      }
    }

    $(addBtnId).addEventListener("click", () => {
      draft.push({ title: "", url: "" });
      render();
      const inputs = $(containerId).querySelectorAll('input[data-f="title"]');
      if (inputs.length) inputs[inputs.length - 1].focus();
    });

    return {
      reset(existing) {
        draft = existing
          .slice()
          .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
          .map((l) => ({ id: l.id, title: l.title, url: l.url }));
        removed = [];
        render();
      },
      // Drops rows with no address at all, so an empty row added by accident
      // does not get saved.
      rows: () => draft.filter((l) => (l.url || "").trim()),
      removed: () => removed,
    };
  }

  const taskLinkEditor = makeLinkEditor("tf-links", "tf-link-add");
  const vendorLinkEditor = makeLinkEditor("vf-links", "vf-link-add");
  const accountLinkEditor = makeLinkEditor("af-links", "af-link-add");

  async function saveLinks(editor, ownerKey, ownerId) {
    for (const id of editor.removed()) {
      await getStore().remove("links", id);
      S.links = S.links.filter((l) => l.id !== id);
    }
    const rows = editor.rows();
    for (let i = 0; i < rows.length; i++) {
      const l = rows[i];
      const url = safeUrl(l.url);
      const title = (l.title || "").trim() || url;
      if (l.id) {
        const existing = S.links.find((x) => x.id === l.id);
        const patch = { title: title, url: url, sort_order: i };
        await getStore().update("links", l.id, patch);
        if (existing) Object.assign(existing, patch);
      } else {
        const row = {
          title: title, url: url, kind: "document", sort_order: i,
          responsibility_id: null, vendor_id: null, account_id: null,
        };
        row[ownerKey] = ownerId;
        S.links.push(await getStore().insert("links", row));
      }
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
    syncOngoing();
    fillSelect($("tf-assignee"), sortedRoles().map((r) => ({ id: r.id, name: roleLabel(r) })),
      t ? t.role_id : "", "Unassigned");
    fillSelect($("tf-vendor"), S.vendors, t ? t.vendor_id : "", "None");
    fillSelect($("tf-account"), S.accounts, t ? t.account_id : "", "None");
    $("tf-status").value = t && !isActive(t) ? t.status : "open";
    $("tf-delete").hidden = !t;
    taskLinkEditor.reset(t ? linksFor("task", t.id) : []);
    openModal("task-modal");
    $("tf-title").focus();
  }

  // An ongoing item has no due date, so the field is cleared and disabled.
  function syncOngoing() {
    const on = $("tf-recurrence").value === "ongoing";
    $("tf-due").disabled = on;
    if (on) $("tf-due").value = "";
  }
  $("tf-recurrence").addEventListener("change", syncOngoing);

  $("task-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = $("tf-id").value;
    const existing = id ? S.tasks.find((t) => t.id === id) : null;
    const wasDone = existing && existing.status === "done";
    let nowDone = $("tf-status").value === "done";
    const costVal = $("tf-cost").value.trim();
    const row = {
      title: $("tf-title").value.trim(),
      description: $("tf-desc").value.trim() || null,
      category: $("tf-category").value,
      priority: $("tf-priority").value,
      due_date: $("tf-recurrence").value === "ongoing" ? null : ($("tf-due").value || null),
      last_completed_on: $("tf-lastdone").value || null,
      estimated_cost: costVal === "" ? null : Number(costVal),
      recurrence: $("tf-recurrence").value,
      role_id: $("tf-assignee").value || null,
      vendor_id: $("tf-vendor").value || null,
      account_id: $("tf-account").value || null,
      status: $("tf-status").value,
      completed_at: nowDone ? (existing && existing.completed_at) || new Date().toISOString() : null,
    };
    // Same rule as the Mark done button.
    const rolled = !wasDone && nowDone && isRecurring(row);
    if (rolled) { Object.assign(row, rollForward(row.due_date, row.recurrence)); nowDone = false; }
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
      toast(rolled ? "Saved. Next due " + fmtDate(row.due_date) + "." : "Saved.");
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

  // ---------------- vendor contacts ----------------
  // Rows of name, email and phone, with one marked primary. There is always
  // exactly one primary while any contact exists.
  const contactEditor = (function () {
    let draft = [];
    let removed = [];

    function fixPrimary() {
      if (draft.length && !draft.some((c) => c.is_primary)) draft[0].is_primary = true;
    }
    function render() {
      const el = $("vf-contacts");
      if (!draft.length) { el.innerHTML = '<p class="link-none">Nothing added yet.</p>'; return; }
      el.innerHTML = draft.map((c, i) =>
        '<div class="doc-row contact-row">' +
          '<div class="doc-fields contact-fields">' +
            '<label class="field"><span class="visually-hidden">Name</span>' +
              '<input class="input" data-f="name" data-i="' + i + '" placeholder="Name" value="' + esc(c.name || "") + '"></label>' +
            '<label class="field"><span class="visually-hidden">Label, optional</span>' +
              '<input class="input" data-f="label" data-i="' + i + '" placeholder="Label (optional)" value="' + esc(c.label || "") + '"></label>' +
            '<label class="field"><span class="visually-hidden">Email</span>' +
              '<input class="input" type="email" data-f="email" data-i="' + i + '" placeholder="Email" value="' + esc(c.email || "") + '"></label>' +
            '<label class="field"><span class="visually-hidden">Phone, optional</span>' +
              '<input class="input" type="tel" data-f="phone" data-i="' + i + '" placeholder="Phone (optional)" value="' + esc(c.phone || "") + '"></label>' +
          "</div>" +
          '<div class="doc-buttons">' +
            '<label class="radio-row contact-primary"><input type="radio" name="vf-primary" data-primary="' + i + '"' +
              (c.is_primary ? " checked" : "") + "><span>Primary</span></label>" +
            '<button type="button" class="doc-btn doc-rm" data-rm="' + i + '" aria-label="Remove contact">Remove</button>' +
          "</div></div>").join("");
      el.querySelectorAll("input[data-f]").forEach((input) =>
        input.addEventListener("input", () => {
          draft[Number(input.dataset.i)][input.dataset.f] = input.value;
        }));
      el.querySelectorAll("[data-primary]").forEach((r) =>
        r.addEventListener("change", () => {
          draft.forEach((c, i) => { c.is_primary = i === Number(r.dataset.primary); });
        }));
      el.querySelectorAll("[data-rm]").forEach((b) =>
        b.addEventListener("click", () => {
          const i = Number(b.dataset.rm);
          if (draft[i].id) removed.push(draft[i].id);
          draft.splice(i, 1);
          fixPrimary();
          render();
        }));
    }
    $("vf-contact-add").addEventListener("click", () => {
      draft.push({ name: "", label: "", email: "", phone: "", is_primary: false });
      fixPrimary();
      render();
      const inputs = $("vf-contacts").querySelectorAll('input[data-f="name"]');
      inputs[inputs.length - 1].focus();
    });
    return {
      reset(existing) {
        draft = existing.map((c) => ({ id: c.id, name: c.name, label: c.label, email: c.email, phone: c.phone, is_primary: !!c.is_primary }));
        removed = [];
        fixPrimary();
        render();
      },
      // Rows with no name are dropped, and the primary mark moves if its row went.
      rows() {
        const kept = draft.filter((c) => (c.name || "").trim());
        if (kept.length && !kept.some((c) => c.is_primary)) kept[0].is_primary = true;
        return kept;
      },
      removed: () => removed,
    };
  })();

  async function saveContacts(vendorId) {
    for (const id of contactEditor.removed()) {
      await getStore().remove("contacts", id);
      S.contacts = S.contacts.filter((c) => c.id !== id);
    }
    const rows = contactEditor.rows();
    for (let i = 0; i < rows.length; i++) {
      const c = rows[i];
      const patch = {
        name: c.name.trim(), label: (c.label || "").trim() || null,
        email: (c.email || "").trim() || null,
        phone: (c.phone || "").trim() || null, is_primary: !!c.is_primary, position: i,
      };
      if (c.id) {
        const existing = S.contacts.find((x) => x.id === c.id);
        await getStore().update("contacts", c.id, patch);
        if (existing) Object.assign(existing, patch);
      } else {
        S.contacts.push(await getStore().insert("contacts", Object.assign({ vendor_id: vendorId }, patch)));
      }
    }
  }

  // ---------------- vendor modal ----------------
  function openVendorModal(v) {
    $("vendor-modal-title").textContent = v ? "Edit vendor" : "Add vendor";
    $("vf-id").value = v ? v.id : "";
    $("vf-name").value = v ? v.name : "";
    $("vf-service").value = v ? (v.service || "") : "";
    $("vf-status").value = v ? (v.status || "contracted") : "contracted";
    $("vf-cost").value = v && v.cost != null ? v.cost : "";
    $("vf-costperiod").value = v ? (v.cost_period || "") : "";
    $("vf-website").value = v ? (v.website || "") : "";
    $("vf-notes").value = v ? (v.notes || "") : "";
    $("vf-delete").hidden = !v;
    vendorLinkEditor.reset(v ? linksFor("vendor", v.id) : []);
    contactEditor.reset(v ? contactsFor(v.id) : []);
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
      cost: costVal === "" ? null : Number(costVal),
      cost_period: $("vf-costperiod").value.trim() || null,
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
      await saveContacts(saved.id);
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
      S.contacts = S.contacts.filter((c) => c.vendor_id !== id);
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
    accountLinkEditor.reset(a ? linksFor("account", a.id) : []);
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
        await saveLinks(accountLinkEditor, "account_id", id);
      } else {
        const created = await getStore().insert("accounts", row);
        S.accounts.push(created);
        await saveLinks(accountLinkEditor, "account_id", created.id);
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
      S.tasks.forEach((t) => { if (t.account_id === id) t.account_id = null; });
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
      await hashEmails();
      closeModal("member-modal");
      toast("Saved.");
      renderFilterOptions();
      renderAll();
    } catch (err) { fail(err); }
  });

  $("mf-delete").addEventListener("click", async () => {
    const id = $("mf-id").value;
    if (!id || !confirm("Remove this board member? Their roles become vacant.")) return;
    try {
      await getStore().remove("members", id);
      S.members = S.members.filter((m) => m.id !== id);
      S.roles.forEach((r) => { if (r.member_id === id) r.member_id = null; });
      closeModal("member-modal");
      toast("Removed.");
      renderFilterOptions();
      renderAll();
    } catch (e) { fail(e); }
  });

  // ---------------- role modal ----------------
  function openRoleModal(r) {
    $("role-modal-title").textContent = r ? "Edit role" : "Add role";
    $("rf-id").value = r ? r.id : "";
    $("rf-name").value = r ? r.name : "";
    fillSelect($("rf-member"), S.members, r ? r.member_id : "", "Vacant");
    $("rf-delete").hidden = !r;
    openModal("role-modal");
    $("rf-name").focus();
  }

  $("role-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = $("rf-id").value;
    const row = { name: $("rf-name").value.trim(), member_id: $("rf-member").value || null };
    try {
      if (id) {
        const existing = roleById(id);
        const patch = await getStore().update("roles", id, row);
        Object.assign(existing, patch || row);
      } else {
        S.roles.push(await getStore().insert("roles", Object.assign({ position: S.roles.length }, row)));
      }
      closeModal("role-modal");
      toast("Saved.");
      renderFilterOptions();
      renderAll();
    } catch (err) { fail(err); }
  });

  $("rf-delete").addEventListener("click", async () => {
    const id = $("rf-id").value;
    if (!id || !confirm("Delete this role? Its responsibilities become unassigned.")) return;
    try {
      await getStore().remove("roles", id);
      S.roles = S.roles.filter((r) => r.id !== id);
      S.tasks.forEach((t) => { if (t.role_id === id) t.role_id = null; });
      closeModal("role-modal");
      toast("Deleted.");
      renderFilterOptions();
      renderAll();
    } catch (e) { fail(e); }
  });

  // ------------------------------------------------------------------
  // Fixtures, the building's paint colours, fittings and hardware
  // ------------------------------------------------------------------
  const fixtureLinkEditor = makeLinkEditor("xf-links", "xf-link-add");

  function renderFixtures() {
    const list = S.fixtures.slice().sort((a, b) =>
      (a.category || "").localeCompare(b.category || "") ||
      (a.position || 0) - (b.position || 0));
    const groups = [];
    for (const f of list) {
      const cat = f.category || "Other";
      const last = groups[groups.length - 1];
      if (last && last.cat === cat) last.items.push(f);
      else groups.push({ cat: cat, items: [f] });
    }
    $("fixture-list").innerHTML = groups.map((g) =>
      '<h2 class="group-heading tone-' + toneFor(FIXTURE_TONE, g.cat) + '">' + esc(g.cat) + "</h2>" +
      '<div class="card-grid tone-' + toneFor(FIXTURE_TONE, g.cat) + '">' + g.items.map(fixtureCard).join("") + "</div>").join("");
    $("fixture-empty").hidden = S.fixtures.length > 0;
  }

  function fixtureCard(f) {
    const swatch = f.color_hex
      ? '<span class="swatch" style="background:' + esc(f.color_hex) + '" aria-hidden="true"></span>'
      : "";
    const pic = f.image_url
      ? '<img class="fixture-pic" src="' + esc(picUrl(f.image_url)) + '" alt="" loading="lazy">'
      : "";
    return '<button type="button" class="info-card fixture-card" data-fixture="' + f.id + '">' + pic +
      '<span class="fixture-text"><h3 class="fixture-title">' + swatch + esc(f.name) + "</h3>" +
      '<div class="sub">' + esc([f.brand, f.code].filter(Boolean).join(", ") || f.category || "") + "</div></span></button>";
  }

  function openFixtureModal(f) {
    $("fixture-modal-title").textContent = f ? "Edit fixture" : "Add fixture";
    $("xf-id").value = f ? f.id : "";
    $("xf-name").value = f ? f.name : "";
    $("xf-category").value = f ? (f.category || "") : "";
    $("xf-brand").value = f ? (f.brand || "") : "";
    $("xf-code").value = f ? (f.code || "") : "";
    $("xf-location").value = f ? (f.location || "") : "";
    $("xf-url").value = f ? (f.url || "") : "";
    $("xf-notes").value = f ? (f.notes || "") : "";
    const hex = f && f.color_hex ? f.color_hex : "";
    $("xf-has-color").checked = !!hex;
    $("xf-color").value = hex || "#cccccc";
    $("xf-color").disabled = !hex;
    $("xf-image").value = f ? (f.image_url || "") : "";
    $("xf-image-file").value = "";
    showFixturePreview();
    $("xf-delete").hidden = !f;
    fixtureLinkEditor.reset(f ? linksFor("fixture", f.id) : []);
    openModal("fixture-modal");
    $("xf-name").focus();
  }

  // A picture is either uploaded or linked. Both end up as an address in
  // image_url. An upload is shrunk first, since a phone photo is far larger
  // than a card needs.
  const FIXTURE_BUCKET = "fixture-images";
  // Demo mode hands back a blob address, which must not gain an https prefix.
  function picUrl(u) { return /^blob:/.test(u) ? u : safeUrl(u); }
  function showFixturePreview() {
    const url = $("xf-image").value.trim();
    const file = $("xf-image-file").files[0];
    const img = $("xf-image-preview");
    img.hidden = !(url || file);
    if (file) img.src = URL.createObjectURL(file);
    else if (url) img.src = picUrl(url);
    $("xf-image-remove").hidden = img.hidden;
  }
  function shrinkImage(file, max) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        c.toBlob((blob) => resolve(blob
          ? new File([blob], file.name.replace(/\.[^.]*$/, "") + ".jpg", { type: "image/jpeg" })
          : file), "image/jpeg", 0.85);
      };
      img.onerror = () => resolve(file);
      img.src = URL.createObjectURL(file);
    });
  }
  $("xf-image").addEventListener("input", () => { $("xf-image-file").value = ""; showFixturePreview(); });
  $("xf-image-file").addEventListener("change", () => { $("xf-image").value = ""; showFixturePreview(); });
  $("xf-image-remove").addEventListener("click", () => {
    $("xf-image").value = "";
    $("xf-image-file").value = "";
    showFixturePreview();
  });
  $("xf-image-preview").addEventListener("error", () => { $("xf-image-preview").hidden = true; });

  $("xf-has-color").addEventListener("change", () => {
    $("xf-color").disabled = !$("xf-has-color").checked;
  });

  $("fixture-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = $("xf-id").value;
    const row = {
      name: $("xf-name").value.trim(),
      category: $("xf-category").value.trim() || "Other",
      brand: $("xf-brand").value.trim() || null,
      code: $("xf-code").value.trim() || null,
      location: $("xf-location").value.trim() || null,
      url: $("xf-url").value.trim() ? safeUrl($("xf-url").value.trim()) : null,
      color_hex: $("xf-has-color").checked ? $("xf-color").value : null,
      notes: $("xf-notes").value.trim() || null,
    };
    const typed = $("xf-image").value.trim();
    row.image_url = typed ? picUrl(typed) : null;
    try {
      const file = $("xf-image-file").files[0];
      if (file) row.image_url = await getStore().upload(FIXTURE_BUCKET, await shrinkImage(file, 1200));
      let saved;
      if (id) {
        const existing = S.fixtures.find((x) => x.id === id);
        const patch = await getStore().update("fixtures", id, row);
        Object.assign(existing, patch || row);
        saved = existing;
      } else {
        saved = await getStore().insert("fixtures", Object.assign({ position: S.fixtures.length }, row));
        S.fixtures.push(saved);
      }
      await saveLinks(fixtureLinkEditor, "fixture_id", saved.id);
      closeModal("fixture-modal");
      toast("Saved.");
      renderFixtures();
    } catch (err) { fail(err); }
  });

  $("xf-delete").addEventListener("click", async () => {
    const id = $("xf-id").value;
    if (!id || !confirm("Delete this fixture?")) return;
    try {
      await getStore().remove("fixtures", id);
      S.fixtures = S.fixtures.filter((x) => x.id !== id);
      S.links = S.links.filter((l) => l.fixture_id !== id);
      closeModal("fixture-modal");
      toast("Deleted.");
      renderFixtures();
    } catch (e) { fail(e); }
  });

  $("btn-new-fixture").addEventListener("click", () => openFixtureModal(null));

  // ------------------------------------------------------------------
  // Schedules, such as the trash rotation
  // ------------------------------------------------------------------
  const MONTHS = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

  function slotsFor(scheduleId) {
    return S.scheduleSlots.filter((x) => x.schedule_id === scheduleId)
      .sort((a, b) => (a.position || 0) - (b.position || 0));
  }

  // A slot is current when this month falls inside its month range. Ranges
  // that wrap around the end of the year are handled too.
  function isCurrentSlot(slot, month) {
    if (!slot.month_start || !slot.month_end) return false;
    if (slot.month_start <= slot.month_end) {
      return month >= slot.month_start && month <= slot.month_end;
    }
    return month >= slot.month_start || month <= slot.month_end;
  }

  // A slot's period is named from its months, so there is nothing to type.
  function periodLabel(start, end) {
    if (!start) return "";
    if (!end || end === start) return MONTHS[start - 1];
    if (end === start % 12 + 1) return MONTHS[start - 1] + "/" + MONTHS[end - 1];
    return MONTHS[start - 1] + " to " + MONTHS[end - 1];
  }
  function slotPeriod(s) { return periodLabel(s.month_start, s.month_end) || s.label || ""; }
  // Apartment numbers are stored bare. Older rows may still say "Apt 6".
  function apartment(v) { return String(v || "").replace(/^\s*apt\.?\s*/i, "").trim(); }

  function renderSchedules() {
    const month = new Date().getMonth() + 1;
    const list = S.schedules.slice().sort((a, b) => (a.position || 0) - (b.position || 0));
    $("schedule-list").innerHTML = list.map((sc) => {
      const slots = slotsFor(sc.id);
      const current = slots.find((s) => isCurrentSlot(s, month));
      const rows = slots.map((s) => {
        const on = current && s.id === current.id;
        return '<tr class="' + (on ? "slot-current" : "") + '">' +
          "<td>" + esc(slotPeriod(s)) + (on ? ' <span class="badge badge-open">This month</span>' : "") + "</td>" +
          "<td>" + esc(apartment(s.responsible) || "Not set") + "</td></tr>";
      }).join("");
      return '<article class="schedule-card tone-green">' +
        '<div class="schedule-head">' +
          "<div><h3>" + esc(sc.name) + "</h3>" +
          (sc.description ? '<p class="sub">' + esc(sc.description) + "</p>" : "") + "</div>" +
          '<button type="button" class="btn" data-schedule="' + sc.id + '">Edit</button>' +
        "</div>" +
        (current
          ? '<p class="schedule-now">Right now: apartment <strong>' + esc(apartment(current.responsible) || "not set") +
            "</strong>, " + esc(slotPeriod(current)) + "</p>"
          : "") +
        (slots.length
          ? '<div class="table-wrap"><table class="table schedule-table"><thead><tr>' +
            '<th scope="col">Period</th><th scope="col">Apartment</th>' +
            "</tr></thead><tbody>" + rows + "</tbody></table></div>"
          : '<p class="link-none">No rows yet.</p>') +
        "</article>";
    }).join("");
    $("schedule-empty").hidden = S.schedules.length > 0;
  }

  // Editor for the rows of a schedule: apartment, first month, last month.
  // Rows reorder by dragging only and remove with the x, by Evan's choice.
  const slotEditor = (function () {
    let draft = [];
    let removed = [];
    let dragFrom = null;

    function move(from, to) {
      if (to < 0 || to >= draft.length) return;
      draft.splice(to, 0, draft.splice(from, 1)[0]);
      render();
    }
    function monthOptions(sel, blank) {
      return '<option value="">' + blank + "</option>" + MONTHS.map((m, i) =>
        '<option value="' + (i + 1) + '"' + (Number(sel) === i + 1 ? " selected" : "") + ">" +
        m + "</option>").join("");
    }
    function render() {
      const el = $("cf-slots");
      if (!draft.length) { el.innerHTML = '<p class="link-none">No rows yet.</p>'; return; }
      el.innerHTML = draft.map((s, i) =>
        '<div class="doc-row slot-row" draggable="true" data-i="' + i + '">' +
          '<span class="doc-grip" aria-hidden="true"><svg viewBox="0 0 16 16" width="16" height="16">' +
            '<circle cx="6" cy="4" r="1.4" fill="currentColor"/><circle cx="10" cy="4" r="1.4" fill="currentColor"/>' +
            '<circle cx="6" cy="8" r="1.4" fill="currentColor"/><circle cx="10" cy="8" r="1.4" fill="currentColor"/>' +
            '<circle cx="6" cy="12" r="1.4" fill="currentColor"/><circle cx="10" cy="12" r="1.4" fill="currentColor"/>' +
          "</svg></span>" +
          '<div class="doc-fields slot-fields">' +
            '<label class="field"><span class="visually-hidden">Apartment</span>' +
              '<input class="input" data-f="responsible" data-i="' + i + '" placeholder="Apartment" value="' + esc(apartment(s.responsible)) + '"></label>' +
            '<label class="field"><span class="visually-hidden">First month</span>' +
              '<select class="input" data-f="month_start" data-i="' + i + '">' + monthOptions(s.month_start, "From") + "</select></label>" +
            '<label class="field"><span class="visually-hidden">Last month</span>' +
              '<select class="input" data-f="month_end" data-i="' + i + '">' + monthOptions(s.month_end, "To") + "</select></label>" +
          "</div>" +
          '<button type="button" class="row-x" data-rm="' + i + '" aria-label="Remove row">' +
            '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">' +
            '<path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>' +
          "</div>").join("");

      el.querySelectorAll("[data-f]").forEach((input) =>
        input.addEventListener("input", () => {
          const v = input.value;
          const f = input.dataset.f;
          draft[Number(input.dataset.i)][f] = (f === "month_start" || f === "month_end")
            ? (v ? Number(v) : null) : v;
        }));
      el.querySelectorAll("[data-rm]").forEach((b) =>
        b.addEventListener("click", () => {
          const i = Number(b.dataset.rm);
          if (draft[i].id) removed.push(draft[i].id);
          draft.splice(i, 1);
          render();
        }));
      el.querySelectorAll(".doc-row").forEach((row) => {
        row.addEventListener("dragstart", (e) => {
          dragFrom = Number(row.dataset.i);
          row.classList.add("dragging");
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", String(dragFrom));
        });
        row.addEventListener("dragend", () => { row.classList.remove("dragging"); dragFrom = null; });
        row.addEventListener("dragover", (e) => { e.preventDefault(); row.classList.add("drag-over"); });
        row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
        row.addEventListener("drop", (e) => {
          e.preventDefault();
          row.classList.remove("drag-over");
          const to = Number(row.dataset.i);
          if (dragFrom != null && dragFrom !== to) move(dragFrom, to);
        });
      });
    }
    $("cf-slot-add").addEventListener("click", () => {
      draft.push({ label: "", responsible: "", month_start: null, month_end: null });
      render();
      const inputs = $("cf-slots").querySelectorAll('input[data-f="responsible"]');
      if (inputs.length) inputs[inputs.length - 1].focus();
    });
    return {
      reset(existing) {
        draft = existing.map((s) => ({
          id: s.id, label: s.label, responsible: s.responsible,
          month_start: s.month_start, month_end: s.month_end,
        }));
        removed = [];
        render();
      },
      rows: () => draft.filter((s) => s.month_start || apartment(s.responsible)),
      removed: () => removed,
    };
  })();

  function openScheduleModal(sc) {
    $("schedule-modal-title").textContent = sc ? "Edit schedule" : "Add schedule";
    $("cf-id").value = sc ? sc.id : "";
    $("cf-name").value = sc ? sc.name : "";
    $("cf-desc").value = sc ? (sc.description || "") : "";
    $("cf-delete").hidden = !sc;
    slotEditor.reset(sc ? slotsFor(sc.id) : []);
    openModal("schedule-modal");
    $("cf-name").focus();
  }

  $("schedule-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = $("cf-id").value;
    const row = {
      name: $("cf-name").value.trim(),
      description: $("cf-desc").value.trim() || null,
    };
    try {
      let saved;
      if (id) {
        const existing = S.schedules.find((x) => x.id === id);
        const patch = await getStore().update("schedules", id, row);
        Object.assign(existing, patch || row);
        saved = existing;
      } else {
        saved = await getStore().insert("schedules", Object.assign({ position: S.schedules.length }, row));
        S.schedules.push(saved);
      }
      for (const rid of slotEditor.removed()) {
        await getStore().remove("scheduleSlots", rid);
        S.scheduleSlots = S.scheduleSlots.filter((x) => x.id !== rid);
      }
      const rows = slotEditor.rows();
      for (let i = 0; i < rows.length; i++) {
        const s = rows[i];
        const patch = {
          label: periodLabel(s.month_start, s.month_end) || (s.label || "").trim(),
          responsible: apartment(s.responsible) || null,
          month_start: s.month_start || null, month_end: s.month_end || null, position: i,
        };
        if (s.id) {
          const existing = S.scheduleSlots.find((x) => x.id === s.id);
          await getStore().update("scheduleSlots", s.id, patch);
          if (existing) Object.assign(existing, patch);
        } else {
          S.scheduleSlots.push(await getStore().insert("scheduleSlots",
            Object.assign({ schedule_id: saved.id }, patch)));
        }
      }
      closeModal("schedule-modal");
      toast("Saved.");
      renderSchedules();
    } catch (err) { fail(err); }
  });

  $("cf-delete").addEventListener("click", async () => {
    const id = $("cf-id").value;
    if (!id || !confirm("Delete this schedule and all of its rows?")) return;
    try {
      await getStore().remove("schedules", id);
      S.schedules = S.schedules.filter((x) => x.id !== id);
      S.scheduleSlots = S.scheduleSlots.filter((x) => x.schedule_id !== id);
      closeModal("schedule-modal");
      toast("Deleted.");
      renderSchedules();
    } catch (e) { fail(e); }
  });

  $("btn-new-schedule").addEventListener("click", () => openScheduleModal(null));

  // ------------------------------------------------------------------
  // Reminder settings
  // ------------------------------------------------------------------
  const DEFAULT_SETTINGS = {
    id: 1, reminders_enabled: false, frequency: "monthly", send_weekday: 1,
    send_day_of_month: 1, delivery_mode: "digest", digest_email: null, last_sent_at: null,
  };
  const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  function settingsFromForm() {
    const monthly = $("sf-monthly").checked;
    return {
      reminders_enabled: monthly,
      frequency: "monthly",
      send_day_of_month: Number($("sf-monthday").value) || 1,
    };
  }

  function renderSettings() {
    const s = S.settings || DEFAULT_SETTINGS;
    $("sf-monthly").checked = !!s.reminders_enabled;
    $("sf-never").checked = !s.reminders_enabled;
    $("sf-monthday").value = s.send_day_of_month || 1;
    refreshSettingsVisibility();
  }

  function refreshSettingsVisibility() {
    const monthly = $("sf-monthly").checked;
    $("sf-monthday-field").hidden = !monthly;
    const to = (S.settings && S.settings.digest_email) || "";
    $("sf-recipient-line").innerHTML = monthly
      ? (to ? "Emails go to <b>" + esc(to) + "</b> at 9AM EST."
            : "No recipient is set yet.")
      : "";
    $("sf-test").disabled = !to;
  }

  ["sf-monthly", "sf-never", "sf-monthday"].forEach((id) =>
    $(id).addEventListener("change", refreshSettingsVisibility));

  $("settings-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const row = settingsFromForm();
    try {
      const patch = await getStore().update("settings", 1, row);
      Object.assign(S.settings, patch || row);
      renderSettings();
      toast(row.reminders_enabled ? "Saved. Monthly email is on." : "Saved. No emails will be sent.");
    } catch (err) { fail(err); }
  });

  // Calls the Edge Function. Preview shows the real email in a dialog and
  // never sends. Send now delivers immediately.
  async function callReminderFunction(mode) {
    const body = $("sf-preview-body");
    const frame = $("sf-preview-frame");
    frame.hidden = true;
    $("preview-modal-title").textContent = mode === "dry" ? "Email preview" : "Sending";
    openModal("preview-modal");

    if (demoMode) {
      body.innerHTML = '<p class="muted">Connect Supabase to build the real email.</p>';
      return;
    }
    body.innerHTML = '<p class="muted">Working.</p>';
    try {
      const url = CFG.SUPABASE_URL.replace(/\/$/, "") +
        "/functions/v1/send-reminders?" + (mode === "dry" ? "dry=1" : "force=1");
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + CFG.SUPABASE_ANON_KEY,
          "Content-Type": "application/json",
        },
      });
      const data = await resp.json();
      if (data.error) {
        body.innerHTML = '<p class="muted">The function returned an error: ' + esc(String(data.error)) + "</p>";
        return;
      }
      if (mode === "dry") {
        if (!data.preview) {
          body.innerHTML = '<p class="muted">' + esc(data.skipped || "No preview came back.") +
            " If that looks wrong, the deployed function may be out of date. " +
            "Run <code>supabase functions deploy send-reminders</code>.</p>";
          return;
        }
        const to = (data.recipients || []).map((r) => r.to).join(", ");
        body.innerHTML =
          "<p><b>To:</b> " + esc(to || "nobody") + "<br><b>Subject:</b> " + esc(data.subject || "") + "</p>";
        frame.srcdoc = data.html || "";
        frame.hidden = false;
      } else {
        const sent = data.sent || 0;
        body.innerHTML = sent
          ? "<p>Sent to " + esc((data.results || []).map((r) => r.to).join(", ")) + ".</p>"
          : "<p>Nothing sent. " + esc(data.skipped || "No recipient is set.") + "</p>";
        if (sent) {
          if (S.settings) S.settings.last_sent_at = new Date().toISOString();
          toast("Email sent.");
        }
      }
    } catch (err) {
      // A browser fetch that fails outright is nearly always CORS, which here
      // means the deployed function predates the headers that allow the site
      // to call it.
      body.innerHTML = '<p class="muted">Could not reach the function. If it is deployed, it is ' +
        "probably an older build without the headers that let this page call it. " +
        "Run <code>supabase functions deploy send-reminders</code> and try again.</p>" +
        '<p class="muted">Error: ' + esc(err.message) + "</p>";
    }
  }

  $("sf-preview").addEventListener("click", () => callReminderFunction("dry"));
  $("sf-test").addEventListener("click", () => {
    const to = (S.settings && S.settings.digest_email) || "the address on file";
    if (!confirm("Send the summary to " + to + " now?")) return;
    callReminderFunction("force");
  });

  const VIEWS = ["dashboard", "tasks", "vendors", "accounts", "board", "fixtures", "schedules", "notifications"];

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
    // Keep the address in step so a tab can be linked to and reloaded.
    try { history.replaceState(null, "", "#" + name); } catch (e) { /* file:// in some browsers */ }
  }

  // Links into the site, used by the monthly email. "#vendors" opens a tab,
  // and "#vendor/<id>" opens that tab with the record's dialog on top.
  const ROUTES = {
    task: ["tasks", (id) => S.tasks.find((x) => x.id === id), (x) => openTaskModal(x)],
    vendor: ["vendors", (id) => vendorById(id), (x) => openVendorModal(x)],
    account: ["accounts", (id) => accountById(id), (x) => openAccountModal(x)],
    member: ["board", (id) => memberById(id), (x) => openMemberModal(x)],
    role: ["board", (id) => roleById(id), (x) => openRoleModal(x)],
    fixture: ["fixtures", (id) => S.fixtures.find((y) => y.id === id), (x) => openFixtureModal(x)],
    schedule: ["schedules", (id) => S.schedules.find((y) => y.id === id), (x) => openScheduleModal(x)],
  };
  function route() {
    const [kind, id] = decodeURIComponent(location.hash.replace(/^#/, "")).split("/");
    if (!kind) return;
    if (VIEWS.includes(kind)) { showView(kind); return; }
    const r = ROUTES[kind];
    if (!r) return;
    const rec = r[1](id);
    showView(r[0]);
    if (rec) r[2](rec);
  }
  window.addEventListener("hashchange", () => { if (S.tasks.length || S.members.length) route(); });

  document.querySelectorAll(".tab").forEach((tab) =>
    tab.addEventListener("click", () => {
      showView(tab.dataset.tab);
      closeSidebar();
      window.scrollTo(0, 0);
    }));

  // ---------------- mobile sidebar ----------------
  let sidebarTimer = null;
  function openSidebar() {
    clearTimeout(sidebarTimer);   // a close still animating must not hide it again
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
    else sidebarTimer = setTimeout(finish, 220);
  }
  // The logo and name go back to the dashboard, from the top bar or the menu.
  document.querySelectorAll(".brand-home").forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      showView("dashboard");
      closeSidebar();
      window.scrollTo(0, 0);
    }));
  $("menu-open").addEventListener("click", openSidebar);
  $("menu-close").addEventListener("click", () => { closeSidebar(); $("menu-open").focus(); });
  $("sidebar-backdrop").addEventListener("click", () => { closeSidebar(); $("menu-open").focus(); });
  // Keep the sidebar from being left open and hidden when rotating to a wide screen.
  window.addEventListener("resize", () => { if (window.innerWidth > 1160) closeSidebar(); });

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
    const fx = e.target.closest("[data-fixture]");
    if (fx) { const x = S.fixtures.find((y) => y.id === fx.dataset.fixture); if (x) openFixtureModal(x); return; }
    const sc = e.target.closest("[data-schedule]");
    if (sc) { const x = S.schedules.find((y) => y.id === sc.dataset.schedule); if (x) openScheduleModal(x); return; }
    const rc = e.target.closest("[data-role]");
    if (rc) { const r = roleById(rc.dataset.role); if (r) openRoleModal(r); return; }
    const mc = e.target.closest("[data-member]");
    if (mc) { const m = memberById(mc.dataset.member); if (m) openMemberModal(m); return; }
  });

  $("btn-new-task").addEventListener("click", () => openTaskModal(null));
  $("btn-new-vendor").addEventListener("click", () => openVendorModal(null));
  $("btn-new-account").addEventListener("click", () => openAccountModal(null));
  $("btn-new-member").addEventListener("click", () => openMemberModal(null));
  $("btn-new-role").addEventListener("click", () => openRoleModal(null));
  $("filter-toggle").addEventListener("click", () => {
    const open = $("filter-panel").hidden;
    $("filter-panel").hidden = !open;
    $("filter-toggle").setAttribute("aria-expanded", String(open));
    if (open) $("filter-status").focus();
  });

  document.querySelectorAll("#task-table th[data-sort] button").forEach((b) =>
    b.addEventListener("click", () => {
      const key = b.parentElement.dataset.sort;
      if (taskSort.key === key) taskSort.dir = -taskSort.dir;
      else { taskSort.key = key; taskSort.dir = 1; }
      renderTaskTable();
    }));

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
      S.roles = S.roles || [];
      S.contacts = S.contacts || [];
      S.settings = Object.assign({}, DEFAULT_SETTINGS, S.settings || {});
      S.schedules = S.schedules || [];
      S.scheduleSlots = S.scheduleSlots || [];
      S.fixtures = S.fixtures || [];
      await hashEmails();
      renderFilterOptions();
      renderAll();
      route();
    } catch (e) {
      fail(e);
      renderSettings();
      $("stats").innerHTML = '<div class="stat" style="grid-column:1/-1"><div class="lbl">' +
        "Could not load the data. Check the Supabase address and key in config.js, and make sure the " +
        "migrations have been applied. See the README. Error: " + esc(e.message) + "</div></div>";
    }
  }

  function boot() {
    const name = CFG.BUILDING_NAME || "372 12th";
    $("brand-name").textContent = name;
    $("sidebar-brand").textContent = name;
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
