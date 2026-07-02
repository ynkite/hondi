package com.jingdari.omong.dto;

/**
 * 발화/사진에서 판별한 가게·장소.
 * brandId="NONE" → 미인식. brandId="generic" → 아는 브랜드는 아니지만 이름/종류는 파악됨.
 * kind: order(주문) | ticket(발권·병원·공항·민원) | unknown | null(아는 브랜드).
 */
public record RecognizeResponse(String brandId, String brandName, String kind) {
    public RecognizeResponse(String brandId, String brandName) { this(brandId, brandName, null); }
    public static RecognizeResponse none() { return new RecognizeResponse("NONE", null, null); }
}
