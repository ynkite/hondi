package com.jingdari.omong.dto;

/** 제보 처리 결과. ok=false 면 프론트가 '다시 찍기/추후 안내'. */
public record ReportResponse(boolean ok, String brandId, String brandName, int itemCount, String message) {
    public static ReportResponse fail(String msg) { return new ReportResponse(false, null, null, 0, msg); }
}
