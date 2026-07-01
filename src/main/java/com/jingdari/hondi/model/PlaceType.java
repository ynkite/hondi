package com.jingdari.hondi.model;

/** 장소 종류 — 주문(식당·카페), 발권(병원·영화·교통), 민원(동사무소 등). */
public enum PlaceType {
    ORDER,   // 주문
    TICKET,  // 발권/접수
    CIVIL,   // 민원 발급
    UNKNOWN
}
