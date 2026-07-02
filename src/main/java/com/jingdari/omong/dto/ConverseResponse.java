package com.jingdari.omong.dto;

/**
 * 자유 대화 응답. reply=사용자 언어로 된 자연스러운 답변,
 * brandId= 아는 가게 id | "generic"(모르는 가게지만 이름 파악) | "NONE"(추측 불가),
 * brandName= 확인용 표시명(있으면).
 */
public record ConverseResponse(String reply, String brandId, String brandName) {}
