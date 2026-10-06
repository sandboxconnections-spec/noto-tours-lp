// Noto, Slowly（3ツアーLP）— 計測と申込の受け口（Google Apps Script のウェブアプリ）
// LPから届く出来事（見た・読んだ・値段を見た・押した・送った）を「events」に1件1行で書く。
// 申込は「requests」に1件1行（名前・メールはここだけに入る＝eventsには入れない）＋持ち主にメールで知らせる。
// 「ファネル」シートは初回に自動で作る（#test のアクセスは集計から外す）。

var SPREADSHEET_ID = ""; // 空＝この受け口が紐づいているスプレッドシート
var SUMMARY_VER = "v5";  // 変えると次の呼び出しでファネルシートを作り直す（記録の行は動かさない）

var TYPES = ["view", "scroll", "sec_enter", "price_seen", "cta", "open_form", "request", "dwell"];
var TOURS = ["zen", "sushi", "sup"];
var SECTIONS = ["hero", "intro", "index", "zen", "sushi", "sup", "how", "access", "request"];
var SID_RE = /^[a-z0-9]{6,24}$/;

var EV_H = ["received_at", "sid", "type", "src", "test", "vid", "target", "from", "value", "lang", "tz", "device", "ref", "vw", "ui"];   // ui＝ページを見た言語（en/ja・v4で追加）
var RQ_H = ["received_at", "sid", "src", "test", "kind", "tour", "date1", "date2", "guests", "staying", "name", "email", "message", "対応状況", "メモ", "ui", "rid"];   // rid＝申込番号（同じ番号は1回だけ記録＝送り直しで二重にしない）

// ---------- 受け取り ----------
function doPost(e) {
  var lock = LockService.getScriptLock(), locked = false;
  try {
    var body = e && e.postData ? e.postData.contents : "";
    if (!body || body.length > 8000) return out_({ok: false, error: "bad_size"});
    var p = JSON.parse(body);
    var err = check_(p);
    if (err) return out_({ok: false, error: err});
    lock.waitLock(20000); locked = true;
    var ss = ss_();
    if (p.type === "request" && p.form.rid) {
      var rqs = sheet_(ss, "requests", RQ_H);
      var last = rqs.getLastRow(), col = RQ_H.indexOf("rid") + 1;
      if (last > 1 && rqs.getRange(2, col, last - 1, 1).createTextFinder(p.form.rid).matchEntireCell(true).findNext()) return out_({ok: true, duplicate: true});
    }
    var ev = sheet_(ss, "events", EV_H);
    var rows = toEventRows_(p);
    ev.getRange(ev.getLastRow() + 1, 1, rows.length, EV_H.length).setValues(rows);
    if (p.type === "request") {
      var rq = sheet_(ss, "requests", RQ_H);
      var f = p.form || {};
      rq.appendRow([new Date(), p.sid, safe_(p.src), p.test ? "test" : "", f.kind === "waitlist" ? "waitlist" : "request", f.tour, safe_(f.date1), safe_(f.date2), f.guests,
                    safe_(f.staying), safe_(f.name), safe_(f.email), safe_(f.message), "未対応", "", ui_(p), f.rid || ""]);
      f.ui = ui_(p); notify_(f, p.src, ss.getUrl(), !!p.test); // テストも知らせる（件名に【テスト】）＝通知の道を確かめられるように
    }
    summary_(ss);
    return out_({ok: true});
  } catch (x) {
    return out_({ok: false, error: String(x && x.message ? x.message : x)});
  } finally {
    if (locked) lock.releaseLock();
  }
}

// 引数なし＝動作確認
function doGet() {
  var ss = ss_();
  var ev = ss.getSheetByName("events"), rq = ss.getSheetByName("requests");
  return out_({ok: true, service: "noto-tours-lp", events: ev ? ev.getLastRow() - 1 : 0, requests: rq ? rq.getLastRow() - 1 : 0});
}

// 初回の許可と、シートの準備（エディタから1回実行する）
function setup() {
  var ss = ss_();
  sheet_(ss, "events", EV_H);
  sheet_(ss, "requests", RQ_H);
  summary_(ss);
  return "ready: " + ss.getUrl();
}

// ---------- 中身 ----------
function check_(p) {
  if (!p || typeof p !== "object") return "not_object";
  if (TYPES.indexOf(p.type) < 0) return "bad_type";
  if (!SID_RE.test(String(p.sid || ""))) return "bad_sid";
  if (p.vid && !SID_RE.test(String(p.vid))) return "bad_vid";
  if (String(p.src || "").length > 40) return "bad_src";
  if (p.type === "scroll" && [25, 50, 75, 100].indexOf(p.depth) < 0) return "bad_depth";
  if (p.type === "sec_enter" && SECTIONS.indexOf(p.sec) < 0) return "bad_sec";
  if ((p.type === "price_seen" || p.type === "cta") && p.tour && TOURS.indexOf(p.tour) < 0) return "bad_tour";
  if (p.type === "dwell") {
    var d = p.sec;
    if (!d || typeof d !== "object") return "bad_dwell";
    for (var k in d) { if (SECTIONS.indexOf(k) < 0 || typeof d[k] !== "number" || d[k] < 0 || d[k] > 86400) return "bad_dwell"; }
  }
  if (p.type === "request") {
    var f = p.form || {};
    if (TOURS.indexOf(f.tour) < 0) return "bad_form_tour";
    if (f.rid !== undefined && !/^[a-z0-9]{8,24}$/.test(String(f.rid))) return "bad_rid";
    if (["2", "3", "4", "5"].indexOf(String(f.guests)) < 0) return "bad_guests";
    if (["request", "waitlist", undefined].indexOf(f.kind) < 0) return "bad_kind";
    if (f.kind !== "waitlist" && !/^\d{4}-\d{2}-\d{2}$/.test(String(f.date1 || ""))) return "bad_date"; // 空き待ち（SUP来季）は日付なし
    if (f.date2 && !/^\d{4}-\d{2}-\d{2}$/.test(String(f.date2))) return "bad_date";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(f.email || "")) || String(f.email).length > 200) return "bad_email";
    if (!String(f.name || "").trim() || String(f.name).length > 120) return "bad_name";
    if (String(f.staying || "").length > 120 || String(f.message || "").length > 2000) return "too_long";
  }
  return "";
}

// dwell は区画ごとに1行（target＝区画・value＝秒）。それ以外は1件1行
function toEventRows_(p) {
  var base = function (target, from, value) {
    return [new Date(), p.sid, p.type, safe_(p.src), p.test ? "test" : "", p.vid || "", target, from, value,
            safe_(String(p.lang || "").slice(0, 20)), safe_(String(p.tz || "").slice(0, 40)), p.mobile ? "mobile" : "desktop",
            safe_(String(p.ref || "").slice(0, 80)), typeof p.vw === "number" ? p.vw : "", ui_(p)];
  };
  if (p.type === "dwell") return Object.keys(p.sec).map(function (k) { return base(k, "", p.sec[k]); });
  if (p.type === "scroll") return [base("", "", p.depth)];
  if (p.type === "sec_enter") return [base(p.sec, "", "")];
  if (p.type === "request") return [base((p.form || {}).tour, "", Number((p.form || {}).guests))]; // 名前・メールは入れない
  return [base(p.tour || "", safe_(String(p.from || "").slice(0, 20)), "")];
}

function notify_(f, src, url, test) {
  var names = {zen: "Zen & Sea（マインドフルネス）", sushi: "Sushi and Its Origins（寿司）", sup: "Paddle the Bay（SUP）"};
  var to = Session.getEffectiveUser().getEmail();
  if (!to) return;
  MailApp.sendEmail(to, (test ? "【テスト】" : "") + (f.kind === "waitlist" ? "【LP空き待ち】" : "【LP申込】") + names[f.tour] + " " + f.guests + "名 " + (f.date1 || "来季"),
    "Noto, Slowly のLPから申込が届きました。\n\n" +
    "ツアー：" + names[f.tour] + "\n第1希望：" + f.date1 + "\n第2希望：" + (f.date2 || "—") + "\n人数：" + f.guests + "名\n" +
    "名前：" + f.name + "\nメール：" + f.email + "\n滞在先：" + (f.staying || "—") + "\nメッセージ：" + (f.message || "—") + "\n" +
    "どこから：" + (src || "direct") + "\n言語：" + (f.ui === "ja" ? "日本語" : "英語") + "\n\nシート：" + url + "\n※まだ返信していません。確定の連絡とStripeのリンクは手で送ってください。");
}

function ui_(p) { return p.ui === "ja" ? "ja" : "en"; }
function safe_(v) {
  if (v === null || v === undefined) return "";
  var s = String(v).slice(0, 5000);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function ss_() {
  var ss = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSpreadsheetTimeZone() !== "Asia/Tokyo") ss.setSpreadsheetTimeZone("Asia/Tokyo"); // 新規シートは米国時間で作られるため
  return ss;
}
function sheet_(ss, name, h) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight("bold");
    sh.setFrozenRows(1);
    sh.getRange("A:A").setNumberFormat("yyyy-mm-dd hh:mm:ss");
    var first = ss.getSheetByName("シート1") || ss.getSheetByName("Sheet1");
    if (first && first.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(first);
  } else if (sh.getLastColumn() < h.length) {
    var cur = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    if (h.slice(0, cur.length).join("\t") === cur.join("\t")) sh.getRange(1, cur.length + 1, 1, h.length - cur.length).setValues([h.slice(cur.length)]).setFontWeight("bold");
  }
  return sh;
}

// ---------- ファネル（式で組む＝データが増えれば勝手に更新される） ----------
function summary_(ss) {
  var sm = ss.getSheetByName("ファネル");
  if (sm && sm.getRange("H1").getValue() === SUMMARY_VER) return;
  if (sm) sm.setName("ファネル_old_" + Utilities.formatDate(new Date(), "Asia/Tokyo", "MMdd_HHmm"));
  sheet_(ss, "events", EV_H); sheet_(ss, "requests", RQ_H);
  sm = ss.insertSheet("ファネル", 0);
  // events の列：A受信 B sid C type D src E test F vid G target H from I value
  var NT = 'events!E2:E<>"test"';
  // 該当なしのとき FILTER はエラーを返し、COUNTUNIQUE はそのエラーを1件と数える＝ROWS(UNIQUE()) を IFERROR で0にする（v2で修正）
  var U = function (cond) { return '=IFERROR(ROWS(UNIQUE(FILTER(events!B2:B,' + NT + ',' + cond + '))),0)'; };
  var rows = [
    ["ファネル（#test を除く・人数＝セッションの数）", "", "", "", "", "", "", SUMMARY_VER],
    ["段", "人数", "最初の段から", "1つ前の段から", "読み方"],
    ["1 ページを開いた", U('events!C2:C="view"'), "", "", ""],
    ["2 ツアーまで下りた", U('REGEXMATCH(events!C2:C&events!G2:G,"^sec_enter(zen|sushi|sup)$")'), "", "", "ここで大きく落ちる＝トップの写真と一文が弱い"],
    ["3 値段を見た", U('events!C2:C="price_seen"'), "", "", "2→3で落ちる＝写真と物語で惹きつけきれていない"],
    ["4 申込ボタンを押した", U('events!C2:C="cta"'), "", "", "3→4で落ちる＝値段か中身が合っていない"],
    ["5 フォームに書き始めた", U('events!C2:C="open_form"'), "", "", ""],
    ["6 申込を送った", '=COUNTIFS(requests!D2:D,"<>test",requests!E2:E,"request")', "", "", "5→6で落ちる＝フォームが重い"],
    [""],
    ["ツアー別", "ツアーまで来た", "値段を見た", "申込ボタン", "申込", "値段→申込ボタン"]
  ];
  sm.getRange(1, 1, rows.length, 8).setValues(rows.map(function (r) { while (r.length < 8) r.push(""); return r; }));
  for (var r = 3; r <= 8; r++) {
    sm.getRange(r, 3).setFormula('=IFERROR(B' + r + '/$B$3,"")');
    if (r > 3) sm.getRange(r, 4).setFormula('=IFERROR(B' + r + '/B' + (r - 1) + ',"")');
  }
  sm.getRange("C3:D8").setNumberFormat("0%");
  // F列＝テストも含めた人数（#test で通したときに、記録と式が動いているかを確かめる用）
  var UA = function (cond) { return "=IFERROR(ROWS(UNIQUE(FILTER(events!B2:B," + cond + "))),0)"; };
  sm.getRange(2, 6).setValue("（テストも含む）").setFontColor("#999999");
  sm.getRange(3, 6, 6, 1).setFormulas([[UA('events!C2:C="view"')], [UA('REGEXMATCH(events!C2:C&events!G2:G,"^sec_enter(zen|sushi|sup)$")')],
    [UA('events!C2:C="price_seen"')], [UA('events!C2:C="cta"')], [UA('events!C2:C="open_form"')], ['=COUNTIFS(requests!E2:E,"request")']]).setFontColor("#999999");
  var names = {zen: "Zen & Sea", sushi: "Sushi", sup: "Paddle the Bay"};
  TOURS.forEach(function (t, i) {
    var rr = 11 + i;
    sm.getRange(rr, 1, 1, 6).setValues([[names[t],
      U('events!C2:C="sec_enter",events!G2:G="' + t + '"'),
      U('events!C2:C="price_seen",events!G2:G="' + t + '"'),
      U('events!C2:C="cta",events!G2:G="' + t + '"'),
      '=COUNTIFS(requests!D2:D,"<>test",requests!F2:F,"' + t + '")',
      '=IFERROR(D' + rr + '/C' + rr + ',"")']]);
  });
  sm.getRange("F11:F13").setNumberFormat("0%");

  sm.getRange(15, 1, 1, 6).setValues([["どこから（?src=）", "開いた", "値段を見た", "申込ボタン", "申込", "開いた→申込"]]);
  sm.getRange(16, 1).setFormula(
    '=IFERROR(LET(s,UNIQUE(FILTER(events!D2:D,events!C2:C="view",' + NT + ')),' +
    'f,LAMBDA(x,ty,IFERROR(ROWS(UNIQUE(FILTER(events!B2:B,events!D2:D=x,events!C2:C=ty,' + NT + '))),0)),' +
    'HSTACK(s,MAP(s,LAMBDA(x,f(x,"view"))),MAP(s,LAMBDA(x,f(x,"price_seen"))),MAP(s,LAMBDA(x,f(x,"cta"))),' +
    'MAP(s,LAMBDA(x,COUNTIFS(requests!C2:C,x,requests!D2:D,"<>test"))),' +
    'MAP(s,LAMBDA(x,IFERROR(COUNTIFS(requests!C2:C,x,requests!D2:D,"<>test")/f(x,"view"),""))))),"（まだありません）")');
  sm.getRange("F16:F40").setNumberFormat("0%");

  sm.getRange(15, 8, 1, 3).setValues([["区画", "見ていた秒（中央値）", "見た人"]]);
  // dwell は1セッションで何度か届く（累計）＝セッション×区画の最大を取ってから中央値
  SECTIONS.forEach(function (s, i) {
    var rr = 16 + i;
    var q = 'QUERY(events!B2:I,"select B, max(I) where C=\'dwell\' and G=\'' + s + '\' and (E is null or E<>\'test\') group by B label max(I) \'\'",0)';
    sm.getRange(rr, 8, 1, 3).setValues([[s, '=IFERROR(MEDIAN(INDEX(' + q + ',0,2)),"")', '=IFERROR(ROWS(' + q + '),0)']]);
  });

  sm.getRange(27, 1, 1, 3).setValues([["端末", "開いた", ""]]);
  sm.getRange(28, 1, 2, 2).setValues([["mobile", U('events!C2:C="view",events!L2:L="mobile"')], ["desktop", U('events!C2:C="view",events!L2:L="desktop"')]]);
  sm.getRange(31, 1, 1, 2).setValues([["スクロール", "届いた人"]]);
  [25, 50, 75, 100].forEach(function (d, i) { sm.getRange(32 + i, 1, 1, 2).setValues([[d + "%", U('events!C2:C="scroll",events!I2:I=' + d)]]); });

  // 言語別（events の O列＝ui・requests の P列＝ui）
  sm.getRange(27, 4, 1, 4).setValues([["言語", "開いた", "値段を見た", "申込"]]).setFontWeight("bold");
  [["英語", "en"], ["日本語", "ja"]].forEach(function (x, i) {
    sm.getRange(28 + i, 4, 1, 4).setValues([[x[0], U('events!C2:C="view",events!O2:O="' + x[1] + '"'), U('events!C2:C="price_seen",events!O2:O="' + x[1] + '"'),
      '=COUNTIFS(requests!D2:D,"<>test",requests!E2:E,"request",requests!P2:P,"' + x[1] + '")']]);
  });
  sm.getRange("E28:G29").setNumberFormat("0"); // F16:F40 の % 書式が重なるため人数に戻す
  [1, 2, 10, 15, 27, 31].forEach(function (r) { sm.getRange(r, 1, 1, 3).setFontWeight("bold"); });
  sm.getRange("H1").setFontColor("#999999");
  sm.setColumnWidth(1, 260); sm.setColumnWidth(5, 120);
}
