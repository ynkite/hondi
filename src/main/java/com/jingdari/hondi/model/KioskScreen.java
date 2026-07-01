package com.jingdari.hondi.model;

import java.util.List;
import java.util.Map;

/**
 * 한 키오스크 브랜드의 '화면 한 장'. 데모용 가짜 키오스크는 화면 흐름을 우리가 다 알고 있어
 * nextScreen(선택 id -> 다음 화면 id)로 단계 이동을 시뮬레이션한다.
 */
public record KioskScreen(
        String screenId,
        String title,        // 화면 제목(한국어)
        List<MenuItem> items,
        List<ButtonGuide> guides,
        Map<String, String> nextScreen
) {
    public KioskScreen {
        if (items == null) items = List.of();
        if (guides == null) guides = List.of();
        if (nextScreen == null) nextScreen = Map.of();
    }
}
