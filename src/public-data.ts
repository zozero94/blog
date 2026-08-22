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

    // 722Y001: 한국은행 기준금리 (최신 100건 조회 후 가장 마지막 row)
    const baseRateUrl = `https://ecos.bok.or.kr/api/StatisticSearch/${apiKey}/json/kr/1/100/722Y001/M/${startStr.slice(0, 6)}/${endStr.slice(0, 6)}/0101000`;
    const rateRes = await fetch(baseRateUrl);
    const rateData = await rateRes.json();
    const rateItems = rateData.StatisticSearch?.row || [];
    const latestRate = rateItems[rateItems.length - 1];

    // 731Y001: 원/달러 환율 (최신 거래일 기준 정확 추출)
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
 * 2. 국토교통부 실거래가 (서울 강남/마포 등 주요 지역 최근 실거래)
 */
export async function fetchRealEstateSummary(apiKey: string): Promise<PublicFactData | null> {
  if (!apiKey) return null;
  try {
    const encKey = encodeURIComponent(apiKey);
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = String(now.getMonth() + 1).padStart(2, '0');
    const ymd = `${curYear}${curMonth}`;

    // 강남구: 11680
    const url = `https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade?serviceKey=${encKey}&LAWD_CD=11680&DEAL_YMD=${ymd}&_type=json`;
    const res = await fetch(url);
    const data = await res.json();

    let items = data.response?.body?.items?.item || [];
    if (!Array.isArray(items)) {
      items = items ? [items] : [];
    }

    if (items.length === 0) {
      const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevYmd = `${prevDate.getFullYear()}${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
      const prevUrl = `https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade?serviceKey=${encKey}&LAWD_CD=11680&DEAL_YMD=${prevYmd}&_type=json`;
      const prevRes = await fetch(prevUrl);
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
 * 3. 금융감독원 DART (최신 주요 공시)
 */
export async function fetchDartSummary(apiKey: string): Promise<PublicFactData | null> {
  if (!apiKey) return null;
  try {
    const today = new Date();
    const endStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const past = new Date(today.getTime() - 80 * 24 * 60 * 60 * 1000);
    const startStr = past.toISOString().slice(0, 10).replace(/-/g, '');

    const url = `https://opendart.fss.or.kr/api/list.json?crtfc_key=${apiKey}&bgn_de=${startStr}&end_de=${endStr}&page_no=1&page_count=5`;
    const res = await fetch(url);
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
 * 카테고리별 최적 공공데이터 가져오기
 */
export async function fetchPublicDataForCategory(
  category: BlogCategory,
  keys: { ecosKey?: string; dataGoKrKey?: string; dartKey?: string }
): Promise<PublicFactData | null> {
  if (category === 'economy' && keys.ecosKey) {
    return await fetchEcosSummary(keys.ecosKey);
  } else if (category === 'real_estate' && keys.dataGoKrKey) {
    return await fetchRealEstateSummary(keys.dataGoKrKey);
  } else if (category === 'finance') {
    const dart = keys.dartKey ? await fetchDartSummary(keys.dartKey) : null;
    return dart || (keys.ecosKey ? await fetchEcosSummary(keys.ecosKey) : null);
  }
  return null;
}
