// GRG2026 即時計分：寫入權限與資料檢查（純函式）
// 瀏覽器示範模式與 Apps Script（apps-script/Score.gs 由 score_tools/build_gs.py 產生）共用同一份
(function (root) {
  "use strict";
  const R = root.GRG_RULES || (typeof require !== "undefined" ? require("./rules.js") : null);

  const KINDS = ["draw", "sumo", "weight", "final", "lineset", "line", "mr", "assign", "absent"];
  const ADMIN_ONLY = { draw: 1, weight: 1, lineset: 1, assign: 1, absent: 1 };
  const SUMO_VALS = { R: 1, B: 1, TR: 1, TB: 1, T0: 1, XR: 1, XB: 1 };   // XR／XB＝對手逾時未進場判分
  const MR_KEYS = {};
  R.MR_ITEMS.forEach((x) => { MR_KEYS[x[0]] = 1; });

  const isInt = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
  const isNum = (x, lo, hi) => typeof x === "number" && isFinite(x) && x >= lo && x <= hi;
  const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);

  // 回傳錯誤訊息；空字串表示 OK
  function validate(kind, parts, p) {
    if (p === null) return "";
    if (!isObj(p)) return "資料格式錯誤";
    if (JSON.stringify(p).length > 3000) return "資料太大";
    switch (kind) {
      case "draw":
        return parts.length === 2 && (p.team === "" || typeof p.team === "string") ? "" : "抽籤資料錯誤";
      case "sumo":
        return parts.length === 4 && Array.isArray(p.r) && p.r.length <= 3 && p.r.every((x) => x == null || x === "" || SUMO_VALS[x]) ? "" : "相撲成績格式錯誤";
      case "weight":
        return isNum(p.g, 0, 100000) ? "" : "重量格式錯誤";
      case "final":
        if (parts.length !== 3 || ["E", "J", "R"].indexOf(parts[1]) < 0 || ["SF1", "SF2", "F"].indexOf(parts[2]) < 0) return "決賽場次錯誤";
        if (p.rounds != null && !(Array.isArray(p.rounds) && p.rounds.length <= 3 && p.rounds.every((x) => x === "R" || x === "B" || x === "XR" || x === "XB"))) return "決賽成績格式錯誤";
        return "";
      case "lineset":
        return isInt(p.laps, 2, 5) && isNum(p.sec, 10, 30) ? "" : "圈數 2–5、每圈秒數 10–30";
      case "line":
        if (parts.length !== 3 || ["1", "2"].indexOf(parts[2]) < 0) return "循跡場次錯誤";
        return Array.isArray(p.t) && p.t.length <= 5 && p.t.every((x) => isNum(x, 0, 999)) ? "" : "循跡秒數格式錯誤";
      case "mr":
        if (parts.length !== 3 || ["1", "2"].indexOf(parts[2]) < 0) return "MR 場次錯誤";
        if (!isObj(p.c) || !Object.keys(p.c).every((k) => MR_KEYS[k] && isInt(p.c[k], 0, 99))) return "MR 計分項目錯誤";
        if (!R.mrValid(p.c)) return "MR 完成數量超過規則上限";
        return p.time == null || isNum(p.time, 0, 120) ? "" : "MR 時間 0–120 秒";
      case "absent":
        return parts.length === 2 && typeof p.on === "boolean" ? "" : "棄權資料錯誤";
      case "assign":
        return isObj(p.slots) && Object.keys(p.slots).every((k) => Array.isArray(p.slots[k]) && p.slots[k].every((x) => isInt(x, 1, 99))) ? "" : "場地指派格式錯誤";
    }
    return "未知的資料";
  }

  // 裁判要有哪個場地的指派才能寫這筆
  function judgeSlots(kind, parts, cur) {
    if (kind === "sumo") return [R.sumoSlot(parts[1], Number(parts[3]))];
    if (kind === "final") return cur && cur.payload && cur.payload.field ? [cur.payload.field] : [];
    if (kind === "line") return ["pm:L1", "pm:L2", "pm:L3"];
    if (kind === "mr") return ["pm:MR"];
    return [];
  }

  /**
   * state：目前資料；req.items：[{key, payload}]（payload 為 null 表示刪除，只有計分台可以）
   * who：{admin:true} 或 {nick, roles:[崗位編號]}
   * 回傳 { results:[{key, ok, message}], changes:[{key, row|null}], state:新資料 }
   */
  function apply(state, req, who, now) {
    const st = Object.assign({}, state);
    const results = [], changes = [];
    const items = Array.isArray(req.items) ? req.items.slice(0, 60) : [];
    items.forEach((it) => {
      const key = String((it && it.key) || "");
      const parts = key.split(":"), kind = parts[0];
      const fail = (m) => results.push({ key, ok: false, message: m });
      if (KINDS.indexOf(kind) < 0) return fail("未知的資料");
      let p = it.payload === undefined ? null : it.payload;
      const err = validate(kind, parts, p);
      if (err) return fail(err);
      const cur = st[key];
      if (!who.admin) {
        if (ADMIN_ONLY[kind] || p === null) return fail("只有計分台可以修改");
        const slots = R.slotsOf(st);
        const roles = (who.roles || []).map(Number);
        const mine = judgeSlots(kind, parts, cur).some((s) => (slots[s] || []).some((r) => roles.indexOf(Number(r)) >= 0));
        if (!mine) return fail("這不是你負責的場地");
        if (kind === "final") {
          if (cur.payload.adminRounds) return fail("計分台已修改這場，請找計分台");
          p = Object.assign({}, cur.payload, { rounds: p.rounds || [] });
        } else if (cur && cur.src === "admin") return fail("計分台已修改這筆，請找計分台");
      }
      const row = p === null ? null : { kind, payload: p, by: who.admin ? "計分台" : who.nick, src: who.admin ? "admin" : "judge", time: now };
      if (row) st[key] = row; else delete st[key];
      changes.push({ key, row });
      results.push({ key, ok: true });
    });
    return { results, changes, state: st };
  }

  const API = { KINDS, validate, judgeSlots, apply };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.GRG_SERVER = API;
})(typeof window !== "undefined" ? window : globalThis);
