/* ───────────── 외국어 (일본어·중국어) ───────────── */

const LANG_HEAD = ['id', 'lang', 'type', 'front', 'reading', 'meaning', 'note', 'created', 'box', 'due', 'reviews', 'lessonId'];
const LESSON_HEAD = ['id', 'date', 'lang', 'json', 'status']; // status: current(지금 배우는 중) / ready(미리 만들어 둠) / done(익힘)
const SRS_DAYS = [0, 1, 3, 7, 14, 30, 60]; // 상자별 다음 복습까지 날짜
const LANG_HOUR = 6;      // 매일 새벽: 다음 레슨 미리 만들어 두기
const LANG_ALERT_HOUR = 21; // 복습 알림 시각
const LANG_NAME = { ja: '일본어', zh: '중국어' };

/** 레슨 전용 Gemini 호출: 빠른 lite 모델 우선, 혼잡하면 잠깐 쉬고 다시, 그래도 안 되면 다른 모델 */
function langGemini_(prompt) {
  const models = ['gemini-flash-lite-latest', 'gemini-flash-latest'];
  let lastErr = '';
  for (let mi = 0; mi < models.length; mi++) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + models[mi] + ':generateContent', {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        headers: { 'x-goog-api-key': prop_('GEMINI_API_KEY') },
        payload: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.7 } }),
      });
      const code = res.getResponseCode();
      let data = {};
      try { data = JSON.parse(res.getContentText()); } catch (e) {}
      if (code === 200) {
        const txt = ((((data.candidates || [])[0] || {}).content || {}).parts || []).map(p => p.text || '').join('');
        try { return JSON.parse(txt.replace(/^```(json)?\s*|\s*```$/g, '')); } catch (e) { lastErr = 'JSON 형식 오류'; continue; }
      }
      lastErr = (data.error && data.error.message) || String(code);
      if (code === 400 || code === 403) break; // 모델 문제 → 다음 모델로
      Utilities.sleep(attempt ? 8000 : 3000);
    }
  }
  throw new Error('레슨 생성 실패: ' + lastErr);
}

function ymdNum_(d) { return Number(fmt_(d || new Date(), 'yyyyMMdd')); }
function lessonStatus_(r) { return r.status || 'current'; } // 예전 레슨(상태 없음)은 '지금 배우는 중'

/** 트리거(매일 새벽 + 다음 레슨 누른 직후): 언어마다 '다음 레슨'을 하나씩 미리 만들어 둠 */
function makeLangLessons() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'prefetchLang').forEach(t => ScriptApp.deleteTrigger(t));
  if (!prop_('GEMINI_API_KEY')) return '키 없음';
  const lt = tbl_('LangLessons', LESSON_HEAD);
  const out = [];
  ['ja', 'zh'].forEach(lang => {
    try {
      const mine = lt.rows().filter(r => r.id && r.lang === lang);
      if (!mine.some(r => lessonStatus_(r) === 'current')) { out.push(makeLesson_(lang, 'current')); }
      if (!lt.rows().some(r => r.id && r.lang === lang && r.status === 'ready')) out.push(makeLesson_(lang, 'ready'));
      else out.push(lang + ' 다음 레슨 준비됨');
    } catch (e) { console.warn(lang + ' 레슨 실패: ' + e); out.push(lang + ' 실패 ' + String(e).slice(0, 150)); }
  });
  return out.join(' | ');
}
function prefetchLang() { return makeLangLessons(); }

/** 이미 배운(또는 준비된) 문법·단어 목록 — 중복 방지용 */
function learnedList_(lang) {
  const list = [];
  tbl_('LangLessons', LESSON_HEAD).rows().filter(r => r.id && r.lang === lang).forEach(r => {
    try {
      const d = JSON.parse(r.json);
      if (lang === 'ja') { if (d.grammar && d.grammar.pattern) list.push(d.grammar.pattern); }
      else (d.words || []).forEach(w => w.zh && list.push(w.zh));
    } catch (e) {}
  });
  return list;
}

function makeLesson_(lang, status) {
  const lt = tbl_('LangLessons', LESSON_HEAD);
  const day = lt.rows().filter(r => r.id && r.lang === lang).length + 1;
  const learned = learnedList_(lang).slice(lang === 'ja' ? -150 : -400);
  let prompt;
  if (lang === 'ja') {
    prompt =
      '당신은 한국인 학습자를 위한 일본어 선생님입니다. 학습자는 애니메이션을 많이 봐서 단어와 듣기는 꽤 되지만 문법이 약합니다.\n' +
      '오늘은 ' + day + '번째 레슨입니다. JLPT N5부터 N3 순서로 실생활 회화에 자주 쓰는 문법을 한 번에 1개씩 차근차근 가르쳐 주세요.\n' +
      '이미 배운 문법(겹치지 않게): ' + (learned.join(', ') || '없음') + '\n' +
      '반드시 JSON 한 개만 출력:\n' +
      '{"title":"레슨 한 줄 제목","grammar":{"pattern":"문법 패턴(예: 〜てもいい)","meaning":"한국어 뜻","level":"N5|N4|N3",' +
      '"explain":"한국어로 3~5문장 설명. 접속 방법(동사 て형 등), 뉘앙스, 애니에서 자주 들리는 예 포함","tip":"헷갈리기 쉬운 점 한 문장"},' +
      '"examples":[{"jp":"예문(한자 포함)","kana":"전체 히라가나 읽기","ko":"한국어 뜻"}] (3개, 일상 회화),' +
      '"talk":[{"jp":"이 문법을 쓴 짧은 대화 문장","kana":"히라가나 읽기","ko":"뜻"}] (2개)}';
  } else {
    prompt =
      '당신은 한국인 완전 초보를 위한 중국어(보통화, 간체) 선생님입니다. 이번이 ' + day + '번째 레슨입니다.\n' +
      (day <= 5 ? '처음 5번의 레슨은 병음과 성조 기초(1~4성, 경성, 성조 변화)를 한 번에 한 주제씩 쉽게 설명하고, 인사·자기소개 같은 아주 쉬운 단어를 고르세요.\n'
        : 'HSK 1급부터 순서대로, 실생활에 바로 쓰는 단어를 고르세요.\n') +
      '이미 배운 단어(겹치지 않게): ' + (learned.join(', ') || '없음') + '\n' +
      '반드시 JSON 한 개만 출력:\n' +
      '{"title":"레슨 주제 한 줄","point":{"topic":"발음·문법 포인트 제목","explain":"한국어로 3~4문장 쉬운 설명"},' +
      '"words":[{"zh":"간체자","py":"성조 표시 병음(예: nǐ hǎo)","ko":"뜻","ex":"아주 쉬운 예문(간체)","expy":"예문 병음","exko":"예문 뜻"}] (5개),' +
      '"sentences":[{"zh":"이 단어들로 만든 짧은 문장","py":"병음","ko":"뜻"}] (2개)}';
  }
  const d = langGemini_(prompt);
  d.day = day;
  const lid = 'L' + lang + ('000' + day).slice(-4) + '_' + Utilities.getUuid().slice(0, 4);
  lt.append({ id: lid, date: fmt_(new Date(), 'yyyy-MM-dd HH:mm'), lang, json: JSON.stringify(d), status });
  if (status === 'current') addLessonCards_(lang, lid, d);
  return lang + ' ' + day + '번째 ' + (status === 'ready' ? '준비' : '시작');
}

/** 레슨을 시작할 때 복습 카드 만들기 */
function addLessonCards_(lang, lid, d) {
  const ct = tbl_('LangCards', LANG_HEAD);
  const today = ymdNum_(), now = fmt_(new Date(), 'yyyy-MM-dd HH:mm');
  const add = (type, front, reading, meaning, note) => {
    if (!front) return;
    ct.append({ id: Utilities.getUuid().slice(0, 13), lang, type, front, reading: reading || '', meaning: meaning || '', note: note || '',
      created: now, box: 0, due: today, reviews: 0, lessonId: lid });
  };
  if (lang === 'ja') {
    const g = d.grammar || {};
    add('grammar', g.pattern, g.level || '', g.meaning, g.explain);
    (d.examples || []).concat(d.talk || []).forEach(x => add('sentence', x.jp, x.kana, x.ko, ''));
  } else {
    (d.words || []).forEach(x => add('word', x.zh, x.py, x.ko, x.ex ? x.ex + ' (' + (x.expy || '') + ') ' + (x.exko || '') : ''));
    (d.sentences || []).forEach(x => add('sentence', x.zh, x.py, x.ko, ''));
  }
}

/** 화면에서 부름: 지금 레슨을 '익힘'으로 바꾸고 다음 레슨 시작 */
function nextLesson(k, lang) {
  if (!keyOk_(k)) throw new Error('key');
  if (['ja', 'zh'].indexOf(lang) < 0) throw new Error('lang');
  const lt = tbl_('LangLessons', LESSON_HEAD);
  const findReady = () => lt.rows().filter(r => r.id && r.lang === lang && r.status === 'ready').sort((a, b) => String(a.id).localeCompare(String(b.id)))[0];
  // 준비된 레슨이 없으면 먼저 만든다 (실패하면 지금 레슨은 그대로 둠)
  if (!findReady()) makeLesson_(lang, 'ready');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const ready = findReady();
    if (!ready) throw new Error('다음 레슨을 찾지 못했어요');
    lt.rows().filter(r => r.id && r.lang === lang && lessonStatus_(r) === 'current').forEach(r => { r.status = 'done'; lt.put(r); });
    ready.status = 'current'; lt.put(ready);
    addLessonCards_(lang, ready.id, JSON.parse(ready.json));
  } finally { lock.releaseLock(); }
  // 그다음 레슨은 뒤에서 미리 만들어 둠
  try {
    ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'prefetchLang').forEach(t => ScriptApp.deleteTrigger(t));
    ScriptApp.newTrigger('prefetchLang').timeBased().after(20 * 1000).create();
  } catch (e) { console.warn('미리 만들기 예약 실패: ' + e); }
  return langData_();
}

/** 화면에서 부름: 복습 결과 기록. grade 0=몰라요 1=애매 2=알아요 */
function reviewCard(k, id, grade) {
  if (!keyOk_(k)) throw new Error('key');
  const t = tbl_('LangCards', LANG_HEAD);
  const c = t.get(id);
  if (!c) return null;
  let box = Number(c.box) || 0;
  grade = Number(grade);
  if (grade === 0) box = 0;
  else if (grade === 2) box = Math.min(box + 1, SRS_DAYS.length - 1);
  const days = grade === 0 ? 0 : grade === 1 ? Math.max(1, Math.floor(SRS_DAYS[box] / 2)) : SRS_DAYS[box];
  c.box = box;
  c.due = ymdNum_(addDays_(new Date(), days));
  c.reviews = (Number(c.reviews) || 0) + 1;
  t.put(c);
  return { id, box, due: c.due };
}

/** 화면에서 부름: 레슨 다시 만들기(오늘 것이 없을 때) */
function makeLangNow(k) {
  if (!keyOk_(k)) throw new Error('key');
  makeLangLessons();
  return langData_();
}

function langData_() {
  const today = ymdNum_();
  const cards = tbl_('LangCards', LANG_HEAD).rows().filter(r => r.id);
  const lessons = tbl_('LangLessons', LESSON_HEAD).rows().filter(r => r.id);
  const res = {};
  ['ja', 'zh'].forEach(lang => {
    const mine = cards.filter(c => c.lang === lang);
    const ls = lessons.filter(l => l.lang === lang);
    const cur = ls.filter(l => lessonStatus_(l) === 'current').sort((a, b) => String(b.id).localeCompare(String(a.id)))[0];
    res[lang] = {
      lesson: cur ? JSON.parse(cur.json) : null, hasNext: ls.some(l => l.status === 'ready'),
      doneCount: ls.filter(l => l.status === 'done').length,
      due: mine.filter(c => Number(c.due) <= today).map(c => ({ id: c.id, type: c.type, front: c.front, reading: c.reading, meaning: c.meaning, note: c.note, box: Number(c.box) || 0 })),
      total: mine.length, mastered: mine.filter(c => Number(c.box) >= 4).length,
    };
  });
  return res;
}

/** 밤 9시: 복습할 카드가 있으면 알림 */
function sendLangAlert() {
  const d = langData_();
  const n = { ja: d.ja.due.length, zh: d.zh.due.length };
  if (!n.ja && !n.zh) return;
  const title = (d.ja.lesson && d.ja.lesson.title) ? '일본어 지금 레슨: ' + d.ja.lesson.title : '';
  sendPush_('📚 오늘 외국어 복습', '일본어 ' + n.ja + '장 · 중국어 ' + n.zh + '장' + (title ? '\n' + title : ''), '?p=lang');
}

/** 외국어 트리거 설치 (편집기에서 한 번 실행) */
function installLangTriggers() {
  ScriptApp.getProjectTriggers().filter(t => ['makeLangLessons', 'sendLangAlert'].indexOf(t.getHandlerFunction()) >= 0).forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('makeLangLessons').timeBased().atHour(LANG_HOUR).everyDays(1).inTimezone(CONFIG.TZ).create();
  ScriptApp.newTrigger('sendLangAlert').timeBased().atHour(LANG_ALERT_HOUR).nearMinute(0).everyDays(1).inTimezone(CONFIG.TZ).create();
  return makeLangLessons();
}

function testLang() { Logger.log(makeLangLessons()); const d = langData_(); Logger.log('ja ' + d.ja.due.length + ' / zh ' + d.zh.due.length); }

/* ───────────── 외국어 페이지 ───────────── */

function langPage_(k) {
  const data = langData_();
  const html = HtmlService.createTemplate(LANG_PAGE_HTML_);
  html.dataJson = JSON.stringify(data).replace(/</g, '\\u003c');
  html.kJson = JSON.stringify(String(k || ''));
  return html.evaluate().setTitle('외국어').addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

const LANG_PAGE_HTML_ = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
<style>
:root{--bg:#f5f6f8;--card:#fff;--text:#1d1f23;--muted:#6b7280;--line:#e3e5ea;--accent:#3b5bdb;--late:#e03131;--field:#f1f3f5;--ok:#2f9e44;--ok-bg:#ebfbee;--mid:#f08c00;--mid-bg:#fff4e6;--bad-bg:#fff0f0;--cal:#e7f0ff;--cal-t:#1c4fd1;--manual:#f1ecff;--manual-t:#6d28d9}
@media (prefers-color-scheme:dark){:root{--bg:#121316;--card:#24262c;--text:#eceef2;--muted:#9aa0aa;--line:#2f323a;--accent:#748ffc;--late:#ff6b6b;--field:#1b1d22;--ok:#69db7c;--ok-bg:#1d3324;--mid:#ffa94d;--mid-bg:#3a2a18;--bad-bg:#3a1f22;--cal:#1d2a44;--cal-t:#9ab6ff;--manual:#2a2143;--manual-t:#c4b0ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:Pretendard,-apple-system,BlinkMacSystemFont,sans-serif;font-size:14px;line-height:1.5}
header{padding:16px 16px 4px;max-width:760px;margin:0 auto;display:flex;align-items:center;gap:12px}h1{font-size:20px;margin:0;letter-spacing:-.02em}
main{padding:8px 16px 32px;max-width:760px;margin:0 auto}
.seg{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden;margin-left:auto;background:var(--card)}
.seg button{font:inherit;border:0;background:transparent;color:var(--text);padding:6px 14px;font-weight:600;cursor:pointer}.seg button.on{background:var(--accent);color:#fff}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px;margin-bottom:12px}
h2{font-size:15px;margin:0 0 10px;display:flex;gap:6px;align-items:baseline}.count{color:var(--muted);font-weight:500;font-size:13px}
.muted{color:var(--muted)}.sub{color:var(--muted);font-size:12px}
.tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:12px}.tile{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 12px}
.tile .n{font-size:22px;font-weight:700;letter-spacing:-.02em}.tile .l{color:var(--muted);font-size:12px}.tile.hot .n{color:var(--accent)}
.lv{display:inline-block;font-size:11px;font-weight:700;border-radius:999px;padding:1px 8px;background:var(--manual);color:var(--manual-t);margin-right:6px}
.pat{font-size:24px;font-weight:700;letter-spacing:-.01em;margin:2px 0}.mean{font-weight:600;color:var(--accent)}
.exp{margin:10px 0 0;padding:10px 12px;background:var(--field);border-radius:10px;font-size:13.5px}.tip{margin-top:8px;font-size:13px;color:var(--mid)}
.ex{list-style:none;padding:0;margin:8px 0 0}.ex li{padding:10px 0;border-top:1px solid var(--line);display:flex;gap:10px;align-items:flex-start}
.ex .t{font-size:16px;font-weight:600}.ex .r{font-size:12.5px;color:var(--muted)}.ex .k{font-size:13px}
.say{flex:none;width:30px;height:30px;border-radius:8px;border:1px solid var(--line);background:var(--card);cursor:pointer;font-size:14px}
.flash{min-height:220px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;cursor:pointer;user-select:none;padding:24px 16px}
.flash .ty{font-size:11px;color:var(--muted);margin-bottom:8px}.flash .f{font-size:30px;font-weight:700;line-height:1.3}
.flash .b{margin-top:14px;display:none}.flash.open .b{display:block}.flash .b .r{color:var(--muted)}.flash .b .m{font-size:17px;font-weight:600;margin-top:4px}
.flash .b .nt{font-size:13px;color:var(--muted);margin-top:8px;text-align:left;white-space:pre-wrap}
.hint{font-size:12px;color:var(--muted);margin-top:12px}.flash.open .hint{display:none}
.grade{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.grade button{font:inherit;font-weight:700;border-radius:10px;padding:12px 0;border:0;cursor:pointer}
.g0{background:var(--bad-bg);color:var(--late)}.g1{background:var(--mid-bg);color:var(--mid)}.g2{background:var(--ok-bg);color:var(--ok)}
.done{text-align:center;padding:30px 10px}.done .big{font-size:40px}
.primary{font:inherit;font-weight:600;border:0;border-radius:8px;background:var(--accent);color:#fff;padding:9px 16px;cursor:pointer}
.next{margin-top:14px;padding-top:12px;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:6px;align-items:stretch}.next .primary{padding:12px}.bar{height:6px;background:var(--field);border-radius:99px;overflow:hidden;margin:8px 0 12px}.bar i{display:block;height:100%;background:var(--accent)}
</style></head><body>
<header><h1>외국어</h1><div class="seg" id="seg"><button data-l="ja" class="on">🇯🇵 일본어</button><button data-l="zh">🇨🇳 중국어</button></div></header>
<main id="main"></main>
<script>
var D = <?!= dataJson ?>, K = <?!= kJson ?>, L = 'ja', Q = [], qi = 0, done = 0;
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function say(t){try{var u=new SpeechSynthesisUtterance(t);u.lang=L==='ja'?'ja-JP':'zh-CN';u.rate=L==='ja'?0.9:0.8;speechSynthesis.cancel();speechSynthesis.speak(u)}catch(e){}}
function sayBtn(t){return '<button class="say" data-say="'+esc(t)+'">🔊</button>'}
function lessonHtml(){
  var d=D[L], s=d.lesson;
  if(!s) return '<div class="card"><h2>지금 레슨</h2><p class="muted">아직 레슨이 없어요.</p><button class="primary" id="mk">지금 만들기</button><span class="sub" id="mkmsg"></span></div>';
  var h='<div class="card"><h2>지금 레슨 <span class="count">'+s.day+'번째</span></h2>';
  if(L==='ja'){
    var g=s.grammar||{};
    h+='<div><span class="lv">'+esc(g.level||'')+'</span><span class="sub">'+esc(s.title||'')+'</span></div><div class="pat">'+esc(g.pattern)+'</div><div class="mean">'+esc(g.meaning)+'</div>'+
      '<div class="exp">'+esc(g.explain)+'</div>'+(g.tip?'<div class="tip">💡 '+esc(g.tip)+'</div>':'');
    var ex=(s.examples||[]).concat(s.talk||[]);
    h+='<ul class="ex">'+ex.map(function(x){return '<li>'+sayBtn(x.jp)+'<div><div class="t">'+esc(x.jp)+'</div><div class="r">'+esc(x.kana)+'</div><div class="k">'+esc(x.ko)+'</div></div></li>'}).join('')+'</ul>';
  } else {
    var p=s.point||{};
    h+='<div class="sub">'+esc(s.title||'')+'</div><div class="pat" style="font-size:18px">'+esc(p.topic||'')+'</div><div class="exp">'+esc(p.explain||'')+'</div>';
    h+='<ul class="ex">'+(s.words||[]).map(function(x){return '<li>'+sayBtn(x.zh)+'<div><div class="t">'+esc(x.zh)+' <span class="r">'+esc(x.py)+'</span></div><div class="k">'+esc(x.ko)+'</div>'+
      (x.ex?'<div class="r">'+esc(x.ex)+' · '+esc(x.expy||'')+' · '+esc(x.exko||'')+'</div>':'')+'</div></li>'}).join('')+
      (s.sentences||[]).map(function(x){return '<li>'+sayBtn(x.zh)+'<div><div class="t">'+esc(x.zh)+'</div><div class="r">'+esc(x.py)+'</div><div class="k">'+esc(x.ko)+'</div></div></li>'}).join('')+'</ul>';
  }
  h+='<div class="next"><button class="primary" id="nx">✅ 익혔어요 · 다음 레슨</button><div class="sub" id="nxmsg">'+(d.hasNext?'다음 레슨 준비됨':'다음 레슨 준비 중 (누르면 1~2분 걸릴 수 있어요)')+'</div></div>';
  return h+'</div>';
}
function flashHtml(){
  if(!Q.length) return '<div class="card done"><div class="big">🎉</div><b>오늘 복습 끝!</b><div class="sub">'+(done?done+'장 복습했어요':'복습할 카드가 없어요')+'</div></div>';
  if(qi>=Q.length){ return '<div class="card done"><div class="big">🎉</div><b>오늘 복습 끝!</b><div class="sub">'+done+'장 복습했어요</div></div>'; }
  var c=Q[qi], ty={grammar:'문법',word:'단어',sentence:'문장'}[c.type]||'';
  var pct=Math.round(qi/Q.length*100);
  return '<div class="card"><h2>복습 <span class="count">'+(qi+1)+' / '+Q.length+'</span></h2><div class="bar"><i style="width:'+pct+'%"></i></div>'+
    '<div class="flash" id="flash"><div class="ty">'+ty+'</div><div class="f">'+esc(c.front)+'</div>'+
    '<div class="b"><div class="r">'+esc(c.reading)+'</div><div class="m">'+esc(c.meaning)+'</div>'+(c.note?'<div class="nt">'+esc(c.note)+'</div>':'')+'</div>'+
    '<div class="hint">눌러서 뜻 보기</div></div>'+
    '<div style="display:flex;justify-content:center;margin:4px 0 12px">'+sayBtn(c.front)+'</div>'+
    '<div class="grade"><button class="g0" data-g="0">몰라요</button><button class="g1" data-g="1">애매해요</button><button class="g2" data-g="2">알아요</button></div></div>';
}
function render(){
  var d=D[L];
  document.getElementById('main').innerHTML=
    '<div class="tiles"><div class="tile hot"><div class="n">'+Math.max(0,Q.length-qi)+'</div><div class="l">남은 복습</div></div>'+
    '<div class="tile"><div class="n">'+d.doneCount+'</div><div class="l">익힌 레슨</div></div>'+
    '<div class="tile"><div class="n">'+d.total+'</div><div class="l">전체 카드</div></div>'+
    '<div class="tile"><div class="n">'+d.mastered+'</div><div class="l">외운 카드</div></div></div>'+
    lessonHtml()+flashHtml();
}
function setLang(l){L=l;Q=D[L].due.slice().sort(function(a,b){return a.box-b.box});qi=0;done=0;
  document.querySelectorAll('#seg button').forEach(function(b){b.classList.toggle('on',b.dataset.l===l)});render();}
document.getElementById('seg').onclick=function(e){var b=e.target.closest('button');if(b)setLang(b.dataset.l)};
document.getElementById('main').addEventListener('click',function(e){
  var s=e.target.closest('[data-say]'); if(s){e.stopPropagation();say(s.dataset.say);return}
  var f=e.target.closest('#flash'); if(f){f.classList.add('open');return}
  var g=e.target.closest('[data-g]'); if(g){var c=Q[qi],gr=Number(g.dataset.g);
    google.script.run.reviewCard(K,c.id,gr); done++;
    if(gr===0) Q.push(c); qi++; render(); return}
  if(e.target.id==='nx'){e.target.disabled=true;var m=document.getElementById('nxmsg');m.textContent=D[L].hasNext?'넘어가는 중…':'다음 레슨 만드는 중… (1~2분)';
    google.script.run.withSuccessHandler(function(nd){D=nd;setLang(L);window.scrollTo(0,0)}).withFailureHandler(function(er){e.target.disabled=false;m.textContent='실패: '+er.message}).nextLesson(K,L);return}
  if(e.target.id==='mk'){e.target.disabled=true;document.getElementById('mkmsg').textContent=' 만드는 중… (1~3분)';
    google.script.run.withSuccessHandler(function(nd){D=nd;setLang(L)}).withFailureHandler(function(er){document.getElementById('mkmsg').textContent=' 실패: '+er.message}).makeLangNow(K)}
});
setLang('ja');
</script></body></html>`;
