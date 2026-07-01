package com.jingdari.hondi.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jingdari.hondi.dto.AnalyzeResponse;
import com.jingdari.hondi.dto.Option;
import com.jingdari.hondi.model.KioskInfo;
import com.jingdari.hondi.model.KioskScreen;
import com.jingdari.hondi.model.Language;
import com.jingdari.hondi.model.MenuItem;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * ① 모르는 키오스크 화면을 사진으로 읽기 — 데모의 'AI 활용도' 핵심.
 * AI(Ollama 비전) → JSON 추출. 실패하면 0단계 DB(가짜 키오스크)나 미인식 안내로 폴백.
 */
@Service
public class VisionService {

    private static final Logger log = LoggerFactory.getLogger(VisionService.class);

    private static final String VISION_SYSTEM = """
            You read Korean kiosk screens from a photo for an accessibility assistant.
            Return ONLY compact JSON, no markdown, with this shape:
            {"placeType":"ORDER|TICKET|CIVIL|UNKNOWN",
             "items":[{"nameKo":"화면에 보이는 한국어 라벨","price":3000 or null,
                       "buttonColor":"파랑|빨강|초록|... or null",
                       "buttonPosition":"맨 위 첫 번째 등 위치 설명 or null"}]}
            Read labels exactly as shown. If unsure, use null. Do not invent items.
            """;

    private final AiService ai;
    private final TranslationService translation;
    private final PrivacyMaskingService privacy;
    private final KioskRepository repo;
    private final ObjectMapper mapper;

    public VisionService(AiService ai, TranslationService translation,
                         PrivacyMaskingService privacy, KioskRepository repo, ObjectMapper mapper) {
        this.ai = ai;
        this.translation = translation;
        this.privacy = privacy;
        this.repo = repo;
        this.mapper = mapper;
    }

    public AnalyzeResponse analyze(byte[] image, String mime, Language lang, String brandHint) {
        byte[] safe = privacy.maskImage(image);

        // 1) AI 비전 시도
        String raw = ai.generateWithImage(VISION_SYSTEM,
                "이 키오스크 화면을 읽어서 위 JSON 형식으로만 답하세요.", safe, mime);
        if (raw != null) {
            try {
                JsonNode root = mapper.readTree(extractJson(raw));
                String placeType = root.path("placeType").asText("UNKNOWN");
                List<Option> items = new ArrayList<>();
                JsonNode arr = root.path("items");
                int idx = 0;
                for (JsonNode it : arr) {
                    String nameKo = privacy.maskText(it.path("nameKo").asText("").trim());
                    if (nameKo.isBlank()) continue;
                    Integer price = it.path("price").isNumber() ? it.path("price").asInt() : null;
                    String color = nullable(it.path("buttonColor").asText(null));
                    String pos = nullable(it.path("buttonPosition").asText(null));
                    items.add(new Option("ai-" + (idx++), translation.translate(nameKo, lang),
                            nameKo, price, color, pos));
                }
                if (!items.isEmpty()) {
                    String narration = translation.translate("메뉴를 읽었어요. 무엇을 도와드릴까요?", lang);
                    return new AnalyzeResponse(true, null, null, placeType, narration, items, "ai");
                }
            } catch (Exception e) {
                log.warn("비전 JSON 파싱 실패 → 폴백: {}", e.getMessage());
            }
        }

        // 2) 데모 폴백: 힌트가 있으면 0단계 DB의 가짜 키오스크 시작 화면을 사용
        Optional<KioskInfo> hinted = brandHint == null ? Optional.empty() : repo.byBrandId(brandHint);
        if (hinted.isPresent()) {
            KioskInfo k = hinted.get();
            KioskScreen start = k.screen(k.startScreenId());
            List<Option> items = toOptions(start, lang);
            String narration = translation.translate(start.title(), lang);
            return new AnalyzeResponse(true, k.brandId(), start.screenId(),
                    k.placeType().name(), narration, items, "db");
        }

        // 3) 미인식 — 버튼/대화로 진행하도록 안내
        String narration = translation.translate(
                "화면을 정확히 못 읽었어요. 다시 찍거나, 여기가 어떤 곳인지 말씀해 주세요.", lang);
        return new AnalyzeResponse(false, null, null, "UNKNOWN", narration, List.of(), "mock");
    }

    /** 화면(KioskScreen)의 항목들을 번역된 Option 리스트로. */
    public List<Option> toOptions(KioskScreen screen, Language lang) {
        List<Option> out = new ArrayList<>();
        for (MenuItem m : screen.items()) {
            out.add(new Option(m.id(), translation.translate(m.nameKo(), lang),
                    m.nameKo(), m.price(), m.buttonColor(), m.buttonPosition()));
        }
        return out;
    }

    private static String nullable(String s) {
        return (s == null || s.isBlank() || "null".equalsIgnoreCase(s)) ? null : s;
    }

    /** 모델이 ```json ... ``` 로 감싸거나 앞뒤 설명을 붙여도 첫 {..} 블록만 뽑는다. */
    private static String extractJson(String raw) {
        int start = raw.indexOf('{');
        int end = raw.lastIndexOf('}');
        if (start >= 0 && end > start) return raw.substring(start, end + 1);
        return raw;
    }
}
