package com.jingdari.omong.service;

import com.jingdari.omong.model.MenuItem;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * "AI와 규칙의 분리" — 메뉴가 정해진 좁혀가기 질문(단거/쓴거, 커피/음료)은
 * 비용·인터넷 사고 없는 if-else 규칙으로 처리한다.
 *
 * 동작: 현재 후보 + 사용자가 고른 태그 → (1) 후보가 1개면 확정,
 *       (2) 아직 갈리는 차원이 있으면 그 차원의 질문을 만든다.
 */
@Service
public class RuleEngine {

    /** 질문 차원 정의: 차원키 → (한국어 질문, 보기 태그 목록). 위에서부터 먼저 물어봄. */
    private static final List<Dimension> DIMENSIONS = List.of(
            new Dimension("drink", "커피로 드릴까요, 다른 음료로 드릴까요?",
                    new String[]{"coffee", "nocoffee"},
                    Map.of("coffee", "커피", "nocoffee", "커피 말고 음료")),
            new Dimension("taste", "단 거 드릴까요, 쓴 거 드릴까요?",
                    new String[]{"sweet", "bitter"},
                    Map.of("sweet", "단 거", "bitter", "쓴 거"))
    );

    public record NarrowResult(
            boolean resolved,
            MenuItem item,           // resolved=true 일 때
            String questionKo,       // resolved=false 일 때
            List<TagOption> options
    ) {}

    public record TagOption(String tag, String labelKo) {}

    /** candidates 중 chosenTags 로 거른 뒤 다음 질문 또는 확정 결과를 돌려준다. */
    public NarrowResult narrow(List<MenuItem> candidates, Set<String> chosenTags) {
        List<MenuItem> filtered = candidates.stream()
                .filter(m -> chosenTags.stream().allMatch(t -> m.tags().contains(t)))
                .toList();

        if (filtered.isEmpty()) {
            // 모순된 선택 → 거르기 전으로 되돌려 다시 묻기
            filtered = candidates;
        }
        if (filtered.size() == 1) {
            return new NarrowResult(true, filtered.get(0), null, List.of());
        }

        for (Dimension d : DIMENSIONS) {
            // 이 차원이 이미 정해졌으면 건너뜀
            boolean alreadyChosen = Arrays.stream(d.tags).anyMatch(chosenTags::contains);
            if (alreadyChosen) continue;

            // 후보들 사이에서 이 차원의 값이 둘 이상 갈리는가?
            List<TagOption> opts = new ArrayList<>();
            for (String tag : d.tags) {
                boolean anyMatch = filtered.stream().anyMatch(m -> m.tags().contains(tag));
                if (anyMatch) opts.add(new TagOption(tag, d.labels.get(tag)));
            }
            if (opts.size() > 1) {
                return new NarrowResult(false, null, d.questionKo, opts);
            }
        }

        // 더 물을 차원이 없으면 후보 전체를 그대로 보여주도록 미해결 반환(질문 없음)
        return new NarrowResult(false, null, null, List.of());
    }

    private record Dimension(String key, String questionKo, String[] tags, Map<String, String> labels) {}
}
