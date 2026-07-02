package com.jingdari.omong.dto;

import java.util.List;

/** 좁혀가기 질문 응답. question 이 null 이면 프론트가 규칙 폴백을 쓴다. */
public record FunnelResponse(String question, List<FunnelOption> options) {
    public static FunnelResponse empty() { return new FunnelResponse(null, List.of()); }
}
