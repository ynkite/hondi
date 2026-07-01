package com.jingdari.hondi.dto;

import java.util.List;

/**
 * 한 턴의 응답. reply 는 음성(TTS)으로 읽고 화면에도 표시.
 * options 가 있으면 버튼으로, guide 가 있으면 실행 안내 단계로 그린다.
 */
public record ChatResponse(
        String reply,            // 사용자 언어 안내문
        List<Option> options,    // 좁혀가기/메뉴 선택지
        List<GuideStep> guide,   // 버튼 누르기 안내
        String brandId,
        String screenId,         // 다음 화면 id (이동했으면 갱신됨)
        String chosenItemId,
        boolean done,            // 주문/발권/민원 완료 여부
        String summary           // 완료 시 주문/요청 요약(사용자 언어)
) {
    public static ChatResponse simple(String reply, String brandId, String screenId) {
        return new ChatResponse(reply, List.of(), List.of(), brandId, screenId, null, false, null);
    }
}
