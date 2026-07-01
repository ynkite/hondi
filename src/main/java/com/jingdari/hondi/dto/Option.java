package com.jingdari.hondi.dto;

/** 화면에 보여줄 선택지 하나. label 은 사용자 언어로 번역된 텍스트. */
public record Option(
        String id,
        String label,        // 사용자 언어
        String labelKo,      // 원문(한국어) — 화면에 함께 표기 가능
        Integer price,
        String color,
        String position
) {}
