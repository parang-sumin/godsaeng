/** 시험: 공고 API 응답 모양 확인 */
function probeSupport() {
  const dk = prop_('DATA_GO_KR_KEY'), bk = prop_('BIZINFO_KEY');
  const enc = encodeURIComponent;
  const show = (name, url) => {
    try {
      const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { Accept: 'application/json' } });
      Logger.log(name + ' ' + r.getResponseCode() + ' ' + r.getContentText().slice(0, 1400).replace(/\s+/g, ' '));
    } catch (e) { Logger.log(name + ' ERR ' + e); }
  };
  Logger.log('keys: data=' + (dk ? dk.length : 0) + ' biz=' + (bk ? bk.length : 0));
  show('BIZ', 'https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do?crtfcKey=' + enc(bk) + '&dataType=json&searchCnt=2&hashtags=' + enc('서울'));
  show('KST', 'https://apis.data.go.kr/B552735/kisedKstartupService01/getAnnouncementInformation01?serviceKey=' + enc(dk) + '&page=1&perPage=2&returnType=json&' + enc('cond[rcrt_prgs_yn::EQ]') + '=Y');
  show('APT', 'https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancDetail?page=1&perPage=2&serviceKey=' + enc(dk));
  show('RENT', 'https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1/getPblPvtRentLttotPblancDetail?page=1&perPage=2&serviceKey=' + enc(dk));
  show('LH', 'https://apis.data.go.kr/B552555/lhLeaseNoticeInfo1/lhLeaseNoticeInfo1?serviceKey=' + enc(dk) + '&PG_SZ=2&PAGE=1&CNP_CD=11&PAN_SS=' + enc('공고중'));
  show('SOCO', 'https://soco.seoul.go.kr/youth/bbs/BMSR00015/list.do?menuNo=400008');
}
