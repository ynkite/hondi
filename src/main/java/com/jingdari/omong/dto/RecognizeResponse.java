package com.jingdari.omong.dto;

/** 발화/사진에서 판별한 가게. brandId="NONE" 이면 미인식(프론트가 사진 요청/추후안내). */
public record RecognizeResponse(String brandId, String brandName) {
    public static RecognizeResponse none() { return new RecognizeResponse("NONE", null); }
}
