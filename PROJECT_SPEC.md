# AI 블로그 자동화 & 애드센스 수익화 파이프라인 명세서

## 1. 프로젝트 개요
- **목적**: 시사 이슈, 부동산 정책/실거래가, 경제/금융 정보를 AI(Gemini)로 요약·분석하여 워드프레스에 자동 포스팅하고 애드센스로 수익화
- **운영 주기**: 매일 3회 (09:00 시사·경제 / 12:00 부동산 / 16:00 재테크·금융)
- **아키텍처**: GitHub Actions (크론 스케줄러) + Vercel (텔레그램 인라인 승인 웹훅) + Gemini API + WordPress REST API

## 2. 연동 완료 인프라 및 자격증명
- **워드프레스 블로그**: `https://zozero94.wordpress.com` (Blog ID: `256898514`)
- **API 연동 상태**: 워드프레스 REST API 테스트 포스팅 & 삭제 검증 완료
- **텔레그램 봇**: `@zozero94bot` (Chat ID: `7137542168`, 메시지 발송 검증 완료)
- **AI 엔진**: Google Gemini API Key 발급 및 .env 등록 완료
- **환경변수 파일**: `/Users/kakao/sideproject/blog/.env`

## 3. 워크플로우
1. **GitHub Actions**: 09시/12시/16시 크론 트리거 -> 뉴스/데이터 수집 -> Gemini SEO 글 생성 -> 워드프레스 임시글(Draft) 등록
2. **텔레그램 승인 알림**: 모바일로 요약본 및 `[✅ 즉시 발행]` `[❌ 삭제]` 버튼 전송
3. **Vercel Webhook**: 사용자가 버튼 클릭 시 Draft -> Publish 상태로 즉시 변경
