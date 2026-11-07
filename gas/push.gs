/* ───────────── 앱 푸시 알림 (Firebase) ───────────── */

const FCM_PROJECT = 'godsaeng-233c4';
const D_HEAD = ['id', 'token', 'ua', 'created', 'lastOk'];

// sendMorningBrief → news.gs

function sendDueAlerts() {
  const t = tbl_(CONFIG.EVENT_SHEET, E_HEAD);
  const now = Date.now(), limit = now + CONFIG.ALERT_HOURS_BEFORE * 3600e3;
  const hits = t.rows().filter(r => r.id && !truthy_(r.deleted) && !truthy_(r.allDay) && r.notified !== 'Y' && (() => {
    const s = new Date(r.start).getTime(); return s > now && s <= limit;
  })());
  if (!hits.length) return;
  sendPush_('⏰ 곧 시작하는 일정', hits.map(r => '• ' + fmt_(new Date(r.start), 'HH:mm') + ' ' + r.title + (r.location ? ' (' + r.location + ')' : '')).join('\n'));
  hits.forEach(r => { r.notified = 'Y'; t.put(r); });
}

/** 편집기에서 한 번 실행: 앱 열쇠(APP_KEY) 만들기 + 카카오 설정 지우기. 실행 로그에 열쇠가 나옵니다. */
function setupApp() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('APP_KEY')) props.setProperty('APP_KEY', Utilities.getUuid().replace(/-/g, ''));
  ['KAKAO_REST_KEY', 'KAKAO_CLIENT_SECRET', 'KAKAO_REDIRECT_URI', 'KAKAO_ACCESS', 'KAKAO_ACCESS_EXP', 'KAKAO_REFRESH']
    .forEach(k => props.deleteProperty(k));
  tbl_('Devices', D_HEAD);
  Logger.log('APP_KEY = ' + props.getProperty('APP_KEY'));
}

/** 편집기에서 실행: 등록된 휴대폰으로 테스트 알림 */
function testPush() { Logger.log(sendPush_('🔔 갓생 앱 테스트', '알림이 잘 오고 있어요!')); }

function sendPush_(title, body, link) {
  const t = tbl_('Devices', D_HEAD);
  const devs = t.rows().filter(r => r.id && r.token);
  if (!devs.length) return '등록된 기기 없음';
  const token = ScriptApp.getOAuthToken();
  const out = [];
  devs.forEach(d => {
    const msg = {
      message: {
        token: d.token,
        data: { title: String(title), body: String(body || ''), link: String(link || '') },
        webpush: { headers: { Urgency: 'high', TTL: '43200' } },
      },
    };
    const res = UrlFetchApp.fetch('https://fcm.googleapis.com/v1/projects/' + FCM_PROJECT + '/messages:send', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + token, 'x-goog-user-project': FCM_PROJECT },
      payload: JSON.stringify(msg),
    });
    const code = res.getResponseCode(), text = res.getContentText();
    if (code === 200) { d.lastOk = fmt_(new Date(), 'yyyy-MM-dd HH:mm'); t.put(d); out.push('ok'); }
    else if (code === 404 || /UNREGISTERED/.test(text)) { t.remove(d.id); out.push('removed'); }
    else { console.warn('푸시 실패 ' + code + ': ' + text); out.push('fail ' + code + ' ' + text.slice(0, 300)); }
  });
  return out.join(' | ');
}

/* 앱(GitHub Pages)에서 부르는 API: ?api=register&k=열쇠&token=... */
function api_(p) {
  const json = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
  if (!keyOk_(p.k)) return json({ ok: false, error: 'key' });
  if (p.api === 'ping') return json({ ok: true });
  if (p.api === 'register' && p.token) {
    const t = tbl_('Devices', D_HEAD);
    const ex = t.rows().find(r => r.token === p.token);
    if (!ex) t.append({ id: Utilities.getUuid(), token: p.token, ua: String(p.ua || '').slice(0, 120), created: fmt_(new Date(), 'yyyy-MM-dd HH:mm') });
    return json({ ok: true, sent: sendPush_('✅ 알림 연결 완료', '이제 이 기기로 브리핑과 일정 알림이 와요.') });
  }
  return json({ ok: false, error: 'unknown' });
}

function keyOk_(k) { const key = prop_('APP_KEY'); return !!key && k === key; }

