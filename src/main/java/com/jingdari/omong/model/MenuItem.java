package com.jingdari.omong.model;

import java.util.List;

/**
 * 키오스크 화면의 항목 하나(메뉴/버튼).
 * tags 는 규칙 엔진의 좁혀가기 질문에 쓰임(예: "sweet","bitter","hot","cold","coffee").
 * buttonColor/buttonPosition 은 3단계 버튼 가이드("파란 버튼 누르세요")에 쓰임.
 */
public record MenuItem(
        String id,
        String nameKo,        // 화면에 실제로 떠 있는 한국어 라벨
        Integer price,        // 원, 없으면 null
        String category,      // 예: "커피", "민원서류"
        List<String> tags,
        String buttonColor,   // 예: "파랑", "빨강", "초록"
        String buttonPosition // 예: "맨 위 첫 번째", "오른쪽 아래"
) {
    public MenuItem {
        if (tags == null) tags = List.of();
    }
}
