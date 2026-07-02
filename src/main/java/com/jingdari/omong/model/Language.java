package com.jingdari.omong.model;

import java.util.Arrays;
import java.util.Optional;

/**
 * 지원 언어. 페르소나(베트남 28세 외국인 근로자) 기준으로 한·영·베·중·일 5개.
 * - flag   : 시작 화면 국기 탭에 쓰는 이모지
 * - native : 그 언어로 표기한 언어 이름(언어 선택 UI 표시용)
 * - bcp47  : 브라우저 음성인식(STT)·음성합성(TTS) 및 번역 프롬프트에 쓰는 코드
 */
public enum Language {
    KO("🇰🇷", "한국어",      "ko-KR", "Korean"),
    EN("🇺🇸", "English",     "en-US", "English"),
    VI("🇻🇳", "Tiếng Việt",  "vi-VN", "Vietnamese"),
    ZH("🇨🇳", "中文",         "zh-CN", "Chinese"),
    JA("🇯🇵", "日本語",       "ja-JP", "Japanese");

    private final String flag;
    private final String nativeName;
    private final String bcp47;
    private final String englishName;

    Language(String flag, String nativeName, String bcp47, String englishName) {
        this.flag = flag;
        this.nativeName = nativeName;
        this.bcp47 = bcp47;
        this.englishName = englishName;
    }

    public String flag() { return flag; }
    public String nativeName() { return nativeName; }
    public String bcp47() { return bcp47; }
    public String englishName() { return englishName; }

    /** "ko", "ko-KR", "KO" 무엇이 와도 최대한 매칭. 모르면 KO. */
    public static Language from(String raw) {
        if (raw == null || raw.isBlank()) return KO;
        String v = raw.trim().toLowerCase();
        return Arrays.stream(values())
                .filter(l -> v.equals(l.name().toLowerCase())
                        || v.startsWith(l.name().toLowerCase())
                        || l.bcp47.toLowerCase().startsWith(v))
                .findFirst()
                .orElse(KO);
    }

    public static Optional<Language> tryFrom(String raw) {
        return Arrays.stream(values())
                .filter(l -> l.name().equalsIgnoreCase(raw))
                .findFirst();
    }
}
