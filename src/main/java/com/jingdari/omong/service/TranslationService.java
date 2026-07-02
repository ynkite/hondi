package com.jingdari.omong.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jingdari.omong.model.Language;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.util.Collections;
import java.util.Map;

/**
 * 다국어 번역(③). 한국어 키오스크 텍스트 → 사용자 모국어.
 * 순서: 1) 사전(오프라인·즉시) → 2) AI(Ollama) → 3) 원문 그대로.
 * 언어 1~2개 추가는 사전/프롬프트만 늘리면 되어 저비용.
 */
@Service
public class TranslationService {

    private final ObjectMapper mapper;
    private final AiService ai;

    @Value("classpath:data/i18n-menu.json")
    private Resource dictResource;

    // 한국어 원문 -> (언어코드 -> 번역)
    private Map<String, Map<String, String>> dict = Collections.emptyMap();

    public TranslationService(ObjectMapper mapper, AiService ai) {
        this.mapper = mapper;
        this.ai = ai;
    }

    @PostConstruct
    void load() throws Exception {
        try (InputStream in = dictResource.getInputStream()) {
            dict = mapper.readValue(in, new TypeReference<Map<String, Map<String, String>>>() {});
        }
    }

    /** 한국어 text 를 사용자 언어로. */
    public String translate(String koText, Language lang) {
        if (koText == null || koText.isBlank() || lang == Language.KO) return koText;

        Map<String, String> entry = dict.get(koText.trim());
        if (entry != null && entry.containsKey(lang.name())) {
            return entry.get(lang.name());
        }

        String aiOut = ai.generate(
                "You are a translator. Translate the Korean text to " + lang.englishName()
                        + ". Output ONLY the translation, no quotes, no explanation.",
                koText);
        if (aiOut != null && !aiOut.isBlank()) {
            return aiOut.trim();
        }
        return koText; // 폴백: 원문 유지
    }
}
