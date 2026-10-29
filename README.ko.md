<div align="center">
  <img src="public/party/assets/wordmark-v3-ink.png" alt="Trick or Take" width="420">
  <p><strong>사탕을 가져가세요. 들키지는 마세요.</strong></p>
  <p>브라우저에서 즐기는 작은 핼러윈 사탕 훔치기 게임입니다. 혼자 또는 친구들과 음성 채팅을 하며 플레이하세요.</p>
  <p><a href="https://trickortake.com/">지금 플레이</a> · <a href="docs/deployment.md">배포 가이드</a></p>
</div>

[English](README.md) · [简体中文](README.zh-CN.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [日本語](README.ja.md) · **한국어** · [Português (Brasil)](README.pt-BR.md)

[![Agora RTC](https://img.shields.io/badge/Agora-RTC-0099FF)](https://www.agora.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-orange.svg)](LICENSE)
![Node.js 22.13+](https://img.shields.io/badge/Node.js-22.13%2B-339933)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers%20%2B%20D1-F38020)

[![Trick or Take](public/party/assets/og-home-v3-en.png)](https://trickortake.com/)

## 게임 소개

릴리는 주방에서 바쁘게 일하고 있어요. 사탕은 바로 눈앞에 있죠. 하나쯤 없어져도 모르겠죠?

길게 누르면 사탕을 훔칩니다. 손을 떼면 사탕을 숨기고 아무 일도 없었다는 표정을 지어요. 릴리가 돌아봤을 때도 계속 훔치고 있다면 빗자루에 맞고 **사탕을 모두 잃습니다**. 제한 시간은 60초. 얼마나 많이 지킬 수 있을까요?

유령, 호박, 박쥐 고양이 중 하나를 선택하세요. 혼자 도전하거나 친구에게 6자리 방 코드를 보내 함께 플레이할 수 있습니다. 음성 채팅은 선택 사항입니다.

| 기능 | 내용 |
| --- | --- |
| 혼자 하기 | 로컬 최고 기록, 일시 정지, 합성 배경 음악 |
| 멀티플레이 | 2~6명, 6자리 방 코드, 준비 확인, 재대결 |
| 음성 채팅 | Agora RTC 마이크 통화, 음소거, 재연결 |
| 방 업데이트 | Agora RTM 알림과 주기적인 서버 조회 방식 |
| 하나의 공통 도전 | 무작위 대기 시간과 명확한 경고, 모두에게 같은 규칙 적용 |
| 순위표 | 하나의 통합 순위표. 이름과 점수 공개는 플레이어가 선택 |
| 공유 | 검증된 결과 링크와 다운로드 가능한 점수 카드 |
| 모바일 | 터치 조작, 반응형 화면, 홈 화면 아이콘 |
| 게임 언어 | 12개 언어의 화면과 메타데이터. OG 이미지는 영어와 중국어 간체 제공 |

## 플레이 방법

1. 캐릭터를 선택하세요. 멀티플레이에서는 방을 만들거나 참가한 뒤 모두 준비될 때까지 기다립니다.
2. 큰 버튼, 게임 화면 또는 **스페이스 키**를 길게 누르세요. 오래 누를수록 사탕을 더 빨리 가져갑니다.
3. 릴리가 돌아보기 시작하면 손을 떼세요. 캐릭터가 즉시 아무 일도 없었다는 표정으로 돌아갑니다.
4. 들키면 사탕 수가 0이 됩니다. 잠깐 기절한 뒤 다시 시도할 수 있어요.
5. 시간이 끝나면 손에 든 사탕도 점수에 포함됩니다. 가장 많이 모은 사람이 이기며, 점수가 같으면 공동 순위입니다.

한 판은 60초입니다. 릴리는 짧고 긴 대기 시간을 섞고, 돌아보기 전 0.90–1.35초 동안 경고합니다. 난이도 선택은 없습니다.

타이밍은 매번 달라집니다. 서버는 경고가 시작되기 전까지 다음 회전 시점을 공개하지 않습니다. 멀티플레이에서는 대화를 방해하지 않도록 배경 음악을 끕니다.

## 로컬 실행

**Node.js 22.13 이상**과 npm이 필요합니다. 로컬 게임과 방 서버는 Cloudflare 계정이나 Agora 인증 정보 없이 실행할 수 있습니다.

```bash
git clone https://github.com/zicojiao/trick-or-take.git
cd trick-or-take
npm ci
npm run db:migrate
npm run dev
```

**http://localhost:5173**을 여세요. 다른 탭에서 같은 방에 참가하고 두 플레이어를 준비 상태로 설정하면 멀티플레이 흐름을 확인할 수 있습니다. 실제 통화 품질은 두 기기로 확인하세요.

`wrangler.json`의 0으로 채운 데이터베이스 ID는 로컬 개발용 임시 값입니다. 배포하기 전에 자신의 D1 데이터베이스 ID로 바꾸세요.

### Agora RTC와 RTM 활성화

```bash
cp .dev.vars.example .dev.vars
```

`.dev.vars`에 `AGORA_APP_ID`와 `AGORA_APP_CERTIFICATE`를 입력하고 개발 서버를 다시 시작하세요. Agora 프로젝트에서 RTC와 Signaling/RTM을 활성화해야 합니다. 서버는 인증된 방 참가자에게 단기 토큰을 발급하며, App Certificate는 브라우저에 전달하지 않습니다.

각 플레이어는 **Join voice**를 누르고 마이크 사용을 허용해야 합니다. localhost 또는 HTTPS가 필요합니다. 운영 환경 설정은 영어로 작성된 [배포 가이드](docs/deployment.md)를 참고하세요.

### 선택적 분석 기능

분석은 **기본적으로 비활성화**되어 있습니다. 자신의 `POSTHOG_PROJECT_TOKEN`과 `POSTHOG_HOST`를 설정하면 활성화됩니다. `/config.js`는 공개 가능한 이벤트 수집 설정만 제공합니다.

PostHog는 자사 쿠키와 로컬 저장소를 사용합니다. 자동 수집과 세션 녹화는 꺼져 있습니다. 이벤트 URL에서 방 코드, 챌린지 ID, 쿼리 매개변수를 제거하며 플레이어 이름은 전송하지 않습니다. 배포 환경에 맞게 개인정보 안내를 수정하세요.

## 동작 방식

클라이언트는 JavaScript와 Canvas 2D를 사용합니다. Cloudflare Worker가 페이지, 정적 파일, API, OG 이미지를 제공하고 D1이 방과 결과를 저장합니다. Agora RTC는 음성을 전송하고 RTM은 방 변경을 알립니다.

- **공통 규칙 엔진:** `public/party/engine.mjs`를 혼자 하기와 서버에서 함께 사용합니다.
- **서버가 관리하는 상태:** 버전 조건부 업데이트로 동시 명령이 서로 덮어쓰는 것을 방지합니다. RTM 알림이 게임 상태를 결정하지는 않습니다.
- **결과 검증:** 서버가 솔로 입력 기록을 재현하며 멀티플레이 결과는 방 상태에서 가져옵니다.
- **선택적 공개:** 게임이 끝났다고 이름이나 점수가 자동 공개되지는 않습니다. 챌린지 링크에는 이름이 포함되지 않습니다.
- **규칙 버전 관리:** 난이도를 변경한 뒤에도 지원되는 이전 버전의 기록을 검증할 수 있습니다.

영어로 작성된 [아키텍처 설명](docs/architecture.md)에서 자세한 내용을 확인하세요. 검증은 일치하지 않는 점수를 거부하지만 자동 플레이를 완전히 차단하지는 않습니다.

## 폴더 구조

```text
public/party/    게임, Canvas, 입력, 음성, 번역, 이미지
public/          아이콘, 매니페스트, 검색 엔진용 파일
server/          방 API, 토큰, 점수 검증, OG 이미지
worker/          라우팅과 언어별 HTML
drizzle/         D1 마이그레이션
scripts/         아이콘 생성과 검증
tests/           자동 테스트
docs/            영어 배포 및 아키텍처 문서
```

## 라이선스

[MIT](LICENSE)
