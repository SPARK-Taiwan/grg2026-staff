(function () {
  const $ = (id) => document.getElementById(id);
  const ROLES = window.ROLES, EV = window.EVENT;
  const GROUP_COLOR = { "裁判組": "var(--g-race)", "門禁接待組": "var(--g-gate)", "場控紀錄組": "var(--g-score)", "後勤安全組": "var(--g-care)" };
  const roleName = (id) => { const r = ROLES.find((x) => x.id === Number(id)); return r ? r.title : ""; };
  const pad = (n) => String(n).padStart(2, "0");

  let state = { open: false, openAt: EV.openAt, offset: 0, nicknames: [], claims: {}, arrange: [] };
  const ARRANGE = "A", ARRANGE_NAME = "由主辦單位安排";
  let filter = "全部";

  // ---------- 後台：正式（Apps Script）或示範模式 ----------
  const demo = !window.API_URL;
  const DEMO_STAFF = { "示範-小明": "0912345678", "示範-小華": "0922333444", "示範-阿美": "0933111222" };
  const demoOpen = () => new URLSearchParams(location.search).has("open");
  function demoLoad() { try { return JSON.parse(localStorage.getItem("grgDemo") || "null") || { claims: {}, arrange: [] }; } catch (e) { return { claims: {}, arrange: [] }; } }
  function demoSave(d) { try { localStorage.setItem("grgDemo", JSON.stringify(d)); } catch (e) {} }
  const norm = (p) => { let d = String(p || "").replace(/\D/g, ""); if (d.startsWith("886")) d = "0" + d.slice(3); return d; };

  async function apiStatus() {
    if (demo) {
      return { open: demoOpen() || Date.now() >= new Date(EV.openAt).getTime(), openAt: EV.openAt, now: new Date().toISOString(), nicknames: Object.keys(DEMO_STAFF), ...demoLoad() };
    }
    const res = await fetch(window.API_URL, { cache: "no-store" });
    return res.json();
  }
  async function apiPost(req) {
    if (demo) {
      if (!state.open) return { ok: false, message: "尚未開放填寫（10/9 00:00 開放）" };
      const d = demoLoad(), c = d.claims, a = d.arrange;
      if (norm(DEMO_STAFF[req.nickname]) !== norm(req.phone)) return { ok: false, message: "電話號碼不符", ...d };
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
    $("chips").onclick = (e) => { const g = e.target.dataset.g; if (!g) return; filter = g; renderStatic(); renderDynamic(); };
  }

  const list = (arr) => (arr && arr.length ? "<ul>" + arr.map((t) => "<li>" + t + "</li>").join("") + "</ul>" : "<p class='load'>無</p>");

  function renderDynamic() {
    const claims = state.claims || {};
    const arrange = state.arrange || [];
    const taken = Object.keys(claims).length;
    $("countText").textContent = "已認領 " + taken + " / " + ROLES.length + "・主辦安排 " + arrange.length + " 人" + (state.nicknames.length ? "・已填 " + (taken + arrange.length) + " / " + state.nicknames.length + " 人" : "");
    $("cards").innerHTML = ROLES.filter((r) => filter === "全部" || r.group === filter).map((r) => {
      const who = claims[String(r.id)];
      return '<details class="card"><summary>' +
        '<span class="num" style="background:' + GROUP_COLOR[r.group] + '">' + pad(r.id) + "</span>" +
        '<span class="title">' + r.title + "</span>" +
        '<span class="badge ' + (who ? "taken" : "free") + '">' + (who ? who + " 已認領" : "可認領") + "</span>" +
        '<span class="short">' + r.short + "</span></summary>" +
        '<div class="body">' +
        '<p class="load">' + r.group + "｜" + r.load + "</p>" +
        '<div class="two"><div class="box"><h4>上午</h4>' + list(r.am) + '</div><div class="box"><h4>下午</h4>' + list(r.pm) + "</div></div>" +
        '<div class="two"><div><h4>要帶</h4>' + list(r.bring) + "</div><div><h4>適合誰</h4>" + list(r.need) + "</div></div>" +
        "<div><h4>重點注意</h4>" + list(r.watch) + "</div></div></details>";
    }).join("");

    $("statusBody").innerHTML = ROLES.map((r) => {
      const who = claims[String(r.id)];
      return "<tr><td>" + pad(r.id) + "</td><td>" + r.title + "</td><td" + (who ? "" : ' class="empty"') + ">" + (who || "尚無") + "</td></tr>";
    }).join("") + '<tr><td>—</td><td>' + ARRANGE_NAME + '</td><td' + (arrange.length ? "" : ' class="empty"') + ">" + (arrange.length ? arrange.join("、") : "尚無") + "</td></tr>";

    const nickSel = $("nick"), keepNick = nickSel.value;
    nickSel.innerHTML = '<option value="">請選擇</option>' + state.nicknames.map((n) => "<option>" + n + "</option>").join("");
    nickSel.value = keepNick;
    const roleSel = $("role"), keepRole = roleSel.value;
    roleSel.innerHTML = '<option value="">請選擇</option>' + ROLES.map((r) => {
      const who = claims[String(r.id)], mine = who && who === nickSel.value;
      return '<option value="' + r.id + '"' + (who && !mine ? " disabled" : "") + ">#" + pad(r.id) + " " + r.title + (who ? (mine ? "（你目前的崗位）" : "（" + who + " 已認領）") : "") + "</option>";
    }).join("") + '<option value="' + ARRANGE + '">' + ARRANGE_NAME + "（可多人" + (arrange.includes(nickSel.value) ? "，你目前的選擇" : "") + "）</option>";
    roleSel.value = keepRole;

    const locked = !state.open;
    $("lockbox").hidden = !locked;
    $("form").classList.toggle("locked", locked);
    ["nick", "phone", "role", "submitBtn", "cancelBtn"].forEach((id) => ($(id).disabled = locked));
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
      state = { ...state, ...st, offset: new Date(st.now).getTime() - Date.now() };
      renderDynamic(); tick();
    } catch (e) {
      $("msg").className = "msg err"; $("msg").textContent = "讀取失敗，請稍後重新整理";
    }
  }

  async function send(action) {
    const msg = $("msg");
    const req = { action, nickname: $("nick").value, phone: $("phone").value, roleId: $("role").value };
    if (!req.nickname || !req.phone || (action === "claim" && !req.roleId)) { msg.className = "msg err"; msg.textContent = "請完成上面三個欄位"; return; }
    if (action === "cancel" && !confirm("確定要取消你目前認領的崗位嗎？")) return;
    $("submitBtn").disabled = $("cancelBtn").disabled = true;
    msg.className = "msg"; msg.textContent = "送出中…";
    try {
      const r = await apiPost(req);
      msg.className = "msg " + (r.ok ? "ok" : "err"); msg.textContent = r.message;
      if (r.claims) state.claims = r.claims;
      if (r.arrange) state.arrange = r.arrange;
      renderDynamic();
    } catch (e) {
      msg.className = "msg err"; msg.textContent = "送出失敗，請檢查網路後再試一次";
    } finally {
      $("submitBtn").disabled = $("cancelBtn").disabled = !state.open;
    }
  }

  $("form").onsubmit = (e) => { e.preventDefault(); send("claim"); };
  $("cancelBtn").onclick = () => send("cancel");
  $("nick").onchange = renderDynamic;

  renderStatic(); refresh();
  setInterval(tick, 1000);
  setInterval(refresh, 30000);
})();
