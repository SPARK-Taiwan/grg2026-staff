/**
 * GRG2026 工作人員崗位認領後台（Google Apps Script）
 *
 * 試算表分頁：
 *   名單      A 暱稱｜B 電話         ← 你填，電話只存在這裡，不會傳到網頁
 *   認領      A 編號｜B 崗位｜C 暱稱｜D 認領時間   ← 程式自動寫入（20 個崗位，一崗一人）
 *   主辦安排  A 暱稱｜B 時間          ← 選「由主辦單位安排」的人，可多人
 *   填寫狀態  A 暱稱｜B 選擇｜C 狀態   ← 程式自動更新，看誰還沒填
 *   紀錄      每一次送出的結果（含電話錯誤）
 *
 * 第一次使用：在 Apps Script 編輯器選 setup 執行一次，再部署成網頁應用程式。
 * 更新程式後：先執行一次 setup（更新崗位名稱與編號、寫入主辦指定），再到 部署 → 管理部署作業 → 編輯 → 版本選「新版本」→ 部署（網址不變）。
 */

var OPEN_AT = new Date('2026-10-09T00:00:00+08:00'); // 開放填寫時間
var CLOSE_AT = null;                                   // 截止時間；null 表示不截止
var MAX_FAILS = 5;                                     // 同一暱稱電話錯幾次後暫停
var LOCK_MINUTES = 15;
var ARRANGE = 'A';                                     // 「由主辦單位安排」的代號
var ARRANGE_NAME = '由主辦單位安排';

var ROLE_NAMES = {
  1: '機動＋危機處理1', 2: '機動＋危機處理2', 3: '1F 打卡＋便當', 4: '2F 攝影',
  5: '2F 門口把關', 6: '計分＋主持',
  7: '相撲裁判 A1・左', 8: '相撲裁判 A1・右', 9: '相撲裁判 A2・左', 10: '相撲裁判 A2・右',
  11: '相撲裁判 A3・左', 12: '相撲裁判 A3・右', 13: '相撲裁判 B1・左', 14: '相撲裁判 B1・右',
  15: '相撲裁判 B2・左', 16: '相撲裁判 B2・右', 17: '相撲裁判 B3・左', 18: '相撲裁判 B3・右',
  19: '相撲裁判 B4・左', 20: '相撲裁判 B4・右'
};

// 主辦單位直接指定的崗位：網站上不能被認領或取消，這些人也不能自己改選
var FIXED = { 1: '台科_Winnie', 2: '北市_小鹿', 7: '彰師_余紹銨', 8: '中央_林星佑' };

function fixedNick_(nick) {
  for (var id in FIXED) if (FIXED[id] === nick) return id;
  return null;
}

// ---------- 純邏輯（不碰試算表，方便測試） ----------

function normalizePhone_(raw) {
  var d = String(raw || '').replace(/\D/g, '');
  if (d.indexOf('886') === 0) d = '0' + d.slice(3);
  return d;
}

function isOpen_(now) {
  if (now < OPEN_AT) return false;
  if (CLOSE_AT && now >= CLOSE_AT) return false;
  return true;
}

/**
 * req:   { action: 'claim' | 'cancel', nickname, phone, roleId }   roleId 為 1–20 或 'A'
 * state: { staff: {暱稱: 電話}, claims: {編號: 暱稱}, arrange: [暱稱], fails: 這個暱稱目前錯誤次數 }
 * 回傳:  { ok, message, claims, arrange, badPhone }
 */
function decide_(req, state, now) {
  if (!isOpen_(now)) return { ok: false, message: '尚未開放填寫（10/9 00:00 開放）' };
  var nick = String(req.nickname || '').trim();
  if (!Object.prototype.hasOwnProperty.call(state.staff, nick)) return { ok: false, message: '找不到這個暱稱' };
  if (state.fails >= MAX_FAILS) return { ok: false, message: '電話錯誤太多次，請 ' + LOCK_MINUTES + ' 分鐘後再試' };
  var phone = normalizePhone_(req.phone);
  if (!phone || phone !== normalizePhone_(state.staff[nick])) return { ok: false, badPhone: true, message: '電話號碼不符' };

  if (fixedNick_(nick)) return { ok: false, message: '你的崗位已由主辦單位指定（' + ROLE_NAMES[fixedNick_(nick)] + '），如需更改請聯絡大會' };
  if (req.action === 'claim' && FIXED[String(parseInt(req.roleId, 10))]) return { ok: false, message: '這個崗位已由主辦單位指定' };

  var claims = {};
  for (var k in state.claims) claims[k] = state.claims[k];
  for (var f in FIXED) claims[f] = FIXED[f];
  var arrange = (state.arrange || []).slice();
  var mine = null;
  for (var r in claims) if (claims[r] === nick) mine = r;
  var inArrange = arrange.indexOf(nick) >= 0;
  var current = mine ? ROLE_NAMES[mine] : inArrange ? ARRANGE_NAME : null;
  var done = function (msg) { return { ok: true, message: msg, claims: claims, arrange: arrange }; };
  var release = function () {
    if (mine) delete claims[mine];
    if (inArrange) arrange.splice(arrange.indexOf(nick), 1);
  };

  if (req.action === 'cancel') {
    if (!current) return { ok: false, message: '你目前沒有選擇' };
    release();
    return done('已取消 ' + current);
  }
  if (req.action !== 'claim') return { ok: false, message: '未知的動作' };

  if (String(req.roleId) === ARRANGE) {
    if (inArrange) return done('你已經選擇 ' + ARRANGE_NAME);
    release();
    arrange.push(nick);
    return done((current ? '已從 ' + current + ' 改為 ' : '已選擇 ') + ARRANGE_NAME);
  }

  var roleId = String(parseInt(req.roleId, 10));
  if (!ROLE_NAMES[roleId]) return { ok: false, message: '請選擇崗位' };
  if (claims[roleId] && claims[roleId] !== nick) return { ok: false, message: '這個崗位已被 ' + claims[roleId] + ' 認領' };
  if (mine === roleId) return done('你已經認領 ' + ROLE_NAMES[roleId]);
  release();
  claims[roleId] = nick;
  return done((current ? '已從 ' + current + ' 改為 ' : '已認領 ') + ROLE_NAMES[roleId]);
}

// ---------- 試算表讀寫 ----------

function sheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh && name === '主辦安排') { sh = ss.insertSheet(name); sh.appendRow(['暱稱', '時間']); sh.setFrozenRows(1); }
  return sh;
}

function readStaff_() {
  var rows = sheet_('名單').getDataRange().getValues().slice(1);
  var staff = {}, order = [];
  rows.forEach(function (r) {
    var nick = String(r[0]).trim();
    if (nick) { staff[nick] = String(r[1]); order.push(nick); }
  });
  return { staff: staff, order: order };
}

function readClaims_() {
  var rows = sheet_('認領').getRange(2, 1, 20, 3).getValues();
  var claims = {};
  rows.forEach(function (r) { if (r[2]) claims[String(r[0])] = String(r[2]); });
  for (var id in FIXED) claims[id] = FIXED[id];
  return claims;
}

function readArrange_() {
  var sh = sheet_('主辦安排');
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0]).trim(); }).filter(String);
}

function writeClaims_(claims, changedRole) {
  var sh = sheet_('認領');
  var old = sh.getRange(2, 1, 20, 4).getValues();
  var now = new Date();
  var out = old.map(function (r) {
    var id = String(r[0]);
    var nick = claims[id] || '';
    var time = nick ? (nick === r[2] && id !== changedRole ? r[3] : now) : '';
    return [r[0], ROLE_NAMES[id] + (FIXED[id] ? '（主辦指定）' : ''), nick, time || (FIXED[id] ? now : '')];
  });
  sh.getRange(2, 1, 20, 4).setValues(out);
}

function writeArrange_(arrange) {
  var sh = sheet_('主辦安排');
  var old = {};
  if (sh.getLastRow() >= 2) sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (r) { old[r[0]] = r[1]; });
  if (sh.getLastRow() >= 2) sh.getRange(2, 1, sh.getLastRow() - 1, 2).clearContent();
  if (arrange.length) sh.getRange(2, 1, arrange.length, 2).setValues(arrange.map(function (n) { return [n, old[n] || new Date()]; }));
}

function writeStatus_(order, claims, arrange) {
  var byNick = {};
  for (var id in claims) byNick[claims[id]] = '#' + ('0' + id).slice(-2) + ' ' + ROLE_NAMES[id];
  arrange.forEach(function (n) { byNick[n] = ARRANGE_NAME; });
  var sh = sheet_('填寫狀態');
  sh.clearContents();
  var rows = [['暱稱', '選擇', '狀態']].concat(order.map(function (n) {
    return [n, byNick[n] || '', byNick[n] ? '已填' : '未填'];
  }));
  sh.getRange(1, 1, rows.length, 3).setValues(rows);
}

function log_(req, result) {
  sheet_('紀錄').appendRow([new Date(), req.action, req.nickname, req.roleId || '', result.ok ? '成功' : '失敗', result.message]);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- 網頁入口 ----------

function doGet() {
  var now = new Date();
  var s = readStaff_();
  return json_({ open: isOpen_(now), openAt: OPEN_AT.toISOString(), now: now.toISOString(), nicknames: s.order, claims: readClaims_(), arrange: readArrange_(), fixed: FIXED });
}

function doPost(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, message: '資料格式錯誤' }); }
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var cache = CacheService.getScriptCache();
    var failKey = 'fail_' + String(req.nickname || '').trim();
    var s = readStaff_();
    var state = { staff: s.staff, claims: readClaims_(), arrange: readArrange_(), fails: Number(cache.get(failKey) || 0) };
    var result = decide_(req, state, new Date());
    if (result.badPhone) cache.put(failKey, String(Number(cache.get(failKey) || 0) + 1), LOCK_MINUTES * 60);
    if (result.ok) {
      cache.remove(failKey);
      writeClaims_(result.claims, String(req.roleId));
      writeArrange_(result.arrange);
      writeStatus_(s.order, result.claims, result.arrange);
    }
    log_(req, result);
    return json_({ ok: result.ok, message: result.message, claims: result.ok ? result.claims : state.claims, arrange: result.ok ? result.arrange : state.arrange });
  } finally {
    lock.releaseLock();
  }
}

// ---------- 第一次執行：建立分頁 ----------

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  function ensure(name, header) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sh.getLastRow() === 0) sh.appendRow(header);
    sh.setFrozenRows(1);
    return sh;
  }
  ensure('名單', ['暱稱', '電話']);
  var claim = ensure('認領', ['編號', '崗位', '暱稱', '認領時間']);
  // 依「崗位名稱」把現有的認領搬到目前的編號（編號順序改過也不會對錯人）
  var byName = {};
  if (claim.getLastRow() >= 2) {
    claim.getRange(2, 1, claim.getLastRow() - 1, 4).getValues().forEach(function (r) {
      var name = String(r[1]).replace('（主辦指定）', '').trim();
      if (name && r[2]) byName[name] = [r[2], r[3]];
    });
    claim.getRange(2, 1, claim.getLastRow() - 1, 4).clearContent();
  }
  var rows = [];
  for (var i = 1; i <= 20; i++) {
    var keep = byName[ROLE_NAMES[i]] || ['', ''];
    rows.push([i, ROLE_NAMES[i], FIXED[i] || keep[0], FIXED[i] ? (keep[0] === FIXED[i] ? keep[1] : new Date()) : keep[1]]);
  }
  claim.getRange(2, 1, 20, 4).setValues(rows);
  ensure('主辦安排', ['暱稱', '時間']);
  ensure('填寫狀態', ['暱稱', '選擇', '狀態']);
  ensure('紀錄', ['時間', '動作', '暱稱', '崗位', '結果', '訊息']);
  var claims = readClaims_();
  writeClaims_(claims, null);           // 更新崗位名稱、寫入主辦指定
  writeStatus_(readStaff_().order, claims, readArrange_());
}
