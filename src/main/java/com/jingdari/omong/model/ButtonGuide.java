package com.jingdari.omong.model;

/** 3단계 실행 안내 한 스텝. 사용자 언어로 번역되어 음성으로 읽힘. */
public record ButtonGuide(
        int step,
        String instructionKo, // "파란색 버튼을 누르세요"
        String color,
        String position,
        String targetItemId   // 연관 항목(있으면)
) {}
