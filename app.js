/* Condo Board — application logic.
   Runs against Supabase when config.js is filled in; otherwise runs in
   demo mode with in-memory sample data so the UI can be previewed. */

(function () {
  "use strict";

  const CFG = window.CONDOBOARD_CONFIG || {};
  const CATEGORIES = [
    "Maintenance", "Inspections", "Financial", "Insurance",
    "Legal & Compliance", "Meetings", "Vendors & Contracts", "Other",
  ];
  const RECUR_LABEL = {
    none: "", monthly: "Monthly", quarterly: "Quarterly",
    semiannual: "Every 6 mo", annual: "Yearly",
  };
  const RECUR_MONTHS = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 };
  const STATUS_LABEL = { open: "Open", in_progress: "In progress", done: "Done" };

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
      { id: uid(), name: "Evan Appleby", position: "President", email: "evan@example.com", phone: "" },
      { id: uid(), name: "Dana Ruiz", position: "Treasurer", email: "dana@example.com", phone: "" },
      { id: uid(), name: "Sam Okafor", position: "Secretary", email: "sam@example.com", phone: "" },
    ];
    const vendors = [
      { id: uid(), name: "Acme Elevator Co.", service: "Elevator maintenance", contact_name: "Rita Chen", email: "service@acme-elevator.example", phone: "(555) 010-2233", website: "https://example.com", notes: "24h emergency line. Contract renews in March." },
      { id: uid(), name: "Brightside Insurance", service: "Building insurance broker", contact_name: "Paul Menard", email: "paul@brightside.example", phone: "(555) 010-8890", website: "", notes: "Policy #BX-44921" },
      { id: uid(), name: "GreenLeaf Landscaping", service: "Landscaping & snow removal", contact_name: "", email: "office@greenleaf.example", phone: "(555) 010-4411", website: "", notes: "" },
      { id: uid(), name: "Metro Fire Safety", service: "Fire alarm & sprinkler inspection", contact_name: "Dispatch", email: "book@metrofire.example", phone: "(555) 010-7755", website: "https://example.com", notes: "" },
    ];
    const m = (i) => members[i].id, v = (i) => vendors[i].id;
    const tasks = [
      { id: uid(), title: "Renew building insurance policy", description: "Get updated quotes from Brightside before the policy lapses.", category: "Insurance", status: "open", priority: "high", due_date: d(-6), recurrence: "annual", assignee_id: m(1), vendor_id: v(1), completed_at: null },
      { id: uid(), title: "Annual elevator inspection", description: "State-mandated inspection; Acme schedules with the city.", category: "Inspections", status: "open", priority: "high", due_date: d(12), recurrence: "annual", assignee_id: m(0), vendor_id: v(0), completed_at: null },
      { id: uid(), title: "Fire alarm & sprinkler inspection", description: "", category: "Inspections", status: "open", priority: "normal", due_date: d(25), recurrence: "annual", assignee_id: m(2), vendor_id: v(3), completed_at: null },
      { id: uid(), title: "Draft next year's budget", description: "Collect vendor contract amounts and utility trends; review with the board in November.", category: "Financial", status: "in_progress", priority: "high", due_date: d(45), recurrence: "annual", assignee_id: m(1), vendor_id: null, completed_at: null },
      { id: uid(), title: "Monthly financial review", description: "Reconcile the operating account and review unpaid dues.", category: "Financial", status: "open", priority: "normal", due_date: d(8), recurrence: "monthly", assignee_id: m(1), vendor_id: null, completed_at: null },
      { id: uid(), title: "Board meeting & minutes", description: "Send agenda a week ahead; Sam records and circulates minutes.", category: "Meetings", status: "open", priority: "normal", due_date: d(15), recurrence: "monthly", assignee_id: m(2), vendor_id: null, completed_at: null },
      { id: uid(), title: "Renew snow removal contract", description: "Confirm pricing with GreenLeaf before the season.", category: "Vendors & Contracts", status: "open", priority: "normal", due_date: d(60), recurrence: "annual", assignee_id: m(0), vendor_id: v(2), completed_at: null },
      { id: uid(), title: "Gutter cleaning", description: "", category: "Maintenance", status: "open", priority: "low", due_date: d(75), recurrence: "semiannual", assignee_id: null, vendor_id: v(2), completed_at: null },
      { id: uid(), title: "Boiler inspection & service", description: "", category: "Inspections", status: "open", priority: "normal", due_date: d(100), recurrence: "annual", assignee_id: null, vendor_id: null, completed_at: null },
      { id: uid(), title: "File the association's tax return", description: "Accountant needs the financials by mid-February.", category: "Legal & Compliance", status: "done", priority: "high", due_date: d(-140), recurrence: "annual", assignee_id: m(1), vendor_id: null, completed_at: new Date(today.getTime() - 138 * 864e5).toISOString() },
      { id: uid(), title: "Annual owners' meeting", description: "Book the community room, send the notice 30 days ahead.", category: "Meetings", status: "done", priority: "normal", due_date: d(-80), recurrence: "annual", assignee_id: m(0), vendor_id: null, completed_at: new Date(today.getTime() - 80 * 864e5).toISOString() },
      { id: uid(), title: "Spring roof & facade walk-through", description: "Walk the roof with the super, photograph any issues.", category: "Maintenance", status: "done", priority: "normal", due_date: d(-30), recurrence: "annual", assignee_id: m(0), vendor_id: null, completed_at: new Date(today.getTime() - 28 * 864e5).toISOString() },
    ];
    const links = [
      { id: uid(), title: "Current policy PDF", url: "https://example.com/policy.pdf", kind: "document", responsibility_id: tasks[0].id, vendor_id: null },
      { id: uid(), title: "Elevator service contract", url: "https://example.com/contract.pdf", kind: "contract", responsibility_id: null, vendor_id: v(0) },
      { id: uid(), title: "Insurance broker portal", url: "https://example.com", kind: "website", responsibility_id: null, vendor_id: v(1) },
      { id: uid(), title: "Budget worksheet", url: "https://example.com/sheet", kind: "document", responsibility_id: tasks[3].id, vendor_id: null },
    ];
    return { members, vendors, tasks, links };
  }

  const TABLE = { members: "board_members", vendors: "vendors", tasks: "responsibilities", links: "links" };

  function makeDemoStore() {
    // In demo mode the app's state object (S) is the only copy of the data,
    // and the UI code maintains it after each operation — so the store just
    // hands back rows and ids without keeping its own copy.
    return {
      async load() { return demoData(); },
      async insert(_kind, row) {
        return Object.assign({ id: crypto.randomUUID() }, row);
      },
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
        const [members, vendors, tasks, links] = await Promise.all([
          q(client.from(TABLE.members).select("*").order("name")),
          q(client.from(TABLE.vendors).select("*").order("name")),
          q(client.from(TABLE.tasks).select("*").order("due_date", { ascending: true, nullsFirst: false })),
          q(client.from(TABLE.links).select("*")),
        ]);
        return { members, vendors, tasks, links };
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

  // The store is created lazily so that nothing is fetched before the
  // password gate (if any) has been passed.
  let store = null;
  function getStore() {
    if (!store) store = demoMode ? makeDemoStore() : makeSupabaseStore();
    return store;
  }

  // ------------------------------------------------------------------
  // State & helpers
  // ------------------------------------------------------------------
  let S = { members: [], vendors: [], tasks: [], links: [] };
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
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }
  function dueText(t) {
    if (t.status === "done") {
      const when = t.completed_at ? t.completed_at.slice(0, 10) : t.due_date;
      return { text: when ? "Completed " + fmtDate(when) : "Completed", cls: "" };
    }
    const n = daysUntil(t.due_date);
    if (n == null) return { text: "No due date", cls: "" };
    if (n < 0) return { text: `${Math.abs(n)}d overdue · ${fmtDate(t.due_date)}`, cls: "overdue" };
    if (n === 0) return { text: "Due today", cls: "soon" };
    if (n <= 14) return { text: `Due in ${n}d · ${fmtDate(t.due_date)}`, cls: "soon" };
    return { text: fmtDate(t.due_date), cls: "" };
  }
  function memberById(id) { return S.members.find((m) => m.id === id); }
  function vendorById(id) { return S.vendors.find((v) => v.id === id); }
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

  let toastTimer = null;
  function toast(msg, isErr) {
    const el = $("toast");
    el.textContent = msg;
    el.className = "toast" + (isErr ? " err" : "");
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3000);
  }
  function fail(err) {
    console.error(err);
    toast("Something went wrong: " + err.message, true);
  }

  // ------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------
  function assigneeChip(t) {
    const m = memberById(t.assignee_id);
    if (!m) return `<span class="assignee-chip"><span class="avatar" style="background:#eef1f5;color:#8a97a5">–</span>Unassigned</span>`;
    return `<span class="assignee-chip"><span class="avatar">${esc(initials(m.name))}</span>${esc(m.name)}</span>`;
  }

  function taskCard(t) {
    const due = dueText(t);
    const v = vendorById(t.vendor_id);
    const bits = [`<span class="badge badge-cat">${esc(t.category || "Other")}</span>`];
    if (t.priority === "high") bits.push(`<span class="badge badge-high">High</span>`);
    if (t.recurrence && t.recurrence !== "none") bits.push(`<span class="badge badge-recur">&#8635; ${RECUR_LABEL[t.recurrence]}</span>`);
    if (v) bits.push(`<span>${esc(v.name)}</span>`);
    return `<div class="task-card" data-task="${t.id}">
      <div class="row1"><span class="title">${esc(t.title)}</span>
      <span class="due ${due.cls}">${esc(due.text)}</span></div>
      <div class="meta">${assigneeChip(t)} ${bits.join(" ")}</div>
    </div>`;
  }

  function renderList(elId, tasks, emptyMsg) {
    $(elId).innerHTML = tasks.length
      ? tasks.map(taskCard).join("")
      : `<div class="none">${emptyMsg}</div>`;
  }

  function renderDashboard() {
    const open = S.tasks.filter((t) => t.status !== "done");
    const overdue = open.filter((t) => daysUntil(t.due_date) != null && daysUntil(t.due_date) < 0)
      .sort((a, b) => a.due_date.localeCompare(b.due_date));
    const soon = open.filter((t) => { const n = daysUntil(t.due_date); return n != null && n >= 0 && n <= 30; })
      .sort((a, b) => a.due_date.localeCompare(b.due_date));
    const later = open.filter((t) => { const n = daysUntil(t.due_date); return n == null || n > 30; })
      .sort((a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999")).slice(0, 6);
    const inprog = S.tasks.filter((t) => t.status === "in_progress");
    const done = S.tasks.filter((t) => t.status === "done")
      .sort((a, b) => (b.completed_at || "").localeCompare(a.completed_at || "")).slice(0, 6);

    const yr = new Date().getFullYear();
    const doneThisYear = S.tasks.filter((t) => t.status === "done" && (t.completed_at || "").startsWith(String(yr))).length;
    $("stats").innerHTML = `
      <div class="stat stat-red"><div class="num">${overdue.length}</div><div class="lbl">Overdue</div></div>
      <div class="stat stat-amber"><div class="num">${soon.length}</div><div class="lbl">Due in 30 days</div></div>
      <div class="stat stat-blue"><div class="num">${open.length}</div><div class="lbl">Open responsibilities</div></div>
      <div class="stat stat-green"><div class="num">${doneThisYear}</div><div class="lbl">Completed in ${yr}</div></div>`;

    renderList("list-overdue", overdue, "Nothing overdue — nice.");
    renderList("list-soon", soon, "Nothing due in the next 30 days.");
    renderList("list-later", later, "Nothing scheduled further out.");
    renderList("list-inprogress", inprog, "Nothing in progress.");
    renderList("list-done", done, "Nothing completed yet.");
  }

  function taskLinks(t) {
    return S.links.filter((l) => l.responsibility_id === t.id);
  }

  function renderTaskTable() {
    const search = $("task-search").value.trim().toLowerCase();
    const fStatus = $("filter-status").value;
    const fCat = $("filter-category").value;
    const fAss = $("filter-assignee").value;

    let rows = S.tasks.slice();
    if (search) rows = rows.filter((t) =>
      (t.title + " " + (t.description || "")).toLowerCase().includes(search));
    if (fStatus) rows = rows.filter((t) => t.status === fStatus);
    if (fCat) rows = rows.filter((t) => (t.category || "Other") === fCat);
    if (fAss) rows = rows.filter((t) => fAss === "none" ? !t.assignee_id : t.assignee_id === fAss);

    const rank = { open: 0, in_progress: 0, done: 1 };
    rows.sort((a, b) => (rank[a.status] - rank[b.status]) ||
      ((a.due_date || "9999") .localeCompare(b.due_date || "9999")));

    $("task-tbody").innerHTML = rows.map((t) => {
      const due = dueText(t);
      const links = taskLinks(t);
      const linkHtml = links.length
        ? `<div class="link-chips">${links.map((l) =>
            `<a class="link-chip" href="${esc(l.url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">&#128279; ${esc(l.title || l.kind)}</a>`).join("")}</div>`
        : "";
      return `<tr data-task="${t.id}">
        <td><div class="t-title">${esc(t.title)}</div>
            ${t.description ? `<div class="t-desc">${esc(t.description)}</div>` : ""}${linkHtml}</td>
        <td><span class="badge badge-cat">${esc(t.category || "Other")}</span></td>
        <td>${assigneeChip(t)}</td>
        <td class="${due.cls ? "due-" + due.cls : ""}">${t.due_date ? esc(due.text) : "—"}</td>
        <td>${t.recurrence && t.recurrence !== "none" ? "&#8635; " + RECUR_LABEL[t.recurrence] : "—"}</td>
        <td><span class="badge badge-${t.status}">${STATUS_LABEL[t.status]}</span></td>
        <td class="t-actions">${t.status !== "done"
          ? `<button class="btn-done" data-done="${t.id}">&#10003; Done</button>` : ""}</td>
      </tr>`;
    }).join("");
    $("task-empty").hidden = rows.length > 0;
  }

  function renderVendors() {
    $("vendor-grid").innerHTML = S.vendors.map((v) => {
      const links = S.links.filter((l) => l.vendor_id === v.id);
      const lines = [];
      if (v.contact_name) lines.push(`<div class="contact-line">&#128100; ${esc(v.contact_name)}</div>`);
      if (v.phone) lines.push(`<div class="contact-line">&#128222; <a href="tel:${esc(v.phone)}" onclick="event.stopPropagation()">${esc(v.phone)}</a></div>`);
      if (v.email) lines.push(`<div class="contact-line">&#9993;&#65039; <a href="mailto:${esc(v.email)}" onclick="event.stopPropagation()">${esc(v.email)}</a></div>`);
      if (v.website) lines.push(`<div class="contact-line">&#127760; <a href="${esc(v.website)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${esc(v.website.replace(/^https?:\/\//, ""))}</a></div>`);
      const linkHtml = links.length
        ? `<div class="link-chips">${links.map((l) =>
            `<a class="link-chip" href="${esc(l.url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">&#128279; ${esc(l.title || l.kind)}</a>`).join("")}</div>`
        : "";
      return `<div class="vendor-card" data-vendor="${v.id}">
        <h3>${esc(v.name)}</h3>
        <div class="service">${esc(v.service || "")}</div>
        ${lines.join("")}
        ${v.notes ? `<div class="notes">${esc(v.notes)}</div>` : ""}
        ${linkHtml}
      </div>`;
    }).join("");
    $("vendor-empty").hidden = S.vendors.length > 0;
  }

  function renderMembers() {
    $("member-grid").innerHTML = S.members.map((m) => {
      const count = S.tasks.filter((t) => t.assignee_id === m.id && t.status !== "done").length;
      return `<div class="member-card" data-member="${m.id}">
        <h3><span class="avatar" style="margin-right:8px">${esc(initials(m.name))}</span>${esc(m.name)}</h3>
        <div class="position">${esc(m.position || "Board member")} · ${count} open item${count === 1 ? "" : "s"}</div>
        ${m.email ? `<div class="contact-line">&#9993;&#65039; <a href="mailto:${esc(m.email)}" onclick="event.stopPropagation()">${esc(m.email)}</a></div>` : ""}
        ${m.phone ? `<div class="contact-line">&#128222; <a href="tel:${esc(m.phone)}" onclick="event.stopPropagation()">${esc(m.phone)}</a></div>` : ""}
      </div>`;
    }).join("");
    $("member-empty").hidden = S.members.length > 0;
  }

  function renderFilterOptions() {
    const catSel = $("filter-category");
    catSel.innerHTML = `<option value="">All categories</option>` +
      CATEGORIES.map((c) => `<option>${esc(c)}</option>`).join("");
    const assSel = $("filter-assignee");
    assSel.innerHTML = `<option value="">Everyone</option><option value="none">Unassigned</option>` +
      S.members.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join("");
  }

  function renderAll() {
    renderDashboard();
    renderTaskTable();
    renderVendors();
    renderMembers();
  }

  // ------------------------------------------------------------------
  // Task completion & recurrence
  // ------------------------------------------------------------------
  async function completeTask(t) {
    try {
      await getStore().update("tasks", t.id, { status: "done", completed_at: new Date().toISOString() });
      Object.assign(t, { status: "done", completed_at: new Date().toISOString() });
      if (t.recurrence && t.recurrence !== "none" && t.due_date) {
        const next = {
          title: t.title, description: t.description, category: t.category,
          status: "open", priority: t.priority, due_date: advanceDate(t.due_date, t.recurrence),
          recurrence: t.recurrence, assignee_id: t.assignee_id, vendor_id: t.vendor_id,
          completed_at: null,
        };
        const created = await getStore().insert("tasks", next);
        S.tasks.push(created);
        toast(`Done. Next occurrence scheduled for ${fmtDate(created.due_date)}.`);
      } else {
        toast("Marked as done.");
      }
      renderAll();
    } catch (e) { fail(e); }
  }

  // ------------------------------------------------------------------
  // Modals — generic open/close
  // ------------------------------------------------------------------
  function openModal(id) { $(id).hidden = false; }
  function closeModal(id) { $(id).hidden = true; }
  document.querySelectorAll("[data-close]").forEach((b) =>
    b.addEventListener("click", () => closeModal(b.dataset.close)));
  document.querySelectorAll(".modal-backdrop").forEach((bd) =>
    bd.addEventListener("mousedown", (e) => { if (e.target === bd) bd.hidden = true; }));

  // ---------------- task modal ----------------
  let taskLinksDraft = [];   // {id?, title, url, kind} — current links in the editor
  let taskLinksRemoved = []; // ids of persisted links removed in the editor

  function renderTaskLinksDraft() {
    $("tf-links").innerHTML = taskLinksDraft.map((l, i) => `
      <div class="link-row">
        <span class="kind">${esc(l.kind)}</span>
        <a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.title || l.url)}</a>
        <button type="button" class="rm" data-rm-link="${i}" title="Remove">&times;</button>
      </div>`).join("") || `<div class="none" style="font-size:13px;color:#8a97a5">No links yet.</div>`;
    $("tf-links").querySelectorAll("[data-rm-link]").forEach((b) =>
      b.addEventListener("click", () => {
        const l = taskLinksDraft[+b.dataset.rmLink];
        if (l.id) taskLinksRemoved.push(l.id);
        taskLinksDraft.splice(+b.dataset.rmLink, 1);
        renderTaskLinksDraft();
      }));
  }

  function fillSelect(sel, items, labelFn, current, emptyLabel) {
    sel.innerHTML = `<option value="">${emptyLabel}</option>` +
      items.map((x) => `<option value="${x.id}" ${x.id === current ? "selected" : ""}>${esc(labelFn(x))}</option>`).join("");
  }

  function openTaskModal(t) {
    $("task-modal-title").textContent = t ? "Edit responsibility" : "New responsibility";
    $("tf-id").value = t ? t.id : "";
    $("tf-title").value = t ? t.title : "";
    $("tf-desc").value = t ? (t.description || "") : "";
    $("tf-category").innerHTML = CATEGORIES.map((c) =>
      `<option ${t && t.category === c ? "selected" : ""}>${esc(c)}</option>`).join("");
    if (!t) $("tf-category").value = "Maintenance";
    $("tf-priority").value = t ? t.priority : "normal";
    $("tf-due").value = t ? (t.due_date || "") : "";
    $("tf-recurrence").value = t ? (t.recurrence || "none") : "none";
    fillSelect($("tf-assignee"), S.members, (m) => m.name, t ? t.assignee_id : "", "Unassigned");
    fillSelect($("tf-vendor"), S.vendors, (v) => v.name, t ? t.vendor_id : "", "None");
    $("tf-status").value = t ? t.status : "open";
    $("tf-delete").hidden = !t;
    taskLinksDraft = t ? taskLinks(t).map((l) => ({ id: l.id, title: l.title, url: l.url, kind: l.kind })) : [];
    taskLinksRemoved = [];
    renderTaskLinksDraft();
    openModal("task-modal");
    $("tf-title").focus();
  }

  $("tf-link-add").addEventListener("click", () => {
    const url = $("tf-link-url").value.trim();
    if (!url) return;
    taskLinksDraft.push({
      title: $("tf-link-title").value.trim() || url,
      url: /^https?:\/\//i.test(url) ? url : "https://" + url,
      kind: $("tf-link-kind").value,
    });
    $("tf-link-title").value = ""; $("tf-link-url").value = "";
    renderTaskLinksDraft();
  });

  $("task-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = $("tf-id").value;
    const existing = id ? S.tasks.find((t) => t.id === id) : null;
    const wasDone = existing && existing.status === "done";
    const nowDone = $("tf-status").value === "done";
    const row = {
      title: $("tf-title").value.trim(),
      description: $("tf-desc").value.trim() || null,
      category: $("tf-category").value,
      priority: $("tf-priority").value,
      due_date: $("tf-due").value || null,
      recurrence: $("tf-recurrence").value,
      assignee_id: $("tf-assignee").value || null,
      vendor_id: $("tf-vendor").value || null,
      status: $("tf-status").value,
      completed_at: nowDone ? (existing && existing.completed_at) || new Date().toISOString() : null,
    };
    try {
      let saved;
      if (existing) {
        saved = await getStore().update("tasks", id, row);
        Object.assign(existing, saved || row);
        saved = existing;
      } else {
        saved = await getStore().insert("tasks", row);
        S.tasks.push(saved);
      }
      // links
      for (const rid of taskLinksRemoved) {
        await getStore().remove("links", rid);
        S.links = S.links.filter((l) => l.id !== rid);
      }
      for (const l of taskLinksDraft) {
        if (!l.id) {
          const created = await getStore().insert("links", {
            title: l.title, url: l.url, kind: l.kind,
            responsibility_id: saved.id, vendor_id: null,
          });
          S.links.push(created);
        }
      }
      closeModal("task-modal");
      // recurrence roll-forward when completed via the modal
      if (!wasDone && nowDone && row.recurrence !== "none" && row.due_date) {
        const next = Object.assign({}, row, {
          status: "open", completed_at: null,
          due_date: advanceDate(row.due_date, row.recurrence),
        });
        const created = await getStore().insert("tasks", next);
        S.tasks.push(created);
        toast(`Saved. Next occurrence scheduled for ${fmtDate(created.due_date)}.`);
      } else {
        toast("Saved.");
      }
      renderAll();
    } catch (err) { fail(err); }
  });

  $("tf-delete").addEventListener("click", async () => {
    const id = $("tf-id").value;
    if (!id || !confirm("Delete this responsibility? This can't be undone.")) return;
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
  let vendorLinksDraft = [];
  let vendorLinksRemoved = [];

  function renderVendorLinksDraft() {
    $("vf-links").innerHTML = vendorLinksDraft.map((l, i) => `
      <div class="link-row">
        <span class="kind">${esc(l.kind)}</span>
        <a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.title || l.url)}</a>
        <button type="button" class="rm" data-rm-vlink="${i}" title="Remove">&times;</button>
      </div>`).join("") || `<div class="none" style="font-size:13px;color:#8a97a5">No documents yet.</div>`;
    $("vf-links").querySelectorAll("[data-rm-vlink]").forEach((b) =>
      b.addEventListener("click", () => {
        const l = vendorLinksDraft[+b.dataset.rmVlink];
        if (l.id) vendorLinksRemoved.push(l.id);
        vendorLinksDraft.splice(+b.dataset.rmVlink, 1);
        renderVendorLinksDraft();
      }));
  }

  function openVendorModal(v) {
    $("vendor-modal-title").textContent = v ? "Edit vendor" : "Add vendor";
    $("vf-id").value = v ? v.id : "";
    $("vf-name").value = v ? v.name : "";
    $("vf-service").value = v ? (v.service || "") : "";
    $("vf-contact").value = v ? (v.contact_name || "") : "";
    $("vf-phone").value = v ? (v.phone || "") : "";
    $("vf-email").value = v ? (v.email || "") : "";
    $("vf-website").value = v ? (v.website || "") : "";
    $("vf-notes").value = v ? (v.notes || "") : "";
    $("vf-delete").hidden = !v;
    vendorLinksDraft = v ? S.links.filter((l) => l.vendor_id === v.id)
      .map((l) => ({ id: l.id, title: l.title, url: l.url, kind: l.kind })) : [];
    vendorLinksRemoved = [];
    renderVendorLinksDraft();
    openModal("vendor-modal");
    $("vf-name").focus();
  }

  $("vf-link-add").addEventListener("click", () => {
    const url = $("vf-link-url").value.trim();
    if (!url) return;
    vendorLinksDraft.push({
      title: $("vf-link-title").value.trim() || url,
      url: /^https?:\/\//i.test(url) ? url : "https://" + url,
      kind: $("vf-link-kind").value,
    });
    $("vf-link-title").value = ""; $("vf-link-url").value = "";
    renderVendorLinksDraft();
  });

  $("vendor-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = $("vf-id").value;
    const row = {
      name: $("vf-name").value.trim(),
      service: $("vf-service").value.trim() || null,
      contact_name: $("vf-contact").value.trim() || null,
      phone: $("vf-phone").value.trim() || null,
      email: $("vf-email").value.trim() || null,
      website: $("vf-website").value.trim() || null,
      notes: $("vf-notes").value.trim() || null,
    };
    try {
      let saved;
      if (id) {
        const existing = S.vendors.find((v) => v.id === id);
        saved = await getStore().update("vendors", id, row);
        Object.assign(existing, saved || row);
        saved = existing;
      } else {
        saved = await getStore().insert("vendors", row);
        S.vendors.push(saved);
      }
      for (const rid of vendorLinksRemoved) {
        await getStore().remove("links", rid);
        S.links = S.links.filter((l) => l.id !== rid);
      }
      for (const l of vendorLinksDraft) {
        if (!l.id) {
          const created = await getStore().insert("links", {
            title: l.title, url: l.url, kind: l.kind,
            responsibility_id: null, vendor_id: saved.id,
          });
          S.links.push(created);
        }
      }
      closeModal("vendor-modal");
      toast("Saved.");
      renderAll();
    } catch (err) { fail(err); }
  });

  $("vf-delete").addEventListener("click", async () => {
    const id = $("vf-id").value;
    if (!id || !confirm("Delete this vendor? Responsibilities linked to it will keep working (the vendor is just unlinked).")) return;
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

  // ---------------- member modal ----------------
  function openMemberModal(m) {
    $("member-modal-title").textContent = m ? "Edit board member" : "Add board member";
    $("mf-id").value = m ? m.id : "";
    $("mf-name").value = m ? m.name : "";
    $("mf-position").value = m ? (m.position || "") : "";
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
      email: $("mf-email").value.trim() || null,
      phone: $("mf-phone").value.trim() || null,
    };
    try {
      if (id) {
        const existing = S.members.find((m) => m.id === id);
        const saved = await getStore().update("members", id, row);
        Object.assign(existing, saved || row);
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
  document.querySelectorAll(".tab").forEach((tab) =>
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      ["dashboard", "tasks", "vendors", "board"].forEach((v) =>
        $("view-" + v).hidden = v !== tab.dataset.tab);
    }));

  document.body.addEventListener("click", (e) => {
    const doneBtn = e.target.closest("[data-done]");
    if (doneBtn) {
      e.stopPropagation();
      const t = S.tasks.find((x) => x.id === doneBtn.dataset.done);
      if (t) completeTask(t);
      return;
    }
    const card = e.target.closest("[data-task]");
    if (card) { const t = S.tasks.find((x) => x.id === card.dataset.task); if (t) openTaskModal(t); return; }
    const vc = e.target.closest("[data-vendor]");
    if (vc) { const v = vendorById(vc.dataset.vendor); if (v) openVendorModal(v); return; }
    const mc = e.target.closest("[data-member]");
    if (mc) { const m = memberById(mc.dataset.member); if (m) openMemberModal(m); return; }
  });

  $("btn-new-task").addEventListener("click", () => openTaskModal(null));
  $("btn-new-vendor").addEventListener("click", () => openVendorModal(null));
  $("btn-new-member").addEventListener("click", () => openMemberModal(null));

  ["task-search", "filter-status", "filter-category", "filter-assignee"].forEach((id) =>
    $(id).addEventListener("input", renderTaskTable));

  // ------------------------------------------------------------------
  // Password gate
  //
  // A doorstop, not a lock: the password lives in config.js, which every
  // visitor's browser downloads. It keeps a stray link from being walked
  // into; it does not stop anyone determined. See "Security" in README.md.
  // ------------------------------------------------------------------
  const PASSWORD = (CFG.SITE_PASSWORD || "").trim();
  const UNLOCK_KEY = "condoboard-unlock";

  // Stored so the saved token isn't the password itself in plain text.
  function token(pw) {
    let h = 5381;
    for (let i = 0; i < pw.length; i++) h = ((h << 5) + h + pw.charCodeAt(i)) >>> 0;
    return "v1-" + h.toString(36);
  }
  function safeGet(store, key) {
    try { return store.getItem(key); } catch (e) { return null; }
  }
  function isUnlocked() {
    const want = token(PASSWORD.toLowerCase());
    return safeGet(localStorage, UNLOCK_KEY) === want ||
           safeGet(sessionStorage, UNLOCK_KEY) === want;
  }
  function rememberUnlock(persist) {
    const t = token(PASSWORD.toLowerCase());
    try { (persist ? localStorage : sessionStorage).setItem(UNLOCK_KEY, t); } catch (e) { /* private mode */ }
  }
  function forgetUnlock() {
    try { localStorage.removeItem(UNLOCK_KEY); } catch (e) {}
    try { sessionStorage.removeItem(UNLOCK_KEY); } catch (e) {}
  }

  $("gate-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const entered = $("gate-input").value.trim().toLowerCase();
    if (entered !== PASSWORD.toLowerCase()) {
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

  // Lock this browser again (useful on a shared/front-desk computer).
  // Re-gates in place rather than reloading, and drops the loaded data so
  // nothing from the board is left on screen behind the gate.
  $("btn-lock").addEventListener("click", () => {
    forgetUnlock();
    S = { members: [], vendors: [], tasks: [], links: [] };
    renderAll();
    document.querySelectorAll(".modal-backdrop").forEach((m) => { m.hidden = true; });
    $("gate-input").value = "";
    $("gate-err").hidden = true;
    document.body.classList.add("locked");
    $("gate").hidden = false;
    $("gate-input").focus();
  });

  // ------------------------------------------------------------------
  // Boot
  // ------------------------------------------------------------------
  async function start() {
    $("demo-banner").hidden = !demoMode;
    $("btn-lock").hidden = !PASSWORD;
    try {
      S = await getStore().load();
      renderFilterOptions();
      renderAll();
    } catch (e) {
      fail(e);
      $("stats").innerHTML = `<div class="stat" style="grid-column:1/-1"><div class="lbl">
        Could not load data. Check the Supabase URL and key in config.js, and make sure schema.sql has been run
        (see README.md). Error: ${esc(e.message)}</div></div>`;
    }
  }

  function boot() {
    const name = CFG.BUILDING_NAME || "Condo Board";
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
