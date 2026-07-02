package com.jingdari.omong.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jingdari.omong.dto.ConverseResponse;
import com.jingdari.omong.dto.RecognizeResponse;
import com.jingdari.omong.model.KioskSpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 말하기(발화)·사진에서 "어느 가게 키오스크인지"를 AI로 판별한다.
 * 아는 가게 목록은 DB(KioskSpec)에서 불러온다 → 제보로 등록된 가게도 자동 인식 대상.
 * AI 실패 시 텍스트는 이름 키워드 폴백, 사진은 NONE(프론트가 다시 찍기/추후안내).
 */
@Service
public class RecognitionService {

    private static final Logger log = LoggerFactory.getLogger(RecognitionService.class);

    private final AiService ai;
    private final ObjectMapper om;
    private final KioskSpecRepository repo;

    public RecognitionService(AiService ai, ObjectMapper om, KioskSpecRepository repo) {
        this.ai = ai;
        this.om = om;
        this.repo = repo;
    }

    /** 기본 지원 브랜드(DB 없이도 항상 인식). */
    private static final Map<String, String> BASE = new LinkedHashMap<>() {{
        put("paik", "빽다방");
        put("momstouch", "맘스터치");
        put("mcdonalds", "맥도날드");
        put("megacoffee", "메가커피");
    }};

    /** 아는 가게 (id → 표시명) = 기본 4개 + DB(제보 포함). DB가 꺼져 있어도 동작. */
    private Map<String, String> known() {
        Map<String, String> m = new LinkedHashMap<>(BASE);
        try {
            for (KioskSpec k : repo.findAll()) m.put(k.getBrandId(), k.getBrandName());
        } catch (Exception e) {
            log.debug("DB 미접속 — 기본 브랜드만 사용: {}", e.getMessage());
        }
        return m;
    }

    private String knownList(Map<String, String> known) {
        return known.entrySet().stream()
                .map(e -> "- " + e.getKey() + " = " + e.getValue())
                .collect(Collectors.joining("\n"));
    }

    /** 발화/입력 텍스트 → 가게 판별. */
    public RecognizeResponse fromText(String text) {
        if (text == null || text.isBlank()) return RecognizeResponse.none();
        Map<String, String> known = known();
        if (ai.ready()) {
            String system = """
                    너는 사용자가 말한 가게/장소 이름을 아래 '아는 가게 목록'의 id 중 하나로 매칭한다.
                    확실히 하나로 판단되면 그 id를, 아니면 NONE 을 준다.
                    출력은 JSON 하나만: {"brandId":"...","brandName":"..."} (설명 금지)
                    """;
            String user = "아는 가게 목록:\n" + knownList(known)
                    + "\n\n사용자 발화: " + text + "\n일치하는 게 없으면 brandId=NONE.";
            RecognizeResponse r = parse(ai.generate(system, user), known);
            if (r != null) return r;
        }
        return keywordFallback(text, known);
    }

    /** 스마트 대화: 잡담도 자연스럽게, 가게 추측+확인. AI 미설정/실패 시 키워드·기본 응답 폴백. */
    public ConverseResponse converse(String text) {
        if (text == null || text.isBlank()) return new ConverseResponse("", "NONE", null);
        Map<String, String> known = known();
        if (ai.ready()) {
            String system = """
                    너는 '오몽' 키오스크 도우미야. 사용자가 딴 얘기·엉뚱한 말을 해도 짧고 친절하게 자연스럽게 대답해.
                    동시에 사용자가 어떤 가게/키오스크를 쓰려는지 최대한 추측해.
                    - 아는 가게 목록에 있으면 그 id.
                    - 목록엔 없지만 가게/장소로 보이면 brandId="generic" 과 그 이름(brandName).
                    - 전혀 모르면 brandId="NONE".
                    반드시 사용자가 쓴 언어로 대답하고, 가게를 추측했으면 reply에 "○○ 맞을까요?"처럼 확인 질문을 넣어.
                    출력은 JSON 하나만: {"reply":"...","brandId":"...","brandName":"..."} (설명 금지)
                    """;
            String user = "아는 가게 목록:\n" + knownList(known) + "\n\n사용자: " + text;
            ConverseResponse r = parseConverse(ai.generate(system, user), known);
            if (r != null) return r;
        }
        // 폴백: 키워드로 가게 잡기 → 확인 질문, 아니면 부드러운 되묻기
        RecognizeResponse kb = keywordFallback(text, known);
        if (!"NONE".equals(kb.brandId()))
            return new ConverseResponse(kb.brandName() + ", 맞으실까요?", kb.brandId(), kb.brandName());
        return new ConverseResponse("네, 편하게 말씀해 주세요 🙂 어느 가게 키오스크를 도와드릴까요?", "NONE", null);
    }

    private ConverseResponse parseConverse(String out, Map<String, String> known) {
        if (out == null || out.isBlank()) return null;
        try {
            int a = out.indexOf('{'), b = out.lastIndexOf('}');
            JsonNode n = om.readTree(a >= 0 && b > a ? out.substring(a, b + 1) : out);
            String reply = n.path("reply").asText("").trim();
            String id = n.path("brandId").asText("NONE").trim();
            String name = n.path("brandName").asText("").trim();
            if (reply.isEmpty() && ("NONE".equals(id) || id.isEmpty())) return null;
            if (!"NONE".equals(id) && !"generic".equals(id) && !known.containsKey(id)) { id = "NONE"; }
            if ("generic".equals(id) && name.isEmpty()) id = "NONE";
            String showName = known.containsKey(id) ? known.get(id) : ("generic".equals(id) ? name : null);
            if (reply.isEmpty()) reply = "네, 말씀해 주세요 🙂";
            return new ConverseResponse(reply, id, showName);
        } catch (Exception e) {
            log.warn("대화 JSON 파싱 실패: {}", e.getMessage());
            return null;
        }
    }

    /** 사진 → 가게 판별(AI 비전). */
    public RecognizeResponse fromImage(byte[] image, String mime) {
        if (image == null || image.length == 0) return RecognizeResponse.none();
        Map<String, String> known = known();
        if (ai.ready()) {
            String system = """
                    이 사진은 어느 가게의 키오스크 화면·메뉴판·간판일 수 있다.
                    사진 속 로고/상호/메뉴를 근거로 아래 '아는 가게 목록'의 id 중 하나로 판별한다.
                    확실하지 않으면 NONE.
                    출력은 JSON 하나만: {"brandId":"...","brandName":"..."} (설명 금지)
                    """;
            String user = "아는 가게 목록:\n" + knownList(known) + "\n\n판별 결과를 JSON으로만.";
            RecognizeResponse r = parse(ai.generateWithImage(system, user, image, mime), known);
            if (r != null) return r;
            // 아는 가게가 아니면 → 일반 인식(가게/장소 이름 + 종류). 병원/공항/새 브랜드 등도 "○○네요"로 안내 가능.
            String gsys = """
                    이 사진은 어떤 가게·장소의 키오스크 화면·메뉴판·간판·로고일 수 있다.
                    사진 속 로고/상호/글자를 근거로 상호(장소) 이름을 한국어로 짧게 정하고, 종류(kind)를 고른다.
                    kind: order(음식·음료 등 주문), ticket(발권·병원·공항·민원 등), unknown.
                    출력은 JSON 하나만: {"brandName":"○○","kind":"order|ticket|unknown"} (모르면 brandName="")
                    """;
            RecognizeResponse g = parseGeneric(ai.generateWithImage(gsys, "판별 결과를 JSON으로만.", image, mime));
            if (g != null) return g;
        }
        return RecognizeResponse.none();
    }

    /** 아는 브랜드가 아닐 때: 상호 이름 + 종류만 일반 인식. */
    private RecognizeResponse parseGeneric(String out) {
        if (out == null || out.isBlank()) return null;
        try {
            int a = out.indexOf('{'), b = out.lastIndexOf('}');
            JsonNode n = om.readTree(a >= 0 && b > a ? out.substring(a, b + 1) : out);
            String name = n.path("brandName").asText("").trim();
            String kind = n.path("kind").asText("unknown").trim();
            if (name.isBlank()) return null;
            return new RecognizeResponse("generic", name, kind);
        } catch (Exception e) {
            log.warn("일반 인식 JSON 파싱 실패: {}", e.getMessage());
            return null;
        }
    }

    private RecognizeResponse parse(String out, Map<String, String> known) {
        if (out == null || out.isBlank()) return null;
        try {
            int a = out.indexOf('{'), b = out.lastIndexOf('}');
            JsonNode n = om.readTree(a >= 0 && b > a ? out.substring(a, b + 1) : out);
            String id = n.path("brandId").asText("NONE");
            if (id == null || id.isBlank() || id.equalsIgnoreCase("NONE") || !known.containsKey(id))
                return RecognizeResponse.none();
            return new RecognizeResponse(id, known.get(id));
        } catch (Exception e) {
            log.warn("인식 JSON 파싱 실패: {}", e.getMessage());
            return null;
        }
    }

    private RecognizeResponse keywordFallback(String text, Map<String, String> known) {
        String s = text.toLowerCase();
        for (Map.Entry<String, String> e : known.entrySet()) {
            String nm = e.getValue() == null ? "" : e.getValue().toLowerCase();
            if (!nm.isBlank() && s.contains(nm)) return new RecognizeResponse(e.getKey(), e.getValue());
        }
        if (s.matches(".*(빽다방|백다방|빽|paik).*"))
            return new RecognizeResponse("paik", known.getOrDefault("paik", "빽다방"));
        if (s.matches(".*(맘스터치|맘스|moms).*"))
            return new RecognizeResponse("momstouch", known.getOrDefault("momstouch", "맘스터치"));
        if (s.matches(".*(맥도날드|맥날|맥도널드|mcdonald|맥크리스피|빅맥).*"))
            return new RecognizeResponse("mcdonalds", known.getOrDefault("mcdonalds", "맥도날드"));
        if (s.matches(".*(메가커피|메가\\s?엠지씨|메가|mega).*"))
            return new RecognizeResponse("megacoffee", known.getOrDefault("megacoffee", "메가커피"));
        return RecognizeResponse.none();
    }
}
