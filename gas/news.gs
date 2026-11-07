/* ───────────── 뉴스·경제 비서 ───────────── */

const NEWS_FEEDS = [
  ['국내 경제', '구글뉴스', 'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=ko&gl=KR&ceid=KR:ko'],
  ['세계', '구글뉴스', 'https://news.google.com/rss/headlines/section/topic/WORLD?hl=ko&gl=KR&ceid=KR:ko'],
  ['국내 경제', '연합뉴스', 'https://www.yna.co.kr/rss/economy.xml'],
  ['국내 증시', '한국경제', 'https://www.hankyung.com/feed/finance'],
  ['국내 증시', '매일경제', 'https://www.mk.co.kr/rss/50200011/'],
  ['미국 경제', 'Google News', 'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-US&gl=US&ceid=US:en'],
  ['세계', 'Google News', 'https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-US&gl=US&ceid=US:en'],
  ['미국 증시', 'CNBC', 'https://www.cnbc.com/id/100003114/device/rss/rss.html'],
  ['미국 증시', 'Yahoo Finance', 'https://finance.yahoo.com/news/rssindex'],
];
const NEWS_PER_FEED = 12;

const MARKETS = [
  ['S&P 500', '^GSPC'], ['나스닥', '^IXIC'], ['다우', '^DJI'], ['VIX', '^VIX'],
  ['코스피', '^KS11'], ['코스닥', '^KQ11'], ['닛케이', '^N225'], ['상하이', '000001.SS'],
  ['원/달러', 'KRW=X'], ['미 10년물', '^TNX'], ['WTI', 'CL=F'], ['금', 'GC=F'], ['비트코인', 'BTC-USD'],
];

const NEWS_HEAD = ['id', 'date', 'cat', 'source', 'title', 'link', 'pub'];
const BRIEF_HEAD = ['id', 'date', 'json', 'created'];

/** 시장 지표: 최근 종가와 전일 대비 */
function fetchMarkets_() {
  return MARKETS.map(([name, sym]) => {
    try {
      const res = UrlFetchApp.fetch('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym) + '?range=5d&interval=1d',
        { muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (res.getResponseCode() !== 200) return { name, sym, err: res.getResponseCode() };
      const r = JSON.parse(res.getContentText()).chart.result[0];
      const closes = (r.indicators.quote[0].close || []).filter(v => v != null);
      const last = r.meta.regularMarketPrice != null ? r.meta.regularMarketPrice : closes[closes.length - 1];
      const prev = closes.length >= 2 ? closes[closes.length - 2] : r.meta.chartPreviousClose;
      const chg = prev ? (last - prev) / prev * 100 : null;
      return { name, sym, last, chg, time: fmt_(new Date(r.meta.regularMarketTime * 1000), 'M/d HH:mm') };
    } catch (e) { return { name, sym, err: String(e).slice(0, 80) }; }
  });
}

/** RSS 수집 → News 시트에 새 기사만 추가, 오늘 기사 목록 반환 */
function collectNews_() {
  const t = tbl_('News', NEWS_HEAD);
  const seen = new Set(t.rows().map(r => String(r.id)));
  const today = fmt_(new Date(), 'yyyy-MM-dd');
  const items = [];
  NEWS_FEEDS.forEach(([cat, source, url]) => {
    try {
      const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (res.getResponseCode() !== 200) { console.warn('피드 실패 ' + source + ' ' + res.getResponseCode()); return; }
      const ch = XmlService.parse(res.getContentText()).getRootElement().getChild('channel');
      ch.getChildren('item').slice(0, NEWS_PER_FEED).forEach(it => {
        let title = (it.getChildText('title') || '').trim();
        const link = (it.getChildText('link') || '').trim();
        if (!title || !link) return;
        let src = source;
        const srcEl = it.getChild('source');
        if (srcEl) { src = srcEl.getText(); title = title.replace(new RegExp('\\s+-\\s+' + src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'), ''); }
        const id = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, link)).slice(0, 16);
        const pubRaw = it.getChildText('pubDate');
        const pub = pubRaw ? fmt_(new Date(pubRaw), 'yyyy-MM-dd HH:mm') : '';
        const o = { id, date: today, cat, source: src, title, link, pub };
        items.push(o);
        if (!seen.has(id)) { seen.add(id); t.append(o); }
      });
    } catch (e) { console.warn('피드 오류 ' + source + ': ' + e); }
  });
  // 중복 제목 제거
  const uniq = [], titles = new Set();
  items.forEach(o => { const k = o.title.replace(/\s/g, '').slice(0, 30); if (!titles.has(k)) { titles.add(k); uniq.push(o); } });
  pruneNews_(t);
  return uniq;
}

function pruneNews_(t) {
  // 30일 지난 기사는 위에서부터 한 번에 정리 (기사는 날짜순으로 쌓임)
  const cut = fmt_(addDays_(new Date(), -30), 'yyyy-MM-dd');
  const ds = t.rows().map(r => r.date instanceof Date ? fmt_(r.date, 'yyyy-MM-dd') : String(r.date));
  let n = 0; while (n < ds.length && ds[n] < cut) n++;
  if (n > 50) SpreadsheetApp.getActiveSpreadsheet().getSheetByName('News').deleteRows(2, n);
}

function mkLine_(m) {
  if (m.err || m.last == null) return m.name + ' -';
  const v = m.sym === '^TNX' ? m.last.toFixed(2) + '%' : (m.last >= 1000 ? Math.round(m.last).toLocaleString('en-US') : m.last.toFixed(2));
  return m.name + ' ' + v + (m.chg == null ? '' : ' (' + (m.chg >= 0 ? '▲' : '▼') + Math.abs(m.chg).toFixed(2) + '%)');
}

/** Gemini로 정리 (뉴스 제목·지표만 보냄. 메일·개인 정보는 보내지 않음) */
function analyzeNews_(items, markets) {
  const list = items.slice(0, 90).map((o, i) => i + '. [' + o.cat + '/' + o.source + '] ' + o.title).join('\n');
  const prompt =
    '당신은 한국의 개인 투자자를 위한 아침 경제 브리핑 비서입니다. 아래 시장 지표와 오늘 아침 뉴스 제목 목록을 보고 정리하세요.\n' +
    '규칙: 한국어 존댓말 없이 간결한 보고체. 사실과 맥락만 쓰고, 특정 종목 매수·매도 추천은 하지 마세요. 목록에 없는 사실을 지어내지 마세요.\n' +
    '반드시 JSON 한 개만 출력:\n' +
    '{"headline":"오늘 핵심 한 문장","summary":["세계 정세·경제 흐름 요약 3줄"],"market":"시장 지표 해석 한두 문장",' +
    '"top":[{"i":번호,"why":"왜 중요한지 한 문장"}] (한국·미국·세계를 고루 5개),' +
    '"reads":[{"i":번호,"why":"읽어볼 이유 한 문장"}] (깊이 있게 읽을 만한 기사 3개, top과 겹치지 않게),' +
    '"keywords":["오늘의 키워드 5개"],"watch":["오늘·이번 주 주목할 일정이나 이벤트 (목록에 근거가 있을 때만, 없으면 빈 배열)"]}\n\n' +
    '[시장 지표]\n' + markets.map(mkLine_).join('\n') + '\n\n[뉴스 제목]\n' + list;
  const raw = gemini_(prompt, true);
  const d = JSON.parse(raw);
  const pick = a => (a || []).map(x => { const o = items[Number(x.i)]; return o ? { title: o.title, link: o.link, source: o.source, cat: o.cat, why: x.why } : null; }).filter(Boolean);
  return { headline: d.headline || '', summary: d.summary || [], market: d.market || '', top: pick(d.top), reads: pick(d.reads), keywords: d.keywords || [], watch: d.watch || [] };
}

/** 업무 요약 (기존 아침 브리핑 내용) */
function workBrief_() {
  const b = getBoard();
  const today = fmt_(new Date(), 'yyyy-MM-dd');
  const evs = b.events.filter(e => evStart_(e) <= today && evEnd_(e) >= today)
    .sort((a, b2) => String(a.start).localeCompare(String(b2.start)));
  const open = b.tasks.filter(t => !t.deleted && t.status !== 'done');
  return {
    events: evs.map(e => ({ time: e.allDay ? '종일' : fmt_(new Date(e.start), 'HH:mm'), title: e.title, location: e.location || '' })),
    dueToday: open.filter(t => t.due === today).map(t => t.title),
    late: open.filter(t => t.due && t.due < today).map(t => t.title + ' (' + t.due + ')'),
    doing: open.filter(t => t.status === 'doing').map(t => t.title),
    newMail: b.mails.filter(m => m.state === 'new').length,
  };
}

/** 브리핑 만들기 + 저장 (푸시는 보내지 않음) */
function buildBrief_() {
  try { syncTasks(); } catch (e) { console.warn('syncTasks 실패: ' + e); }
  const markets = fetchMarkets_();
  const items = collectNews_();
  let ai = null, aiErr = '';
  if (prop_('GEMINI_API_KEY') && items.length) {
    try { ai = analyzeNews_(items, markets); } catch (e) { aiErr = String(e).slice(0, 200); console.warn('Gemini 실패: ' + e); }
  }
  const brief = {
    date: fmt_(new Date(), 'yyyy-MM-dd'), label: fmt_(new Date(), 'M/d (E)'), created: fmt_(new Date(), 'yyyy-MM-dd HH:mm'),
    markets, ai, aiErr, work: workBrief_(),
    news: items.slice(0, 120).map(o => ({ title: o.title, link: o.link, source: o.source, cat: o.cat })),
  };
  const t = tbl_('Briefs', BRIEF_HEAD);
  const json = JSON.stringify(brief);
  const id = 'b' + brief.date.replace(/-/g, '');
  const ex = t.get(id);
  const row = { id, date: brief.date, json: json.length > 49000 ? JSON.stringify(Object.assign({}, brief, { news: brief.news.slice(0, 40) })) : json, created: brief.created };
  if (ex) { row._row = ex._row; t.put(row); } else t.append(row);
  return brief;
}

/** 매일 아침 8시: 브리핑 만들고 푸시 */
function sendMorningBrief() {
  scheduleMorning_();
  const b = buildBrief_();
  const w = b.work;
  const mk = n => b.markets.find(m => m.name === n);
  const L = [];
  if (b.ai && b.ai.headline) L.push('🌍 ' + b.ai.headline);
  L.push('📈 ' + ['S&P 500', '나스닥', '코스피', '원/달러'].map(n => mkLine_(mk(n))).join(' · '));
  L.push('🗂 일정 ' + w.events.length + ' · 오늘 마감 ' + w.dueToday.length + ' · 기한 지남 ' + w.late.length + ' · 새 메일 ' + w.newMail);
  w.events.slice(0, 3).forEach(e => L.push('📅 ' + e.time + ' ' + e.title));
  w.dueToday.slice(0, 2).forEach(t => L.push('⏰ ' + t));
  sendPush_('☀️ ' + b.label + ' 아침 브리핑', L.join('\n'), '?p=brief');
}

/** 다음 아침 8:00 정각에 한 번 실행되는 트리거 예약 (매일 이어서 예약) */
function scheduleMorning_() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'sendMorningBrief').forEach(t => ScriptApp.deleteTrigger(t));
  const now = new Date();
  const ymd = fmt_(now, 'yyyy-MM-dd');
  let next = new Date(ymd + 'T' + ('0' + CONFIG.MORNING_HOUR).slice(-2) + ':00:00+09:00');
  if (next.getTime() <= now.getTime() + 60e3) next = new Date(next.getTime() + 24 * 3600e3);
  ScriptApp.newTrigger('sendMorningBrief').timeBased().at(next).create();
  return fmt_(next, 'yyyy-MM-dd HH:mm');
}

/** 편집기에서 실행: 지금 바로 브리핑 만들어 보기 (푸시 없음) */
function testBrief() {
  const b = buildBrief_();
  Logger.log('지표 ' + b.markets.filter(m => !m.err).length + '/' + b.markets.length + ', 기사 ' + b.news.length + ', AI ' + (b.ai ? 'OK' : '없음 ' + b.aiErr));
  Logger.log(b.markets.map(mkLine_).join(' | '));
  if (b.ai) Logger.log(b.ai.headline);
}

/* ───────────── 브리핑 페이지 ───────────── */

function briefPage_(date) {
  const t = tbl_('Briefs', BRIEF_HEAD);
  const rows = t.rows().filter(r => r.id).sort((a, b) => String(b.id).localeCompare(String(a.id)));
  const r = (date && rows.find(x => String(x.id) === date)) || rows[0];
  const h = esc_;
  let body;
  if (!r) {
    body = '<p class="muted">아직 브리핑이 없어요. 내일 아침 8시에 첫 브리핑이 와요.</p>';
  } else {
    const b = JSON.parse(r.json);
    const a = b.ai;
    const link = (o, extra) => '<li><a href="' + h(o.link) + '" target="_blank" rel="noopener">' + h(o.title) + '</a> <span class="src">' + h(o.source) + '</span>' + (extra ? '<div class="why">' + h(extra) + '</div>' : '') + '</li>';
    const mk = b.markets.map(m => {
      const up = m.chg != null && m.chg >= 0;
      return '<div class="mk"><div class="n">' + h(m.name) + '</div><div class="v">' + h(mkLine_(m).replace(m.name + ' ', '').replace(/ \(.*/, '')) + '</div>' +
        (m.chg == null ? '<div class="c">-</div>' : '<div class="c ' + (up ? 'up' : 'dn') + '">' + (up ? '▲' : '▼') + Math.abs(m.chg).toFixed(2) + '%</div>') + '</div>';
    }).join('');
    const w = b.work;
    const workHtml = '<ul class="plain">' +
      w.events.map(e => '<li>📅 ' + h(e.time + ' ' + e.title) + (e.location ? ' <span class="src">' + h(e.location) + '</span>' : '') + '</li>').join('') +
      w.dueToday.map(x => '<li>⏰ ' + h(x) + '</li>').join('') +
      w.late.map(x => '<li>⚠️ ' + h(x) + '</li>').join('') +
      w.doing.map(x => '<li>▶ ' + h(x) + '</li>').join('') +
      '<li class="muted">새 메일 ' + w.newMail + '통</li></ul>';
    const cats = {};
    b.news.forEach(o => { (cats[o.cat] = cats[o.cat] || []).push(o); });
    const allNews = Object.keys(cats).map(c => '<details><summary>' + h(c) + ' (' + cats[c].length + ')</summary><ul>' + cats[c].map(o => link(o)).join('') + '</ul></details>').join('');
    body =
      '<div class="date">' + h(b.label) + ' · ' + h(b.created) + ' 기준</div>' +
      (a ? '<h2 class="hl">' + h(a.headline) + '</h2><ul class="plain sum">' + a.summary.map(s => '<li>' + h(s) + '</li>').join('') + '</ul>' +
        (a.keywords.length ? '<div class="kw">' + a.keywords.map(k => '<span>#' + h(k) + '</span>').join('') + '</div>' : '')
        : '<p class="muted">AI 요약 없음' + (b.aiErr ? ' (' + h(b.aiErr) + ')' : ' (Gemini 키 미설정)') + '</p>') +
      '<h3>📈 시장</h3><div class="mks">' + mk + '</div>' + (a && a.market ? '<p class="note">' + h(a.market) + '</p>' : '') +
      (a && a.top.length ? '<h3>📰 핵심 뉴스</h3><ul>' + a.top.map(o => link(o, o.why)).join('') + '</ul>' : '') +
      (a && a.reads.length ? '<h3>📚 오늘의 읽을거리</h3><ul>' + a.reads.map(o => link(o, o.why)).join('') + '</ul>' : '') +
      (a && a.watch.length ? '<h3>👀 주목할 일정</h3><ul class="plain">' + a.watch.map(x => '<li>' + h(x) + '</li>').join('') + '</ul>' : '') +
      '<h3>🗂 오늘 할 일</h3>' + workHtml +
      '<h3>🗞 전체 헤드라인</h3>' + allNews +
      '<p class="muted small">지난 브리핑: ' + rows.slice(0, 7).map(x => h(String(x.id).slice(5, 7) + '/' + String(x.id).slice(7))).join(' · ') + '</p>' +
      '<p class="muted small">투자 판단은 본인 책임이에요. 이 브리핑은 정보 정리용이에요.</p>';
  }
  return HtmlService.createHtmlOutput(
    '<style>body{font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",sans-serif;margin:0;padding:16px 16px 40px;color:#222;line-height:1.55;max-width:760px;margin:0 auto}' +
    'h2.hl{font-size:20px;margin:6px 0 8px}h3{font-size:16px;margin:22px 0 8px;border-top:1px solid #eee;padding-top:14px}' +
    'a{color:#1864ab;text-decoration:none}ul{padding-left:18px;margin:0}li{margin:6px 0}ul.plain{list-style:none;padding:0}.sum li{margin:4px 0}' +
    '.src{color:#999;font-size:12px}.why{color:#555;font-size:13px}.muted{color:#888}.small{font-size:12px}.date{color:#888;font-size:13px}' +
    '.kw span{display:inline-block;background:#e7f5ff;color:#1864ab;border-radius:12px;padding:2px 10px;margin:4px 4px 0 0;font-size:13px}' +
    '.mks{display:grid;grid-template-columns:repeat(auto-fill,minmax(105px,1fr));gap:8px}.mk{background:#f8f9fa;border-radius:10px;padding:8px 10px}' +
    '.mk .n{font-size:12px;color:#666}.mk .v{font-weight:600}.mk .c{font-size:12px}.up{color:#e03131}.dn{color:#1c7ed6}.note{font-size:14px;color:#444}' +
    'details{margin:6px 0}summary{cursor:pointer;font-weight:600}</style>' + body
  ).setTitle('아침 브리핑').addMetaTag('viewport', 'width=device-width, initial-scale=1').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
