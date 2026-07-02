package com.jingdari.omong.model;

import java.util.List;

/** 0단계 DB의 레코드 하나 = 한 브랜드/장소의 키오스크 정보(화면 흐름 포함). */
public record KioskInfo(
        String brandId,
        String brandName,
        PlaceType placeType,
        String startScreenId,
        List<KioskScreen> screens
) {
    public KioskScreen screen(String screenId) {
        return screens.stream()
                .filter(s -> s.screenId().equals(screenId))
                .findFirst()
                .orElse(null);
    }
}
