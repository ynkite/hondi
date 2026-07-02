package com.jingdari.omong.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.jingdari.omong.model.KioskInfo;
import com.jingdari.omong.model.PlaceType;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Repository;

import java.io.InputStream;
import java.util.*;

/**
 * 0단계 DB(데모 버전). 모든 키오스크를 덮지 않고, 현장에서 수집한 몇 곳만
 * resources/data/kiosks.json 에 담아 메모리로 올린다.
 * 추후: 사용자 제보(크라우드소싱) → 브랜드 제휴로 확장.
 */
@Repository
public class KioskRepository {

    @Value("classpath:data/kiosks.json")
    private Resource seed;

    private final ObjectMapper mapper; // Spring 이 -parameters + ParameterNamesModule 로 구성 → record 역직렬화 OK
    private final Map<String, KioskInfo> byBrandId = new LinkedHashMap<>();

    public KioskRepository(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    @PostConstruct
    void load() throws Exception {
        try (InputStream in = seed.getInputStream()) {
            Seed parsed = mapper.readValue(in, Seed.class);
            if (parsed.kiosks != null) {
                for (KioskInfo k : parsed.kiosks) {
                    byBrandId.put(k.brandId(), k);
                }
            }
        }
    }

    public Collection<KioskInfo> all() {
        return Collections.unmodifiableCollection(byBrandId.values());
    }

    public Optional<KioskInfo> byBrandId(String brandId) {
        return Optional.ofNullable(byBrandId.get(brandId));
    }

    /** 사용자가 말한 장소("OO대학병원이다" 등)에서 가장 그럴듯한 키오스크를 고른다. */
    public Optional<KioskInfo> guessFromText(String text) {
        if (text == null || text.isBlank()) return Optional.empty();
        String t = text.toLowerCase();
        for (KioskInfo k : byBrandId.values()) {
            String firstToken = k.brandName().toLowerCase().split(" ")[0];
            if (!firstToken.isBlank() && t.contains(firstToken)) return Optional.of(k);
        }
        PlaceType type = null;
        if (t.matches(".*(병원|접수|진료|hospital|clinic).*")) type = PlaceType.TICKET;
        else if (t.matches(".*(동사무소|주민센터|민원|발급|증명|gov|civil).*")) type = PlaceType.CIVIL;
        else if (t.matches(".*(카페|커피|주문|식당|메뉴|cafe|coffee|order|menu).*")) type = PlaceType.ORDER;
        if (type != null) {
            PlaceType finalType = type;
            return byBrandId.values().stream().filter(k -> k.placeType() == finalType).findFirst();
        }
        return Optional.empty();
    }

    static class Seed {
        public List<KioskInfo> kiosks;
    }
}
