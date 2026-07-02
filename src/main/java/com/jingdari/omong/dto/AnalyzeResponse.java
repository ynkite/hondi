package com.jingdari.omong.dto;

import java.util.List;

/** 사진 분석 결과. items 는 화면에서 읽어낸 항목, narration 은 사용자 언어 안내. */
public record AnalyzeResponse(
        boolean recognized,
        String brandId,        // 데모 키오스크로 매칭되면 채워짐(없으면 null)
        String screenId,
        String placeType,      // ORDER / TICKET / CIVIL / UNKNOWN
        String narration,      // 사용자 언어 한 줄 안내
        List<Option> items,    // 읽어낸 항목들(번역 포함)
        String source          // "ai" | "db" | "mock"
) {}
