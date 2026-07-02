package com.jingdari.omong.dto;

import java.util.List;

/** 좁혀가기 질문 생성 요청: 남은 후보 메뉴를 보내면 다음 질문을 받는다. */
public record FunnelRequest(String language, String brandName, List<Item> items) {
    public record Item(String id, String name) {}
}
