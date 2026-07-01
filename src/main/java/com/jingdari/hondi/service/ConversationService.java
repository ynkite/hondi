package com.jingdari.hondi.service;

import com.jingdari.hondi.dto.*;
import com.jingdari.hondi.model.*;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

/**
 * 2단계(눈높이 대화) + 3단계(버튼 가이드) 오케스트레이션.
 * 무상태: 화면/누적 태그를 프론트가 들고 다시 보낸다.
 *   - 선택지 id 규칙:  "brand:<id>" 장소선택 / "tags:a,b" 좁혀가기 누적 / 그 외 = 항목 id
 * AI는 자유 발화 이해에만, 좁혀가기 질문은 RuleEngine(if-else)이 담당.
 */
@Service
public class ConversationService {

    private final KioskRepository repo;
    private final RuleEngine rules;
    private final TranslationService translation;
    private final VisionService vision;
    private final AiService ai;

    public ConversationService(KioskRepository repo, RuleEngine rules, TranslationService translation,
                               VisionService vision, AiService ai) {
        this.repo = repo;
        this.rules = rules;
        this.translation = translation;
        this.vision = vision;
        this.ai = ai;
    }

    public ChatResponse handle(ChatRequest req) {
        Language lang = Language.from(req.language());

        // 0) 장소(brand) 미정 → 사진/말로 파악하거나 데모 키오스크 선택지를 보여줌
        if (req.brandId() == null || req.brandId().isBlank()) {
            if (req.selectedItemId() != null && req.selectedItemId().startsWith("brand:")) {
                return enterBrand(req.selectedItemId().substring("brand:".length()), lang);
            }
            Optional<KioskInfo> guess = repo.guessFromText(req.message());
            if (guess.isPresent()) return enterBrand(guess.get().brandId(), lang);
            return greeting(lang);
        }

        KioskInfo k = repo.byBrandId(req.brandId()).orElse(null);
        if (k == null) return greeting(lang);
        String screenId = (req.screenId() == null || req.screenId().isBlank()) ? k.startScreenId() : req.screenId();
        KioskScreen screen = k.screen(screenId);
        if (screen == null) screen = k.screen(k.startScreenId());

        String sel = req.selectedItemId();

        // 1) 좁혀가기 누적 태그 선택 → 다시 좁히기
        if (sel != null && sel.startsWith("tags:")) {
            Set<String> tags = parseTags(sel);
            return narrowOrAdvance(k, screen, lang, tags);
        }

        // 2) 항목 직접 선택 → 다음 화면으로
        if (sel != null && !sel.isBlank()) {
            return advance(k, screen, sel, lang);
        }

        // 3) 자유 발화 이해
        if (req.message() != null && !req.message().isBlank()) {
            Set<String> tags = deriveTags(req.message());
            if (tags.isEmpty()) {
                // 키워드로 못 잡으면 AI에게 항목 매칭을 맡김(②)
                String itemId = aiMatch(screen, req.message(), lang);
                if (itemId != null) return advance(k, screen, itemId, lang);
            }
            return narrowOrAdvance(k, screen, lang, tags);
        }

        // 4) 기본: 현재 화면 보여주기
        return showScreen(k, screen, lang, null);
    }

    /* ---------- 장소 진입/인사 ---------- */

    private ChatResponse enterBrand(String brandId, Language lang) {
        KioskInfo k = repo.byBrandId(brandId).orElse(null);
        if (k == null) return greeting(lang);
        return showScreen(k, k.screen(k.startScreenId()), lang, null);
    }

    private ChatResponse greeting(Language lang) {
        String reply = translation.translate(
                "안녕하세요! 도와드릴게요. 키오스크 화면을 사진으로 찍거나, 어디에 계신지 골라 주세요.", lang);
        List<Option> options = new ArrayList<>();
        for (KioskInfo k : repo.all()) {
            options.add(new Option("brand:" + k.brandId(),
                    translation.translate(k.brandName(), lang), k.brandName(), null, null, null));
        }
        return new ChatResponse(reply, options, List.of(), null, null, null, false, null);
    }

    /* ---------- 좁혀가기 / 이동 ---------- */

    private ChatResponse narrowOrAdvance(KioskInfo k, KioskScreen screen, Language lang, Set<String> tags) {
        RuleEngine.NarrowResult r = rules.narrow(screen.items(), tags);
        if (r.resolved()) {
            return advance(k, screen, r.item().id(), lang);
        }
        if (r.questionKo() != null) {
            // 좁혀가기 질문 + 누적 태그를 실은 보기
            List<Option> options = new ArrayList<>();
            for (RuleEngine.TagOption to : r.options()) {
                Set<String> next = new LinkedHashSet<>(tags);
                next.add(to.tag());
                String id = "tags:" + String.join(",", next);
                options.add(new Option(id, translation.translate(to.labelKo(), lang), to.labelKo(),
                        null, null, null));
            }
            return new ChatResponse(translation.translate(r.questionKo(), lang),
                    options, List.of(), k.brandId(), screen.screenId(), null, false, null);
        }
        // 질문할 차원이 없으면 후보를 그대로 보여줌
        return showScreen(k, screen, lang, null);
    }

    private ChatResponse advance(KioskInfo k, KioskScreen current, String itemId, Language lang) {
        String nextId = current.nextScreen().get(itemId);
        // 선택한 항목 라벨(요약/안내용)
        String chosenKo = current.items().stream()
                .filter(m -> m.id().equals(itemId)).map(MenuItem::nameKo).findFirst().orElse(itemId);

        if (nextId == null) {
            // 이동 정의가 없으면 현재 화면 유지하며 가이드 강조
            return showScreen(k, current, lang, itemId);
        }
        KioskScreen next = k.screen(nextId);
        if (next == null) return showScreen(k, current, lang, itemId);
        return showScreen(k, next, lang, chosenKo);
    }

    /* ---------- 화면 렌더 ---------- */

    private ChatResponse showScreen(KioskInfo k, KioskScreen screen, Language lang, String chosenKoOrId) {
        boolean terminal = screen.items().isEmpty() && screen.nextScreen().isEmpty();
        String reply = translation.translate(screen.title(), lang);

        if (terminal) {
            String summary = buildSummary(screen, chosenKoOrId, lang);
            return new ChatResponse(reply, List.of(), List.of(), k.brandId(), screen.screenId(),
                    null, true, summary);
        }

        List<Option> options = vision.toOptions(screen, lang);
        List<GuideStep> guide = translateGuides(screen, lang);
        return new ChatResponse(reply, options, guide, k.brandId(), screen.screenId(),
                null, false, null);
    }

    private String buildSummary(KioskScreen done, String chosenKoOrId, Language lang) {
        String base = translation.translate("완료되었어요. 직원이 도와드리거나 결제 화면으로 안내됩니다.", lang);
        if (chosenKoOrId != null && !chosenKoOrId.isBlank()) {
            return translation.translate(chosenKoOrId, lang) + " — " + base;
        }
        return base;
    }

    private List<GuideStep> translateGuides(KioskScreen screen, Language lang) {
        return screen.guides().stream()
                .map(g -> new GuideStep(g.step(), translation.translate(g.instructionKo(), lang),
                        g.color(), g.position()))
                .collect(Collectors.toList());
    }

    /* ---------- 자유 발화 → 태그 / AI 매칭 ---------- */

    private static final Map<String, List<String>> TAG_KEYWORDS = Map.of(
            "coffee",  List.of("커피", "coffee", "cà phê", "ca phe", "咖啡", "コーヒー"),
            "sweet",   List.of("단", "달달", "달콤", "sweet", "ngọt", "ngot", "甜", "甘"),
            "bitter",  List.of("쓴", "쓰다", "bitter", "đắng", "dang", "苦"),
            "cold",    List.of("시원", "차가", "아이스", "ice", "cold", "lạnh", "lanh", "冰", "冷", "アイス"),
            "hot",     List.of("뜨거", "따뜻", "hot", "nóng", "nong", "热", "ホット", "温")
    );

    private Set<String> deriveTags(String message) {
        String m = message.toLowerCase();
        Set<String> tags = new LinkedHashSet<>();
        TAG_KEYWORDS.forEach((tag, kws) -> {
            for (String kw : kws) {
                if (m.contains(kw.toLowerCase())) { tags.add(tag); break; }
            }
        });
        return tags;
    }

    /** AI에게 현재 화면 항목 중 사용자 의도에 맞는 id 하나를 고르게 한다. 실패/불명확 시 null. */
    private String aiMatch(KioskScreen screen, String message, Language lang) {
        if (screen.items().isEmpty()) return null;
        String list = screen.items().stream()
                .map(m -> m.id() + " = " + m.nameKo())
                .collect(Collectors.joining("\n"));
        String system = """
                You match a user's free-form request (any language) to ONE menu item id.
                Respond with ONLY the id from the list, or the word NONE if unclear.
                """;
        String user = "Items:\n" + list + "\n\nUser said: " + message;
        String out = ai.generate(system, user);
        if (out == null) return null;
        String id = out.trim().split("\\s+")[0];
        boolean valid = screen.items().stream().anyMatch(m -> m.id().equals(id));
        return valid ? id : null;
    }

    private Set<String> parseTags(String sel) {
        String body = sel.substring("tags:".length());
        if (body.isBlank()) return new LinkedHashSet<>();
        return new LinkedHashSet<>(Arrays.asList(body.split(",")));
    }
}
