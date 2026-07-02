package com.jingdari.omong.dto;

/** 말하기 진입: 사용자가 말한/입력한 텍스트로 가게를 판별. */
public record IntentRequest(String text, String language) {}
