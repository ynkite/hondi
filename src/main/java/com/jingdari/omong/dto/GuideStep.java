package com.jingdari.omong.dto;

/** 3단계 버튼 가이드 한 스텝(사용자 언어로 번역됨). */
public record GuideStep(
        int step,
        String instruction,  // 사용자 언어
        String color,
        String position
) {}
