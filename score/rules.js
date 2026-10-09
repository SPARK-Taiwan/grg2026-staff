// GRG2026 即時計分：規則與排名（純函式，瀏覽器與 Node 測試共用）
// 資料狀態 state：{ key: { kind, payload, by, src, time } }
//   draw:<代號>                 {team}            抽籤：代號→隊伍 id
//   sumo:<組>:<輪>:<場地>       {r:[...]}         相撲預賽 3 回合：R 紅勝、B 藍勝、TR/TB 時間到紅/藍較輕、T0 一樣重
//   weight:<代號>               {g}               同分時秤重（公克）
//   final:<E|J|R>:<SF1|SF2|F>   {field, red, blue, rounds:[R|B...]}   決賽（三戰兩勝）
//   lineset                     {laps, sec}       循跡現場抽籤：圈數、每圈秒數
//   line:<隊伍id>:<1|2>         {t:[累計秒...], done}               循跡每次的分圈累計秒數
//   mr:<隊伍id>:<1|2>           {c:{...}, time}   MR 每次的計分項目數量與時間
//   assign                      {slots:{...}}     場地指派（覆蓋預設）
(function (root) {
  "use strict";

  const RANKS = ["第一名", "第二名", "第三名"];
  const TOTAL_NAMES = { 1: "冠軍", 2: "亞軍", 3: "季軍" };

  // ---------- 場地指派 ----------
  // 上午 am:1–15 → 崗位 #04–#18；下午遙控 pm:R1–R6 → #11–#16（網站原安排）；
  // 循跡 pm:L1–L3 → #07、#08、#10（#18 循跡助理可協助）；MR → #04、#05（#06、#17 MR 助理可協助）
  function defaultSlots() {
    const s = {};
    for (let i = 1; i <= 15; i++) s["am:" + i] = [i + 3];
    for (let i = 1; i <= 6; i++) s["pm:R" + i] = [i + 10];
    s["pm:L1"] = [7, 18]; s["pm:L2"] = [8, 18]; s["pm:L3"] = [10, 18];
    s["pm:MR"] = [4, 5, 6, 17];
    return s;
  }
  function slotsOf(state) {
    const s = defaultSlots();
    const a = state["assign"];
    if (a && a.payload && a.payload.slots) Object.assign(s, a.payload.slots);
    return s;
  }
  function slotLabel(slot) {
    const [sess, f] = slot.split(":");
    if (sess === "am") return "上午 場地" + f;
    if (f === "MR") return "下午 MR 場地";
    if (f[0] === "R") return "下午 遙控" + f.slice(1);
    return "下午 循跡" + f.slice(1);
  }
  function sumoSlot(gk, field) { return gk === "R" ? "pm:R" + field : "am:" + field; }

  // ---------- 隊伍查詢 ----------
  function teamById(D, id) {
    if (!id) return null;
    const list = D.teams[id[0]] || [];
    return list.find((t) => t.id === id) || null;
  }
  function teamOfCode(D, state, code) {
    const d = state["draw:" + code];
    return d && d.payload && d.payload.team ? teamById(D, d.payload.team) : null;
  }

  // ---------- 相撲預賽 ----------
  function sumoPts(r) {
    const p = { red: 0, blue: 0 };
    (r || []).forEach((x) => { if (x === "R" || x === "TR") p.red++; else if (x === "B" || x === "TB") p.blue++; });
    return p;
  }
  function matchKey(gk, m) { return "sumo:" + gk + ":" + m[0] + ":" + m[1]; }
  function matchResult(state, gk, m) {
    const s = state[matchKey(gk, m)];
    return s && s.payload && Array.isArray(s.payload.r) ? s.payload.r : null;
  }
  function isDone(r) { return Array.isArray(r) && r.length === 3 && r.every(Boolean); }

  function groupStandings(D, state, gk) {
    const g = D.groups[gk], sched = D.schedule[gk];
    const row = {};
    g.codes.forEach((c) => { row[c] = { code: c, pts: 0, played: 0, total: 0, h2h: 0, weight: null, tie: false }; });
    sched.forEach((m) => { row[m[2]].total++; row[m[3]].total++; });
    const results = [];
    sched.forEach((m) => {
      const r = matchResult(state, gk, m);
      if (!r) return;
      const p = sumoPts(r);
      row[m[2]].pts += p.red; row[m[3]].pts += p.blue;
      if (isDone(r)) { row[m[2]].played++; row[m[3]].played++; }
      results.push({ red: m[2], blue: m[3], p });
    });
    g.codes.forEach((c) => {
      const w = state["weight:" + c];
      row[c].weight = w && w.payload && w.payload.g > 0 ? Number(w.payload.g) : null;
    });
    // 規則 2.3.7：總分 → 同分隊伍間對戰得分 → 重量（輕者在前）
    const byPts = {};
    g.codes.forEach((c) => { (byPts[row[c].pts] = byPts[row[c].pts] || []).push(c); });
    const order = [];
    Object.keys(byPts).map(Number).sort((a, b) => b - a).forEach((pts) => {
      const tied = byPts[pts];
      if (tied.length === 1) { order.push(tied); return; }
      const set = new Set(tied);
      tied.forEach((c) => { row[c].h2h = 0; });
      results.forEach((x) => { if (set.has(x.red) && set.has(x.blue)) { row[x.red].h2h += x.p.red; row[x.blue].h2h += x.p.blue; } });
      const byH = {};
      tied.forEach((c) => { (byH[row[c].h2h] = byH[row[c].h2h] || []).push(c); });
      Object.keys(byH).map(Number).sort((a, b) => b - a).forEach((h) => {
        const t2 = byH[h];
        if (t2.length === 1) { order.push(t2); return; }
        const allW = t2.every((c) => row[c].weight != null);
        if (!allW) { order.push(t2); return; }
        const byW = {};
        t2.forEach((c) => { (byW[row[c].weight] = byW[row[c].weight] || []).push(c); });
        Object.keys(byW).map(Number).sort((a, b) => a - b).forEach((w) => order.push(byW[w]));
      });
    });
    const out = [];
    let pos = 1;
    order.forEach((bucket) => {
      bucket.sort();
      bucket.forEach((c) => { row[c].rank = pos; row[c].tie = bucket.length > 1; out.push(row[c]); });
      pos += bucket.length;
    });
    const done = sched.every((m) => isDone(matchResult(state, gk, m)));
    return { rows: out, done, played: sched.filter((m) => isDone(matchResult(state, gk, m))).length, total: sched.length };
  }

  // 同分卡在晉級／得獎線上、需要秤重的隊伍（排名相同且尚未秤重）
  function tiesNeedingWeight(D, state, gk) {
    const st = groupStandings(D, state, gk);
    const groups = {};
    st.rows.filter((r) => r.tie).forEach((r) => { (groups[r.rank] = groups[r.rank] || []).push(r.code); });
    return Object.keys(groups).map((rank) => ({ rank: Number(rank), codes: groups[rank] }));
  }

  // 每個場地目前／下一場
  function fieldQueue(D, state, gk) {
    const out = {};
    D.groups[gk].fields.forEach((f) => {
      const ms = D.schedule[gk].filter((m) => m[1] === f).sort((a, b) => a[0] - b[0]);
      const pend = ms.filter((m) => !isDone(matchResult(state, gk, m)));
      out[f] = { now: pend[0] || null, next: pend[1] || null, done: ms.length - pend.length, total: ms.length };
    });
    return out;
  }

  // ---------- 決賽（三戰兩勝；敗方 2 隊並列季軍） ----------
  const FAMILY = { E: ["EA", "EB"], J: ["J"], R: ["R"] };
  function seeds(D, state, fam) {
    if (fam === "E") {
      const a = groupStandings(D, state, "EA"), b = groupStandings(D, state, "EB");
      return { done: a.done && b.done, SF1: [a.rows[0], b.rows[1]], SF2: [b.rows[0], a.rows[1]],
               label: { SF1: ["A 組第 1 名", "B 組第 2 名"], SF2: ["B 組第 1 名", "A 組第 2 名"] } };
    }
    const s = groupStandings(D, state, fam);
    return { done: s.done, SF1: [s.rows[0], s.rows[3]], SF2: [s.rows[1], s.rows[2]],
             label: { SF1: ["預賽第 1 名", "預賽第 4 名"], SF2: ["預賽第 2 名", "預賽第 3 名"] } };
  }
  function boWinner(rounds, red, blue) {
    let r = 0, b = 0;
    (rounds || []).forEach((x) => { if (x === "R") r++; else if (x === "B") b++; });
    return { r, b, winner: r >= 2 ? red : b >= 2 ? blue : null, loser: r >= 2 ? blue : b >= 2 ? red : null };
  }
  function finals(D, state, fam) {
    const sd = seeds(D, state, fam);
    const get = (slot) => (state["final:" + fam + ":" + slot] || {}).payload || {};
    const mk = (slot, autoRed, autoBlue, labels) => {
      const p = get(slot);
      const red = p.red || autoRed || null, blue = p.blue || autoBlue || null;
      return { slot, red, blue, labels, field: p.field || null, rounds: p.rounds || [], ...boWinner(p.rounds, red, blue) };
    };
    const sf1 = mk("SF1", sd.done && sd.SF1[0] && sd.SF1[0].code, sd.done && sd.SF1[1] && sd.SF1[1].code, sd.label.SF1);
    const sf2 = mk("SF2", sd.done && sd.SF2[0] && sd.SF2[0].code, sd.done && sd.SF2[1] && sd.SF2[1].code, sd.label.SF2);
    const f = mk("F", sf1.winner, sf2.winner, ["準決賽 ① 勝方", "準決賽 ② 勝方"]);
    return { fam, prelimDone: sd.done, SF1: sf1, SF2: sf2, F: f,
             champion: f.winner, runnerUp: f.loser, thirds: [sf1.loser, sf2.loser].filter(Boolean) };
  }

  // ---------- 相撲頒獎名單（規則 2.5；不頒殿軍，季軍 2 隊；佳作改稱表現優異） ----------
  function levelOf(D, state, code) { const t = teamOfCode(D, state, code); return t ? t.level : null; }
  function bandName(i) { return i < 3 ? RANKS[i] : i < 6 ? "優勝" : "表現優異"; }
  function sumoAwards(D, state, fam) {
    const fn = finals(D, state, fam);
    const famName = { E: "相撲自動組 國小組", J: "相撲自動組 國高中組", R: "相撲遙控組" }[fam];
    const list = [];
    const add = (cat, title, code) => list.push({ cat, title, code, team: teamOfCode(D, state, code) });
    if (fn.champion) add(famName + "｜總名次", "冠軍", fn.champion);
    if (fn.runnerUp) add(famName + "｜總名次", "亞軍", fn.runnerUp);
    fn.thirds.forEach((c) => add(famName + "｜總名次", "季軍", c));
    const finalists = new Set([fn.SF1.red, fn.SF1.blue, fn.SF2.red, fn.SF2.blue].filter(Boolean));
    if (fam === "E") {
      [["EA", "國小自動組 A 組"], ["EB", "國小自動組 B 組"]].forEach(([gk, name]) => {
        // 小組預賽第 3–5 名＝小組第一～三名、6–8 名優勝、其餘表現優異
        groupStandings(D, state, gk).rows.filter((r) => !finalists.has(r.code)).forEach((r, i) => add(name, bandName(i), r.code));
      });
    } else {
      const levels = fam === "J" ? ["國中", "高中"] : ["國小", "國中", "高中"];
      const rest = groupStandings(D, state, fam).rows.filter((r) => !finalists.has(r.code));
      levels.forEach((lv) => {
        rest.filter((r) => levelOf(D, state, r.code) === lv).forEach((r, i) => add(famName + "｜" + lv + "組", bandName(i), r.code));
      });
    }
    return list;
  }

  // ---------- 循跡：最接近目標秒數；2 次取最好；沒跑完依完成圈數 ----------
  function lineEval(set, p) {
    if (!set || !p || !Array.isArray(p.t)) return null;
    const n = Number(set.laps), sec = Number(set.sec);
    const t = p.t.map(Number).filter((x) => x > 0);
    const done = !!p.done && t.length >= n;
    const laps = done ? n : Math.min(t.length, n);
    const diffs = [];
    for (let k = laps; k >= 1; k--) diffs.push(Math.abs(t[k - 1] - k * sec));
    return { laps, done, diffs, final: laps ? t[laps - 1] : null, target: n * sec };
  }
  function lineCmp(a, b) {               // 負數＝a 比較好
    if (!a && !b) return 0; if (!a) return 1; if (!b) return -1;
    if (a.laps !== b.laps) return b.laps - a.laps;
    for (let i = 0; i < Math.max(a.diffs.length, b.diffs.length); i++) {
      const x = a.diffs[i] == null ? Infinity : a.diffs[i], y = b.diffs[i] == null ? Infinity : b.diffs[i];
      if (Math.abs(x - y) > 1e-9) return x - y;
    }
    return 0;
  }
  function lineRanking(D, state) {
    const set = (state["lineset"] || {}).payload || null;
    const rows = D.teams.L.map((team) => {
      const tries = [1, 2].map((n) => lineEval(set, (state["line:" + team.id + ":" + n] || {}).payload));
      const best = tries.slice().sort(lineCmp)[0];
      return { team, tries, best };
    });
    rows.sort((a, b) => lineCmp(a.best, b.best));
    return { set, rows };
  }
  function lineAwards(D, state) {
    const { rows } = lineRanking(D, state);
    const list = [];
    ["國小", "國中", "高中"].forEach((lv) => {
      rows.filter((r) => r.team.level === lv && r.best).forEach((r, i) => list.push({ cat: "循跡賽｜" + lv + "組", title: bandName(i), team: r.team }));
    });
    return list;
  }

  // ---------- MR：分數高者勝，同分比時間；沒分數時間記 120 秒；2 次取最高 ----------
  const MR_ITEMS = [
    ["W", "白色大方塊堆疊（收成）", 70], ["G", "綠色大方塊堆疊（種植）", 60], ["B", "藍色大方塊堆疊（營養輸送）", 50],
    ["P", "粉色大方塊堆疊（分類）", 40], ["Y", "黃色大方塊堆疊（照明控制）", 30], ["X", "無效堆疊（不同顏色）", 20],
    ["w", "白色小方塊層", 50], ["o", "橘色小方塊層", 40], ["u", "紫色小方塊層", 30], ["r", "紅色小方塊層", 20], ["y", "黃色小方塊層", 20], ["m", "混合顏色層", 15],
  ];
  function mrEval(p) {
    if (!p || !p.c) return null;
    const score = MR_ITEMS.reduce((s, [k, , v]) => s + (Number(p.c[k]) || 0) * v, 0);
    const time = score > 0 ? Math.min(120, Number(p.time) || 120) : 120;
    return { score, time };
  }
  function mrCmp(a, b) {
    if (!a && !b) return 0; if (!a) return 1; if (!b) return -1;
    return b.score - a.score || a.time - b.time;
  }
  function mrRanking(D, state, cls) {
    const rows = D.teams.M.filter((t) => t.mr === cls).map((team) => {
      const tries = [1, 2].map((n) => mrEval((state["mr:" + team.id + ":" + n] || {}).payload));
      return { team, tries, best: tries.slice().sort(mrCmp)[0] };
    });
    rows.sort((a, b) => mrCmp(a.best, b.best));
    return rows;
  }
  function mrAwards(D, state) {
    const list = [];
    const m2 = mrRanking(D, state, "MR2").filter((r) => r.best);
    if (m2[0]) list.push({ cat: "RoboMission II（MR2）", title: "冠軍", team: m2[0].team });
    // MR3 只頒冠軍、亞軍、季軍（季軍 2 隊）；其餘表現優異
    mrRanking(D, state, "MR3").filter((r) => r.best).forEach((r, i) =>
      list.push({ cat: "RoboMission III（MR3）", title: i === 0 ? "冠軍" : i === 1 ? "亞軍" : i <= 3 ? "季軍" : "表現優異", team: r.team }));
    return list;
  }

  const API = { RANKS, TOTAL_NAMES, defaultSlots, slotsOf, slotLabel, sumoSlot, teamById, teamOfCode, sumoPts, matchKey, matchResult,
    isDone, groupStandings, tiesNeedingWeight, fieldQueue, FAMILY, seeds, finals, boWinner, sumoAwards, lineEval, lineCmp,
    lineRanking, lineAwards, MR_ITEMS, mrEval, mrCmp, mrRanking, mrAwards };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.GRG_RULES = API;
})(typeof window !== "undefined" ? window : globalThis);
