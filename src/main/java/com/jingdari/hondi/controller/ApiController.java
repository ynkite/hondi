package com.jingdari.hondi.controller;

import com.jingdari.hondi.dto.*;
import com.jingdari.hondi.model.KioskInfo;
import com.jingdari.hondi.model.Language;
import com.jingdari.hondi.service.ConversationService;
import com.jingdari.hondi.service.KioskRepository;
import com.jingdari.hondi.service.TranslationService;
import com.jingdari.hondi.service.VisionService;
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

    public ApiController(ConversationService conversation, VisionService vision,
                         TranslationService translation, KioskRepository repo) {
        this.conversation = conversation;
        this.vision = vision;
        this.translation = translation;
        this.repo = repo;
    }

    /** 한 턴 대화 (2·3단계). */
    @PostMapping(value = "/chat", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ChatResponse chat(@RequestBody ChatRequest req) {
        return conversation.handle(req);
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
