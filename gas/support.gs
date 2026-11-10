/* ───────────── 지원 (개인 · 사업자 · 공모전) ───────────── */

const SUP_HEAD = ['id', 'cat', 'src', 'title', 'org', 'start', 'end', 'announce', 'target', 'summary', 'link', 'firstSeen', 'lastSeen', 'status', 'appliedAt', 'resultDate', 'memo'];
const SUP_HOUR = 7; // 매일 아침 새로고침
const SUP_KEEP = ['status', 'appliedAt', 'resultDate', 'memo', 'firstSeen'];
// 사업자: 1인·여성·초기 창업자에게 맞을 법한 것만
const BIZ_IN = /창업|여성|1인|입주|소상공인|예비|초기|공간|보육|사무실|스타트업|청년|마케팅|판로|온라인|브랜드|컨설팅|교육|멘토/;
const BIZ_OUT = /수출|제조|R&D|연구개발|기술개발|중견|스마트공장|농업|어업|축산|해외인증|조선|원전|방산|반도체|대학원/;

function supDate_(s) {
  s = String(s || '').trim();
  let m = s.match(/(20\d\d)[.\-/년\s]*(\d{1,2})[.\-/월\s]*(\d{1,2})/);
  if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  m = s.match(/^(20\d\d)(\d\d)(\d\d)$/);
  return m ? m[1] + '-' + m[2] + '-' + m[3] : '';
}
function supText_(h, n) { return String(h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/g, '').replace(/\s+/g, ' ').trim().slice(0, n || 140); }
function supGet_(url) {
  const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { Accept: 'application/json' } });
  if (r.getResponseCode() !== 200) throw new Error(r.getResponseCode() + ' ' + r.getContentText().slice(0, 120));
  return r.getContentText();
}

/* ── 출처별 수집 ── */

function supBizinfo_() {
  const out = [], seen = {};
  ['서울', '창업'].forEach(tag => {
    let j = {};
    try { j = JSON.parse(supGet_('https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do?crtfcKey=' + encodeURIComponent(prop_('BIZINFO_KEY')) + '&dataType=json&searchCnt=150&hashtags=' + encodeURIComponent(tag))); } catch (e) { console.warn('기업마당 ' + tag + ' ' + e); return; }
    (j.jsonArray || []).forEach(x => {
      if (seen[x.pblancId]) return; seen[x.pblancId] = 1;
      const txt = x.pblancNm + ' ' + x.hashtags + ' ' + (x.trgetNm || '');
      if (!BIZ_IN.test(txt) || BIZ_OUT.test(x.pblancNm)) return;
      const jr = String(x.jrsdInsttNm || '');
      if (jr.indexOf('서울') < 0 && /(광역시|특별자치시|특별자치도|도)$/.test(jr)) return; // 다른 지역 전용 제외
      const p = String(x.reqstBeginEndDe || '').split('~');
      out.push({ id: 'bz' + x.pblancId, cat: 'biz', src: '기업마당', title: x.pblancNm, org: x.excInsttNm || x.jrsdInsttNm || '',
        start: supDate_(p[0]), end: supDate_(p[1]), announce: '', target: x.trgetNm || '', summary: supText_(x.bsnsSumryCn), link: x.pblancUrl });
    });
  });
  return out;
}

function supKstartup_() {
  const out = [];
  const url = 'https://apis.data.go.kr/B552735/kisedKstartupService01/getAnnouncementInformation01?serviceKey=' + encodeURIComponent(prop_('DATA_GO_KR_KEY')) +
    '&page=1&perPage=300&returnType=json&' + encodeURIComponent('cond[rcrt_prgs_yn::EQ]') + '=Y';
  (JSON.parse(supGet_(url)).data || []).forEach(x => {
    if (!/서울|전국/.test(x.supt_regin || '')) return;
    if (x.biz_enyy && !/1년미만|예비/.test(x.biz_enyy)) return;
    if (x.biz_trgt_age && !/39세|제한없음/.test(x.biz_trgt_age) && /세/.test(x.biz_trgt_age)) return;
    const title = x.biz_pbanc_nm || x.intg_pbanc_biz_nm || '';
    const contest = /경진|대회|공모|챌린지|해커톤|오디션/.test(title);
    out.push({ id: 'ks' + x.pbanc_sn, cat: contest ? 'contest' : 'biz', src: 'K-Startup', title, org: x.pbanc_ntrp_nm || '',
      start: supDate_(x.pbanc_rcpt_bgng_dt), end: supDate_(x.pbanc_rcpt_end_dt), announce: '',
      target: supText_(x.aply_trgt_ctnt || x.aply_trgt, 120), summary: supText_(x.pbanc_ctnt), link: x.detl_pg_url || '' });
  });
  return out;
}

function supApplyhome_() {
  const out = [], dk = encodeURIComponent(prop_('DATA_GO_KR_KEY'));
  const since = fmt_(addDays_(new Date(), -45), 'yyyy-MM-dd');
  const q = (path, extra) => JSON.parse(supGet_('https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1/' + path + '?page=1&perPage=100&serviceKey=' + dk + extra)).data || [];
  // 아파트 분양 (서울)
  q('getAPTLttotPblancDetail', '&' + encodeURIComponent('cond[SUBSCRPT_AREA_CODE_NM::EQ]') + '=' + encodeURIComponent('서울') + '&' + encodeURIComponent('cond[RCRIT_PBLANC_DE::GTE]') + '=' + since)
    .forEach(x => {
      if (/신혼희망/.test(x.HOUSE_NM + x.HOUSE_SECD_NM)) return;
      out.push({ id: 'ah' + x.PBLANC_NO, cat: 'personal', src: '청약홈', title: '[' + (x.HOUSE_DTL_SECD_NM || x.HOUSE_SECD_NM || '분양') + '] ' + x.HOUSE_NM, org: x.BSNS_MBY_NM || '',
        start: supDate_(x.RCEPT_BGNDE), end: supDate_(x.RCEPT_ENDDE), announce: supDate_(x.PRZWNER_PRESNATN_DE),
        target: '무주택 · 청약통장 필요 (특별/일반공급 자격 확인)', summary: (x.HSSPLY_ADRES || '') + (x.TOT_SUPLY_HSHLDCO ? ' · ' + x.TOT_SUPLY_HSHLDCO + '세대' : ''), link: x.PBLANC_URL });
    });
  // 공공지원 민간임대 (서울)
  q('getPblPvtRentLttotPblancDetail', '&' + encodeURIComponent('cond[SUBSCRPT_AREA_CODE_NM::EQ]') + '=' + encodeURIComponent('서울') + '&' + encodeURIComponent('cond[RCRIT_PBLANC_DE::GTE]') + '=' + since.replace(/-/g, ''))
    .forEach(x => out.push({ id: 'ar' + x.PBLANC_NO, cat: 'personal', src: '청약홈', title: '[공공지원민간임대] ' + x.HOUSE_NM, org: x.BSNS_MBY_NM || '',
      start: supDate_(x.SUBSCRPT_RCEPT_BGNDE), end: supDate_(x.SUBSCRPT_RCEPT_ENDDE), announce: supDate_(x.PRZWNER_PRESNATN_DE),
      target: '무주택 · 청년/일반 공급 자격 확인', summary: (x.HSSPLY_ADRES || '') + (x.TOT_SUPLY_HSHLDCO ? ' · ' + x.TOT_SUPLY_HSHLDCO + '세대' : ''), link: x.PBLANC_URL }));
  return out;
}

function supLh_() {
  const out = [];
  const url = 'https://apis.data.go.kr/B552555/lhLeaseNoticeInfo1/lhLeaseNoticeInfo1?serviceKey=' + encodeURIComponent(prop_('DATA_GO_KR_KEY')) +
    '&PG_SZ=100&PAGE=1&CNP_CD=11&PAN_SS=' + encodeURIComponent('공고중');
  const j = JSON.parse(supGet_(url));
  const list = ((j.find ? j.find(o => o.dsList) : null) || {}).dsList || [];
  list.forEach(x => {
    if (/상가|토지|용지/.test((x.UPP_AIS_TP_NM || '') + (x.AIS_TP_CD_NM || ''))) return;
    if (/신혼|고령|다자녀/.test(x.PAN_NM) && !/청년/.test(x.PAN_NM)) return;
    out.push({ id: 'lh' + x.PAN_ID, cat: 'personal', src: 'LH', title: '[' + (x.AIS_TP_CD_NM || x.UPP_AIS_TP_NM) + '] ' + x.PAN_NM, org: 'LH 한국토지주택공사',
      start: supDate_(x.PAN_NT_ST_DT), end: supDate_(x.CLSG_DT), announce: '', target: '무주택 · 소득/자산 기준 확인', summary: x.CNP_CD_NM || '', link: x.DTL_URL || x.DTL_URL_MOB });
  });
  return out;
}

/** 서울 청년안심주택 공고 게시판 (공식 API 없음 → 게시판 목록 JSON) */
function supSoco_() {
  const base = 'https://soco.seoul.go.kr/youth';
  const r = UrlFetchApp.fetch(base + '/pgm/home/yohome/bbsListJson.json', { method: 'post', payload: { bbsId: 'BMSR00015', pageIndex: '1' }, muteHttpExceptions: true });
  const since = fmt_(addDays_(new Date(), -30), 'yyyy-MM-dd');
  return (JSON.parse(r.getContentText()).resultList || []).filter(x => (x.optn1 || '') >= since).map(x => ({
    id: 'sc' + x.boardId, cat: 'personal', src: '청년안심주택', title: '[청년안심주택] ' + x.nttSj.replace(/^\[[^\]]*\]\s*/, '') + (x.optn2 === '1' ? ' (공공)' : x.optn2 === '2' ? ' (민간)' : ''),
    org: x.optn3 || '서울시', start: supDate_(x.optn4), end: '', announce: '',
    target: '만 19~39세 무주택 청년 (공고별 소득·자산 기준)', summary: '공고 ' + x.optn1 + ' · 청약신청일 ' + (x.optn4 || '-') + ' · 상세 기간은 공고문 확인',
    link: base + '/bbs/BMSR00015/view.do?boardId=' + x.boardId + '&menuNo=400008',
  }));
}

/** 뉴스로만 알 수 있는 것들(청년 정책 · 공모전) → Gemini가 '지금 모집 중'만 골라 정리 */
const SUP_NEWS_ = {
  personal: ['청년미래적금 신청', '서울 청년 지원 신청 모집', '서울시 청년 월세 지원 신청', '청년 정책 신청 접수 시작'],
  contest: ['작사 공모전', '글쓰기 공모전 모집', '문학 공모전 접수', '아이디어 공모전 모집', '창업경진대회 모집'],
};
function supNews_(cat) {
  const heads = [], seen = {};
  SUP_NEWS_[cat].forEach(q => {
    try {
      const xml = UrlFetchApp.fetch('https://news.google.com/rss/search?q=' + encodeURIComponent(q + ' when:14d') + '&hl=ko&gl=KR&ceid=KR:ko', { muteHttpExceptions: true }).getContentText();
      XmlService.parse(xml).getRootElement().getChild('channel').getChildren('item').slice(0, 12).forEach(it => {
        const t = it.getChildText('title'); const k = t.replace(/\s+-\s+[^-]+$/, '').slice(0, 30);
        if (seen[k]) return; seen[k] = 1;
        heads.push({ i: heads.length, t, d: fmt_(new Date(it.getChildText('pubDate')), 'yyyy-MM-dd'), l: it.getChildText('link') });
      });
    } catch (e) { console.warn('news ' + q + ' ' + e); }
  });
  if (!heads.length || !prop_('GEMINI_API_KEY')) return [];
  const who = cat === 'personal'
    ? '서울에 혼자 사는 무주택 만 19~34세 청년(2026년 3월 개업한 1인 여성 개인사업자이기도 함)이 개인으로 신청할 수 있는 지원·복지·금융 상품'
    : '작사·글쓰기(문학·수필·시·시나리오)·아이디어 공모전과 창업경진대회';
  const prompt = '오늘은 ' + fmt_(new Date(), 'yyyy-MM-dd') + '. 아래 뉴스 제목 중 "' + who + '"의 모집/신청 공고로 보이는 것만 골라라. ' +
    '이미 끝난 것, 결과 발표, 단순 정책 논평, 다른 지역 전용은 제외. 같은 공고는 하나로 합쳐라.\n' +
    'JSON 배열만 출력: [{"i":번호,"title":"공고 이름 짧게","org":"주최","start":"YYYY-MM-DD 또는 빈칸","end":"YYYY-MM-DD 또는 빈칸","target":"신청 자격 한 줄(모르면 \'원문 확인\')","summary":"무엇을 주는지 한 줄"}]\n' +
    '날짜는 제목에 있거나 확실할 때만. 추측 금지.\n\n' + heads.map(h => h.i + '. [' + h.d + '] ' + h.t).join('\n');
  let arr = [];
  try { arr = langGemini_(prompt); } catch (e) { console.warn('support gemini ' + e); return []; }
  return (Array.isArray(arr) ? arr : []).filter(x => heads[x.i]).map(x => ({
    id: 'nw' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, cat + (x.title || ''))).slice(0, 12),
    cat, src: '뉴스', title: x.title, org: x.org || '', start: supDate_(x.start), end: supDate_(x.end), announce: '',
    target: x.target || '원문 확인', summary: x.summary || '', link: heads[x.i].l,
  }));
}

/* ── 시트 저장 (한 번에 읽고 한 번에 씀) ── */

function supSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName('Support');
  if (!sh) { sh = ss.insertSheet('Support'); sh.getRange(1, 1, 1, SUP_HEAD.length).setValues([SUP_HEAD]); sh.setFrozenRows(1); }
  return sh;
}
function supRead_() {
  const sh = supSheet_();
  const v = sh.getDataRange().getDisplayValues();
  const h = v[0];
  return v.slice(1).filter(r => r[0]).map(r => { const o = {}; h.forEach((k, i) => o[k] = r[i]); return o; });
}
function supWrite_(rows) {
  const sh = supSheet_();
  sh.getRange(2, 1, Math.max(sh.getMaxRows() - 1, 1), SUP_HEAD.length).clearContent();
  if (rows.length) {
    if (sh.getMaxRows() < rows.length + 1) sh.insertRowsAfter(sh.getMaxRows(), rows.length + 1 - sh.getMaxRows());
    sh.getRange(2, 1, rows.length, SUP_HEAD.length).setNumberFormat('@').setValues(rows.map(o => SUP_HEAD.map(k => o[k] == null ? '' : String(o[k]))));
  }
}

/** 매일 아침 트리거: 모든 출처를 새로 읽어서 합치고, 내가 체크한 상태는 그대로 둠 */
function refreshSupport() {
  const today = fmt_(new Date(), 'yyyy-MM-dd');
  const got = [], log = [];
  [['기업마당', supBizinfo_], ['K-Startup', supKstartup_], ['청약홈', supApplyhome_], ['LH', supLh_], ['청년안심주택', supSoco_],
   ['뉴스(개인)', () => supNews_('personal')], ['뉴스(공모전)', () => supNews_('contest')]].forEach(([n, f]) => {
    try { const a = f(); got.push.apply(got, a); log.push(n + ' ' + a.length); } catch (e) { log.push(n + ' 실패'); console.warn(n + ' ' + e); }
  });
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  let fresh = 0;
  try {
    const map = {};
    supRead_().forEach(r => map[r.id] = r);
    got.forEach(x => {
      const old = map[x.id];
      const r = Object.assign({}, x, { lastSeen: today });
      if (old) SUP_KEEP.forEach(k => r[k] = old[k]); else { r.firstSeen = today; fresh++; }
      if (!r.resultDate && r.announce) r.resultDate = r.announce;
      if (old && !x.end && old.end) r.end = old.end;
      map[x.id] = r;
    });
    const cut = fmt_(addDays_(new Date(), -21), 'yyyy-MM-dd');
    const keep = Object.keys(map).map(k => map[k]).filter(r => {
      if (r.status === 'applied') return !(r.resultDate && r.resultDate < fmt_(addDays_(new Date(), -60), 'yyyy-MM-dd'));
      if (r.end) return r.end >= cut;
      return (r.lastSeen || '') >= cut;
    });
    supWrite_(keep);
  } finally { lock.releaseLock(); }
  const msg = log.join(' · ') + ' · 새 공고 ' + fresh;
  PropertiesService.getScriptProperties().setProperty('SUP_LAST', fmt_(new Date(), 'M/d HH:mm') + ' · ' + msg);
  supAlert_(fresh);
  return msg;
}

/** 알림: 새 공고 수 + 신청한 것 중 오늘/내일 발표 + 관심(★) 마감 임박 */
function supAlert_(fresh) {
  const t0 = fmt_(new Date(), 'yyyy-MM-dd'), t1 = fmt_(addDays_(new Date(), 1), 'yyyy-MM-dd');
  const rows = supRead_();
  const ann = rows.filter(r => r.status === 'applied' && (r.resultDate === t0 || r.resultDate === t1));
  const lines = ann.map(r => (r.resultDate === t0 ? '오늘' : '내일') + ' 발표 · ' + r.title.slice(0, 30));
  if (!fresh && !lines.length) return;
  sendPush_('📮 지원 소식', (fresh ? '새 공고 ' + fresh + '건' : '') + (lines.length ? (fresh ? '\n' : '') + lines.join('\n') : ''), '?p=support');
}

function installSupportTriggers() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'refreshSupport').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('refreshSupport').timeBased().atHour(SUP_HOUR).nearMinute(0).everyDays(1).inTimezone(CONFIG.TZ).create();
  return refreshSupport();
}
function testSupport() { Logger.log(refreshSupport()); }

/** 화면에서 부름: 신청함/관심없음/되돌리기, 발표일·메모 저장 */
function setSupport(k, id, patch) {
  if (!keyOk_(k)) throw new Error('key');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const rows = supRead_();
    const r = rows.filter(x => x.id === id)[0];
    if (!r) return null;
    if ('status' in patch && ['', 'applied', 'skip', 'star'].indexOf(patch.status) >= 0) {
      r.status = patch.status;
      r.appliedAt = patch.status === 'applied' ? (r.appliedAt || fmt_(new Date(), 'yyyy-MM-dd')) : '';
    }
    if ('resultDate' in patch) r.resultDate = supDate_(patch.resultDate);
    if ('memo' in patch) r.memo = String(patch.memo || '').slice(0, 300);
    supWrite_(rows);
    return r;
  } finally { lock.releaseLock(); }
}

function supportData_() {
  const today = fmt_(new Date(), 'yyyy-MM-dd');
  const rows = supRead_().filter(r => r.status === 'applied' || r.status === 'star' || !r.end || r.end >= today);
  return { today, last: prop_('SUP_LAST') || '', items: rows.map(r => {
    const o = {}; ['id', 'cat', 'src', 'title', 'org', 'start', 'end', 'target', 'summary', 'link', 'firstSeen', 'status', 'appliedAt', 'resultDate', 'memo'].forEach(k => o[k] = r[k]); return o;
  }) };
}

/* ───────────── 지원 페이지 ───────────── */

function supportPage_(k) {
  const html = HtmlService.createTemplate(SUP_PAGE_HTML_);
  html.dataJson = JSON.stringify(supportData_()).replace(/</g, '\\u003c');
  html.kJson = JSON.stringify(String(k || ''));
  return html.evaluate().setTitle('지원').addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

const SUP_PAGE_HTML_ = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
<style>
:root{--bg:#f5f6f8;--card:#fff;--text:#1d1f23;--muted:#6b7280;--line:#e3e5ea;--accent:#3b5bdb;--late:#e03131;--field:#f1f3f5;--ok:#2f9e44;--ok-bg:#ebfbee;--mid:#e8590c;--mid-bg:#fff4e6;--tag:#f1ecff;--tag-t:#6d28d9;--new:#e7f0ff;--new-t:#1c4fd1}
@media (prefers-color-scheme:dark){:root{--bg:#121316;--card:#24262c;--text:#eceef2;--muted:#9aa0aa;--line:#2f323a;--accent:#748ffc;--late:#ff6b6b;--field:#1b1d22;--ok:#69db7c;--ok-bg:#1d3324;--mid:#ffa94d;--mid-bg:#3a2a18;--tag:#2a2143;--tag-t:#c4b0ff;--new:#1d2a44;--new-t:#9ab6ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:Pretendard,-apple-system,BlinkMacSystemFont,sans-serif;font-size:14px;line-height:1.5}
header{padding:16px 16px 4px;max-width:760px;margin:0 auto}h1{font-size:20px;margin:0;letter-spacing:-.02em}.last{color:var(--muted);font-size:12px}
main{padding:8px 16px 40px;max-width:760px;margin:0 auto}
.seg{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--card);margin:10px 0}
.seg button{font:inherit;border:0;background:transparent;color:var(--text);padding:9px 0;font-weight:600;cursor:pointer}.seg button.on{background:var(--accent);color:#fff}.seg small{opacity:.75;font-weight:500}
.tools{display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap}.chip{font:inherit;font-size:12.5px;border:1px solid var(--line);background:var(--card);color:var(--text);border-radius:999px;padding:4px 11px;cursor:pointer}.chip.on{border-color:var(--accent);color:var(--accent);font-weight:600}
h2{font-size:14px;margin:16px 2px 8px;color:var(--muted);font-weight:600}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin-bottom:10px}
.top{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:4px}
.dd{font-size:11.5px;font-weight:700;border-radius:6px;padding:1px 7px;background:var(--field);color:var(--muted)}.dd.hot{background:#ffe3e3;color:var(--late)}.dd.warm{background:var(--mid-bg);color:var(--mid)}
.src{font-size:11px;border-radius:999px;padding:1px 8px;background:var(--tag);color:var(--tag-t);font-weight:600}.nw{font-size:11px;border-radius:999px;padding:1px 8px;background:var(--new);color:var(--new-t);font-weight:700}
.t{font-weight:700;font-size:15px;letter-spacing:-.01em;margin:2px 0}.org{color:var(--muted);font-size:12.5px}
.row{display:flex;gap:6px;font-size:13px;margin-top:6px}.row b{flex:none;color:var(--muted);font-weight:600;width:52px}
.sum{font-size:12.5px;color:var(--muted);margin-top:4px}
.act{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap}.btn{font:inherit;font-size:13px;font-weight:600;border-radius:8px;padding:6px 12px;border:1px solid var(--line);background:var(--card);color:var(--text);cursor:pointer;text-decoration:none}
.btn.pri{background:var(--accent);border-color:var(--accent);color:#fff}.btn.ok{background:var(--ok-bg);border-color:transparent;color:var(--ok)}
.applied{border-color:var(--ok)}.res{display:flex;gap:8px;align-items:center;margin-top:8px;padding:8px 10px;background:var(--ok-bg);border-radius:8px;font-size:13px;flex-wrap:wrap}
.res input{font:inherit;border:1px solid var(--line);border-radius:6px;padding:3px 6px;background:var(--card);color:var(--text)}
.empty{text-align:center;color:var(--muted);padding:40px 0}
</style></head><body>
<header><h1>지원</h1><div class="last" id="last"></div>
<div class="seg" id="seg"><button data-c="personal" class="on">개인 <small id="n-personal"></small></button><button data-c="biz">사업자 <small id="n-biz"></small></button><button data-c="contest">공모전 <small id="n-contest"></small></button></div>
<div class="tools" id="tools"><button class="chip on" data-f="all">전체</button><button class="chip" data-f="star">★ 관심</button><button class="chip" data-f="applied">신청함</button><button class="chip" data-f="soon">7일 내 마감</button><button class="chip" data-f="skip">숨김</button></div></header>
<main id="main"></main>
<script>
var D = <?!= dataJson ?>, K = <?!= kJson ?>, C = 'personal', F = 'all';
var SRC = {personal:'개인',biz:'사업자',contest:'공모전'};
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function days(d){if(!d)return null;var a=new Date(D.today+'T00:00:00'),b=new Date(d+'T00:00:00');return Math.round((b-a)/864e5)}
function md(d){return d?d.slice(5).replace('-','/'):''}
function ddBadge(it){var n=days(it.end);if(n==null)return '<span class="dd">기간 확인</span>';if(n<0)return '<span class="dd">마감</span>';
 return '<span class="dd '+(n<=3?'hot':n<=7?'warm':'')+'">'+(n===0?'오늘 마감':'D-'+n)+'</span>'}
function card(it){
 var ap=it.status==='applied', per=(it.start||it.end)?(md(it.start)||'?')+' ~ '+(md(it.end)||'?'):'원문 확인';
 var h='<div class="card'+(ap?' applied':'')+'" data-id="'+esc(it.id)+'"><div class="top">'+(ap?'<span class="dd" style="background:var(--ok-bg);color:var(--ok)">신청함</span>':ddBadge(it))+
  '<span class="src">'+esc(it.src)+'</span>'+(it.firstSeen===D.today?'<span class="nw">NEW</span>':'')+(it.status==='star'?'<span class="nw">★</span>':'')+'</div>'+
  '<div class="t">'+esc(it.title)+'</div>'+(it.org?'<div class="org">'+esc(it.org)+'</div>':'')+
  '<div class="row"><b>신청 기간</b><span>'+esc(per)+'</span></div><div class="row"><b>자격</b><span>'+esc(it.target||'원문 확인')+'</span></div>'+
  (it.summary?'<div class="sum">'+esc(it.summary)+'</div>':'');
 if(ap){var n=days(it.resultDate);h+='<div class="res">📣 발표일 <input type="date" data-rd value="'+esc(it.resultDate||'')+'">'+
  (it.resultDate?'<b>'+(n===0?'오늘 발표':n>0?'D-'+n:'발표 지남')+'</b>':'<span class="org">날짜를 넣으면 전날·당일에 알려줘요</span>')+'</div>'}
 h+='<div class="act">'+(it.link?'<a class="btn" href="'+esc(it.link)+'" target="_blank" rel="noopener">원문</a>':'')+
  (ap?'<button class="btn" data-s="">신청 취소</button>':'<button class="btn pri" data-s="applied">신청했어요</button>')+
  (it.status==='star'?'<button class="btn" data-s="">★ 해제</button>':ap?'':'<button class="btn" data-s="star">★ 관심</button>')+
  (it.status==='skip'?'<button class="btn" data-s="">다시 보기</button>':ap?'':'<button class="btn" data-s="skip">관심없음</button>')+'</div></div>';
 return h}
function render(){
 ['personal','biz','contest'].forEach(function(c){document.getElementById('n-'+c).textContent=D.items.filter(function(i){return i.cat===c&&i.status!=='skip'}).length});
 document.getElementById('last').textContent=D.last?'마지막 새로고침 '+D.last.split(' · ')[0]+' · 매일 아침 7시':'';
 var L=D.items.filter(function(i){return i.cat===C});
 if(F==='skip')L=L.filter(function(i){return i.status==='skip'});else L=L.filter(function(i){return i.status!=='skip'});
 if(F==='star')L=L.filter(function(i){return i.status==='star'});if(F==='applied')L=L.filter(function(i){return i.status==='applied'});
 if(F==='soon')L=L.filter(function(i){var n=days(i.end);return n!=null&&n>=0&&n<=7&&i.status!=='applied'});
 var key=function(i){var n=days(i.end);return n==null?9999:n};
 var ap=L.filter(function(i){return i.status==='applied'}).sort(function(a,b){return (a.resultDate||'9').localeCompare(b.resultDate||'9')});
 var rest=L.filter(function(i){return i.status!=='applied'}).sort(function(a,b){return (b.status==='star')-(a.status==='star')||key(a)-key(b)});
 var h='';if(ap.length)h+='<h2>신청한 것 · '+ap.length+'</h2>'+ap.map(card).join('');
 if(rest.length)h+=(ap.length?'<h2>모집 중 · '+rest.length+'</h2>':'')+rest.map(card).join('');
 document.getElementById('main').innerHTML=h||'<div class="empty">'+(F==='all'?'지금은 '+SRC[C]+' 공고가 없어요':'해당하는 공고가 없어요')+'</div>'}
function find(id){return D.items.filter(function(i){return i.id===id})[0]}
function save(id,patch){var it=find(id);Object.keys(patch).forEach(function(k){it[k]=patch[k]});
 if(patch.status==='applied'&&!it.resultDate)it.resultDate='';render();
 google.script.run.withSuccessHandler(function(r){if(r){Object.assign(it,r);render()}}).withFailureHandler(function(e){alert('저장 실패: '+e.message)}).setSupport(K,id,patch)}
document.getElementById('seg').onclick=function(e){var b=e.target.closest('button');if(!b)return;C=b.dataset.c;[].forEach.call(this.children,function(x){x.classList.toggle('on',x===b)});render();scrollTo(0,0)};
document.getElementById('tools').onclick=function(e){var b=e.target.closest('button');if(!b)return;F=b.dataset.f;[].forEach.call(this.children,function(x){x.classList.toggle('on',x===b)});render()};
document.getElementById('main').onclick=function(e){var b=e.target.closest('[data-s]');if(!b)return;var id=b.closest('.card').dataset.id;save(id,{status:b.dataset.s})};
document.getElementById('main').onchange=function(e){if(!e.target.hasAttribute('data-rd'))return;save(e.target.closest('.card').dataset.id,{resultDate:e.target.value})};
render();
</script></body></html>`;
