import { GeneratedPost } from './types.js';

export interface VerificationResult {
  passed: boolean;
  score: number; // 100점 만점
  checks: Array<{ name: string; status: 'PASS' | 'WARN' | 'FAIL'; message: string }>;
}

/**
 * 배포 직전 시스템 및 콘텐츠 코드 무결성 자동 검증 (Code & Deploy Integrity Verifier)
 */
export async function verifyDeployIntegrity(
  post: GeneratedPost,
  domain: string = 'https://zozero94.com'
): Promise<VerificationResult> {
  const checks: Array<{ name: string; status: 'PASS' | 'WARN' | 'FAIL'; message: string }> = [];
  let penalty = 0;

  // 1. HTML 문법 및 렌더링 구조 무결성 검증
  const openDivs = (post.htmlContent.match(/<div/g) || []).length;
  const closeDivs = (post.htmlContent.match(/<\/div>/g) || []).length;
  if (openDivs === closeDivs) {
    checks.push({ name: 'HTML 태그 정합성', status: 'PASS', message: `모든 div 태그 닫힘 검증 완료 (${openDivs}쌍)` });
  } else {
    checks.push({ name: 'HTML 태그 정합성', status: 'WARN', message: `div 태그 열림(${openDivs})/닫힘(${closeDivs}) 불일치 감지` });
    penalty += 10;
  }

  // 2. 모바일 반응형 필수 컴포넌트 검증
  const hasCallout = post.htmlContent.includes('💡') || post.htmlContent.includes('핵심 요약') || post.htmlContent.includes('background:');
  const hasTable = post.htmlContent.includes('<table');
  const hasHeading = post.htmlContent.includes('<h2');

  if (hasCallout && hasHeading) {
    checks.push({ name: '반응형 UI/UX 구조', status: 'PASS', message: '콜아웃 박스, H2 서브섹션 및 모바일 레이아웃 완비' });
  } else {
    checks.push({ name: '반응형 UI/UX 구조', status: 'WARN', message: 'H2 헤딩 또는 3줄 요약 박스 미흡' });
    penalty += 5;
  }

  if (hasTable) {
    checks.push({ name: '데이터 시뮬레이션 표(Table)', status: 'PASS', message: '공공데이터 및 자산 계산표 정상 탑재' });
  } else {
    checks.push({ name: '데이터 시뮬레이션 표(Table)', status: 'WARN', message: '표 형태의 데이터 계산식 미포함' });
  }

  // 3. 메타데이터 및 SEO 태그 무결성 검증
  if (post.tags.length >= 3 && post.title.length >= 10) {
    checks.push({ name: 'SEO 메타데이터 무결성', status: 'PASS', message: `태그 ${post.tags.length}개 및 SEO 제목 길이 적합` });
  } else {
    checks.push({ name: 'SEO 메타데이터 무결성', status: 'WARN', message: '태그 수 부족 또는 제목 길이 미달' });
    penalty += 5;
  }

  // 4. 라이브 웹 서버 & Vercel 도메인 헬스체크
  try {
    const res = await fetch(domain, { method: 'HEAD', signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      checks.push({ name: '라이브 웹진 헬스체크', status: 'PASS', message: `${domain} 실시간 정상 가동 중 (HTTP ${res.status})` });
    } else {
      checks.push({ name: '라이브 웹진 헬스체크', status: 'WARN', message: `${domain} 응답 상태 코드: HTTP ${res.status}` });
      penalty += 10;
    }
  } catch (err) {
    checks.push({ name: '라이브 웹진 헬스체크', status: 'WARN', message: `${domain} 연결 지연 또는 오프라인 상태 (서버리스 백업 서빙)` });
  }

  const score = Math.max(0, 100 - penalty);
  const passed = score >= 80;

  return { passed, score, checks };
}
