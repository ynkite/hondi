package com.jingdari.omong.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jingdari.omong.dto.FunnelOption;
import com.jingdari.omong.dto.FunnelRequest;
import com.jingdari.omong.dto.FunnelResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

/**
 * "AI 인식 + 주문 구성"의 좁혀가기 질문을 Claude로 생성한다.
 * 남은 후보 메뉴를 2~4개의 쉬운 그룹으로 나누는 질문 1개를 만들어, 최소 횟수로 메뉴를 확정하게 한다.
 * AI가 없거나 실패하면 question=null 을 돌려주고 프론트가 규칙 폴백을 쓴다(데모가 안 죽음).
 */
@Service
public class FunnelService {

    private static final Logger log = LoggerFactory.getLogger(FunnelService.class);
    private final AiService ai;
    private final ObjectMapper om;

    public FunnelService(AiService ai, ObjectMapper om) {
        this.ai = ai;
        this.om = om;
    }

    public FunnelResponse next(FunnelRequest req) {
        if (req == null || req.items() == null || req.items().size() <= 1) return FunnelResponse.empty();
        if (!ai.ready()) return FunnelResponse.empty();

        Set<String> validIds = req.items().stream().map(FunnelRequest.Item::id).collect(Collectors.toSet());
        String menu = req.items().stream()
                .map(it -> "- " + it.id() + " : " + it.name())
                .collect(Collectors.joining("\n"));

        String system = """
                너는 키오스크 앞 다정한 안내 도우미. 손님(어르신·아이·외국인 포함)이 '한 번에 하나의 쉬운 선택'으로 메뉴에 다가가게 한다.
                규칙:
                - 남은 후보를 겹치지 않는 2묶음(가끔 3묶음)으로 나누는 질문 1개.
                - 성급히 한 번에 정하지 말 것. 뜻이 크게 갈리는 축부터 물어 단계적으로 좁힌다: 종류 → 맛 → 온도 → 크기 순.
                - 후보가 3개 이상이면 한 선택지에 한 개만 남기지 말고 되도록 반씩 나눈다(계속 질문이 이어지게).
                - 감각의 말만 쓴다: 커피/커피 아닌 것, 단 거/안 단 거, 시원/뜨겁, 보통/많이. 전문용어·영어·은어 금지(ICED→시원한 거, 샷추가→진하게).
                - 짧고 품위 있는 존댓말. 라벨 2~7글자, 각 선택지에 어울리는 이모지 1개.
                - 가게 종류에 맞는 기준을 고른다(카페=맛/온도/크기, 버거=고기/치킨/새우, 아이스크림=초코/과일/바닐라, 분식=국물/밥/튀김).
                - id 는 정확히 한 묶음에만, 주어진 id 만 사용.
                출력은 오직 JSON 하나(설명·코드펜스 금지):
                {"question":"...","options":[{"label":"단 거","icon":"🍯","ids":["id1","id2"]}]}
                """;
        String user = "언어: " + (req.language() == null ? "KO" : req.language())
                + "\n가게: " + (req.brandName() == null ? "" : req.brandName())
                + "\n남은 메뉴 후보(id : 이름):\n" + menu
                + "\n\n손님이 편하게 고르도록, 알바생처럼 다정하게 묻는 질문 하나를 위 JSON으로만 답해."
                + " question 과 label 은 반드시 요청 언어로, 짧고 쉽게.";

        String out = ai.generateFast(system, user);
        if (out == null || out.isBlank()) return FunnelResponse.empty();

        try {
            JsonNode root = om.readTree(extractJson(out));
            String question = root.path("question").asText(null);
            JsonNode opts = root.path("options");
            if (question == null || question.isBlank() || !opts.isArray() || opts.isEmpty())
                return FunnelResponse.empty();

            List<FunnelOption> options = new ArrayList<>();
            for (JsonNode o : opts) {
                String label = o.path("label").asText(null);
                String icon = o.path("icon").asText("");
                List<String> ids = new ArrayList<>();
                for (JsonNode idn : o.path("ids")) {
                    String id = idn.asText();
                    if (validIds.contains(id)) ids.add(id);
                }
                if (label != null && !label.isBlank() && !ids.isEmpty())
                    options.add(new FunnelOption(label, icon, ids));
            }
            // 최소 2개 그룹이고, 한 선택지가 전부를 담지 않아야(=좁혀져야) 유효
            if (options.size() < 2) return FunnelResponse.empty();
            boolean narrows = options.stream().anyMatch(op -> op.ids().size() < req.items().size());
            if (!narrows) return FunnelResponse.empty();

            return new FunnelResponse(question, options);
        } catch (Exception e) {
            log.warn("좁혀가기 JSON 파싱 실패 → 폴백: {}", e.getMessage());
            return FunnelResponse.empty();
        }
    }

    /**
     * 질문 '계획'을 한 번에 생성한다(범용). 메뉴 목록만 보고 그 가게 성격을 파악해
     * 큰 갈래 → 세부 → 맛/온도/크기 순의 질문 여러 개를 순서대로 만든다.
     * 프론트가 이 계획을 즉시 걸어가므로(질문마다 AI 호출 없음) 빠르면서도 매장 맞춤이 된다.
     */
    public List<FunnelResponse> plan(FunnelRequest req) {
        if (req == null || req.items() == null || req.items().size() <= 2) return List.of();
        if (!ai.ready()) return List.of();
        Set<String> validIds = req.items().stream().map(FunnelRequest.Item::id).collect(Collectors.toSet());
        String menu = req.items().stream().map(it -> "- " + it.id() + " : " + it.name()).collect(Collectors.joining("\n"));
        String system = """
                너는 키오스크 주문 도우미의 '질문 설계자'다. 아래 메뉴 목록만 보고 이 가게의 성격을 스스로 파악해,
                손님이 원하는 메뉴 하나까지 쉽고 정확하게 좁혀갈 '질문 계획'을 순서대로 만든다.
                규칙:
                - 3~6개의 질문을 큰 갈래 → 세부 → 맛/매운맛/온도/크기 순으로 배열.
                - 첫 질문은 그 가게의 가장 큰 분류(예: 치킨/버거/사이드, 커피/커피 아닌 것, 밥/면/튀김).
                - 각 질문의 선택지는 2~4개만(절대 5개 이상 금지), 겹치지 않는 묶음. 한 질문 안에서 각 id는 한 번만.
                - 되도록 모든 메뉴 id가 어느 질문에선가 갈라지도록 한다.
                - 쉬운 감각어·존댓말·이모지 1개. 라벨 2~7자. 전문용어·영어·은어 금지.
                출력은 오직 JSON 하나(설명·코드펜스 금지):
                {"questions":[{"question":"치킨 드실래요, 버거 드실래요?","options":[{"label":"치킨","icon":"🍗","ids":["id1"]},{"label":"버거","icon":"🍔","ids":["id2"]}]}]}
                """;
        String user = "가게: " + (req.brandName() == null ? "" : req.brandName())
                + " (언어 " + (req.language() == null ? "KO" : req.language()) + ")\n"
                + "메뉴(id : 이름):\n" + menu + "\n\n위 메뉴에 맞는 질문 계획을 JSON으로만.";
        String out = ai.generateFast(system, user);
        if (out == null || out.isBlank()) return List.of();
        try {
            JsonNode root = om.readTree(extractJson(out));
            JsonNode qs = root.path("questions");
            List<FunnelResponse> plan = new ArrayList<>();
            if (qs.isArray()) {
                for (JsonNode qn : qs) {
                    String question = qn.path("question").asText(null);
                    JsonNode opts = qn.path("options");
                    if (question == null || question.isBlank() || !opts.isArray()) continue;
                    List<FunnelOption> options = new ArrayList<>();
                    for (JsonNode o : opts) {
                        String label = o.path("label").asText(null);
                        String icon = o.path("icon").asText("");
                        List<String> ids = new ArrayList<>();
                        for (JsonNode idn : o.path("ids")) { String id = idn.asText(); if (validIds.contains(id)) ids.add(id); }
                        if (label != null && !label.isBlank() && !ids.isEmpty()) options.add(new FunnelOption(label, icon, ids));
                    }
                    if (options.size() >= 2) plan.add(new FunnelResponse(question, options));
                }
            }
            return plan;
        } catch (Exception e) {
            log.warn("질문 계획 JSON 파싱 실패: {}", e.getMessage());
            return List.of();
        }
    }

    /**
     * 자유 발화에서 메뉴 하나를 골라낸다(실시간 음성). 두서없이 말해도 의도를 잡아 id 반환, 없으면 NONE.
     */
    public String pick(String text, List<FunnelRequest.Item> items) {
        if (text == null || text.isBlank() || items == null || items.isEmpty()) return "NONE";
        if (!ai.ready()) return "NONE";
        java.util.Set<String> ids = items.stream().map(FunnelRequest.Item::id).collect(Collectors.toSet());
        String menu = items.stream().map(it -> "- " + it.id() + " : " + it.name()).collect(Collectors.joining("\n"));
        String system = """
                손님이 편하게(두서없이, 사투리·에두른 표현 포함) 말해도 무엇을 원하는지 파악해,
                아래 메뉴 중 가장 알맞은 것 하나의 id를 고른다. 애매하거나 해당 없음이면 NONE.
                출력은 JSON 하나만: {"id":"..."} (설명 금지)
                """;
        String user = "메뉴(id : 이름):\n" + menu + "\n\n손님 말: " + text + "\n가장 맞는 id 하나를 JSON으로.";
        String out = ai.generateFast(system, user);
        if (out == null) return "NONE";
        try {
            JsonNode n = om.readTree(extractJson(out));
            String id = n.path("id").asText("NONE");
            return (id != null && ids.contains(id)) ? id : "NONE";
        } catch (Exception e) {
            return "NONE";
        }
    }

    /** 모델이 코드펜스나 잡담을 섞어도 첫 '{' ~ 마지막 '}' 만 취한다. */
    private String extractJson(String s) {
        int a = s.indexOf('{'), b = s.lastIndexOf('}');
        return (a >= 0 && b > a) ? s.substring(a, b + 1) : s;
    }
}
