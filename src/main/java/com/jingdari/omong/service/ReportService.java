package com.jingdari.omong.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.jingdari.omong.dto.ReportResponse;
import com.jingdari.omong.model.KioskSpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * 제보 파이프라인(단계4): 키오스크 사진 → AI 비전이 메뉴/가격/위치/카테고리 추출
 *   → 상품영역 사각 크롭(순수 Java ImageIO) 저장 → 렌더러 스펙(JSON) 생성 → DB(KioskSpec) 저장.
 * 누끼는 나중에 tools/nuki_rembg.py 로 _thumb.jpg → _cut.png 일괄 적용(사각 크롭 먼저).
 */
@Service
public class ReportService {

    private static final Logger log = LoggerFactory.getLogger(ReportService.class);

    private final AiService ai;
    private final KioskSpecRepository repo;
    private final ObjectMapper om;
    private final String uploadDir;

    public ReportService(AiService ai, KioskSpecRepository repo, ObjectMapper om,
                         @Value("${kiosk.upload-dir:./data/uploads}") String uploadDir) {
        this.ai = ai;
        this.repo = repo;
        this.om = om;
        this.uploadDir = uploadDir;
    }

    public ReportResponse process(byte[] image, String mime, String storeName) {
        if (image == null || image.length == 0) return ReportResponse.fail("이미지가 없어요.");
        if (!ai.ready()) return ReportResponse.fail("지금은 사진 분석이 어려워요. 잠시 후 다시 시도해 주세요.");

        // 1) AI 비전으로 메뉴 추출
        String system = """
                이 사진은 어느 가게의 키오스크 '메뉴 화면'이다. 화면 속 메뉴를 추출해 JSON으로만 답하라.
                각 메뉴에 대해: 이름(name), 가격 숫자(price), 화면 격자 위치(r 행, c 열, 0부터),
                그리고 '상품 사진(음료/음식 이미지)'이 있는 영역의 위치를 사진 대비 백분율로(x,y,w,h).
                화면 제목(title), 왼쪽 카테고리 탭 목록(categories), 한 줄 칸 수(cols)도 함께.
                출력 형식(JSON 하나, 설명·코드펜스 금지):
                {"brandName":"","title":"","cols":4,"categories":["",""],
                 "items":[{"name":"","price":0,"r":0,"c":0,"x":0,"y":0,"w":0,"h":0}]}
                """;
        String user = "가게 이름 힌트: " + (storeName == null ? "(모름)" : storeName)
                + "\n위 형식 JSON으로만 답하라. 가격은 숫자만(원 제외).";
        String out = ai.generateWithImage(system, user, image, mime);
        if (out == null) return ReportResponse.fail("사진을 읽지 못했어요. 메뉴가 잘 보이게 다시 찍어 주세요.");

        try {
            JsonNode root = om.readTree(extractJson(out));
            JsonNode itemsNode = root.path("items");
            if (!itemsNode.isArray() || itemsNode.isEmpty())
                return ReportResponse.fail("메뉴를 찾지 못했어요. 메뉴판이 잘 보이게 다시 찍어 주세요.");

            String brandName = txt(root, "brandName", storeName != null ? storeName : "새 키오스크");
            String title = txt(root, "title", "메뉴");
            int cols = root.path("cols").asInt(4);
            String brandId = slug(brandName) + "-" + (System.currentTimeMillis() % 100000);

            // 2) 이미지 디코드 + 저장 폴더
            BufferedImage img = ImageIO.read(new ByteArrayInputStream(image));
            if (img == null) return ReportResponse.fail("이미지 형식을 읽지 못했어요.");
            int W = img.getWidth(), H = img.getHeight();
            Path dir = Paths.get(uploadDir, brandId);
            Files.createDirectories(dir);
            ImageIO.write(img, "jpg", new File(dir.toFile(), "_full.jpg"));

            // 3) 메뉴별 상품영역 크롭 + 스펙 items 구성
            ArrayNode specItems = om.createArrayNode();
            int idx = 0;
            for (JsonNode it : itemsNode) {
                String name = it.path("name").asText("").trim();
                if (name.isEmpty()) continue;
                int price = it.path("price").asInt(0);
                int r = it.path("r").asInt(idx / Math.max(1, cols));
                int c = it.path("c").asInt(idx % Math.max(1, cols));
                String id = "it" + idx;
                String thumb = "/uploads/" + brandId + "/" + id + ".jpg";
                cropSave(img, W, H, it, new File(dir.toFile(), id + ".jpg"));

                ObjectNode si = om.createObjectNode();
                si.put("id", id); si.put("name", name); si.put("price", price);
                si.put("r", r); si.put("c", c);
                si.put("thumb", thumb); si.put("cut", thumb); // 누끼 전엔 사각 크롭 사용
                specItems.add(si);
                idx++;
            }
            if (specItems.isEmpty()) return ReportResponse.fail("메뉴를 인식하지 못했어요.");

            // 4) 렌더러 스펙(JSON) 생성
            ObjectNode spec = om.createObjectNode();
            spec.put("brandId", brandId); spec.put("brandName", brandName);
            spec.put("screen", "menu"); spec.put("title", title);
            spec.put("aspect", Math.round((double) W / H * 10000d) / 10000d);
            ObjectNode theme = spec.putObject("theme");
            theme.put("pageBg", "#e9edf1"); theme.put("sidebarBg", "#eef1f6");
            theme.put("cardBg", "#ffffff"); theme.put("thumbBg", "#faf6ea");
            theme.put("accent", "#F5851F"); theme.put("price", "#3a3f5a");
            theme.put("tabActiveBg", "#d7d9e0");
            ArrayNode side = spec.putArray("sidebar");
            JsonNode cats = root.path("categories");
            if (cats.isArray() && !cats.isEmpty()) cats.forEach(n -> side.add(n.asText()));
            else side.add(title);
            spec.put("activeCategory", side.get(0).asText(title));
            spec.put("cols", cols);
            spec.put("cartLabel", "장바구니"); spec.put("togoLabel", "포장주문");
            spec.set("items", specItems);

            // 5) DB 저장
            repo.save(new KioskSpec(brandId, brandName, om.writeValueAsString(spec)));
            log.info("제보 등록: {} ({}개 메뉴)", brandId, specItems.size());
            return new ReportResponse(true, brandId, brandName, specItems.size(), "등록 완료");
        } catch (Exception e) {
            log.warn("제보 처리 실패: {}", e.getMessage());
            return ReportResponse.fail("처리 중 문제가 생겼어요. 다시 시도해 주세요.");
        }
    }

    private void cropSave(BufferedImage img, int W, int H, JsonNode it, File out) {
        try {
            double x = it.path("x").asDouble(0), y = it.path("y").asDouble(0),
                   w = it.path("w").asDouble(0), h = it.path("h").asDouble(0);
            int cx = clamp((int) Math.round(x / 100 * W), 0, W - 1);
            int cy = clamp((int) Math.round(y / 100 * H), 0, H - 1);
            int cw = clamp((int) Math.round(w / 100 * W), 1, W - cx);
            int ch = clamp((int) Math.round(h / 100 * H), 1, H - cy);
            if (w <= 0 || h <= 0) return; // 위치정보 없으면 크롭 생략(썸네일 없음)
            ImageIO.write(img.getSubimage(cx, cy, cw, ch), "jpg", out);
        } catch (Exception e) {
            log.debug("크롭 실패(무시): {}", e.getMessage());
        }
    }

    private static int clamp(int v, int lo, int hi) { return Math.max(lo, Math.min(hi, v)); }
    private static String txt(JsonNode n, String k, String def) {
        String v = n.path(k).asText("").trim(); return v.isEmpty() ? def : v;
    }
    private static String slug(String s) {
        if (s == null) return "kiosk";
        String out = s.toLowerCase().replaceAll("[^a-z0-9]+", "");
        return out.isEmpty() ? "kiosk" : (out.length() > 20 ? out.substring(0, 20) : out);
    }

    private String extractJson(String s) {
        int a = s.indexOf('{'), b = s.lastIndexOf('}');
        return (a >= 0 && b > a) ? s.substring(a, b + 1) : s;
    }
}
