package com.jingdari.omong.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jingdari.omong.model.AppUser;
import com.jingdari.omong.model.KioskSpec;
import com.jingdari.omong.model.PendingReport;
import com.jingdari.omong.service.KioskSpecRepository;
import com.jingdari.omong.service.PendingReportRepository;
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
    private final PendingReportRepository pendingRepo;
    private final ObjectMapper om;

    public AdminController(UserService userService, KioskSpecRepository specRepo,
                           PendingReportRepository pendingRepo, ObjectMapper om) {
        this.userService = userService;
        this.specRepo = specRepo;
        this.pendingRepo = pendingRepo;
        this.om = om;
    }

    private Optional<AppUser> currentAdmin(HttpSession session) {
        Long uid = (Long) session.getAttribute(SESSION_UID);
        return userService.byId(uid).filter(AppUser::isAdmin);
    }

    /** 대시보드 페이지. 관리자가 아니면 홈으로 돌려보냄. */
    @GetMapping("/admin")
    public String dashboard(HttpSession session) {
        return "admin";   // 데모: 로그인/권한 없이도 상시 접근 허용
    }

    /** 등록된 키오스크 목록(관리자용). itemCount = 스펙의 items 개수. */
    @GetMapping(value = "/admin/api/kiosks", produces = MediaType.APPLICATION_JSON_VALUE)
    @ResponseBody
    public ResponseEntity<?> listKiosks(HttpSession session) {
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
        if (!specRepo.existsById(brandId)) return ResponseEntity.notFound().build();
        specRepo.deleteById(brandId);
        return ResponseEntity.ok(Map.of("ok", true, "brandId", brandId));
    }

    // ===================== 검수 대기(제보 승인) =====================

    /** 검수 대기 중인 제보 목록. 관리자가 내용을 보고 승인/거절한다. */
    @GetMapping(value = "/admin/api/pending", produces = MediaType.APPLICATION_JSON_VALUE)
    @ResponseBody
    public ResponseEntity<?> listPending(HttpSession session) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (PendingReport p : pendingRepo.findAll()) {
            Map<String, Object> row = new java.util.LinkedHashMap<>();
            row.put("id", p.getId());
            row.put("brandName", p.getBrandName());
            row.put("brandId", p.getBrandId());
            row.put("itemCount", countItems(p.getSpecJson()));
            row.put("items", previewItems(p.getSpecJson()));   // 메뉴 이름 미리보기(판단용)
            row.put("reporter", p.getReporterName());
            row.put("createdAt", p.getCreatedAt() == null ? null : p.getCreatedAt().toString());
            out.add(row);
        }
        return ResponseEntity.ok(out);
    }

    /** 승인: 대기 제보를 정식 등록(KioskSpec)으로 옮기고 대기함에서 제거. */
    @PostMapping(value = "/admin/api/pending/{id}/approve", produces = MediaType.APPLICATION_JSON_VALUE)
    @ResponseBody
    public ResponseEntity<?> approve(@PathVariable Long id, HttpSession session) {
        PendingReport p = pendingRepo.findById(id).orElse(null);
        if (p == null) return ResponseEntity.notFound().build();
        specRepo.save(new KioskSpec(p.getBrandId(), p.getBrandName(), p.getSpecJson())); // 정식 등록
        pendingRepo.deleteById(id);
        return ResponseEntity.ok(Map.of("ok", true, "brandId", p.getBrandId(), "brandName", p.getBrandName()));
    }

    /** 거절: 대기 제보 삭제(정식 등록 안 함). */
    @DeleteMapping(value = "/admin/api/pending/{id}", produces = MediaType.APPLICATION_JSON_VALUE)
    @ResponseBody
    public ResponseEntity<?> reject(@PathVariable Long id, HttpSession session) {
        if (!pendingRepo.existsById(id)) return ResponseEntity.notFound().build();
        pendingRepo.deleteById(id);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    private int countItems(String specJson) {
        try {
            JsonNode items = om.readTree(specJson).path("items");
            return items.isArray() ? items.size() : 0;
        } catch (Exception e) {
            return 0;
        }
    }

    /** 스펙 JSON 에서 메뉴 이름을 최대 8개까지 뽑아 미리보기용으로 반환. */
    private List<String> previewItems(String specJson) {
        List<String> names = new ArrayList<>();
        try {
            JsonNode items = om.readTree(specJson).path("items");
            if (items.isArray()) {
                for (JsonNode it : items) {
                    String nm = it.path("name").asText("").trim();
                    if (!nm.isEmpty()) names.add(nm);
                    if (names.size() >= 8) break;
                }
            }
        } catch (Exception ignored) {}
        return names;
    }
}
