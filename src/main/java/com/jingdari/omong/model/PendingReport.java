package com.jingdari.omong.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;
import java.time.ZoneId;

/**
 * 제보 대기함(검수 전). 사용자가 제보한 키오스크는 바로 등록되지 않고 여기에 쌓인다.
 * 관리자가 대시보드에서 확인 후 "승인"하면 그때 KioskSpec(정식 등록)으로 옮겨진다.
 * 존재 자체 = 검수 대기 상태(승인/거절 시 이 행은 삭제).
 */
@Entity
@Table(name = "pending_report")
public class PendingReport {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(length = 64)
    private String brandId;

    @Column(length = 128)
    private String brandName;

    /** 승인 시 그대로 KioskSpec.specJson 이 될 렌더러 스펙 JSON. */
    @Column(columnDefinition = "LONGTEXT")
    private String specJson;

    /** 제보자 이름(로그인했다면). 참고용. */
    @Column(length = 60)
    private String reporterName;

    private LocalDateTime createdAt;

    protected PendingReport() {}

    public PendingReport(String brandId, String brandName, String specJson, String reporterName) {
        this.brandId = brandId;
        this.brandName = brandName;
        this.specJson = specJson;
        this.reporterName = reporterName;
        this.createdAt = LocalDateTime.now(ZoneId.of("Asia/Seoul"));
    }

    public Long getId() { return id; }
    public String getBrandId() { return brandId; }
    public String getBrandName() { return brandName; }
    public String getSpecJson() { return specJson; }
    public String getReporterName() { return reporterName; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}
