package com.jingdari.omong.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jingdari.omong.model.AppUser;
import com.jingdari.omong.model.KioskSpec;
import com.jingdari.omong.service.KioskSpecRepository;
import com.jingdari.omong.service.UserService;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 관리자 대시보드. ADMIN 역할 사용자만 접근 가능(로그인 세션의 uid → role 확인).
 * 하는 일: 기존 4개 브랜드를 "학습"시킨 것과 "동일한" 파이프라인(/api/report)을 재사용해
 *          새 브랜드 키오스크를 등록하고, 등록된 키오스크 스펙(KioskSpec)을 조회·삭제한다.
 * ※ 로그인/게스트 흐름은 AuthController 와 동일하게 HttpSession 만 사용(Spring Security 미사용).
 */
@Controller
public class AdminController {

    /** AuthController 와 동일한 세션 키. */
    private static final String SESSION_UID = "uid";
    /** 기본 시드 브랜드(관리자 화면 '기본' 배지용). KioskSeeder 의 SEEDS 와 동일. */
    private static final java.util.Set<String> CORE_BRANDS =
            java.util.Set.of("paik", "momstouch", "mcdonalds", "megacoffee");

    private final UserService userService;
    private final KioskSpecRepository specRepo;
    private final ObjectMapper om;

    public AdminController(UserService userService, KioskSpecRepository specRepo, ObjectMapper om) {
        this.userService = userService;
        this.specRepo = specRepo;
        this.om = om;
    }

    private Optional<AppUser> currentAdmin(HttpSession session) {
        Long uid = (Long) session.getAttribute(SESSION_UID);
        return userService.byId(uid).filter(AppUser::isAdmin);
    }

    /** 대시보드 페이지. 관리자가 아니면 홈으로 돌려보냄. */
    @GetMapping("/admin")
    public String dashboard(HttpSession session) {
        return currentAdmin(session).isPresent() ? "admin" : "redirect:/";
    }

    /** 등록된 키오스크 목록(관리자용). itemCount = 스펙의 items 개수. */
    @GetMapping(value = "/admin/api/kiosks", produces = MediaType.APPLICATION_JSON_VALUE)
    @ResponseBody
    public ResponseEntity<?> listKiosks(HttpSession session) {
        if (currentAdmin(session).isEmpty()) return ResponseEntity.status(403).body(Map.of("error", "forbidden"));
        List<Map<String, Object>> out = new ArrayList<>();
        for (KioskSpec k : specRepo.findAll()) {
            Map<String, Object> row = new java.util.LinkedHashMap<>();
            row.put("brandId", k.getBrandId());
            row.put("brandName", k.getBrandName());
            row.put("itemCount", countItems(k.getSpecJson()));
            row.put("updatedAt", k.getUpdatedAt() == null ? null : k.getUpdatedAt().toString());
            row.put("core", CORE_BRANDS.contains(k.getBrandId())); // 기본 4개 브랜드 표시
            out.add(row);
        }
        return ResponseEntity.ok(out);
    }

    /** 등록된 키오스크 삭제(관리자용). */
    @DeleteMapping(value = "/admin/api/kiosks/{brandId}", produces = MediaType.APPLICATION_JSON_VALUE)
    @ResponseBody
    public ResponseEntity<?> deleteKiosk(@PathVariable String brandId, HttpSession session) {
        if (currentAdmin(session).isEmpty()) return ResponseEntity.status(403).body(Map.of("error", "forbidden"));
        if (!specRepo.existsById(brandId)) return ResponseEntity.notFound().build();
        specRepo.deleteById(brandId);
        return ResponseEntity.ok(Map.of("ok", true, "brandId", brandId));
    }

    private int countItems(String specJson) {
        try {
            JsonNode items = om.readTree(specJson).path("items");
            return items.isArray() ? items.size() : 0;
        } catch (Exception e) {
            return 0;
        }
    }
}
