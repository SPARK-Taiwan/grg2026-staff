// GRG2026 即時計分：共用畫面元件（公開頁、裁判頁、計分台共用）
window.GRG_UI = (function () {
  "use strict";
  const R = window.GRG_RULES, D = window.GRG_DATA;
  const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = (n) => String(n).padStart(2, "0");
  const hhmm = (iso) => { const d = new Date(iso); return isNaN(d) ? "" : pad(d.getHours()) + ":" + pad(d.getMinutes()); };
  const hhmmss = (d) => pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  const f2 = (x) => (x == null || isNaN(x) ? "" : Number(x).toFixed(2));

  const FAM_GROUPS = { E: ["EA", "EB"], J: ["J"], R: ["R"] };
  const FAM_NAME = { E: "相撲自動組 國小組", J: "相撲自動組 國高中組", R: "相撲遙控組" };
  const FINAL_NAME = { SF1: "準決賽 ①", SF2: "準決賽 ②", F: "冠亞軍賽" };
  const SUMO_OPTS = [["R", "紅勝", "r"], ["B", "藍勝", "b"], ["TR", "時間到・紅較輕", "r"], ["TB", "時間到・藍較輕", "b"], ["T0", "時間到・一樣重", "g"]];
  const SUMO_SHORT = { R: "紅", B: "藍", TR: "紅輕", TB: "藍輕", T0: "同重" };

  // ---------- 隊伍顯示 ----------
  function teamHTML(st, code, o) {
    const t = R.teamOfCode(D, st, code);
    let h = '<b class="code">' + esc(code || "—") + "</b>";
    if (t) h += ' <span class="tn">' + esc(t.name) + "</span>" + (o && o.unit ? ' <small class="unit">' + esc(t.unit) + "</small>" : "");
    return h;
  }
  const plainTeam = (t, o) => '<span class="tn">' + esc(t.name) + "</span>" + (o && o.id ? ' <small class="unit">' + esc(t.id) + "</small>" : "") + (o && o.unit ? ' <small class="unit">' + esc(t.unit) + "</small>" : "");

  // ---------- 場地進度 ----------
  function fieldsHTML(st, gk, o) {
    const q = R.fieldQueue(D, st, gk);
    if (Object.keys(q).every((f) => !q[f].now)) return '<div class="banner okb">' + esc(D.groups[gk].short) + " 預賽全部完成 ✓</div>";
    return '<div class="fields">' + Object.keys(q).map((f) => {
      const x = q[f], m = x.now;
      const label = gk === "R" ? "遙控場地 " + f : "場地 " + f;
      return '<div class="field' + (m ? "" : " fin") + '"><div class="fh"><b>' + label + '</b><span class="prog">' + x.done + "/" + x.total + "</span></div>" +
        (m ? '<div class="fm"><span class="rnd">第 ' + m[0] + ' 輪</span><span class="side red">' + teamHTML(st, m[2]) + '</span><span class="vsx">vs</span><span class="side blue">' + teamHTML(st, m[3]) + "</span></div>"
           : '<div class="fm done">預賽完成</div>') +
        (o && o.next && x.next ? '<div class="fn">下一場：' + esc(x.next[2]) + " vs " + esc(x.next[3]) + "</div>" : "") + "</div>";
    }).join("") + "</div>";
  }

  // ---------- 預賽積分 ----------
  function standingsHTML(st, gk, o) {
    o = o || {};
    const s = R.groupStandings(D, st, gk);
    const rows = s.rows.map((r) => {
      let tag = "";
      if (r.tie) tag = o.admin ? '<span class="tag warn">同分・待秤重</span>' : '<span class="tag">並列</span>';
      else if (o.admin && r.weight != null) tag = '<span class="tag">' + r.weight + " g</span>";
      return "<tr" + (o.me === r.code ? " class='me'" : "") + "><td class='rk'>" + r.rank + "</td><td>" + teamHTML(st, r.code, { unit: o.unit }) + " " + tag + "</td><td class='num'>" + r.pts + "</td><td class='num mute'>" + r.played + "/" + r.total + "</td></tr>";
    }).join("");
    return '<table class="tbl"><thead><tr><th>名次</th><th>隊伍</th><th class="num">積分</th><th class="num">已賽</th></tr></thead><tbody>' + rows + "</tbody></table>" +
      '<p class="note">' + (s.done ? "預賽已完成" : "預賽進行中：" + s.played + " / " + s.total + " 場") + "　積分同分比對戰得分，再同分比重量（輕者在前）</p>";
  }

  // ---------- 決賽 ----------
  function finalsHTML(st, fam) {
    const F = R.finals(D, st, fam);
    const card = (slot) => {
      const x = F[slot];
      const side = (code, label, cls) => '<div class="fs ' + cls + (x.winner && x.winner === code ? " win" : "") + (x.loser && x.loser === code ? " lose" : "") + '">' +
        (code ? teamHTML(st, code) : '<span class="mute">' + esc(label) + "</span>") + "</div>";
      const chips = x.rounds.map((v) => '<i class="chip ' + (v === "R" ? "r" : "b") + '">' + (v === "R" ? "紅" : "藍") + "</i>").join("");
      return '<div class="final"><div class="fh"><b>' + FINAL_NAME[slot] + "</b>" + (x.field ? '<span class="mute">' + esc(R.slotLabel(x.field)) + "</span>" : "") + "</div>" +
        side(x.red, x.labels[0], "red") + '<div class="frow"><span class="score">' + x.r + " : " + x.b + "</span>" + chips + "</div>" + side(x.blue, x.labels[1], "blue") + "</div>";
    };
    return '<div class="finals">' + card("SF1") + card("SF2") + card("F") + "</div>" + '<p class="note">三戰兩勝；準決賽敗方 2 隊並列季軍</p>';
  }

  // ---------- 循跡 ----------
  function lineTry(e) {
    if (!e) return '<span class="mute">—</span>';
    if (e.done) return f2(e.final) + " 秒 <small class='mute'>差 " + f2(e.diffs[0]) + "</small>";
    return e.laps + " 圈 <small class='mute'>未完成</small>";
  }
  function lineHTML(st, o) {
    const { set, rows } = R.lineRanking(D, st);
    const head = set ? '<p class="target">' + set.laps + " 圈 × " + set.sec + " 秒 ＝ 目標 <b>" + f2(set.laps * set.sec) + "</b> 秒</p>" : '<p class="target mute">現場抽籤後公布圈數與每圈秒數</p>';
    const lv = ["國小", "國中", "高中"].map((L) => {
      const rs = rows.filter((r) => r.team.level === L);
      let n = 0;
      return "<h3>" + L + "組</h3><table class='tbl'><thead><tr><th>名次</th><th>隊伍</th><th>第 1 次</th><th>第 2 次</th></tr></thead><tbody>" +
        rs.map((r) => "<tr><td class='rk'>" + (r.best ? ++n : "") + "</td><td>" + plainTeam(r.team, { unit: o && o.unit, id: o && o.admin }) + "</td><td>" + lineTry(r.tries[0]) + "</td><td>" + lineTry(r.tries[1]) + "</td></tr>").join("") + "</tbody></table>";
    }).join("");
    return head + lv + '<p class="note">每隊 2 次取較好的一次；最終圈最接近目標者勝，同差距再比次終圈；未完成者依完成圈數排在後面</p>';
  }

  // ---------- MR ----------
  const mrTry = (e) => (e ? "<b>" + e.score + "</b> 分 <small class='mute'>" + e.time + " 秒</small>" : '<span class="mute">—</span>');
  function mrHTML(st, o) {
    return ["MR3", "MR2"].map((cls) => {
      let n = 0;
      return "<h3>" + (cls === "MR3" ? "RoboMission III（MR3）" : "RoboMission II（MR2）") + "</h3><table class='tbl'><thead><tr><th>名次</th><th>隊伍</th><th>第 1 次</th><th>第 2 次</th></tr></thead><tbody>" +
        R.mrRanking(D, st, cls).map((r) => "<tr><td class='rk'>" + (r.best ? ++n : "") + "</td><td>" + plainTeam(r.team, { unit: o && o.unit, id: o && o.admin }) + "</td><td>" + mrTry(r.tries[0]) + "</td><td>" + mrTry(r.tries[1]) + "</td></tr>").join("") + "</tbody></table>";
    }).join("") + '<p class="note">每隊 2 次取最高分；同分比時間（短者勝）；0 分時間記 120 秒</p>';
  }

  // ====================== 輸入元件 ======================
  const drafts = {};        // key → 尚未送出的相撲／決賽回合
  const openSet = new Set();

  function sumoMatchHTML(st, gk, m, o) {
    o = o || {};
    const key = R.matchKey(gk, m), rec = st[key];
    const cur = R.matchResult(st, gk, m);
    const d = drafts[key] || (cur ? cur.slice() : []);
    while (d.length < 3) d.push(null);
    const done = R.isDone(cur), dirty = key in drafts;
    const p = R.sumoPts(d), sp = R.sumoPts(cur || []);
    const status = rec && rec.pending ? '<span class="tag warn">待上傳</span>' : done ? '<span class="tag ok">完成</span>' : cur ? '<span class="tag">輸入中</span>' : "";
    const canSend = dirty && (o.admin || d.every(Boolean));
    const open = dirty || openSet.has(key) || (!done && o.openPending);
    const chipsSummary = (cur || []).filter(Boolean).map((v) => '<i class="chip ' + ({ R: "r", TR: "r", B: "b", TB: "b" }[v] || "g") + '">' + SUMO_SHORT[v] + "</i>").join("");
    return '<details class="match' + (done ? " done" : "") + '" data-key="' + key + '" data-gk="' + gk + '"' + (open ? " open" : "") + ">" +
      '<summary><span class="rnd">第 ' + m[0] + " 輪" + (o.showField ? "・場地 " + m[1] : "") + '</span><span class="sv"><span class="r">紅 ' + teamText(st, m[2]) + "</span> <b>" + sp.red + " : " + sp.blue + '</b> <span class="b">藍 ' + teamText(st, m[3]) + "</span></span>" + chipsSummary + status + "</summary>" +
      '<div class="mbody"><div class="vs"><div class="side red">' + teamHTML(st, m[2]) + '</div><div class="pts">' + p.red + " : " + p.blue + '</div><div class="side blue">' + teamHTML(st, m[3]) + "</div></div>" +
      [0, 1, 2].map((i) => '<div class="rd"><span class="rl">第 ' + (i + 1) + ' 回合</span><div class="opts">' +
        SUMO_OPTS.map(([v, l, c]) => '<button type="button" class="opt ' + c + (d[i] === v ? " on" : "") + '" data-act="sumo" data-i="' + i + '" data-v="' + v + '">' + l + "</button>").join("") + "</div></div>").join("") +
      '<div class="foot"><span class="mute small">' + (rec ? esc(rec.by) + " " + hhmm(rec.time) : "") + "</span>" +
      (o.admin && rec ? '<button type="button" class="ghost small" data-act="sumo-clear">清除</button>' : "") +
      (dirty ? '<button type="button" class="ghost small" data-act="sumo-undo">取消</button>' : "") +
      '<button type="button" data-act="sumo-send"' + (canSend ? "" : " disabled") + ">送出</button></div></div></details>";
  }

  function finalEditHTML(st, fam, slot, o) {
    o = o || {};
    const F = R.finals(D, st, fam), x = F[slot];
    const key = "final:" + fam + ":" + slot, rec = st[key];
    const d = (drafts[key] || x.rounds).slice();
    const dirty = key in drafts;
    const bo = R.boWinner(d, x.red, x.blue);
    const rows = [0, 1, 2].map((i) => {
      const before = R.boWinner(d.slice(0, i), x.red, x.blue);
      const dis = (i > 0 && !d[i - 1]) || before.winner;
      return '<div class="rd"><span class="rl">第 ' + (i + 1) + ' 戰</span><div class="opts two">' +
        [["R", "紅勝", "r"], ["B", "藍勝", "b"]].map(([v, l, c]) => '<button type="button" class="opt ' + c + (d[i] === v ? " on" : "") + '" data-act="fin" data-i="' + i + '" data-v="' + v + '"' + (dis && d[i] !== v ? " disabled" : "") + ">" + l + "</button>").join("") + "</div></div>";
    }).join("");
    const ready = x.red && x.blue;
    return '<div class="card match open" data-key="' + key + '" data-fam="' + fam + '" data-slot="' + slot + '">' +
      '<div class="fh"><b>' + FAM_NAME[fam] + "｜" + FINAL_NAME[slot] + "</b>" + (rec && rec.pending ? '<span class="tag warn">待上傳</span>' : x.winner ? '<span class="tag ok">完成</span>' : "") + "</div>" +
      (ready ? '<div class="vs"><div class="side red">' + teamHTML(st, x.red) + '</div><div class="pts">' + bo.r + " : " + bo.b + '</div><div class="side blue">' + teamHTML(st, x.blue) + "</div></div>" + rows +
        '<div class="foot"><span class="mute small">' + (bo.winner ? "勝方：" + esc(bo.winner) : "三戰兩勝") + "</span>" +
        (dirty ? '<button type="button" class="ghost small" data-act="fin-undo">取消</button>' : "") +
        '<button type="button" data-act="fin-send"' + (dirty ? "" : " disabled") + ">送出</button></div>"
        : '<p class="mute">對戰隊伍尚未產生</p>') + "</div>";
  }

  // ---------- 循跡輸入（碼錶＋手動修改） ----------
  const LE = { team: "", att: 1, t: [], done: false, run: false, t0: 0, dirty: false, timer: null };
  function leLoad(st) {
    const p = (st["line:" + LE.team + ":" + LE.att] || {}).payload;
    LE.t = p ? p.t.slice() : []; LE.done = p ? !!p.done : false; LE.dirty = false;
  }
  // 隊伍按鈕（循跡、MR 共用）：顯示這隊第 1、2 次是否已有成績
  const GRID_OPEN = {};                 // 選好隊伍後收起隊伍按鈕，按「換隊伍」再展開
  function teamGrid(st, list, kind, cur, act) {
    if (cur && !GRID_OPEN[kind]) {
      const t = [].concat(...list.map((x) => x[1])).find((x) => x.id === cur);
      return '<div class="tpicked"><span><b class="code">' + esc(cur) + "</b> " + esc(t ? t.name : "") + '</span><button type="button" class="ghost small" data-act="tg-open" data-v="' + kind + '">換隊伍</button></div>';
    }
    return '<div class="tgrid">' + list.map(([label, teams]) => '<p class="tglabel">' + label + '</p>' + teams.map((t) => {
      const n = [1, 2].filter((a) => st[kind + ":" + t.id + ":" + a]).length;
      return '<button type="button" class="tbtn' + (cur === t.id ? " on" : "") + (n === 2 ? " full" : "") + '" data-act="' + act + '" data-v="' + t.id + '"><b class="code">' + esc(t.id) + "</b> " + esc(t.name) +
        '<small>' + (n === 2 ? "2 次都完成" : n === 1 ? "已跑 1 次" : "尚未出賽") + "</small></button>";
    }).join("")).join("") + "</div>";
  }
  function confirmSend(team, act, enabled, att) {
    return '<p class="ask">請選手確認成績後按下面的按鈕</p><button type="button" class="confirm one" data-act="' + act + '"' + (enabled ? "" : " disabled") + ">隊伍 " + esc(team.id) + " " + esc(team.name) + "<small>確認第 " + att + " 次成績，送出</small></button>";
  }
  function lineEditorHTML(st, o) {
    o = o || {};
    const set = (st["lineset"] || {}).payload;
    const n = set ? set.laps : 5;
    const ev = set && LE.t.length ? R.lineEval(set, { t: LE.t, done: LE.done }) : null;
    let h = '<div class="card editor">' +
      (set ? '<p class="target">' + set.laps + " 圈 × " + set.sec + " 秒 ＝ 目標 <b>" + f2(set.laps * set.sec) + "</b> 秒</p>" : '<p class="target warn">計分台尚未設定圈數與秒數（仍可先計時）</p>') +
      teamGrid(st, ["國小", "國中", "高中"].map((L) => [L + "組", D.teams.L.filter((t) => t.level === L)]).filter((x) => x[1].length), "line", LE.team, "le-pick");
    if (!LE.team) return h + '<p class="note">點上面的隊伍開始計時。</p></div>';
    const lt = D.teams.L.find((t) => t.id === LE.team);
    h += '<div class="seg">' + [1, 2].map((a) => '<button type="button" class="' + (LE.att === a ? "on" : "") + '" data-act="le-att" data-v="' + a + '">第 ' + a + " 次" + (st["line:" + LE.team + ":" + a] ? " ✓" : "") + "</button>").join("") + "</div>" +
      '<div class="watch"><span class="lw-time">' + (LE.run ? "" : f2(LE.t.length ? LE.t[LE.t.length - 1] : 0)) + '</span><small>秒</small></div><div class="btnrow">' +
      (LE.run ? '<button type="button" class="big go" data-act="le-lap">過線（記一圈）</button><button type="button" class="big stop" data-act="le-stop">終止</button>'
              : '<button type="button" class="big go" data-act="le-start">' + (LE.t.length ? "重新計時" : "開始計時") + "</button>") + "</div>" +
      '<div class="laps">' + Array.from({ length: n }, (_, i) => {
        const v = LE.t[i];
        const diff = set && v ? Math.abs(v - (i + 1) * set.sec) : null;
        return '<label class="lap"><span>第 ' + (i + 1) + ' 圈</span><input type="number" inputmode="decimal" step="0.01" min="0" data-act="le-t" data-k="' + i + '" value="' + (v ? f2(v) : "") + '" placeholder="累計秒"><small class="mute">' + (diff != null ? "差 " + f2(diff) : "") + "</small></label>";
      }).join("") + "</div>" +
      '<label class="check"><input type="checkbox" data-act="le-done"' + (LE.done ? " checked" : "") + "> 跑完全部圈數，最後停在終點線上</label>" +
      (ev ? '<p class="eval">' + (ev.done ? "完成 " + ev.laps + " 圈，最終 " + f2(ev.final) + " 秒（差 " + f2(ev.diffs[0]) + "）" : "未完成：完成 " + ev.laps + " 圈") + "</p>" : "") +
      (o.judge ? confirmSend(lt, "le-send", LE.dirty && !LE.run && LE.t.length, LE.att) + '<div class="foot"><button type="button" class="ghost small" data-act="le-clear">清空重來</button></div></div>'
        : '<div class="foot"><button type="button" class="ghost small" data-act="le-clear">清空</button><button type="button" data-act="le-send"' + (LE.dirty && !LE.run ? "" : " disabled") + ">送出第 " + LE.att + " 次成績</button></div></div>");
    return h;
  }

  // ---------- MR 輸入（計數＋計時） ----------
  const ME = { team: "", att: 1, c: {}, time: "", run: false, t0: 0, dirty: false };
  function meLoad(st) {
    const p = (st["mr:" + ME.team + ":" + ME.att] || {}).payload;
    ME.c = p ? Object.assign({}, p.c) : {}; ME.time = p && p.time != null ? p.time : ""; ME.dirty = false;
  }
  function mrEditorHTML(st, o) {
    o = o || {};
    let h = '<div class="card editor">' + teamGrid(st, ["MR2", "MR3"].map((c) => [c, D.teams.M.filter((t) => t.mr === c)]), "mr", ME.team, "me-pick");
    if (!ME.team) return h + '<p class="note">點上面的隊伍開始計分。</p></div>';
    const mt = D.teams.M.find((t) => t.id === ME.team);
    const ev = R.mrEval({ c: ME.c, time: ME.time === "" ? 120 : Number(ME.time) });
    const timed = ME.time !== "" && !ME.run;
    const step = (n, t) => '<p class="steph"><b>' + n + "</b>" + t + "</p>";
    h += '<div class="seg">' + [1, 2].map((a) => '<button type="button" class="' + (ME.att === a ? "on" : "") + '" data-act="me-att" data-v="' + a + '">第 ' + a + " 次" + (st["mr:" + ME.team + ":" + a] ? " ✓" : "") + "</button>").join("") + "</div>" +
      // ① 計時：最多 120 秒，到 120 自動停
      step("①", "計時（每場最多 120 秒，到 120 秒自動停）") +
      '<div class="watch"><span class="mw-time">' + (ME.run ? "" : ME.time === "" ? "0.00" : f2(ME.time)) + '</span><small>秒</small></div><div class="btnrow">' +
      (ME.run ? '<button type="button" class="big stop" data-act="me-stop">停止計時（隊伍喊 STOP／機器人停止）</button>'
              : '<button type="button" class="big go" data-act="me-start">' + (ME.time === "" ? "開始計時（GRG Go!）" : "重新計時") + "</button>") + "</div>" +
      (timed ? '<label class="lbl inline small">時間有誤可修正（秒）<input type="number" inputmode="decimal" step="0.01" min="0" max="120" data-act="me-time" value="' + f2(ME.time) + '"></label>' : "");
    // ② 完成數量：停錶後才能輸入（計分台不限）；超過規則上限的 ＋ 會鎖住
    if (timed || !o.judge) {
      h += step("②", "完成數量（依場地最後狀態計分）") + '<div class="items">' + R.MR_ITEMS.map(([k, label, pts]) => {
        const v = ME.c[k] || 0, max = R.mrMax(ME.c, k);
        return '<div class="item' + (v ? " has" : "") + '"><span class="il">' + esc(label) + ' <small class="mute">' + pts + " 分・最多 " + max + '</small></span><button type="button" class="ghost cnt" data-act="me-inc" data-k="' + k + '" data-d="-1"' + (v ? "" : " disabled") + '>−</button><b class="cv">' + v +
          '</b><button type="button" class="ghost cnt" data-act="me-inc" data-k="' + k + '" data-d="1"' + (v < max ? "" : " disabled") + ">＋</button></div>";
      }).join("") + "</div>" +
        '<p class="eval">總分 <b>' + ev.score + "</b> 分，時間 " + ev.time + " 秒" + (ev.score === 0 ? "（0 分記 120 秒）" : "") + "</p>";
    } else h += '<p class="note">停止計時後，這裡會出現完成數量讓你輸入。</p>';
    // ③ 選手確認
    const ready = ME.dirty && timed;
    h += o.judge ? (timed ? step("③", "請選手確認") + confirmSend(mt, "me-send", ready, ME.att) : "") + '<div class="foot"><button type="button" class="ghost small" data-act="me-clear">清空重來</button></div></div>'
      : '<div class="foot"><button type="button" class="ghost small" data-act="me-clear">清空</button><button type="button" data-act="me-send"' + (ME.dirty && !ME.run ? "" : " disabled") + ">送出第 " + ME.att + " 次成績</button></div></div>";
    return h;
  }

  // ====================== 裁判：一步一步輸入＋雙方確認 ======================
  // JD[key] = { r:[回合結果], cf:{R,B}（雙方已確認）, tu:是否展開「時間到」 }
  const JD = {};
  const J = { focus: null };            // 指定要修改的場次 key
  const JSHORT = { R: "紅得分", B: "藍得分", TR: "紅較輕", TB: "藍較輕", T0: "一樣重" };
  const jcls = (v) => ({ R: "r", TR: "r", B: "b", TB: "b" }[v] || "g");
  const teamText = (st, code) => { const t = R.teamOfCode(D, st, code); return esc(code) + (t ? " " + esc(t.name) : ""); };
  const sideBox = (st, code, cls, label) => {
    const t = R.teamOfCode(D, st, code);
    return '<div class="side ' + cls + '"><small>' + label + '</small><b class="code">' + esc(code || "—") + '</b><span class="tn">' + (t ? esc(t.name) : code ? "（尚未抽籤）" : "（待產生）") + "</span></div>";
  };
  const confirmBtn = (st, code, side, done) =>
    '<button type="button" class="confirm ' + (side === "R" ? "r" : "b") + (done ? " done" : "") + '" data-act="js-cf" data-side="' + side + '"' + (done ? " disabled" : "") + ">" +
    (done ? "✓ " : "") + (side === "R" ? "紅方 " : "藍方 ") + teamText(st, code) + "<small>" + (done ? "已確認" : "按這裡確認成績") + "</small></button>";

  // 進行中／修改中的那一場（預賽 3 回合全打；決賽三戰兩勝）
  function nowCard(st, key, red, blue, title, sub, isFinal, editing) {
    const d = JD[key] || { r: [], cf: {} };
    const p = isFinal ? (() => { const x = R.boWinner(d.r, red, blue); return { red: x.r, blue: x.b, winner: x.winner }; })() : R.sumoPts(d.r);
    const complete = isFinal ? !!p.winner : d.r.length === 3;
    const n = isFinal ? 3 : 3;
    let h = '<div class="card now' + (editing ? " editing" : "") + '" data-key="' + key + '"><div class="nowh"><b>' + title + "</b><span>" + sub + "</span></div>" +
      '<div class="vs big">' + sideBox(st, red, "red", "紅方") + '<div class="pts">' + p.red + " : " + p.blue + "</div>" + sideBox(st, blue, "blue", "藍方") + "</div>";
    if (!red || !blue) return h + '<p class="note">對戰隊伍尚未產生，請等計分台。</p></div>';
    h += '<div class="rounds">' + Array.from({ length: n }, (_, i) => {
      const v = d.r[i], curI = i === d.r.length && !complete;
      return '<button type="button" class="rchip' + (v ? " set " + jcls(v) : curI ? " cur" : "") + '" data-act="js-redo" data-i="' + i + '"' + (v ? "" : " disabled") + ">" +
        (isFinal ? "第 " + (i + 1) + " 戰" : "第 " + (i + 1) + " 回合") + "<b>" + (v ? (isFinal ? (v === "R" ? "紅勝" : "藍勝") : JSHORT[v]) : curI ? "輸入中" : "—") + "</b></button>";
    }).join("") + '</div><p class="note small">點已輸入的回合可以從那一回合重新輸入</p>';
    if (!complete) {
      const i = d.r.length + 1;
      h += '<p class="ask">' + (isFinal ? "第 " + i + " 戰：誰贏？" : "第 " + i + " 回合：誰得分？") + '</p><div class="pick">' +
        '<button type="button" class="opt r big" data-act="js-pick" data-v="R">' + (isFinal ? "紅方勝" : "紅方得分") + "<small>" + teamText(st, red) + "</small></button>" +
        '<button type="button" class="opt b big" data-act="js-pick" data-v="B">' + (isFinal ? "藍方勝" : "藍方得分") + "<small>" + teamText(st, blue) + "</small></button></div>";
      if (!isFinal) h += d.tu
        ? '<p class="ask small">時間到、雙方都還在場上：比重量，較輕的得 1 分</p><div class="pick three"><button type="button" class="opt r" data-act="js-pick" data-v="TR">紅方較輕<small>紅得 1 分</small></button><button type="button" class="opt b" data-act="js-pick" data-v="TB">藍方較輕<small>藍得 1 分</small></button><button type="button" class="opt g" data-act="js-pick" data-v="T0">一樣重<small>都不得分</small></button></div>'
        : '<button type="button" class="ghost wide" data-act="js-tu">30 秒時間到、雙方都還在場上 →</button>';
    } else {
      h += '<p class="ask">請雙方選手看過成績，各自按自己的按鈕確認</p><div class="pick">' + confirmBtn(st, red, "R", d.cf.R) + confirmBtn(st, blue, "B", d.cf.B) + "</div>" +
        '<p class="note">雙方都確認後會自動送出。</p>';
    }
    if (d.r.length || editing) h += '<div class="foot"><button type="button" class="ghost small" data-act="js-cancel">' + (editing ? "取消修改" : "這場清除重來") + "</button></div>";
    return h + "</div>";
  }

  // 裁判的某個相撲場地：決賽（若指派到這裡）→ 現在這一場 → 下一場叫號 → 全部對戰
  function judgeFieldHTML(st, gk, field, slot) {
    const ms = D.schedule[gk].filter((m) => m[1] === field).sort((a, b) => a[0] - b[0]);
    const done = (m) => R.isDone(R.matchResult(st, gk, m));
    const pending = ms.filter((m) => !done(m));
    const fam = gk === "EA" || gk === "EB" ? "E" : gk;
    let h = "";
    // 決賽
    const fins = ["SF1", "SF2", "F"].filter((x) => ((st["final:" + fam + ":" + x] || {}).payload || {}).field === slot);
    const F = fins.length ? R.finals(D, st, fam) : null;
    const finFocus = fins.find((x) => J.focus === "final:" + fam + ":" + x) || fins.find((x) => !F[x].winner);
    if (finFocus) {
      const x = F[finFocus], key = "final:" + fam + ":" + finFocus;
      h += nowCard(st, key, x.red, x.blue, (x.winner ? "修改決賽成績" : "決賽") + "｜" + FINAL_NAME[finFocus], FAM_NAME[fam] + "・三戰兩勝", true, !!x.winner);
    }
    fins.filter((x) => x !== finFocus).forEach((x) => {
      const y = F[x], key = "final:" + fam + ":" + x, locked = (st[key].payload || {}).adminRounds;
      h += '<div class="lrow done"><span class="rnd">' + FINAL_NAME[x] + '</span><span class="lt"><span class="r">紅 ' + teamText(st, y.red) + '</span><span class="b">藍 ' + teamText(st, y.blue) + '</span></span><span class="res"><b>' + y.r + ":" + y.b + "</b></span>" +
        (locked ? '<small class="mute">計分台已改</small>' : '<button type="button" class="ghost small" data-act="js-edit" data-key="' + key + '">修改</button>') + "</div>";
    });
    // 預賽
    const focus = ms.find((m) => R.matchKey(gk, m) === J.focus);
    const cur = focus || pending[0] || null;
    if (!finFocus) {
      if (cur) h += nowCard(st, R.matchKey(gk, cur), cur[2], cur[3], focus && done(focus) ? "修改成績" : "現在比賽", "第 " + cur[0] + " 輪・場地 " + field, false, !!(focus && done(focus)));
      else h += '<div class="banner okb">本場地預賽全部完成 ✓' + (fins.length ? "" : "　決賽若指派到這個場地，會出現在這裡") + "</div>";
      const nxt = pending.filter((m) => m !== cur)[0];
      if (nxt) h += '<div class="nextcall"><b>下一場，請先叫號準備</b>第 ' + nxt[0] + ' 輪：<span class="r">紅 ' + teamText(st, nxt[2]) + '</span>　vs　<span class="b">藍 ' + teamText(st, nxt[3]) + "</span></div>";
    }
    h += "<h3>" + esc(D.groups[gk].short) + " 場地 " + field + " 全部對戰（" + (ms.length - pending.length) + " / " + ms.length + " 完成）</h3>" +
      ms.map((m) => {
        const key = R.matchKey(gk, m), rec = st[key], r = R.matchResult(st, gk, m), p = R.sumoPts(r || []);
        const isCur = cur === m && !finFocus;
        return '<div class="lrow' + (done(m) ? " done" : "") + (isCur ? " cur" : "") + '"><span class="rnd">第 ' + m[0] + ' 輪</span><span class="lt"><span class="r">紅 ' + teamText(st, m[2]) + '</span><span class="b">藍 ' + teamText(st, m[3]) + "</span></span>" +
          '<span class="res">' + (done(m) ? "<b>" + p.red + ":" + p.blue + "</b>" + (rec && rec.pending ? '<small class="warn">待上傳</small>' : "") : isCur ? '<small class="mute">比賽中</small>' : "") + "</span>" +
          (done(m) && !isCur ? (rec.src === "admin" ? '<small class="mute">計分台已改</small>' : '<button type="button" class="ghost small" data-act="js-edit" data-key="' + key + '">修改</button>') : "") + "</div>";
      }).join("");
    return h;
  }

  function judgeClick(act, b, key, st, ctx) {
    if (act === "js-edit") {
      if (!confirm("要修改這場的成績嗎？要重新輸入，並請雙方選手重新確認。")) return true;
      J.focus = b.dataset.key; JD[J.focus] = { r: [], cf: {} }; ctx.render(); window.scrollTo(0, 0); return true;
    }
    if (!key || !/^js-/.test(act)) return false;
    const d = JD[key] || (JD[key] = { r: [], cf: {} });
    const isFinal = key.startsWith("final:");
    if (act === "js-pick") { d.r.push(b.dataset.v); d.tu = false; d.cf = {}; }
    else if (act === "js-tu") d.tu = !d.tu;
    else if (act === "js-redo") { d.r = d.r.slice(0, Number(b.dataset.i)); d.cf = {}; d.tu = false; }
    else if (act === "js-cancel") { delete JD[key]; if (J.focus === key) J.focus = null; }
    else if (act === "js-cf") {
      d.cf[b.dataset.side] = true;
      if (d.cf.R && d.cf.B) {
        const payload = isFinal ? { rounds: d.r.slice() } : { r: d.r.slice() };
        ctx.save([{ key, payload }]).then((res) => {
          if (res && res.ok) { delete JD[key]; if (J.focus === key) J.focus = null; }
          ctx.toast(res.message, res.ok); ctx.render(); window.scrollTo(0, 0);
        });
        return true;
      }
    }
    ctx.render();
    return true;
  }

  // ====================== 公開頁：對戰表、我的隊伍 ======================
  function scheduleHTML(st, gk, o) {
    o = o || {};
    const q = R.fieldQueue(D, st, gk);
    const live = new Set(Object.values(q).map((x) => x.now).filter(Boolean));
    const ms = D.schedule[gk].filter((m) => !o.me || m[2] === o.me || m[3] === o.me);
    const rounds = [...new Set(ms.map((m) => m[0]))].sort((a, b) => a - b);
    if (!ms.length) return '<p class="mute">沒有對戰</p>';
    return rounds.map((rd) => '<div class="rblock"><p class="rhead">第 ' + rd + " 輪</p>" + ms.filter((m) => m[0] === rd).sort((a, b) => a[1] - b[1]).map((m) => {
      const r = R.matchResult(st, gk, m), done = R.isDone(r), p = R.sumoPts(r || []);
      const st1 = done ? '<span class="tag ok">已完成</span>' : live.has(m) ? '<span class="tag warn">比賽中</span>' : "";
      const win = done ? (p.red > p.blue ? "R" : p.blue > p.red ? "B" : "") : "";
      return '<div class="mrow' + (done ? " done" : live.has(m) ? " live" : "") + '"><div class="mh"><span>' + (gk === "R" ? "遙控場地 " : "場地 ") + m[1] + "</span>" + st1 + "</div>" +
        '<div class="mt"><span class="tm r' + (win === "R" ? " win" : "") + (o.me === m[2] ? " me" : "") + '">' + teamText(st, m[2]) + '</span><b class="sc">' + (r ? p.red + " : " + p.blue : "vs") + '</b><span class="tm b' + (win === "B" ? " win" : "") + (o.me === m[3] ? " me" : "") + '">' + teamText(st, m[3]) + "</span></div></div>";
    }).join("") + "</div>").join("");
  }
  function myTeamHTML(st, gk, code) {
    const s = R.groupStandings(D, st, gk), row = s.rows.find((r) => r.code === code);
    if (!row) return "";
    const nx = D.schedule[gk].filter((m) => (m[2] === code || m[3] === code) && !R.isDone(R.matchResult(st, gk, m))).sort((a, b) => a[0] - b[0])[0];
    const opp = nx ? (nx[2] === code ? nx[3] : nx[2]) : null;
    return '<div class="mycard"><b>' + teamText(st, code) + "</b><span>目前第 " + row.rank + " 名・積分 " + row.pts + "・已賽 " + row.played + "/" + row.total + "</span>" +
      (nx ? "<span>下一場：第 " + nx[0] + " 輪 場地 " + nx[1] + "，對 " + teamText(st, opp) + "（" + (nx[2] === code ? "紅方" : "藍方") + "）</span>" : "<span>預賽已全部比完</span>") + "</div>";
  }

  // 碼錶顯示（只更新數字，不重畫整頁）
  setInterval(() => {
    const now = performance.now();
    if (LE.run) document.querySelectorAll(".lw-time").forEach((el) => { el.textContent = f2((now - LE.t0) / 1000); });
    if (ME.run && (now - ME.t0) / 1000 >= 120) { ME.run = false; ME.time = 120; if (lastCtx) { lastCtx.toast("120 秒時間到，請輸入完成數量", true); lastCtx.render(); } }
    if (ME.run) document.querySelectorAll(".mw-time").forEach((el) => { el.textContent = f2((now - ME.t0) / 1000); });
  }, 50);

  // ---------- 事件 ----------
  // ctx：{ state(), save(items) → Promise<{ok, message}>, render(), toast(msg, ok), admin }
  let lastCtx = null;
  function bindEditors(root, ctx) {
    lastCtx = ctx;
    const keyOf = (el) => { const c = el.closest("[data-key]"); return c ? c.dataset.key : null; };
    const done = (p, after) => p.then((r) => { if (r && r.ok) after(); ctx.toast(r.message, r.ok); ctx.render(); });

    root.addEventListener("toggle", (e) => {
      const el = e.target;
      if (el.matches && el.matches("details.match")) { if (el.open) openSet.add(el.dataset.key); else openSet.delete(el.dataset.key); }
    }, true);

    root.addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]");
      if (!b || b.tagName === "SELECT" || b.tagName === "INPUT") return;
      const act = b.dataset.act, key = keyOf(b), st = ctx.state();
      if (judgeClick(act, b, key, st, ctx)) return;
      if (act === "sumo") {
        const cur = st[key] && st[key].payload && st[key].payload.r;
        const d = drafts[key] || (cur ? cur.slice() : [null, null, null]);
        while (d.length < 3) d.push(null);
        const i = Number(b.dataset.i);
        d[i] = d[i] === b.dataset.v ? null : b.dataset.v;
        drafts[key] = d; ctx.render();
      } else if (act === "sumo-undo" || act === "fin-undo") { delete drafts[key]; ctx.render(); }
      else if (act === "sumo-send") {
        const d = drafts[key];
        done(ctx.save([{ key, payload: { r: d } }]), () => { delete drafts[key]; if (R.isDone(d)) openSet.delete(key); });
      } else if (act === "sumo-clear") {
        if (confirm("清除這場成績？")) done(ctx.save([{ key, payload: null }]), () => { delete drafts[key]; });
      } else if (act === "fin") {
        const c = b.closest("[data-fam]");
        const x = R.finals(D, st, c.dataset.fam)[c.dataset.slot];
        const d = (drafts[key] || x.rounds).slice();
        const i = Number(b.dataset.i);
        if (d[i] === b.dataset.v) d.length = i; else { d[i] = b.dataset.v; d.length = i + 1; }
        drafts[key] = d; ctx.render();
      } else if (act === "fin-send") {
        const payload = ctx.admin ? Object.assign({}, (st[key] || {}).payload, { rounds: drafts[key], adminRounds: true }) : { rounds: drafts[key] };
        done(ctx.save([{ key, payload }]), () => { delete drafts[key]; });
      }
      // 隊伍按鈕
      else if (act === "tg-open") { GRID_OPEN[b.dataset.v] = true; ctx.render(); }
      else if (act === "le-pick" || act === "me-pick") {
        const E = act === "le-pick" ? LE : ME, kind = act === "le-pick" ? "line" : "mr";
        if (E.team === b.dataset.v) { GRID_OPEN[kind] = false; ctx.render(); return; }
        if (E.dirty && !confirm("目前的成績還沒送出，確定換隊伍？")) return;
        E.team = b.dataset.v; E.run = false; GRID_OPEN[kind] = false;
        E.att = st[kind + ":" + E.team + ":1"] && !st[kind + ":" + E.team + ":2"] ? 2 : 1;
        if (kind === "line") leLoad(st); else meLoad(st);
        ctx.render();
      }
      // 循跡
      else if (act === "le-att") { LE.att = Number(b.dataset.v); leLoad(st); ctx.render(); }
      else if (act === "le-start") {
        if (LE.t.length && !confirm("重新計時會清掉目前的圈數秒數，確定？")) return;
        LE.t = []; LE.done = false; LE.run = true; LE.t0 = performance.now(); LE.dirty = true; ctx.render();
      } else if (act === "le-lap") {
        // 圈數上限：計分台設定的圈數，沒設定就是規則最多 5 圈；到上限自動停錶，多按不會多記
        const set = (st["lineset"] || {}).payload, max = set ? set.laps : 5;
        if (LE.t.length < max) LE.t.push(Math.round((performance.now() - LE.t0) / 10) / 100);
        if (LE.t.length >= max) { LE.run = false; LE.done = !!set; }
        ctx.render();
      } else if (act === "le-stop") { LE.run = false; LE.done = false; ctx.render(); }
      else if (act === "le-clear") { LE.t = []; LE.done = false; LE.run = false; LE.dirty = true; ctx.render(); }
      else if (act === "le-send") {
        const k = "line:" + LE.team + ":" + LE.att;
        const set = (st["lineset"] || {}).payload, max = set ? set.laps : 5;
        const t = LE.t.filter((x) => x > 0).slice(0, max).map((x) => Math.round(x * 100) / 100);
        done(ctx.save([{ key: k, payload: { t, done: LE.done } }]), () => { LE.dirty = false; });
      }
      // MR
      else if (act === "me-att") { ME.att = Number(b.dataset.v); meLoad(st); ctx.render(); }
      else if (act === "me-inc") {
        const k = b.dataset.k;
        const nv = Math.max(0, (ME.c[k] || 0) + Number(b.dataset.d));
        if (nv > (ME.c[k] || 0) && nv > R.mrMax(ME.c, k)) return;
        ME.c[k] = nv;
        ME.c = R.mrClamp(ME.c);
        ME.dirty = true; ctx.render();
      } else if (act === "me-start") {
        if (ME.time !== "" && !confirm("重新計時會清掉目前的時間，確定？")) return;
        ME.run = true; ME.time = ""; ME.t0 = performance.now(); ME.dirty = true; ctx.render();
      }
      else if (act === "me-stop") { ME.run = false; ME.time = Math.min(120, Math.round((performance.now() - ME.t0) / 10) / 100); ctx.render(); }
      else if (act === "me-clear") { ME.c = {}; ME.time = ""; ME.run = false; ME.dirty = true; ctx.render(); }
      else if (act === "me-send") {
        const k = "mr:" + ME.team + ":" + ME.att;
        const payload = { c: ME.c };
        if (ME.time !== "") payload.time = Math.min(120, Number(ME.time));
        done(ctx.save([{ key: k, payload }]), () => { ME.dirty = false; });
      }
    });

    root.addEventListener("change", (e) => {
      const el = e.target, act = el.dataset && el.dataset.act, st = ctx.state();
      if (act === "le-team") {
        if (LE.dirty && !confirm("目前的秒數還沒送出，確定換隊伍？")) { el.value = LE.team; return; }
        LE.team = el.value; LE.run = false;
        LE.att = st["line:" + LE.team + ":1"] && !st["line:" + LE.team + ":2"] ? 2 : 1;
        leLoad(st); ctx.render();
      } else if (act === "le-t") {
        LE.t[Number(el.dataset.k)] = el.value === "" ? 0 : Number(el.value);
        while (LE.t.length && !(LE.t[LE.t.length - 1] > 0)) LE.t.pop();
        LE.dirty = true; ctx.render();
      } else if (act === "le-done") { LE.done = el.checked; LE.dirty = true; ctx.render(); }
      else if (act === "me-team") {
        if (ME.dirty && !confirm("目前的分數還沒送出，確定換隊伍？")) { el.value = ME.team; return; }
        ME.team = el.value; ME.run = false;
        ME.att = st["mr:" + ME.team + ":1"] && !st["mr:" + ME.team + ":2"] ? 2 : 1;
        meLoad(st); ctx.render();
      } else if (act === "me-time") { ME.time = el.value === "" ? "" : Math.min(120, Number(el.value)); ME.dirty = true; ctx.render(); }
    });
  }

  // 正在輸入（游標在輸入框、碼錶在跑）時，背景更新不要重畫輸入區
  const busy = (root) => LE.run || ME.run || Object.keys(JD).some((k) => JD[k].r.length) || (document.activeElement && root.contains(document.activeElement) && /INPUT|SELECT/.test(document.activeElement.tagName));

  function toast(msg, ok) {
    let el = document.getElementById("toast");
    if (!el) { el = document.createElement("div"); el.id = "toast"; document.body.appendChild(el); }
    el.textContent = msg || (ok ? "完成" : "失敗");
    el.className = "show " + (ok ? "ok" : "err");
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { el.className = ""; }, ok ? 2200 : 4500);
  }

  return { judgeFieldHTML, scheduleHTML, myTeamHTML, teamText, JD, J, esc, pad, hhmm, hhmmss, f2, FAM_GROUPS, FAM_NAME, FINAL_NAME, teamHTML, plainTeam, fieldsHTML, standingsHTML, finalsHTML, lineHTML, mrHTML,
    sumoMatchHTML, finalEditHTML, lineEditorHTML, mrEditorHTML, bindEditors, busy, toast, drafts, LE, ME };
})();
