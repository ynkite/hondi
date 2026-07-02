package com.jingdari.omong.controller;

import com.jingdari.omong.dto.*;
import com.jingdari.omong.model.KioskInfo;
import com.jingdari.omong.model.Language;
import com.jingdari.omong.service.ConversationService;
import com.jingdari.omong.service.FunnelService;
import com.jingdari.omong.service.KioskRepository;
import com.jingdari.omong.service.KioskSpecRepository;
import com.jingdari.omong.service.RecognitionService;
import com.jingdari.omong.service.ReportService;
import org.springframework.http.ResponseEntity;
import com.jingdari.omong.service.TranslationService;
import com.jingdari.omong.service.VisionService;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** 도우미 앱의 백엔드 API. */
@RestController
@RequestMapping("/api")
public class ApiController {

    private final ConversationService conversation;
    private final VisionService vision;
    private final TranslationService translation;
    private final KioskRepository repo;
    private final FunnelService funnel;
    private final RecognitionService recognition;
    private final KioskSpecRepository specRepo;
    private final ReportService report;

    public ApiController(ConversationService conversation, VisionService vision,
                         TranslationService translation, KioskRepository repo,
                         FunnelService funnel, RecognitionService recognition,
                         KioskSpecRepository specRepo, ReportService report) {
        this.conversation = conversation;
        this.vision = vision;
        this.translation = translation;
        this.repo = repo;
        this.funnel = funnel;
        this.recognition = recognition;
        this.specRepo = specRepo;
        this.report = report;
    }

    /** 한 턴 대화 (2·3단계). */
    @PostMapping(value = "/chat", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ChatResponse chat(@RequestBody ChatRequest req) {
        return conversation.handle(req);
    }

    /** AI 좁혀가기: 남은 후보 메뉴 → 가게 맞춤 질문 1개(Claude). 실패 시 question=null(프론트 규칙 폴백). */
    @PostMapping(value = "/funnel", consumes = MediaType.APPLICATION_JSON_VALUE)
    public FunnelResponse funnel(@RequestBody FunnelRequest req) {
        return funnel.next(req);
    }

    /** 좁혀가기 '질문 계획'을 한 번에 생성(범용, 매장 메뉴 기반). 프론트가 즉시 걸어감. */
    @PostMapping(value = "/plan", consumes = MediaType.APPLICATION_JSON_VALUE)
    public java.util.List<FunnelResponse> plan(@RequestBody FunnelRequest req) {
        return funnel.plan(req);
    }

    /** 말하기 진입: 발화/입력 텍스트로 가게 판별(AI, 키워드 폴백). */
    @PostMapping(value = "/intent", consumes = MediaType.APPLICATION_JSON_VALUE)
    public RecognizeResponse intent(@RequestBody IntentRequest req) {
        return recognition.fromText(req.text());
    }

    /** 스마트 대화: 잡담도 자연스럽게 받되, 가게/메뉴를 추측해 확인 질문을 돌려준다. */
    @PostMapping(value = "/converse", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ConverseResponse converse(@RequestBody IntentRequest req) {
        return recognition.converse(req.text());
    }

    /** 실시간 음성: 두서없는 발화에서 메뉴 하나를 골라 id 반환(없으면 NONE). */
    @PostMapping(value = "/pick", consumes = MediaType.APPLICATION_JSON_VALUE)
    public java.util.Map<String, String> pick(@RequestBody PickRequest req) {
        return java.util.Map.of("itemId", funnel.pick(req.text(), req.items()));
    }

    /** 브랜드 화면 스펙(범용 렌더러용 JSON)을 DB에서 반환. */
    @GetMapping(value = "/brands/{brandId}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> brandSpec(@PathVariable String brandId) {
        try {
            return specRepo.findById(brandId)
                    .map(k -> ResponseEntity.ok(k.getSpecJson()))
                    .orElse(ResponseEntity.notFound().build());
        } catch (Exception e) {
            // DB 미기동 → 404 로 응답해 프론트가 정적 스펙으로 폴백(데모 안 죽음)
            return ResponseEntity.notFound().build();
        }
    }

    /** 제보: 키오스크 사진 → AI 분석 → 상품 크롭 → DB에 새 키오스크 스펙 저장. */
    @PostMapping(value = "/report", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ReportResponse report(@RequestParam("image") MultipartFile image,
                                 @RequestParam(value = "storeName", required = false) String storeName,
                                 @RequestParam(value = "reporterName", required = false) String reporterName)
            throws IOException {
        return report.process(image.getBytes(), image.getContentType(), storeName, reporterName);
    }

    /** 사진 진입: 업로드 사진으로 가게 판별(AI 비전). 미인식 시 brandId=NONE. */
    @PostMapping(value = "/recognize", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public RecognizeResponse recognize(@RequestParam("image") MultipartFile image) throws IOException {
        return recognition.fromImage(image.getBytes(), image.getContentType());
    }

    /** 사진 분석 (1·2단계의 화면 읽기). */
    @PostMapping(value = "/analyze", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public AnalyzeResponse analyze(@RequestParam("image") MultipartFile image,
                                   @RequestParam(value = "language", defaultValue = "KO") String language,
                                   @RequestParam(value = "brandId", required = false) String brandId)
            throws IOException {
        Language lang = Language.from(language);
        return vision.analyze(image.getBytes(), image.getContentType(), lang, brandId);
    }

    /** 임의 텍스트 번역. */
    @PostMapping(value = "/translate", consumes = MediaType.APPLICATION_JSON_VALUE)
    public TranslateResponse translate(@RequestBody TranslateRequest req) {
        Language lang = Language.from(req.language());
        return new TranslateResponse(translation.translate(req.text(), lang), lang.name());
    }

    /** 지원 언어 목록(국기 탭용). */
    @GetMapping("/languages")
    public List<Map<String, String>> languages() {
        List<Map<String, String>> out = new ArrayList<>();
        for (Language l : Language.values()) {
            out.add(Map.of("code", l.name(), "flag", l.flag(),
                    "native", l.nativeName(), "bcp47", l.bcp47()));
        }
        return out;
    }

    /** 0단계 DB 전체(데모 키오스크 목록·화면 흐름). */
    @GetMapping("/kiosks")
    public Iterable<KioskInfo> kiosks() {
        return repo.all();
    }

    @GetMapping("/kiosks/{brandId}")
    public KioskInfo kiosk(@PathVariable String brandId) {
        return repo.byBrandId(brandId).orElse(null);
    }
}
