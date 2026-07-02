package com.jingdari.omong.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * 제보/시드된 키오스크 화면 스펙(범용 렌더러가 그대로 소비하는 JSON)을 통째로 저장.
 * specJson = coffee.v2.json 형태(theme/sidebar/cols/items...). 어떤 디자인이든 유연하게 담긴다.
 */
@Entity
@Table(name = "kiosk_spec")
public class KioskSpec {

    @Id
    @Column(length = 64)
    private String brandId;

    @Column(length = 128)
    private String brandName;

    @Column(columnDefinition = "LONGTEXT")
    private String specJson;

    private Instant updatedAt;

    protected KioskSpec() {}

    public KioskSpec(String brandId, String brandName, String specJson) {
        this.brandId = brandId;
        this.brandName = brandName;
        this.specJson = specJson;
        this.updatedAt = Instant.now();
    }

    public String getBrandId() { return brandId; }
    public String getBrandName() { return brandName; }
    public String getSpecJson() { return specJson; }
    public Instant getUpdatedAt() { return updatedAt; }

    public void setBrandName(String v) { this.brandName = v; }
    public void setSpecJson(String v) { this.specJson = v; this.updatedAt = Instant.now(); }
}
