package com.jingdari.omong.dto;

/**
 * 한 턴의 대화 요청. 세션 상태(brandId/screenId)는 프론트가 들고 다시 보내는 무상태 방식.
 * - message        : 사용자가 말하거나 친 자유 발화 (없을 수 있음)
 * - selectedItemId : 사용자가 버튼/옵션을 직접 눌렀을 때의 항목 id (없을 수 있음)
 */
public record ChatRequest(
        String language,
        String brandId,
        String screenId,
        String message,
        String selectedItemId
) {}
