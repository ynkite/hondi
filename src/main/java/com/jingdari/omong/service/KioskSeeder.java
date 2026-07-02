package com.jingdari.omong.service;

import com.jingdari.omong.model.KioskSpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * 시작 시 지원 브랜드 화면 스펙을 DB에 시드(없을 때만).
 * 정적 리소스의 스펙 JSON을 그대로 저장 → /api/brands/{id} 로 제공.
 * DB가 꺼져 있으면 조용히 건너뜀(프론트가 정적 스펙으로 폴백 → 데모 안 죽음).
 */
@Component
public class KioskSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(KioskSeeder.class);

    /** brandId → (표시명, classpath 스펙 경로) */
    static final Map<String, String[]> SEEDS = Map.of(
            "paik",       new String[]{"빽다방",   "static/kiosk/paik/crops/coffee.v2.json"},
            "momstouch",  new String[]{"맘스터치", "static/kiosk/momstouch/crops/menu.v2.json"},
            "mcdonalds",  new String[]{"맥도날드", "static/kiosk/mcdonalds/crops/menu.v2.json"},
            "megacoffee", new String[]{"메가커피", "static/kiosk/megacoffee/crops/menu.v2.json"}
    );

    private final KioskSpecRepository repo;

    public KioskSeeder(KioskSpecRepository repo) { this.repo = repo; }

    @Override
    public void run(String... args) {
        for (Map.Entry<String, String[]> e : SEEDS.entrySet()) {
            String id = e.getKey(), name = e.getValue()[0], path = e.getValue()[1];
            try {
                if (repo.existsById(id)) continue;
                var res = new ClassPathResource(path);
                if (!res.exists()) { log.warn("시드 스펙 없음: {}", path); continue; }
                String json = new String(res.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
                repo.save(new KioskSpec(id, name, json));
                log.info("KioskSpec 시드 완료: {}", id);
            } catch (Exception ex) {
                log.warn("KioskSpec 시드 실패(무시, DB 미기동?): {} — {}", id, ex.getMessage());
            }
        }
    }
}
