// GRG2026 即時計分：連線（Apps Script 或示範模式）＋裁判離線佇列
// 示範模式：config.js 沒有 API_URL，或網址加 ?demo=1 → 資料只存在這台瀏覽器
//   示範裁判：示範裁判04～18，電話 0900000004～0900000018（崗位編號＝暱稱數字）；計分台密碼 demo
window.GRG_API = (function () {
  "use strict";
  const S = window.GRG_SERVER;
  const qs = new URLSearchParams(location.search);
  const demo = !window.API_URL || qs.has("demo");
  const pad = (n) => String(n).padStart(2, "0");

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };

  // ---------- 示範模式 ----------
  const DEMO = { staff: {}, claims: {} };
  for (let i = 1; i <= 18; i++) { DEMO.staff["示範裁判" + pad(i)] = "09000000" + pad(i); DEMO.claims[i] = "示範裁判" + pad(i); }
  // 示範裁判07 多負責 MR，一個帳號就能試相撲（場地4）、循跡1、MR 三種輸入
  const DEMO_ASSIGN = { kind: "assign", payload: { slots: { "pm:MR": [4, 5, 6, 17, 7] } }, by: "示範", src: "admin", time: "" };
  const demoState = () => { const s = store.get("grgScoreDemo", {}); if (!s.assign) s.assign = DEMO_ASSIGN; return s; };
  function demoCall(req) {
    let who;
    if (req.admin != null) {
      if (String(req.admin) !== "demo") return { ok: false, message: "計分台密碼錯誤（示範模式密碼：demo）" };
      who = { admin: true };
    } else {
      const nick = String(req.nickname || "").trim();
      if (!DEMO.staff[nick]) return { ok: false, message: "找不到這個暱稱" };
      const norm = (p) => String(p || "").replace(/\D/g, "").slice(-9);
      if (norm(req.phone) !== norm(DEMO.staff[nick])) return { ok: false, message: "電話號碼不符" };
      who = { nick, roles: Object.keys(DEMO.claims).filter((id) => DEMO.claims[id] === nick).map(Number) };
    }
    if (req.action === "score.login") return { ok: true, nick: who.nick, roles: who.roles || [], admin: !!who.admin };
    if (req.action !== "score.put") return { ok: false, message: "未知的動作" };
    const out = S.apply(demoState(), req, who, new Date().toISOString());
    store.set("grgScoreDemo", out.state);
    return { ok: true, results: out.results, ...snapshot(out.state) };
  }
  const snapshot = (state) => ({ now: new Date().toISOString(), state, claims: DEMO.claims, nicknames: Object.keys(DEMO.staff), demo: true });

  // ---------- 連線 ----------
  async function post(req) {
    if (demo) {
      if (store.get("grgDemoOffline", false)) throw new Error("示範：模擬斷線");   // 測試離線佇列用
      return demoCall(req);
    }
    const res = await fetch(window.API_URL, { method: "POST", body: JSON.stringify(req) });
    return res.json();
  }
  async function load() {
    if (demo) return { ok: true, ...snapshot(demoState()) };
    const res = await fetch(window.API_URL + "?score=1&t=" + Date.now(), { cache: "no-store" });
    return res.json();
  }

  // ---------- 裁判離線佇列：先存在手機，有網路就上傳 ----------
  // 佇列項目：{key, payload, at}；同一個 key 只留最新的
  const QK = "grgScoreQueue", RK = "grgScoreRejected";
  const queue = () => store.get(QK, []);
  const rejected = () => store.get(RK, []);
  function enqueue(items) {
    const q = queue().filter((x) => !items.some((i) => i.key === x.key));
    items.forEach((i) => q.push({ key: i.key, payload: i.payload, at: Date.now() }));
    store.set(QK, q);
  }
  let flushing = null;
  // auth：{nickname, phone} 或 {admin}；回傳 {sent, failed, offline, data}
  function flush(auth) {
    if (flushing) return flushing;
    flushing = (async () => {
      const q = queue();
      if (!q.length) return { sent: 0, failed: 0 };
      try {
        const r = await post({ action: "score.put", ...auth, items: q.map((x) => ({ key: x.key, payload: x.payload })) });
        if (!r.ok) return { sent: 0, failed: 0, error: r.message };
        const res = r.results || [];
        const bad = res.filter((x) => !x.ok);
        // 送出期間又新增／修改的項目留著下次再送
        const sentAt = {};
        q.forEach((x) => { sentAt[x.key] = x.at; });
        store.set(QK, queue().filter((x) => !(x.key in sentAt) || x.at !== sentAt[x.key]));
        if (bad.length) store.set(RK, rejected().concat(bad.map((b) => ({ ...b, at: Date.now() }))).slice(-20));
        return { sent: res.length - bad.length, failed: bad.length, data: r };
      } catch (e) {
        return { sent: 0, failed: 0, offline: true };
      }
    })();
    return flushing.finally(() => { flushing = null; });
  }
  // 把還沒上傳的資料疊在伺服器資料上，裁判看得到自己剛輸入的
  function overlay(state, by) {
    const st = Object.assign({}, state);
    queue().forEach((x) => {
      if (x.payload === null) delete st[x.key];
      else {
        const kind = x.key.split(":")[0];
        const base = kind === "final" && st[x.key] ? st[x.key].payload : {};   // 裁判只送決賽回合，場地與對戰沿用
        st[x.key] = { kind, payload: Object.assign({}, base, x.payload), by: by || "我", src: "pending", time: new Date(x.at).toISOString(), pending: true };
      }
    });
    return st;
  }

  return { demo, store, post, load, queue, enqueue, flush, overlay, rejected, clearRejected: () => store.set(RK, []) };
})();
