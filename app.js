(function () {
  const $ = (id) => document.getElementById(id);
  const ROLES = window.ROLES, EV = window.EVENT;
  const ARRANGE = "A", ARRANGE_NAME = "由主辦單位安排";
  const FIXED = window.FIXED || {};
  const FIXED_NAMES = new Set(Object.values(FIXED));
  const withFixed = (c) => ({ ...(c || {}), ...FIXED });
  const GROUP_COLOR = { "裁判組": "var(--g-race)", "門禁接待組": "var(--g-gate)", "場控紀錄組": "var(--g-score)", "後勤安全組": "var(--g-care)" };
  const roleName = (id) => { if (String(id) === ARRANGE) return ARRANGE_NAME; const r = ROLES.find((x) => x.id === Number(id)); return r ? r.title : ""; };
  const pad = (n) => String(n).padStart(2, "0");
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  let state = { open: false, openAt: EV.openAt, offset: 0, nicknames: [], claims: {}, arrange: [] };
  let filter = "全部";
  const ui = {}; // 每一列的輸入狀態：{ nick, phone, cancel, msg, ok }，重新整理時保留

  // ---------- 後台：正式（Apps Script）或示範模式 ----------
  const demo = !window.API_URL;
  const DEMO_STAFF = { "示範-小明": "0912345678", "示範-小華": "0922333444", "示範-阿美": "0933111222" };
  const demoOpen = () => new URLSearchParams(location.search).has("open");
  function demoLoad() { try { return JSON.parse(localStorage.getItem("grgDemo") || "null") || { claims: {}, arrange: [] }; } catch (e) { return { claims: {}, arrange: [] }; } }
  function demoSave(d) { try { localStorage.setItem("grgDemo", JSON.stringify(d)); } catch (e) {} }
  const norm = (p) => { let d = String(p || "").replace(/\D/g, ""); if (d.startsWith("886")) d = "0" + d.slice(3); return d; };

  async function apiStatus() {
    if (demo) return { open: demoOpen() || Date.now() >= new Date(EV.openAt).getTime(), openAt: EV.openAt, now: new Date().toISOString(), nicknames: Object.keys(DEMO_STAFF), ...demoLoad() };
    const res = await fetch(window.API_URL, { cache: "no-store" });
    return res.json();
  }
  async function apiPost(req) {
    if (demo) {
      if (!state.open) return { ok: false, message: "尚未開放填寫（10/9 00:00 開放）" };
      const d = demoLoad(), c = d.claims, a = d.arrange;
      if (norm(DEMO_STAFF[req.nickname]) !== norm(req.phone)) return { ok: false, message: "電話號碼不符", ...d };
      if (FIXED[String(req.roleId)]) return { ok: false, message: "這個崗位已由主辦單位指定", ...d };
      const mine = Object.keys(c).find((k) => c[k] === req.nickname), inA = a.includes(req.nickname);
      const cur = mine ? roleName(mine) : inA ? ARRANGE_NAME : null;
      const release = () => { if (mine) delete c[mine]; if (inA) a.splice(a.indexOf(req.nickname), 1); };
      const done = (m) => { demoSave(d); return { ok: true, message: m, ...d }; };
      if (req.action === "cancel") { if (!cur) return { ok: false, message: "你目前沒有選擇", ...d }; release(); return done("已取消 " + cur); }
      if (req.roleId === ARRANGE) { if (inA) return done("你已經選擇 " + ARRANGE_NAME); release(); a.push(req.nickname); return done((cur ? "已從 " + cur + " 改為 " : "已選擇 ") + ARRANGE_NAME); }
      const id = String(req.roleId);
      if (c[id] && c[id] !== req.nickname) return { ok: false, message: "這個崗位已被 " + c[id] + " 認領", ...d };
      if (mine === id) return done("你已經認領 " + roleName(id));
      release(); c[id] = req.nickname;
      return done((cur ? "已從 " + cur + " 改為 " : "已認領 ") + roleName(id));
    }
    const res = await fetch(window.API_URL, { method: "POST", body: JSON.stringify(req) });
    return res.json();
  }

  // ---------- 畫面 ----------
  function renderStatic() {
    $("eventMeta").textContent = EV.date + "｜" + EV.place;
    $("openText").textContent = "10/9 00:00 開放，";
    $("pdfBtn").href = EV.pdf;
    $("contact").textContent = "有問題請聯絡：" + EV.contact;
    $("common").innerHTML = window.COMMON.map((t) => "<li>" + t + "</li>").join("");
    $("demoNote").hidden = !demo;
    const groups = ["全部"].concat([...new Set(ROLES.map((r) => r.group))]);
    $("chips").innerHTML = groups.map((g) => '<button type="button" class="chip' + (g === filter ? " on" : "") + '" data-g="' + g + '">' + g + "</button>").join("");
  }

  const list = (arr) => (arr && arr.length ? "<ul>" + arr.map((t) => "<li>" + t + "</li>").join("") + "</ul>" : "<p class='load'>無</p>");

  // 誰目前在哪裡：暱稱 → 崗位名稱
  function whereIs() {
    const m = {};
    for (const id in state.claims) m[state.claims[id]] = "#" + pad(id);
    (state.arrange || []).forEach((n) => (m[n] = "主辦安排"));
    return m;
  }

  function nickOptions(key, onlyFrom) {
    const where = whereIs();
    const names = onlyFrom || state.nicknames.filter((n) => !FIXED_NAMES.has(n));
    return '<option value="">選你的暱稱</option>' + names.map((n) =>
      '<option value="' + esc(n) + '"' + (ui[key] && ui[key].nick === n ? " selected" : "") + ">" + esc(n) + (where[n] && !onlyFrom ? "（目前：" + where[n] + "）" : "") + "</option>").join("");
  }

  // 一列的操作區：可認領 → 暱稱＋電話＋確認；已認領 → 名字＋取消
  function actionHTML(key, takenBy) {
    if (FIXED[key]) return '<div class="act"><span class="who">✔ ' + esc(FIXED[key]) + '</span></div>';
    const u = ui[key] || {}, locked = !state.open, dis = locked ? " disabled" : "";
    const msg = u.msg ? '<p class="row-msg ' + (u.ok ? "ok" : "err") + '">' + esc(u.msg) + "</p>" : "";
    if (takenBy && !u.cancel) {
      return '<div class="act taken-act"><span class="who">✔ ' + esc(takenBy) + " 已認領</span>" +
        '<button type="button" class="ghost small" data-act="askcancel" data-key="' + key + '"' + dis + ">我要取消</button></div>" + msg;
    }
    const isCancel = !!u.cancel;
    const nickSel = isCancel
      ? '<select data-f="nick" data-key="' + key + '"' + dis + ">" + nickOptions(key, key === ARRANGE ? state.arrange : [takenBy]) + "</select>"
      : '<select data-f="nick" data-key="' + key + '"' + dis + ">" + nickOptions(key) + "</select>";
    return '<div class="act">' + nickSel +
      '<input data-f="phone" data-key="' + key + '" type="tel" inputmode="numeric" autocomplete="tel" placeholder="手機號碼" value="' + esc(u.phone || "") + '"' + dis + ">" +
      '<button type="button" data-act="' + (isCancel ? "cancel" : "claim") + '" data-key="' + key + '"' + dis + ">" + (isCancel ? "確認取消" : "確認") + "</button>" +
      (isCancel ? '<button type="button" class="ghost small" data-act="back" data-key="' + key + '">返回</button>' : "") +
      "</div>" + (locked ? '<p class="row-hint">10/9 00:00 開放</p>' : "") + msg;
  }

  function arrangeRow() {
    const a = state.arrange || [], u = ui[ARRANGE] || {};
    return '<div class="row arrange"><div class="row-head">' +
      '<span class="num star">★</span><div class="row-title"><span class="title">' + ARRANGE_NAME + '</span>' +
      '<span class="short">不確定選哪個崗位？選這裡，由大會依需要分配（可多人）</span></div>' +
      '<span class="badge free">' + a.length + " 人</span></div>" +
      (a.length ? '<p class="names">' + a.map(esc).join("、") + "</p>" : "") +
      actionHTML(ARRANGE, null) +
      (a.length && !u.cancel ? '<button type="button" class="link" data-act="askcancel" data-key="' + ARRANGE + '"' + (state.open ? "" : " disabled") + ">取消我的「由主辦單位安排」</button>" : "") +
      "</div>";
  }

  function roleRow(r) {
    const key = String(r.id), who = state.claims[key];
    return '<div class="row' + (who ? " is-taken" : "") + '"><div class="row-head">' +
      '<span class="num" style="background:' + GROUP_COLOR[r.group] + '">' + pad(r.id) + "</span>" +
      '<div class="row-title"><span class="title">' + r.title + '</span><span class="short">' + r.short + "</span></div>" +
      '<span class="badge ' + (who ? "taken" : "free") + '">' + (FIXED[key] ? "主辦指定" : who ? "已認領" : "可認領") + "</span></div>" +
      actionHTML(key, who) +
      '<details><summary>看詳細</summary><div class="body">' +
      '<p class="load">' + r.group + "｜" + r.load + "</p>" +
      '<div class="two"><div class="box"><h4>上午</h4>' + list(r.am) + '</div><div class="box"><h4>下午</h4>' + list(r.pm) + "</div></div>" +
      '<div class="two"><div><h4>要帶</h4>' + list(r.bring) + "</div><div><h4>適合誰</h4>" + list(r.need) + "</div></div>" +
      "<div><h4>重點注意</h4>" + list(r.watch) + "</div></div></details></div>";
  }

  function renderDynamic() {
    const claims = state.claims || {}, arrange = state.arrange || [];
    const taken = Object.keys(claims).length;
    $("countText").textContent = "已認領 " + taken + " / " + ROLES.length + "・主辦安排 " + arrange.length + " 人" + (state.nicknames.length ? "・已填 " + (taken + arrange.length) + " / " + state.nicknames.length + " 人" : "");
    $("lockbox").hidden = state.open;

    // 保留展開中的「看詳細」與游標位置
    const openDetails = new Set([...document.querySelectorAll("#rows details[open]")].map((d) => d.dataset.key));
    const active = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset : null;
    const activeKey = active && active.key, activeF = active && active.f;

    $("rows").innerHTML = arrangeRow() + ROLES.filter((r) => filter === "全部" || r.group === filter).map(roleRow).join("");
    document.querySelectorAll("#rows details").forEach((d) => {
      const key = d.closest(".row").querySelector("[data-key]");
      d.dataset.key = key ? key.dataset.key : "";
      if (openDetails.has(d.dataset.key)) d.open = true;
    });
    if (activeKey && activeF) { const el = document.querySelector('#rows [data-key="' + activeKey + '"][data-f="' + activeF + '"]'); if (el) el.focus(); }
  }

  function tick() {
    if (state.open) return;
    const ms = new Date(state.openAt).getTime() - (Date.now() + state.offset);
    if (ms <= 0) { $("countdown").textContent = "開放中，重新整理…"; refresh(); return; }
    const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1e3) % 60;
    $("countdown").textContent = "倒數 " + d + " 天 " + pad(h) + ":" + pad(m) + ":" + pad(s);
  }

  async function refresh() {
    try {
      const st = await apiStatus();
      state = { ...state, ...st, claims: withFixed(st.claims), arrange: st.arrange || [], offset: new Date(st.now).getTime() - Date.now() };
      renderDynamic(); tick();
    } catch (e) {
      $("countText").textContent = "讀取失敗，請稍後重新整理";
    }
  }

  async function send(action, key) {
    const u = (ui[key] = ui[key] || {});
    const req = { action, nickname: u.nick || "", phone: u.phone || "", roleId: key };
    if (!req.nickname || !req.phone) { u.msg = "請選暱稱並輸入手機號碼"; u.ok = false; renderDynamic(); return; }
    u.msg = "送出中…"; u.ok = true; renderDynamic();
    try {
      const r = await apiPost(req);
      if (r.claims) state.claims = withFixed(r.claims);
      if (r.arrange) state.arrange = r.arrange;
      for (const k in ui) if (k !== key) ui[k].msg = "";
      ui[key] = r.ok ? { msg: r.message, ok: true } : { ...u, msg: r.message, ok: false };
    } catch (e) {
      u.msg = "送出失敗，請檢查網路後再試一次"; u.ok = false;
    }
    renderDynamic();
  }

  // ---------- 事件 ----------
  $("chips").onclick = (e) => { const g = e.target.dataset.g; if (!g) return; filter = g; renderStatic(); renderDynamic(); };
  $("rows").addEventListener("input", (e) => {
    const t = e.target, key = t.dataset.key, f = t.dataset.f;
    if (!key || !f) return;
    (ui[key] = ui[key] || {})[f] = t.value;
  });
  $("rows").addEventListener("change", (e) => {
    const t = e.target; if (t.dataset.key && t.dataset.f) (ui[t.dataset.key] = ui[t.dataset.key] || {})[t.dataset.f] = t.value;
  });
  $("rows").addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]"); if (!b || b.disabled) return;
    const key = b.dataset.key, act = b.dataset.act;
    if (act === "claim") send("claim", key);
    else if (act === "cancel") { if (confirm("確定要取消嗎？")) send("cancel", key); }
    else if (act === "askcancel") { ui[key] = { cancel: true, nick: key === ARRANGE ? "" : state.claims[key] }; renderDynamic(); }
    else if (act === "back") { ui[key] = {}; renderDynamic(); }
  });

  renderStatic(); refresh();
  setInterval(tick, 1000);
  setInterval(() => { const a = document.activeElement; if (!(a && a.closest && a.closest("#rows") && (a.tagName === "INPUT" || a.tagName === "SELECT"))) refresh(); }, 30000);
})();
