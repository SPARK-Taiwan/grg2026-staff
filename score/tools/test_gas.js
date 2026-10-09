// 後台測試：用假的試算表在 Node 跑 Code.gs ＋ Score.gs（node score/tools/test_gas.js，在 staff-site 資料夾執行）
const fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");
const root = path.resolve(__dirname, "../..");

// ---------- 假的 Apps Script 環境 ----------
function makeSheet(name) {
  const data = [];
  const sh = {
    name, data,
    getLastRow: () => { for (let i = data.length; i > 0; i--) if ((data[i - 1] || []).some((v) => v !== "" && v != null)) return i; return 0; },
    appendRow: (r) => { data[sh.getLastRow()] = r.slice(); },
    setFrozenRows: () => {},
    getDataRange: () => sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), Math.max(1, ...data.map((r) => (r || []).length))),
    getRange: (r, c, nr = 1, nc = 1) => {
      if (typeof r === "string") return { setNumberFormat: () => ({}) };
      const rg = {
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => { const row = data[r - 1 + i] || []; const v = row[c - 1 + j]; return v == null ? "" : v; })),
        setValues: (vals) => { vals.forEach((row, i) => { const rr = (data[r - 1 + i] = data[r - 1 + i] || []); row.forEach((v, j) => { rr[c - 1 + j] = v; }); }); return rg; },
        setNumberFormat: () => rg,
        clearContent: () => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) if (data[r - 1 + i]) data[r - 1 + i][c - 1 + j] = ""; return rg; },
      };
      return rg;
    },
    clearContents: () => { data.length = 0; },
  };
  return sh;
}
const sheets = {};
const ss = { getSheetByName: (n) => sheets[n] || null, insertSheet: (n) => (sheets[n] = makeSheet(n)) };
const cacheStore = {}, props = {};
let cacheGets = 0;
const ctx = {
  SpreadsheetApp: { getActiveSpreadsheet: () => ss },
  CacheService: { getScriptCache: () => ({ get: (k) => { cacheGets++; return k in cacheStore ? cacheStore[k] : null; }, put: (k, v) => { cacheStore[k] = String(v); }, remove: (k) => { delete cacheStore[k]; } }) },
  LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = v; } }) },
  ContentService: { createTextOutput: (t) => ({ text: t, setMimeType() { return this; } }), MimeType: { JSON: "json" } },
  Logger: { log: (m) => { ctx.lastLog = m; } },
  console,
};
vm.createContext(ctx);
for (const f of ["apps-script/Code.gs", "apps-script/Score.gs"]) vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f });

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log("✓", name); };
const post = (req) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(req) } }).text);
const get = (p) => JSON.parse(ctx.doGet({ parameter: p || {} }).text);
const clearCache = () => { for (const k in cacheStore) delete cacheStore[k]; };

// 名單與認領
ctx.setup();
sheets["名單"].getRange(2, 1, 4, 2).setValues([["裁判七", "0912000007"], ["裁判十一", "912000011"], ["MR甲", "0912000004"], ["沒崗位", "0912999999"]]);
const claim = sheets["認領"];
claim.getRange(8, 3, 1, 1).setValues([["裁判七"]]);    // #07
claim.getRange(12, 3, 1, 1).setValues([["裁判十一"]]); // #11

ok("scoreSetup 產生計分台密碼、建立分頁", () => {
  ctx.scoreSetup();
  assert.ok(/^\d{6}$/.test(props.SCORE_ADMIN_PW));
  assert.ok(sheets["計分資料"] && sheets["計分紀錄"]);
  assert.ok(ctx.lastLog.includes(props.SCORE_ADMIN_PW));
});
const PW = () => props.SCORE_ADMIN_PW;

ok("原本的崗位認領 GET 不受影響", () => {
  const r = get();
  assert.ok("open" in r && "claims" in r && r.nicknames.includes("裁判七"));
  assert.ok(!("state" in r));
});

ok("裁判登入：電話對才過、回傳崗位", () => {
  assert.strictEqual(post({ action: "score.login", nickname: "裁判七", phone: "0912-000-007" }).roles[0], 7);
  assert.strictEqual(post({ action: "score.login", nickname: "裁判十一", phone: "0912000011" }).roles[0], 11);
  assert.strictEqual(post({ action: "score.login", nickname: "裁判七", phone: "0900000000" }).ok, false);
  assert.strictEqual(post({ action: "score.login", nickname: "誰", phone: "0900000000" }).message, "找不到這個暱稱");
});

ok("計分台密碼", () => {
  assert.strictEqual(post({ action: "score.login", admin: PW() }).admin, true);
  assert.strictEqual(post({ action: "score.login", admin: "x" }).ok, false);
});

ok("裁判只能寫自己場地（#07 = 上午場地 4）", () => {
  const auth = { nickname: "裁判七", phone: "0912000007" };
  const r = post({ action: "score.put", ...auth, items: [
    { key: "sumo:EB:1:4", payload: { r: ["R", "B", "TR"] } },   // 場地 4 → OK
    { key: "sumo:EA:1:1", payload: { r: ["R", "R", "R"] } },    // 場地 1 → 拒絕
    { key: "draw:EB01", payload: { team: "E01" } },             // 抽籤 → 只有計分台
    { key: "line:L01:1", payload: { t: [25, 50], done: false } }, // #07 預設是循跡 1 → OK
    { key: "mr:M01:1", payload: { c: { W: 1 }, time: 50 } },    // MR → 拒絕
  ] });
  assert.deepStrictEqual(r.results.map((x) => x.ok), [true, false, false, true, false]);
  assert.strictEqual(r.state["sumo:EB:1:4"].by, "裁判七");
  const rows = sheets["計分資料"].getRange(2, 1, 2, 6).getValues();
  assert.deepStrictEqual(rows.map((x) => x[0]).sort(), ["line:L01:1", "sumo:EB:1:4"]);
  assert.strictEqual(sheets["計分紀錄"].getLastRow(), 6);   // 標題＋5 筆
});

ok("#11 上午場地 8、下午遙控 1", () => {
  const auth = { nickname: "裁判十一", phone: "0912000011" };
  const r = post({ action: "score.put", ...auth, items: [{ key: "sumo:J:1:8", payload: { r: ["B", "B", "B"] } }, { key: "sumo:R:1:1", payload: { r: ["R", "R", "T0"] } }, { key: "sumo:R:1:2", payload: { r: ["R", "R", "R"] } }] });
  assert.deepStrictEqual(r.results.map((x) => x.ok), [true, true, false]);
});

ok("格式錯誤會被擋", () => {
  const r = post({ action: "score.put", admin: PW(), items: [{ key: "sumo:EA:1:1", payload: { r: ["X"] } }, { key: "lineset", payload: { laps: 7, sec: 25 } }, { key: "hack", payload: {} }, { key: "mr:M01:3", payload: { c: {} } }] });
  assert.ok(r.results.every((x) => !x.ok));
});

ok("計分台修改後裁判不能覆蓋；更新同一列不新增列", () => {
  const before = sheets["計分資料"].getLastRow();
  post({ action: "score.put", admin: PW(), items: [{ key: "sumo:EB:1:4", payload: { r: ["B", "B", "B"] } }] });
  assert.strictEqual(sheets["計分資料"].getLastRow(), before);
  const r = post({ action: "score.put", nickname: "裁判七", phone: "0912000007", items: [{ key: "sumo:EB:1:4", payload: { r: ["R", "R", "R"] } }] });
  assert.strictEqual(r.results[0].ok, false);
  assert.deepStrictEqual(r.state["sumo:EB:1:4"].payload.r, ["B", "B", "B"]);
});

ok("決賽：計分台指定場地後，該場地裁判只能改回合", () => {
  post({ action: "score.put", admin: PW(), items: [{ key: "final:E:SF1", payload: { field: "am:4", red: "EA01", blue: "EB02" } }] });
  const r = post({ action: "score.put", nickname: "裁判七", phone: "0912000007", items: [{ key: "final:E:SF1", payload: { rounds: ["R", "R"], red: "EA09" } }, { key: "final:E:SF2", payload: { rounds: ["R"] } }] });
  assert.deepStrictEqual(r.results.map((x) => x.ok), [true, false]);
  assert.deepStrictEqual(r.state["final:E:SF1"].payload, { field: "am:4", red: "EA01", blue: "EB02", rounds: ["R", "R"] });
});

ok("刪除只限計分台；刪掉的列會清空且讀取時略過", () => {
  const r = post({ action: "score.put", nickname: "裁判七", phone: "0912000007", items: [{ key: "line:L01:1", payload: null }] });
  assert.strictEqual(r.results[0].ok, false);
  const r2 = post({ action: "score.put", admin: PW(), items: [{ key: "line:L01:1", payload: null }] });
  assert.ok(r2.results[0].ok && !("line:L01:1" in r2.state));
  clearCache();
  assert.ok(!("line:L01:1" in get({ score: "1" }).state));
  // 再寫回來會新增在後面
  post({ action: "score.put", admin: PW(), items: [{ key: "line:L01:1", payload: { t: [20], done: false } }] });
  clearCache();
  assert.deepStrictEqual(get({ score: "1" }).state["line:L01:1"].payload.t, [20]);
});

ok("場地指派改了，權限跟著改", () => {
  post({ action: "score.put", admin: PW(), items: [{ key: "assign", payload: { slots: { "pm:MR": [7] } } }] });
  const r = post({ action: "score.put", nickname: "裁判七", phone: "0912000007", items: [{ key: "mr:M01:1", payload: { c: { W: 1 }, time: 50 } }] });
  assert.ok(r.results[0].ok);
});

ok("GET ?score=1 有快取、寫入後立即更新", () => {
  clearCache();
  const a = get({ score: "1" });
  assert.ok(a.ok && a.state["mr:M01:1"] && a.claims["7"] === "裁判七" && a.nicknames.length === 4);
  assert.ok(!JSON.stringify(a).includes("0912"));   // 電話不會出現在回應
  assert.ok(cacheStore.score_get_v1);
  post({ action: "score.put", admin: PW(), items: [{ key: "weight:EA01", payload: { g: 950 } }] });
  assert.strictEqual(get({ score: "1" }).state["weight:EA01"].payload.g, 950);
});

ok("計分台密碼錯 10 次鎖住", () => {
  for (let i = 0; i < 10; i++) post({ action: "score.login", admin: "bad" });
  assert.ok(post({ action: "score.login", admin: PW() }).message.includes("太多次"));
});

console.log(`\n全部通過：${n} 項`);
