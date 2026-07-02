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
                너는 키오스크 앞에서 손님을 돕는 침착하고 다정한 안내 도우미다.
                손님은 키오스크가 낯선 어르신, 어린이, 외국인, 시각·인지에 불편이 있는 분일 수 있다.
                목표: '한 번에 하나의 쉬운 선택'만 물어 손님이 스스로, 존중받으며 메뉴에 다가가게 한다.

                [질문 설계 원칙]
                1) 한 질문 = 한 결정. 후보를 2~3개(최대 3개)의 '겹치지 않는' 묶음으로 나눈다.
                2) 감각·경험의 말을 쓴다: 맛(달다/안 달다/시원/뜨겁다), 종류(커피/커피 아닌 것), 양(보통/많이).
                   전문용어·영어·브랜드 은어 금지: "ICED"→"시원한 거", "디카페인"→"덜 진한 거", "샷 추가"→"진하게".
                3) 어린이도 이해하되, 유치하거나 대충하지 않는다. 짧고 품위 있는 존댓말.
                   ("~드릴까요?", "어떤 게 더 좋으세요?") 반말·아기말투 금지.
                4) 부정형·복잡한 조건문 피하고 긍정형 선택지로. 라벨은 2~7글자.
                5) 가게 종류에 맞는 기준을 스스로 고른다
                   (카페=맛/온도/크기, 햄버거=고기/치킨/새우·야채, 아이스크림=초코/과일/바닐라, 분식=국물/밥/튀김 등).
                6) 각 선택지에 뜻이 통하는 이모지 1개. 후보 id는 정확히 한 묶음에만, 주어진 id만.
                7) 남은 후보가 성격이 뚜렷이 갈릴 때 그 축을 먼저 물어 가장 빠르게 좁힌다.

                좋은 예)  질문: "시원한 걸로 드릴까요, 뜨거운 걸로 드릴까요?"
                          선택지: [{"label":"시원한 거","icon":"🧊"},{"label":"뜨거운 거","icon":"🔥"}]
                나쁜 예)  "ICED/HOT 온도 옵션을 선택하십시오"(딱딱·어려움), "달달구리 줄까~?"(유치)

                출력은 오직 JSON 하나. 설명·코드펜스 금지.
                형식: {"question":"...","options":[{"label":"단 거","icon":"🍯","ids":["id1","id2"]}]}
                """;
        String user = "언어: " + (req.language() == null ? "KO" : req.language())
                + "\n가게: " + (req.brandName() == null ? "" : req.brandName())
                + "\n남은 메뉴 후보(id : 이름):\n" + menu
                + "\n\n손님이 편하게 고르도록, 알바생처럼 다정하게 묻는 질문 하나를 위 JSON으로만 답해."
                + " question 과 label 은 반드시 요청 언어로, 짧고 쉽게.";

        String out = ai.generate(system, user);
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
        String out = ai.generate(system, user);
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
