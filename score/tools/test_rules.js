// 計分規則單元測試：node score/tools/test_rules.js（在 staff-site 資料夾執行）
const fs = require("fs"), path = require("path"), assert = require("assert");
const dir = process.argv[2] || path.resolve(__dirname, "..");
global.window = {};
eval(fs.readFileSync(path.join(dir, "data.js"), "utf8"));
const D = window.GRG_DATA;
const R = require(path.join(dir, "rules.js"));
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log("✓", name); };

const put = (st, key, payload, src = "judge") => { st[key] = { kind: key.split(":")[0], payload, src }; };
function drawAll(st) {
  ["EA", "EB"].forEach((gk, gi) => D.groups[gk].codes.forEach((c, i) => put(st, "draw:" + c, { team: D.teams.E[gi * 10 + i].id })));
  D.groups.J.codes.forEach((c, i) => put(st, "draw:" + c, { team: D.teams.J[i].id }));
  D.groups.R.codes.forEach((c, i) => put(st, "draw:" + c, { team: D.teams.R[i].id }));
}
// 預賽：代號數字小的贏（3:0）→ 名次＝代號順序
function playAll(st, gk, fn) {
  D.schedule[gk].forEach((m) => {
    const red = m[2], blue = m[3];
    put(st, R.matchKey(gk, m), { r: fn ? fn(red, blue) : (red < blue ? ["R", "R", "R"] : ["B", "B", "B"]) });
  });
}

ok("相撲每回合得分", () => {
  assert.deepStrictEqual(R.sumoPts(["R", "TB", "T0"]), { red: 1, blue: 1 });
  assert.deepStrictEqual(R.sumoPts(["TR", "TR", "B"]), { red: 2, blue: 1 });
});

ok("預賽排名：全勝者第一、名次照代號", () => {
  const st = {}; drawAll(st); playAll(st, "EA");
  const s = R.groupStandings(D, st, "EA");
  assert.strictEqual(s.done, true);
  assert.deepStrictEqual(s.rows.map((r) => r.code), D.groups.EA.codes);
  assert.strictEqual(s.rows[0].pts, 27);              // 9 場 × 3 分
  assert.ok(s.rows.every((r) => !r.tie));
});

ok("同分 → 比對戰得分", () => {
  // EA01、EA02 都只輸給對方以外的人… 造一個：EA02 贏 EA01，其餘照代號 → EA01 24 分、EA02 24 分（EA02 少拿 EA01 那場的 3 分，多拿…）
  const st = {}; drawAll(st);
  playAll(st, "EA", (a, b) => {
    if ((a === "EA01" && b === "EA02") || (a === "EA02" && b === "EA01")) return a === "EA02" ? ["R", "R", "R"] : ["B", "B", "B"];
    if (a === "EA01" || b === "EA01") return a === "EA01" ? ["R", "R", "R"] : ["B", "B", "B"];
    if (a === "EA03" || b === "EA03") { const other = a === "EA03" ? b : a; if (other === "EA02") return a === "EA03" ? ["R", "R", "R"] : ["B", "B", "B"]; }
    return a < b ? ["R", "R", "R"] : ["B", "B", "B"];
  });
  const s = R.groupStandings(D, st, "EA");
  const top = s.rows.slice(0, 3).map((r) => [r.code, r.pts, r.rank, r.tie]);
  // EA01：輸 EA02，贏其餘 8 → 24；EA02：贏 EA01、輸 EA03，贏其餘 7 → 24；EA03：輸 EA01、贏 EA02、贏其餘 7 → 24
  assert.deepStrictEqual(top.map((x) => x[1]), [24, 24, 24]);
  // 三隊互打各贏一場 → 對戰得分都是 3 → 仍同分（需要秤重）
  assert.ok(top.every((x) => x[3] === true));
  assert.deepStrictEqual(R.tiesNeedingWeight(D, st, "EA"), [{ rank: 1, codes: ["EA01", "EA02", "EA03"] }]);
  // 秤重後：輕者在前
  put(st, "weight:EA01", { g: 980 }, "admin"); put(st, "weight:EA02", { g: 900 }, "admin"); put(st, "weight:EA03", { g: 950 }, "admin");
  const s2 = R.groupStandings(D, st, "EA");
  assert.deepStrictEqual(s2.rows.slice(0, 3).map((r) => r.code), ["EA02", "EA03", "EA01"]);
  assert.ok(s2.rows.slice(0, 3).every((r) => !r.tie));
});

ok("兩隊同分時對戰勝者在前", () => {
  const st = {}; drawAll(st);
  // 讓 EA02 贏 EA01、其他照代號；EA01 24、EA02 24（EA02 輸 0 場? EA02 贏 EA01 且贏 EA03..10 → 27）→ 改：EA02 輸 EA03
  playAll(st, "EA", (a, b) => {
    const pair = (x, y) => (a === x && b === y) || (a === y && b === x);
    if (pair("EA01", "EA02")) return a === "EA02" ? ["R", "R", "R"] : ["B", "B", "B"];
    if (pair("EA02", "EA03")) return a === "EA03" ? ["R", "R", "R"] : ["B", "B", "B"];
    if (pair("EA01", "EA03")) return a === "EA01" ? ["R", "R", "R"] : ["B", "B", "B"];
    return a < b ? ["R", "R", "R"] : ["B", "B", "B"];
  });
  // 這樣仍是三角循環；改成只看 EA01 vs EA02 兩隊同分的情況
  const st2 = {}; drawAll(st2);
  playAll(st2, "EA", (a, b) => {
    const pair = (x, y) => (a === x && b === y) || (a === y && b === x);
    if (pair("EA01", "EA02")) return a === "EA02" ? ["R", "R", "R"] : ["B", "B", "B"];   // EA02 勝
    if (pair("EA02", "EA04")) return a === "EA04" ? ["R", "R", "R"] : ["B", "B", "B"];   // EA02 輸給 EA04
    return a < b ? ["R", "R", "R"] : ["B", "B", "B"];
  });
  const s = R.groupStandings(D, st2, "EA");
  // EA01 = 24、EA02 = 24 → 對戰 EA02 勝 → EA02 第一
  assert.deepStrictEqual(s.rows.slice(0, 2).map((r) => [r.code, r.pts]), [["EA02", 24], ["EA01", 24]]);
  assert.ok(!s.rows[0].tie && !s.rows[1].tie);
});

ok("決賽配對、三戰兩勝、頒獎名單（國小）", () => {
  const st = {}; drawAll(st); playAll(st, "EA"); playAll(st, "EB");
  let f = R.finals(D, st, "E");
  assert.deepStrictEqual([f.SF1.red, f.SF1.blue, f.SF2.red, f.SF2.blue], ["EA01", "EB02", "EB01", "EA02"]);
  put(st, "final:E:SF1", { rounds: ["R", "B", "R"] });          // EA01 勝
  put(st, "final:E:SF2", { rounds: ["B", "B"] });               // EA02 勝
  f = R.finals(D, st, "E");
  assert.deepStrictEqual([f.F.red, f.F.blue], ["EA01", "EA02"]);
  put(st, "final:E:F", { rounds: ["B", "R", "B"] });            // EA02 冠軍
  f = R.finals(D, st, "E");
  assert.strictEqual(f.champion, "EA02"); assert.strictEqual(f.runnerUp, "EA01");
  assert.deepStrictEqual(f.thirds.sort(), ["EB01", "EB02"]);
  const aw = R.sumoAwards(D, st, "E");
  assert.strictEqual(aw.length, 21);
  const t = (cat, title) => aw.filter((x) => x.cat.includes(cat) && x.title === title).map((x) => x.code);
  assert.deepStrictEqual(t("總名次", "季軍").sort(), ["EB01", "EB02"]);
  assert.deepStrictEqual(t("A 組", "第一名"), ["EA03"]);      // A 組預賽第 3 名
  assert.deepStrictEqual(t("A 組", "優勝"), ["EA06", "EA07", "EA08"]);
  assert.deepStrictEqual(t("A 組", "表現優異"), ["EA09", "EA10"]);
  assert.deepStrictEqual(t("B 組", "表現優異"), ["EB09", "EB10", "EB11"]);
  assert.ok(!aw.some((x) => x.title === "殿軍"));
});

ok("國高中：學制名次（扣掉決賽 4 隊）", () => {
  const st = {}; drawAll(st); playAll(st, "J");
  ["SF1", "SF2", "F"].forEach((s) => put(st, "final:J:" + s, { rounds: ["R", "R"] }));
  const aw = R.sumoAwards(D, st, "J");
  assert.strictEqual(aw.length, 17);
  const lv = (code) => R.teamOfCode(D, st, code).level;
  // 決賽 4 隊 J01–J04；國中隊依預賽 J05.. 第一～三、優勝、表現優異
  const jh = aw.filter((x) => x.cat.endsWith("國中組"));
  const hs = aw.filter((x) => x.cat.endsWith("高中組"));
  assert.ok(jh.every((x) => lv(x.code) === "國中") && hs.every((x) => lv(x.code) === "高中"));
  assert.deepStrictEqual(jh.slice(0, 3).map((x) => x.title), ["第一名", "第二名", "第三名"]);
  assert.strictEqual(jh.length + hs.length, 13);
});

ok("循跡：最接近目標、沒跑完排後面、2 次取最好", () => {
  const st = {};
  put(st, "lineset", { laps: 3, sec: 25 }, "admin");               // 目標 75 秒
  const L = D.teams.L;
  put(st, "line:" + L[0].id + ":1", { t: [25.5, 50.2, 75.30], done: true });   // 差 0.30
  put(st, "line:" + L[0].id + ":2", { t: [24, 49, 74.90], done: true });       // 差 0.10 ← 較好
  put(st, "line:" + L[1].id + ":1", { t: [25, 50, 75.10], done: true });       // 差 0.10，次終圈差 0 → 比 L0 好
  put(st, "line:" + L[2].id + ":1", { t: [25, 50], done: false });             // 只跑 2 圈 → 排在完成者後
  put(st, "line:" + L[3].id + ":1", { t: [26, 77], done: true });              // 只記 2 圈卻勾完成 → 視為未完成 2 圈
  const { rows } = R.lineRanking(D, st);
  assert.deepStrictEqual(rows.slice(0, 2).map((r) => r.team.id), [L[1].id, L[0].id]);
  assert.strictEqual(rows[0].best.laps, 3);
  const r2 = rows.find((r) => r.team.id === L[2].id), r3 = rows.find((r) => r.team.id === L[3].id);
  assert.strictEqual(r2.best.laps, 2); assert.strictEqual(r3.best.laps, 2);
  assert.ok(rows.indexOf(r2) < rows.indexOf(r3));                               // 第 2 圈差 0 < 第 2 圈差 27
  const aw = R.lineAwards(D, st);
  assert.ok(aw.every((x) => ["第一名", "第二名", "第三名"].includes(x.title)));
});

ok("MR：分數、同分比時間、0 分記 120 秒、頒獎", () => {
  const st = {};
  const M3 = D.teams.M.filter((t) => t.mr === "MR3"), M2 = D.teams.M.filter((t) => t.mr === "MR2");
  assert.deepStrictEqual(R.mrEval({ c: { W: 1, w: 2 }, time: 90 }), { score: 170, time: 90 });
  assert.deepStrictEqual(R.mrEval({ c: {}, time: 30 }), { score: 0, time: 120 });
  put(st, "mr:" + M3[0].id + ":1", { c: { W: 1 }, time: 100 });
  put(st, "mr:" + M3[1].id + ":1", { c: { W: 1 }, time: 80 });     // 同分較快 → 第一
  put(st, "mr:" + M3[2].id + ":1", { c: { G: 1 }, time: 50 });
  put(st, "mr:" + M3[2].id + ":2", { c: { G: 1, o: 1 }, time: 110 }); // 第二次 100 分較高
  put(st, "mr:" + M3[3].id + ":1", { c: { Y: 1 }, time: 60 });
  put(st, "mr:" + M3[4].id + ":1", { c: { X: 1 }, time: 60 });
  put(st, "mr:" + M2[0].id + ":1", { c: { B: 1 }, time: 70 });
  const rk = R.mrRanking(D, st, "MR3");
  assert.deepStrictEqual(rk.slice(0, 3).map((r) => r.team.id), [M3[2].id, M3[1].id, M3[0].id]);
  const aw = R.mrAwards(D, st);
  const titles = aw.filter((x) => x.cat.includes("MR3")).map((x) => x.title);
  assert.deepStrictEqual(titles, ["冠軍", "亞軍", "季軍", "季軍", "表現優異"]);
  assert.deepStrictEqual(aw.filter((x) => x.cat.includes("MR2")).map((x) => x.title), ["冠軍"]);
});

ok("MR 數量上限（依規則推算）", () => {
  const m = (c, k) => R.mrMax(c, k);
  assert.strictEqual(m({}, "W"), 1); assert.strictEqual(m({ W: 1 }, "W"), 1);           // 每色有效堆疊最多 1
  assert.strictEqual(m({}, "X"), 5); assert.strictEqual(m({ W: 1, G: 1 }, "X"), 3);    // 有效＋無效最多 5
  assert.strictEqual(m({ X: 5 }, "W"), 0);                                               // 大方塊用完了
  assert.strictEqual(m({}, "w"), 0); assert.strictEqual(m({ W: 1 }, "w"), 2);            // 同色層要有該色堆疊、最多 2 層
  assert.strictEqual(m({ W: 1 }, "o"), 0);
  assert.strictEqual(m({ W: 1, w: 1 }, "m"), 1); assert.strictEqual(m({ W: 1, m: 1 }, "w"), 1); // 每個堆疊共 2 層
  const full = { W: 1, G: 1, B: 1, P: 1, Y: 1, w: 2, o: 2, u: 2, r: 2, y: 2 };
  assert.ok(R.mrValid(full)); assert.strictEqual(R.mrEval({ c: full, time: 100 }).score, 570);
  assert.ok(!R.mrValid({ W: 2 })); assert.ok(!R.mrValid({ w: 1 })); assert.ok(!R.mrValid({ W: 1, X: 5 })); assert.ok(!R.mrValid({ W: 1, w: 2, m: 1 }));
  assert.deepStrictEqual(R.mrClamp({ W: 0, w: 2, m: 1, G: 1 }), { G: 1, m: 1 });        // 拿掉白色堆疊 → 白色層歸零
  const S = require(path.join(dir, "server.js"));
  assert.strictEqual(S.validate("mr", ["mr", "M01", "1"], { c: { G: 2 }, time: 60 }), "MR 完成數量超過規則上限");
  assert.strictEqual(S.validate("mr", ["mr", "M01", "1"], { c: full, time: 60 }), "");
});

ok("場地指派：預設與覆蓋", () => {
  const s = R.slotsOf({});
  assert.deepStrictEqual(s["am:1"], [4]); assert.deepStrictEqual(s["pm:R1"], [11]); assert.deepStrictEqual(s["pm:R6"], [16]);
  assert.deepStrictEqual(s["pm:L3"], [10, 18]); assert.deepStrictEqual(s["pm:MR"], [4, 5, 6, 17]);
  const s2 = R.slotsOf({ assign: { payload: { slots: { "pm:L1": [9] } } } });
  assert.deepStrictEqual(s2["pm:L1"], [9]);
});

console.log(`\n全部通過：${n} 項`);
