package com.jingdari.omong.dto;

import java.util.List;

/** 자유 발화/입력에서 메뉴 하나를 골라내는 요청(실시간 음성). */
public record PickRequest(String text, String language, List<FunnelRequest.Item> items) {}
