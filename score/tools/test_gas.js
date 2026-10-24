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
    getLastColumn: () => Math.max(1, ...data.map((r) => (r || []).length)),
    copyTo: () => ({ setName: (n) => { sheets[n] = makeSheet(n); data.forEach((r) => sheets[n].data.push((r || []).slice())); return sheets[n]; } }),
  };
  return sh;
}
const sheets = {};
const ss = { getSheetByName: (n) => sheets[n] || null, insertSheet: (n) => (sheets[n] = makeSheet(n)) };
const cacheStore = {}, props = {};
let cacheGets = 0;
const ctx = {
  SpreadsheetApp: { getActiveSpreadsheet: () => ss, flush: () => {} },
  CacheService: { getScriptCache: () => ({ get: (k) => { cacheGets++; return k in cacheStore ? cacheStore[k] : null; }, put: (k, v) => { cacheStore[k] = String(v); }, remove: (k) => { delete cacheStore[k]; } }) },
  LockService: { getScriptLock: () => ({ waitLock: () => {}, tryLock: () => !ctx.lockBusy, releaseLock: () => {} }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = v; } }) },
  ContentService: { createTextOutput: (t) => ({ text: t, setMimeType() { return this; } }), MimeType: { JSON: "json" } },
  Logger: { log: (m) => { ctx.lastLog = m; } },
  Utilities: { formatDate: () => "1025_0600" },
  console,
};
vm.createContext(ctx);
for (const f of ["apps-script/Code.gs", "apps-script/Score.gs"]) vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f });

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log("✓", name); };
// 10/13 18 個崗位全部主辦指定（#10 恢復成「2F 門口＋報到支援」）；以下測試沿用「抽籤三＝#03、裁判七＝#07、裁判十一＝#11」，所以測試環境把這三格讓出來
assert.strictEqual(Object.keys(ctx.FIXED).length, 18); assert.strictEqual(Object.keys(ctx.CANCELLED).length, 0);
assert.strictEqual(ctx.FIXED[6], "臺師_阿帕頓諾迪"); assert.strictEqual(ctx.FIXED[8], "宜大_ian"); assert.strictEqual(ctx.FIXED[10], "北醫_Kang Lun");
assert.strictEqual(ctx.FIXED[14], "元智_LouLou"); assert.strictEqual(ctx.FIXED[15], "輔大_魚魚"); assert.strictEqual(ctx.FIXED[16], "輔大_PEIPEI");
assert.strictEqual(ctx.FIXED[17], "中原_呵呵"); assert.strictEqual(ctx.FIXED[18], "中原_郁郁");
delete ctx.FIXED[3]; delete ctx.FIXED[7]; delete ctx.FIXED[11];
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
    { key: "line:L01:1", payload: { t: [25, 50], done: false } }, // #07 下午是循跡 1 → OK
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

ok("排隊太久（拿不到鎖）回覆系統忙碌、不寫入", () => {
  ctx.lockBusy = true;
  const r = post({ action: "score.put", admin: PW(), items: [{ key: "weight:EA02", payload: { g: 1 } }] });
  ctx.lockBusy = false;
  assert.ok(!r.ok && r.busy && r.message.includes("忙碌"));
  clearCache();
  assert.ok(!get({ score: "1" }).state["weight:EA02"]);
});

ok("紀錄分頁每筆都有寫（含被拒絕的）", () => {
  const rows = sheets["計分紀錄"].getRange(2, 1, sheets["計分紀錄"].getLastRow() - 1, 5).getValues();
  assert.ok(rows.length >= 20 && rows.some((r) => String(r[4]).startsWith("拒絕")) && rows.some((r) => r[4] === "成功"));
});

ok("裁判電話錯 10 次才鎖；計分台可解鎖；登入成功清掉錯誤次數", () => {
  for (let i = 0; i < 9; i++) assert.strictEqual(post({ action: "score.login", nickname: "裁判十一", phone: "0900000000" }).message, "電話號碼不符");
  assert.ok(post({ action: "score.login", nickname: "裁判十一", phone: "0912000011" }).ok);           // 第 10 次前登入成功 → 歸零
  for (let i = 0; i < 10; i++) post({ action: "score.login", nickname: "裁判十一", phone: "0900000000" });
  assert.ok(post({ action: "score.login", nickname: "裁判十一", phone: "0912000011" }).message.includes("太多次"));
  assert.ok(!post({ action: "score.unlock", nickname: "裁判十一", phone: "0912000011" }).ok);         // 裁判自己不能解
  assert.ok(post({ action: "score.unlock", admin: PW(), nickname: "裁判十一" }).ok);
  assert.ok(post({ action: "score.login", nickname: "裁判十一", phone: "0912000011" }).ok);
  // 崗位認領網站維持原本的 fail_ 計數（不受影響）
  assert.ok(!("fail_裁判十一" in cacheStore));
});

ok("棄權：只有計分台能設，判對手 3:0", () => {
  const r = post({ action: "score.put", nickname: "裁判七", phone: "0912000007", items: [{ key: "absent:EB03", payload: { on: true } }] });
  assert.ok(!r.results[0].ok);
  const r2 = post({ action: "score.put", admin: PW(), items: [{ key: "absent:EB03", payload: { on: true } }] });
  assert.ok(r2.results[0].ok && r2.state["absent:EB03"].payload.on === true);
});

ok("計分台密碼錯 10 次鎖住", () => {
  for (let i = 0; i < 10; i++) post({ action: "score.login", admin: "bad" });
  assert.ok(post({ action: "score.login", admin: PW() }).message.includes("太多次"));
});

ok("抽籤人員 #01–#03 可以登錄、清除抽籤；裁判不行；抽籤人員不能改成績", () => {
  sheets["名單"].getRange(6, 1, 1, 2).setValues([["抽籤三", "0912000003"]]);
  claim.getRange(4, 3, 1, 1).setValues([["抽籤三"]]);     // #03
  const me = { nickname: "抽籤三", phone: "0912000003" };
  const r = post({ action: "score.put", ...me, items: [{ key: "draw:J05", payload: { team: "J01" } }, { key: "sumo:J:1:8", payload: { r: ["R", "R", "R"] } }] });
  assert.deepStrictEqual(r.results.map((x) => x.ok), [true, false]);
  assert.strictEqual(r.state["draw:J05"].by, "抽籤三");
  const r2 = post({ action: "score.put", ...me, items: [{ key: "draw:J05", payload: null }] });
  assert.ok(r2.results[0].ok && !("draw:J05" in r2.state));
  const r3 = post({ action: "score.put", nickname: "裁判十一", phone: "0912000011", items: [{ key: "draw:J06", payload: { team: "J02" } }] });
  assert.ok(!r3.results[0].ok);
});

ok("裁判替補 #01、#02、#10：每個場地都能寫、也能抽籤；計分台改過的照樣鎖住", () => {
  assert.strictEqual(JSON.stringify(ctx.GRG_RULES.SUB_ROLES), "[1,2,10]");
  sheets["名單"].getRange(7, 1, 1, 2).setValues([["北醫_Kang Lun", "0912150326"]]);   // #10 是主辦指定
  const me = { nickname: "北醫_Kang Lun", phone: "0912150326" };
  const r = post({ action: "score.put", ...me, items: [
    { key: "sumo:EA:1:1", payload: { r: ["R", "R", "B"] } },      // 上午場地 1（#04 的）
    { key: "sumo:R:1:3", payload: { r: ["B", "B", "B"] } },       // 下午遙控 3（#13 的）
    { key: "line:L01:2", payload: { t: [26, 51], done: false } }, // 循跡
    { key: "mr:M01:2", payload: { c: { W: 1 }, time: 60 } },      // MR
    { key: "draw:J07", payload: { team: "J03" } },                // 抽籤
  ] });
  assert.deepStrictEqual(r.results.map((x) => x.ok), [true, true, true, true, true]);
  assert.strictEqual(r.state["sumo:EA:1:1"].by, "北醫_Kang Lun");
  clearCache();   // 前面的測試把計分台密碼鎖住了
  assert.ok(post({ action: "score.put", admin: PW(), items: [{ key: "sumo:EA:1:1", payload: { r: ["B", "B", "B"] } }] }).results[0].ok);
  const r2 = post({ action: "score.put", ...me, items: [{ key: "sumo:EA:1:1", payload: { r: ["R", "R", "R"] } }, { key: "sumo:EA:1:2", payload: null }] });
  assert.deepStrictEqual(r2.results.map((x) => x.ok), [false, false]);   // 計分台改過 → 鎖住；刪除只限計分台
  const r3 = post({ action: "score.put", nickname: "裁判十一", phone: "0912000011", items: [{ key: "sumo:EA:1:2", payload: { r: ["R", "R", "R"] } }] });
  assert.ok(!r3.results[0].ok);   // 一般裁判還是只能寫自己場地
});

ok("主辦人員 大雄、蜜蜂、腳踏車（不佔崗位）：每個場地都能寫成績；不能抽籤、不能刪除", () => {
  assert.strictEqual(JSON.stringify(ctx.GRG_RULES.SUB_NICKS), '["大雄","蜜蜂","腳踏車","治平機動"]');
  sheets["名單"].getRange(8, 1, 1, 2).setValues([["蜜蜂", "0983407283"]]);
  const me = { nickname: "蜜蜂", phone: "0983407283" };
  assert.deepStrictEqual(post({ action: "score.login", ...me }).roles, []);
  const r = post({ action: "score.put", ...me, items: [
    { key: "sumo:EA:1:3", payload: { r: ["R", "R", "B"] } },      // 上午場地 1
    { key: "sumo:R:1:4", payload: { r: ["B", "B", "B"] } },       // 下午遙控
    { key: "line:L02:2", payload: { t: [26, 51], done: false } }, // 循跡
    { key: "mr:M02:2", payload: { c: { W: 1 }, time: 60 } },      // MR
    { key: "draw:J08", payload: { team: "J04" } },                // 抽籤：不行
    { key: "sumo:EA:1:4", payload: null },                        // 刪除：不行
  ] });
  assert.deepStrictEqual(r.results.map((x) => x.ok), [true, true, true, true, false, false]);
  assert.strictEqual(r.state["sumo:EA:1:3"].by, "蜜蜂");
});

ok("機動人員 治平機動（不佔崗位）：每個場地都能寫成績，也能抽籤；不能刪成績", () => {
  sheets["名單"].getRange(9, 1, 1, 2).setValues([["治平機動", "0987654321"]]);
  const me = { nickname: "治平機動", phone: "0987654321" };
  const r = post({ action: "score.put", ...me, items: [
    { key: "sumo:EA:2:1", payload: { r: ["R", "B", "R"] } },      // 上午場地
    { key: "line:L03:2", payload: { t: [26, 51], done: false } }, // 循跡
    { key: "mr:M03:2", payload: { c: { W: 1 }, time: 60 } },      // MR
    { key: "draw:J09", payload: { team: "J05" } },                // 抽籤：可以
    { key: "sumo:EA:2:2", payload: null },                        // 刪除：不行
  ] });
  assert.deepStrictEqual(r.results.map((x) => x.ok), [true, true, true, true, false]);
  assert.strictEqual(r.state["draw:J09"].by, "治平機動");
  const r2 = post({ action: "score.put", nickname: "蜜蜂", phone: "0983407283", items: [{ key: "draw:J10", payload: { team: "J06" } }] });
  assert.ok(!r2.results[0].ok);   // 主辦人員（大雄、蜜蜂、腳踏車）還是不能抽籤
});

ok("#10 恢復（2F 門口＋報到支援，主辦指定）；setup 把舊「場地7」認領搬到 #15（#15 已有人就不搬）", () => {
  const d = ctx.decide_({ action: "claim", nickname: "甲", phone: "0911222333", roleId: 10 }, { staff: { 甲: "0911222333" }, claims: {}, arrange: [], fails: 0 }, new Date("2026-10-11T12:00:00+08:00"));
  assert.ok(!d.ok && d.message.includes("主辦單位指定"), d.message);
  const nickAt = (id) => claim.getRange(id + 1, 3, 1, 1).getValues()[0][0];
  const fixed15 = ctx.FIXED[15]; delete ctx.FIXED[15]; claim.getRange(16, 3, 1, 1).setValues([[""]]);   // #15 是主辦指定，測搬移時先讓出來
  claim.getRange(11, 2, 1, 2).setValues([["相撲裁判 場地7", "沒崗位"]]);
  ctx.setup();
  assert.strictEqual(nickAt(15), "沒崗位");
  assert.strictEqual(nickAt(10), "北醫_Kang Lun");
  assert.strictEqual(claim.getRange(11, 2, 1, 1).getValues()[0][0], "2F 門口＋報到支援（主辦指定）");
  claim.getRange(11, 2, 1, 2).setValues([["相撲裁判 場地7（國小決賽）", "MR甲"]]);
  ctx.setup();
  assert.strictEqual(nickAt(15), "沒崗位");   // #15 已有人：不覆蓋
  assert.strictEqual(nickAt(10), "北醫_Kang Lun");
  ctx.FIXED[15] = fixed15;
  ctx.setup();
  assert.strictEqual(nickAt(15), "輔大_魚魚");   // 主辦指定蓋過舊認領
});

ok("賽前清除 score.reset：只限計分台、只在期限前；決賽只留場地、其餘成績與紀錄清空、先備份", () => {
  clearCache();
  post({ action: "score.put", admin: PW(), items: [{ key: "final:E:SF1", payload: { field: "am:5", red: "EA01", blue: "EB02", rounds: ["R"] } }, { key: "draw:EA03", payload: { team: "E03" } }] });
  clearCache();
  const before = Object.keys(JSON.parse(ctx.doGet({ parameter: { score: "1" } }).text).state).length;
  assert.ok(before >= 3, "before=" + before);
  assert.ok(!post({ action: "score.reset", nickname: "蜜蜂", phone: "0983407283" }).ok);   // 裁判不行
  const r = post({ action: "score.reset", admin: PW() });
  assert.ok(r.ok, r.message);
  clearCache();
  const st = JSON.parse(ctx.doGet({ parameter: { score: "1" } }).text).state;
  assert.deepStrictEqual(Object.keys(st), ["final:E:SF1"]);
  assert.deepStrictEqual(st["final:E:SF1"].payload, { field: "am:5" });
  assert.strictEqual(sheets["計分紀錄"].getLastRow(), 1);
  assert.ok(sheets["清除前備份_1025_0600"].getLastRow() >= before);
  ctx.SCORE_RESET_UNTIL = new Date("2026-01-01T00:00:00+08:00");
  assert.ok(post({ action: "score.reset", admin: PW() }).message.includes("已過"));   // 過了期限就不能清
});

console.log(`\n全部通過：${n} 項`);
