# 누구나 키오스크 도우미 (hondi)

낯선 키오스크 앞에서 막막한 **누구나**(외국인·어르신·시각장애인·어린이)가
**사진·말·버튼 + 음성·다국어 + 큰글씨/큰소리**로 도움받아 주문·발권·민원을
혼자 끝내도록 돕는 AI 도우미. (해커톤 4팀 징검다리 / 다문화 × 배리어프리)

대표 페르소나: 베트남 28세 외국인 근로자. 같은 설계가 어르신·시각장애인·어린이도 커버.

---

## 빠르게 실행

```bash
# 1) Ollama 설치 후 비전 모델 받기 (사진→메뉴 읽기용)
ollama pull llava            # 또는 llama3.2-vision / qwen2.5vl

# 2) 앱 실행 (Java 25 필요)
./gradlew bootRun

# 3) 브라우저
#   도우미 앱     : http://localhost:8080/
#   데모 키오스크 : http://localhost:8080/demo/cafe-jingdari
#                   /demo/hospital-univ , /demo/gov-dong
```

> **Ollama 없이 데모만 돌리려면** `application.properties` 에서
> `kiosk.ai.provider=mock` 으로 두면 됨 → 화면읽기/번역은 0단계 DB·사전 폴백으로 동작
> (가짜 키오스크 시연은 AI 없이도 끝까지 굴러감).

---

## 설계(0~4단계) ↔ 코드 매핑

| 단계 | 내용 | 구현 |
|---|---|---|
| **0. DB** | 현장 수집한 몇 곳만 메모리 DB로 | `data/kiosks.json` + `KioskRepository` |
| **1. 진입/언어** | 국기 탭·음성 자동감지·사진·대화·버튼 | `index.html`, `app.js`, `Language` |
| **2. 눈높이 대화** | 사용자 언어로 좁혀가기 + 자유발화 이해 | `ConversationService`, `RuleEngine`, `VisionService` |
| **3. 버튼 가이드** | "파란 버튼 누르세요" + 큰글씨/큰소리 | `KioskScreen.guides`, `GuideStep`, `app.css(.big)` |
| **4. 완료** | 결제 따라하기 / 직원결제 / [추후]QR | `ChatResponse.done+summary` |

### AI와 규칙의 분리 (원칙)
- **AI(Ollama)** = ① 모르는 화면 사진 읽기 ② 자유 발화 이해 ③ 다국어 번역 → `AiService`
- **규칙(if-else)** = 정해진 메뉴 좁혀가기(단/쓴, 커피/음료) → `RuleEngine` (공짜·인터넷 사고 없음)
- Ollama 가 꺼져 있으면 자동으로 규칙/사전 폴백 → **데모가 죽지 않음**

### 책임 있는 AI
- 제보 사진의 카드번호·주민번호 텍스트 마스킹: `PrivacyMaskingService`
- 이미지 얼굴/번호 블러는 `maskImage()` 훅에 추후 연동

---

## 지원 언어
한국어 · English · Tiếng Việt · 中文 · 日本語 (`Language` enum, `i18n.js`, `i18n-menu.json`)
언어 추가는 enum + 사전/프롬프트만 늘리면 됨(저비용).

## API
- `POST /api/chat` — 한 턴 대화(무상태, brandId/screenId를 프론트가 보유)
- `POST /api/analyze` — 사진(multipart) 분석 → 메뉴 읽기
- `POST /api/translate` — 임의 텍스트 번역
- `GET  /api/kiosks`, `/api/kiosks/{brandId}`, `/api/languages`

---

## 추후(주석으로 자리 잡아둠)
- **OpenAI / Claude**: `build.gradle` starter + `AiService`/`application.properties` 주석 해제.
  Claude·OpenAI 둘 다 같은 프롬프트로 화면인식 비교 후 더 나은 쪽을 기본값으로.
- **MariaDB 벡터스토어(RAG)**: `build.gradle` + DB 설정 주석 해제 → 키오스크 화면흐름 검색.
- **QR 자동주문 / 브랜드 제휴 / 크라우드소싱 제보**: 0단계 DB 확장 경로.
