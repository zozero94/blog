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
    const rateRes = await fetch(baseRateUrl);
    const rateData = await rateRes.json();
    const rateItems = rateData.StatisticSearch?.row || [];
    const latestRate = rateItems[rateItems.length - 1];

    // 731Y001: 원/달러 환율
    const fxUrl = `https://ecos.bok.or.kr/api/StatisticSearch/${apiKey}/json/kr/1/100/731Y001/D/${startStr}/${endStr}/0000001`;
    const fxRes = await fetch(fxUrl);
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
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
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
    const encKey = encodeURIComponent(apiKey);
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = String(now.getMonth() + 1).padStart(2, '0');
    const ymd = `${curYear}${curMonth}`;

    // 강동구(올림픽파크포레온 등) 또는 강남구
    const url = `https://apis.data.go.kr/1613000/RTMSDataSvcSilvTrade/getRTMSDataSvcSilvTrade?serviceKey=${encKey}&LAWD_CD=11740&DEAL_YMD=${ymd}&_type=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const data = await res.json();

    let items = data.response?.body?.items?.item || [];
    if (!Array.isArray(items)) items = items ? [items] : [];

    if (items.length === 0) {
      const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevYmd = `${prevDate.getFullYear()}${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
      const prevUrl = `https://apis.data.go.kr/1613000/RTMSDataSvcSilvTrade/getRTMSDataSvcSilvTrade?serviceKey=${encKey}&LAWD_CD=11740&DEAL_YMD=${prevYmd}&_type=json`;
      const prevRes = await fetch(prevUrl, { signal: AbortSignal.timeout(5000) });
      const prevData = await prevRes.json();
      items = prevData.response?.body?.items?.item || [];
      if (!Array.isArray(items)) items = items ? [items] : [];
    }

    if (items.length === 0) return null;

    const list = items.slice(0, 3).map((it: any) => ({
      label: `[분양권] ${it.aptNm} (전용 ${Math.round(Number(it.excluUseAr || 84))}㎡)`,
      value: `${it.dealAmount?.trim()}만원 (층수: ${it.floor}층)`,
      extra: `계약일: ${it.dealYear}.${it.dealMonth}.${it.dealDay}`,
    }));

    return {
      sourceName: '국토교통부 분양권전매 실거래가',
      dataType: '아파트 입주권 및 분양권 실제 체결가',
      items: list,
      summaryText: list.map((t: any) => `${t.label} : ${t.value}`).join(' | '),
    };
  } catch (error) {
    console.warn('[PublicData] 분양권 전매 조회 오류:', error);
    return null;
  }
}

/**
 * 4. 국토교통부 아파트 매매 실거래가 (기존 아파트)
 */
export async function fetchRealEstateSummary(apiKey: string): Promise<PublicFactData | null> {
  if (!apiKey) return null;
  try {
    const encKey = encodeURIComponent(apiKey);
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = String(now.getMonth() + 1).padStart(2, '0');
    const ymd = `${curYear}${curMonth}`;

    const url = `https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade?serviceKey=${encKey}&LAWD_CD=11680&DEAL_YMD=${ymd}&_type=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const data = await res.json();

    let items = data.response?.body?.items?.item || [];
    if (!Array.isArray(items)) items = items ? [items] : [];

    if (items.length === 0) {
      const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevYmd = `${prevDate.getFullYear()}${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
      const prevUrl = `https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade?serviceKey=${encKey}&LAWD_CD=11680&DEAL_YMD=${prevYmd}&_type=json`;
      const prevRes = await fetch(prevUrl, { signal: AbortSignal.timeout(5000) });
      const prevData = await prevRes.json();
      items = prevData.response?.body?.items?.item || [];
      if (!Array.isArray(items)) items = items ? [items] : [];
    }

    const tradeList = items.slice(0, 4).map((it: any) => ({
      label: `${it.aptNm} (전용 ${Math.round(Number(it.excluUseAr || 84))}㎡)`,
      value: `${it.dealAmount?.trim()}만원 (층수: ${it.floor}층)`,
      extra: `계약일: ${it.dealYear}.${it.dealMonth}.${it.dealDay}`,
    }));

    return {
      sourceName: '국토교통부 실거래가 공개시스템',
      dataType: '최근 아파트 실제 체결 매매가',
      items: tradeList,
      summaryText: tradeList.map((t: any) => `${t.label} : ${t.value}`).join(' | '),
    };
  } catch (error) {
    console.warn('[PublicData] 국토교통부 실거래가 조회 오류:', error);
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
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
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
 * 카테고리별 최적 공공데이터 가져오기 (청약홈, 분양권, 실거래가, 한은, DART)
 */
export async function fetchPublicDataForCategory(
  category: BlogCategory,
  keys: { ecosKey?: string; dataGoKrKey?: string; dartKey?: string; kosisKey?: string }
): Promise<PublicFactData | null> {
  if (category === 'real_estate' && keys.dataGoKrKey) {
    // 부동산: 1. 청약홈 분양정보 -> 2. 분양권 전매 실거래가 -> 3. 아파트 매매 실거래가
    const applyhome = await fetchApplyhomeSummary(keys.dataGoKrKey);
    if (applyhome) return applyhome;

    const silv = await fetchSilvTradeSummary(keys.dataGoKrKey);
    if (silv) return silv;

    return await fetchRealEstateSummary(keys.dataGoKrKey);
  } else if (category === 'economy' && keys.ecosKey) {
    return await fetchEcosSummary(keys.ecosKey);
  } else if (category === 'finance') {
    const dart = keys.dartKey ? await fetchDartSummary(keys.dartKey) : null;
    return dart || (keys.ecosKey ? await fetchEcosSummary(keys.ecosKey) : null);
  }
  return null;
}
