package com.jingdari.omong.dto;

import java.util.List;

/** 좁혀가기 선택지 하나: 라벨 + 이모지 + 이 선택 시 남길 메뉴 id들. */
public record FunnelOption(String label, String icon, List<String> ids) {}
