// ===================== 即時計分：試算表讀寫與網頁入口 =====================
// 分頁：計分資料（A key｜B 種類｜C 內容 JSON｜D 輸入者｜E 來源 judge/admin｜F 時間）← 程式自動寫入
//       計分紀錄（每一次寫入，含被拒絕的）
// 計分台密碼：專案設定 → 指令碼屬性 SCORE_ADMIN_PW（scoreSetup 會自動產生，也可以自己改）

var SCORE_DATA = '計分資料', SCORE_LOG = '計分紀錄', SCORE_CACHE = 'score_get_v1';
var SCORE_ADMIN_FAILS = 10;

function scoreSheet_(name, header) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange('A:F').setNumberFormat('@');
    sh.appendRow(header);
    sh.setFrozenRows(1);
  }
  return sh;
}
function scoreDataSheet_() { return scoreSheet_(SCORE_DATA, ['key', '種類', '內容', '輸入者', '來源', '時間']); }
function scoreLogSheet_() { return scoreSheet_(SCORE_LOG, ['時間', '輸入者', 'key', '內容', '結果']); }

function scoreRead_() {
  var sh = scoreDataSheet_();
  var state = {}, rowOf = {};
  var n = sh.getLastRow();
  if (n >= 2) sh.getRange(2, 1, n - 1, 6).getValues().forEach(function (r, i) {
    var key = String(r[0]);
    if (!key) return;
    var p;
    try { p = JSON.parse(r[2]); } catch (e) { return; }
    state[key] = { kind: String(r[1]), payload: p, by: String(r[3]), src: String(r[4]), time: r[5] instanceof Date ? r[5].toISOString() : String(r[5]) };
    rowOf[key] = i + 2;
  });
  return { sh: sh, state: state, rowOf: rowOf };
}

function scoreWrite_(db, changes) {
  var sh = db.sh, appends = [];
  var next = Math.max(sh.getLastRow(), 1) + 1;
  changes.forEach(function (c) {
    var r = c.row;
    var vals = r ? [c.key, r.kind, JSON.stringify(r.payload), r.by, r.src, r.time] : ['', '', '', '', '', ''];
    if (db.rowOf[c.key]) { sh.getRange(db.rowOf[c.key], 1, 1, 6).setValues([vals]); if (!r) delete db.rowOf[c.key]; }
    else if (r) { appends.push(vals); db.rowOf[c.key] = next++; }
  });
  if (appends.length) {
    var start = Math.max(sh.getLastRow(), 1) + 1;
    sh.getRange(start, 1, appends.length, 6).setNumberFormat('@').setValues(appends);
  }
}

function scoreLog_(who, items, results) {
  var now = new Date(), by = who.admin ? '計分台' : who.nick;
  var rows = items.map(function (it, i) {
    var res = results[i] || {};
    return [now, by, String(it.key || ''), it.payload === null ? '（刪除）' : JSON.stringify(it.payload), res.ok ? '成功' : '拒絕：' + (res.message || '')];
  });
  var sh = scoreLogSheet_();
  rows.forEach(function (r) { sh.appendRow(r); });   // appendRow 多人同時寫也不會互相蓋掉
}

function scoreResponse_(state) {
  return { ok: true, now: new Date().toISOString(), state: state, claims: readClaims_(), nicknames: readStaff_().order };
}

function scoreCachePut_(text) {
  var cache = CacheService.getScriptCache();
  if (text.length < 95000) cache.put(SCORE_CACHE, text, 10); else cache.remove(SCORE_CACHE);
}

// GET ?score=1：公開頁、裁判頁、計分台每 15 秒讀一次（快取 10 秒）
function scoreGet_() {
  var hit = CacheService.getScriptCache().get(SCORE_CACHE);
  var text = hit || JSON.stringify(scoreResponse_(scoreRead_().state));
  if (!hit) scoreCachePut_(text);
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.JSON);
}

// POST action：score.login（裁判暱稱＋電話，或計分台 admin 密碼）、score.put（寫入成績）
function scorePost_(req) {
  var cache = CacheService.getScriptCache();
  var who;
  if (req.admin != null) {
    var aKey = 'fail_score_admin';
    if (Number(cache.get(aKey) || 0) >= SCORE_ADMIN_FAILS) return json_({ ok: false, message: '密碼錯誤太多次，請 ' + LOCK_MINUTES + ' 分鐘後再試' });
    var pw = PropertiesService.getScriptProperties().getProperty('SCORE_ADMIN_PW');
    if (!pw || String(req.admin) !== pw) {
      cache.put(aKey, String(Number(cache.get(aKey) || 0) + 1), LOCK_MINUTES * 60);
      return json_({ ok: false, message: '計分台密碼錯誤' });
    }
    who = { admin: true };
  } else {
    var nick = String(req.nickname || '').trim();
    var failKey = 'fail_' + nick;
    var s = readStaff_();
    if (!Object.prototype.hasOwnProperty.call(s.staff, nick)) return json_({ ok: false, message: '找不到這個暱稱' });
    if (Number(cache.get(failKey) || 0) >= MAX_FAILS) return json_({ ok: false, message: '電話錯誤太多次，請 ' + LOCK_MINUTES + ' 分鐘後再試' });
    if (!samePhone_(req.phone, s.staff[nick])) {
      cache.put(failKey, String(Number(cache.get(failKey) || 0) + 1), LOCK_MINUTES * 60);
      return json_({ ok: false, message: '電話號碼不符' });
    }
    var claims = readClaims_(), roles = [];
    for (var id in claims) if (claims[id] === nick) roles.push(Number(id));
    who = { nick: nick, roles: roles };
  }
  if (req.action === 'score.login') return json_({ ok: true, nick: who.nick || '', roles: who.roles || [], admin: !!who.admin });
  if (req.action !== 'score.put') return json_({ ok: false, message: '未知的動作' });

  // 排隊只包「讀成績 → 檢查 → 寫成績 → 更新快取」；名單、認領先讀好，紀錄排完隊再寫，讓每個人排隊時間最短
  var base = { claims: readClaims_(), nicknames: readStaff_().order };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(28000)) return json_({ ok: false, busy: true, message: '系統忙碌，成績已存在手機，稍後自動重送' });
  var out, resp;
  try {
    var db = scoreRead_();
    out = GRG_SERVER.apply(db.state, req, who, new Date().toISOString());
    scoreWrite_(db, out.changes);
    SpreadsheetApp.flush();
    resp = { ok: true, now: new Date().toISOString(), state: out.state, claims: base.claims, nicknames: base.nicknames };
    scoreCachePut_(JSON.stringify(resp));
  } finally {
    lock.releaseLock();
  }
  try { scoreLog_(who, (req.items || []).slice(0, 60), out.results); } catch (e) {}   // 紀錄失敗不影響成績
  resp.results = out.results;
  return json_(resp);
}

// 第一次使用（或要看計分台密碼）：選 scoreSetup 執行一次，到「執行作業紀錄」看密碼
function scoreSetup() {
  scoreDataSheet_();
  scoreLogSheet_();
  var props = PropertiesService.getScriptProperties();
  var pw = props.getProperty('SCORE_ADMIN_PW');
  if (!pw) {
    pw = String(Math.floor(100000 + Math.random() * 900000));
    props.setProperty('SCORE_ADMIN_PW', pw);
  }
  CacheService.getScriptCache().remove(SCORE_CACHE);
  Logger.log('計分台密碼：' + pw + '（要改：專案設定 → 指令碼屬性 SCORE_ADMIN_PW）');
}
