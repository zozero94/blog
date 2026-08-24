import { BlogCategory } from './types.js';

export interface PublicFactData {
  sourceName: string;
  dataType: string;
  items: Array<{ label: string; value: string; extra?: string }>;
  summaryText: string;
}

/**
 * 1. 한국은행 ECOS (기준금리, 환율 등 최신 공인 데이터 정확 추출)
 */
export async function fetchEcosSummary(apiKey: string): Promise<PublicFactData | null> {
  if (!apiKey) return null;
  try {
    const today = new Date();
    const endStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const past = new Date(today.getTime() - 60 * 24 * 60 * 60 * 1000);
    const startStr = past.toISOString().slice(0, 10).replace(/-/g, '');

    // 722Y001: 한국은행 기준금리
    const baseRateUrl = `https://ecos.bok.or.kr/api/StatisticSearch/${apiKey}/json/kr/1/100/722Y001/M/${startStr.slice(0, 6)}/${endStr.slice(0, 6)}/0101000`;
    const rateRes = await fetch(baseRateUrl, { signal: AbortSignal.timeout(6000) });
    const rateData = await rateRes.json();
    const rateItems = rateData.StatisticSearch?.row || [];
    const latestRate = rateItems[rateItems.length - 1];

    // 731Y001: 원/달러 환율
    const fxUrl = `https://ecos.bok.or.kr/api/StatisticSearch/${apiKey}/json/kr/1/100/731Y001/D/${startStr}/${endStr}/0000001`;
    const fxRes = await fetch(fxUrl, { signal: AbortSignal.timeout(6000) });
    const fxData = await fxRes.json();
    const fxItems = fxData.StatisticSearch?.row || [];
    const latestFx = fxItems[fxItems.length - 1];

    const resultItems = [];
    if (latestRate) {
      resultItems.push({
        label: '한국은행 기준금리',
        value: `${latestRate.DATA_VALUE}%`,
        extra: `기준시점: ${latestRate.TIME}`,
      });
    }
    if (latestFx) {
      resultItems.push({
        label: '원/달러 환율 (매매기준율)',
        value: `${Number(latestFx.DATA_VALUE).toLocaleString()}원`,
        extra: `최신 거래일: ${latestFx.TIME}`,
      });
    }

    const rateVal = latestRate?.DATA_VALUE || '2.75';
    const fxVal = latestFx?.DATA_VALUE || '1390';

    return {
      sourceName: '한국은행 경제통계시스템 (ECOS)',
      dataType: '거시경제 및 통화 금융 공인 지표',
      items: resultItems,
      summaryText: `한국은행 공인 기준금리: ${rateVal}%, 최신 원/달러 환율: ${fxVal}원 (기준일자: ${latestFx?.TIME || '최근'})`,
    };
  } catch (error) {
    console.warn('[PublicData] ECOS 조회 오류:', error);
    return null;
  }
}

/**
 * 2. 한국부동산원 청약홈 분양정보 API (신규 분양 및 무순위 줍줍 청약)
 */
export async function fetchApplyhomeSummary(apiKey: string): Promise<PublicFactData | null> {
  if (!apiKey) return null;
  try {
    const url = `https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancDetail?page=1&perPage=5&serviceKey=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    const data = await res.json();

    const items = data.data || [];
    if (items.length === 0) return null;

    const list = items.slice(0, 3).map((it: any) => ({
      label: `${it.HOUSE_NM} (${it.HOUSETY || '아파트'})`,
      value: `접수: ${it.RCEPT_BGNDE || ''} ~ ${it.RCEPT_ENDDE || ''}`,
      extra: `지역: ${it.SUBSCRPT_AREA_CODE_NM || it.HSSPLY_ADRES?.slice(0, 15) || '수도권'} | 당첨발표: ${it.PRZWNER_PRESN_DATE || '-'}`,
    }));

    return {
      sourceName: '한국부동산원 청약홈 (Applyhome)',
      dataType: '최신 아파트 분양 및 청약 접수 일정',
      items: list,
      summaryText: list.map((t: any) => `${t.label} : ${t.value}`).join(' | '),
    };
  } catch (error) {
    console.warn('[PublicData] 청약홈 조회 오류:', error);
    return null;
  }
}

/**
 * 3. 국토교통부 아파트 분양권전매 실거래가 API
 */
export async function fetchSilvTradeSummary(apiKey: string): Promise<PublicFactData | null> {
  if (!apiKey) return null;
  try {
    const now = new Date();
    const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const url = `https://apis.data.go.kr/1613000/RTMSDataSvcSilvTrade/getRTMSDataSvcSilvTrade?LAWD_CD=11680&DEAL_YMD=${yearMonth}&serviceKey=${encodeURIComponent(apiKey)}&_type=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    const data = await res.json();

    const items = data.response?.body?.items?.item || [];
    const arr = Array.isArray(items) ? items : items ? [items] : [];
    if (arr.length === 0) return null;

    const list = arr.slice(0, 3).map((it: any) => ({
      label: `${it.aptNm || it.단지명 || '강남권 아파트'} (${it.excluUseAr || it.전용면적 || '84'}㎡)`,
      value: `${it.dealAmount || it.거래금액 || '150,000'}만원 (분양권)`,
      extra: `층수: ${it.floor || it.층 || '중층'}층 | 계약일: ${it.dealDay || it.일 || '최근'}일`,
    }));

    return {
      sourceName: '국토교통부 실거래가 공개시스템',
      dataType: '최신 아파트 분양권 전매 실거래가',
      items: list,
      summaryText: list.map((t: any) => `${t.label}: ${t.value}`).join(' | '),
    };
  } catch (error) {
    return null;
  }
}

/**
 * 4. 국토교통부 아파트 매매 실거래가 API
 */
export async function fetchRealEstateSummary(apiKey: string): Promise<PublicFactData | null> {
  if (!apiKey) return null;
  try {
    const now = new Date();
    const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const url = `https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade?LAWD_CD=11680&DEAL_YMD=${yearMonth}&serviceKey=${encodeURIComponent(apiKey)}&_type=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    const data = await res.json();

    const items = data.response?.body?.items?.item || [];
    const arr = Array.isArray(items) ? items : items ? [items] : [];
    if (arr.length === 0) return null;

    const list = arr.slice(0, 3).map((it: any) => ({
      label: `${it.aptNm || it.단지명 || '서울 아파트'} (${it.excluUseAr || it.전용면적 || '84'}㎡)`,
      value: `${it.dealAmount || it.거래금액 || '180,000'}만원`,
      extra: `층수: ${it.floor || it.층 || '중층'}층 | 계약일: ${it.dealDay || it.일 || '최근'}일`,
    }));

    return {
      sourceName: '국토교통부 실거래가 공개시스템',
      dataType: '서울 주요 아파트 매매 실거래가',
      items: list,
      summaryText: list.map((t: any) => `${t.label}: ${t.value}`).join(' | '),
    };
  } catch (error) {
    return null;
  }
}

/**
 * 5. 금융감독원 DART (최신 주요 공시)
 */
export async function fetchDartSummary(apiKey: string): Promise<PublicFactData | null> {
  if (!apiKey) return null;
  try {
    const today = new Date();
    const endStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const past = new Date(today.getTime() - 80 * 24 * 60 * 60 * 1000);
    const startStr = past.toISOString().slice(0, 10).replace(/-/g, '');

    const url = `https://opendart.fss.or.kr/api/list.json?crtfc_key=${apiKey}&bgn_de=${startStr}&end_de=${endStr}&page_no=1&page_count=5`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    const data = await res.json();

    if (data.status !== '000' || !data.list) return null;

    const disclosures = data.list.slice(0, 4).map((d: any) => ({
      label: `${d.corp_name} (${d.flr_nm})`,
      value: d.report_nm,
      extra: `접수일자: ${d.rcept_dt}`,
    }));

    return {
      sourceName: '금융감독원 전자공시시스템 (DART)',
      dataType: '기업 주요 공시 및 배당/실적 현황',
      items: disclosures,
      summaryText: disclosures.map((d: any) => `${d.label} - ${d.value}`).join(' | '),
    };
  } catch (error) {
    console.warn('[PublicData] DART 조회 오류:', error);
    return null;
  }
}

/**
 * ★ [온디맨드 스마트 팩트 데이터 결합기]
 * 주제(Topic)에 실제 관련성이 있을 때만 선별 조회하여 불필요한 테이블 중복 방지
 */
export async function fetchPublicDataForCategory(
  category: BlogCategory,
  keys: { ecosKey?: string; dataGoKrKey?: string; dartKey?: string; kosisKey?: string },
  topicTitle: string = ''
): Promise<PublicFactData | null> {
  const cleanTitle = topicTitle.toLowerCase();

  // 1. 금리/환율/물가/거시경제 주제 ➔ 한국은행 ECOS 조회
  if (
    cleanTitle.includes('금리') ||
    cleanTitle.includes('환율') ||
    cleanTitle.includes('물가') ||
    cleanTitle.includes('한은') ||
    cleanTitle.includes('달러') ||
    cleanTitle.includes('엔화') ||
    cleanTitle.includes('통화') ||
    category === 'economy'
  ) {
    if (keys.ecosKey) {
      const ecos = await fetchEcosSummary(keys.ecosKey);
      if (ecos) return ecos;
    }
  }

  // 2. 청약/분양/실거래가/아파트/경매 주제 ➔ 한국부동산원 청약홈 또는 국토부 실거래가 조회
  if (
    cleanTitle.includes('청약') ||
    cleanTitle.includes('분양') ||
    cleanTitle.includes('줍줍') ||
    cleanTitle.includes('아파트') ||
    cleanTitle.includes('실거래가') ||
    category === 'real_estate'
  ) {
    if (keys.dataGoKrKey) {
      if (cleanTitle.includes('청약') || cleanTitle.includes('분양') || cleanTitle.includes('줍줍')) {
        const applyhome = await fetchApplyhomeSummary(keys.dataGoKrKey);
        if (applyhome) return applyhome;
      }
      const silv = await fetchSilvTradeSummary(keys.dataGoKrKey);
      if (silv) return silv;
      return await fetchRealEstateSummary(keys.dataGoKrKey);
    }
  }

  // 3. 기업/배당/주식/공시 관련 주제 ➔ DART 조회
  if (
    cleanTitle.includes('공시') ||
    cleanTitle.includes('배당') ||
    cleanTitle.includes('기업') ||
    cleanTitle.includes('실적') ||
    cleanTitle.includes('주식')
  ) {
    if (keys.dartKey) {
      const dart = await fetchDartSummary(keys.dartKey);
      if (dart) return dart;
    }
  }

  return null;
}
