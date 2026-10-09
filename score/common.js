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
      return "<tr><td class='rk'>" + r.rank + "</td><td>" + teamHTML(st, r.code, { unit: o.unit }) + " " + tag + "</td><td class='num'>" + r.pts + "</td><td class='num mute'>" + r.played + "/" + r.total + "</td></tr>";
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
      '<summary><span class="rnd">第 ' + m[0] + " 輪" + (o.showField ? "・場地 " + m[1] : "") + '</span><span class="sv"><b class="code r">' + esc(m[2]) + "</b> " + sp.red + " : " + sp.blue + ' <b class="code b">' + esc(m[3]) + "</b></span>" + chipsSummary + status + "</summary>" +
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
  function lineEditorHTML(st) {
    const set = (st["lineset"] || {}).payload;
    const n = set ? set.laps : 5;
    const status = (t) => [1, 2].map((a) => (st["line:" + t.id + ":" + a] ? "✓" + a : "")).join(" ");
    const ev = set && LE.t.length ? R.lineEval(set, { t: LE.t, done: LE.done }) : null;
    const opts = '<option value="">選擇隊伍</option>' + ["國小", "國中", "高中"].map((L) => '<optgroup label="' + L + '組">' +
      D.teams.L.filter((t) => t.level === L).map((t) => '<option value="' + t.id + '"' + (LE.team === t.id ? " selected" : "") + ">" + esc(t.id + " " + t.name) + " " + status(t) + "</option>").join("") + "</optgroup>").join("");
    let h = '<div class="card editor">' +
      (set ? '<p class="target">' + set.laps + " 圈 × " + set.sec + " 秒 ＝ 目標 <b>" + f2(set.laps * set.sec) + "</b> 秒</p>" : '<p class="target warn">計分台尚未設定圈數與秒數（仍可先計時）</p>') +
      '<label class="lbl">隊伍<select data-act="le-team">' + opts + "</select></label>";
    if (!LE.team) return h + "</div>";
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
      '<div class="foot"><button type="button" class="ghost small" data-act="le-clear">清空</button><button type="button" data-act="le-send"' + (LE.dirty && !LE.run ? "" : " disabled") + ">送出第 " + LE.att + " 次成績</button></div></div>";
    return h;
  }

  // ---------- MR 輸入（計數＋計時） ----------
  const ME = { team: "", att: 1, c: {}, time: "", run: false, t0: 0, dirty: false };
  function meLoad(st) {
    const p = (st["mr:" + ME.team + ":" + ME.att] || {}).payload;
    ME.c = p ? Object.assign({}, p.c) : {}; ME.time = p && p.time != null ? p.time : ""; ME.dirty = false;
  }
  function mrEditorHTML(st) {
    const status = (t) => [1, 2].map((a) => (st["mr:" + t.id + ":" + a] ? "✓" + a : "")).join(" ");
    const opts = '<option value="">選擇隊伍</option>' + ["MR3", "MR2"].map((cls) => '<optgroup label="' + cls + '">' +
      D.teams.M.filter((t) => t.mr === cls).map((t) => '<option value="' + t.id + '"' + (ME.team === t.id ? " selected" : "") + ">" + esc(t.id + " " + t.name) + " " + status(t) + "</option>").join("") + "</optgroup>").join("");
    let h = '<div class="card editor"><label class="lbl">隊伍<select data-act="me-team">' + opts + "</select></label>";
    if (!ME.team) return h + "</div>";
    const ev = R.mrEval({ c: ME.c, time: ME.time === "" ? 120 : Number(ME.time) });
    h += '<div class="seg">' + [1, 2].map((a) => '<button type="button" class="' + (ME.att === a ? "on" : "") + '" data-act="me-att" data-v="' + a + '">第 ' + a + " 次" + (st["mr:" + ME.team + ":" + a] ? " ✓" : "") + "</button>").join("") + "</div>" +
      '<div class="items">' + R.MR_ITEMS.map(([k, label, pts]) => '<div class="item"><span class="il">' + esc(label) + ' <small class="mute">' + pts + ' 分</small></span><button type="button" class="ghost cnt" data-act="me-inc" data-k="' + k + '" data-d="-1">−</button><b class="cv">' + (ME.c[k] || 0) + '</b><button type="button" class="ghost cnt" data-act="me-inc" data-k="' + k + '" data-d="1">＋</button></div>').join("") + "</div>" +
      '<div class="watch small"><span class="mw-time">' + (ME.run ? "" : ME.time === "" ? "0.00" : f2(ME.time)) + '</span><small>秒</small></div><div class="btnrow">' +
      (ME.run ? '<button type="button" class="big stop" data-act="me-stop">停止計時</button>' : '<button type="button" class="big go" data-act="me-start">開始計時</button>') + "</div>" +
      '<label class="lbl inline">完成時間（秒，最多 120）<input type="number" inputmode="decimal" step="0.01" min="0" max="120" data-act="me-time" value="' + (ME.time === "" ? "" : f2(ME.time)) + '"></label>' +
      '<p class="eval">總分 <b>' + ev.score + "</b> 分，時間 " + ev.time + " 秒" + (ev.score === 0 ? "（0 分記 120 秒）" : "") + "</p>" +
      '<div class="foot"><button type="button" class="ghost small" data-act="me-clear">清空</button><button type="button" data-act="me-send"' + (ME.dirty && !ME.run ? "" : " disabled") + ">送出第 " + ME.att + " 次成績</button></div></div>";
    return h;
  }

  // 碼錶顯示（只更新數字，不重畫整頁）
  setInterval(() => {
    const now = performance.now();
    if (LE.run) document.querySelectorAll(".lw-time").forEach((el) => { el.textContent = f2((now - LE.t0) / 1000); });
    if (ME.run) document.querySelectorAll(".mw-time").forEach((el) => { el.textContent = f2((now - ME.t0) / 1000); });
  }, 50);

  // ---------- 事件 ----------
  // ctx：{ state(), save(items) → Promise<{ok, message}>, render(), toast(msg, ok), admin }
  function bindEditors(root, ctx) {
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
      // 循跡
      else if (act === "le-att") { LE.att = Number(b.dataset.v); leLoad(st); ctx.render(); }
      else if (act === "le-start") {
        if (LE.t.length && !confirm("重新計時會清掉目前的圈數秒數，確定？")) return;
        LE.t = []; LE.done = false; LE.run = true; LE.t0 = performance.now(); LE.dirty = true; ctx.render();
      } else if (act === "le-lap") {
        LE.t.push(Math.round((performance.now() - LE.t0) / 10) / 100);
        const set = (st["lineset"] || {}).payload;
        if (set && LE.t.length >= set.laps) { LE.run = false; LE.done = true; }
        ctx.render();
      } else if (act === "le-stop") { LE.run = false; LE.done = false; ctx.render(); }
      else if (act === "le-clear") { LE.t = []; LE.done = false; LE.run = false; LE.dirty = true; ctx.render(); }
      else if (act === "le-send") {
        const k = "line:" + LE.team + ":" + LE.att;
        const t = LE.t.filter((x) => x > 0).map((x) => Math.round(x * 100) / 100);
        done(ctx.save([{ key: k, payload: { t, done: LE.done } }]), () => { LE.dirty = false; });
      }
      // MR
      else if (act === "me-att") { ME.att = Number(b.dataset.v); meLoad(st); ctx.render(); }
      else if (act === "me-inc") {
        const k = b.dataset.k;
        ME.c[k] = Math.max(0, (ME.c[k] || 0) + Number(b.dataset.d));
        if (!ME.c[k]) delete ME.c[k];
        ME.dirty = true; ctx.render();
      } else if (act === "me-start") { ME.run = true; ME.t0 = performance.now(); ME.dirty = true; ctx.render(); }
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
  const busy = (root) => LE.run || ME.run || (document.activeElement && root.contains(document.activeElement) && /INPUT|SELECT/.test(document.activeElement.tagName));

  function toast(msg, ok) {
    let el = document.getElementById("toast");
    if (!el) { el = document.createElement("div"); el.id = "toast"; document.body.appendChild(el); }
    el.textContent = msg || (ok ? "完成" : "失敗");
    el.className = "show " + (ok ? "ok" : "err");
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { el.className = ""; }, ok ? 2200 : 4500);
  }

  return { esc, pad, hhmm, hhmmss, f2, FAM_GROUPS, FAM_NAME, FINAL_NAME, teamHTML, plainTeam, fieldsHTML, standingsHTML, finalsHTML, lineHTML, mrHTML,
    sumoMatchHTML, finalEditHTML, lineEditorHTML, mrEditorHTML, bindEditors, busy, toast, drafts, LE, ME };
})();
