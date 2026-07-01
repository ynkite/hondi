package com.jingdari.hondi.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.ollama.OllamaChatModel;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.stereotype.Service;
import org.springframework.util.MimeType;
import org.springframework.util.MimeTypeUtils;

/**
 * AI 호출의 단일 진입점. "AI와 규칙의 분리" 원칙에서 AI가 맡는 부분
 *   ① 모르는 키오스크 화면을 사진으로 읽기  ② 자유 발화 이해  ③ 다국어 번역
 * 만 여기를 통한다.
 *
 * 지금은 Ollama(로컬)만 활성. OpenAI / Claude 는 build.gradle + 아래 주석을 풀고
 * 비교 테스트 후 더 잘하는 쪽으로 교체할 예정.
 *
 * Ollama 가 안 떠 있거나 호출이 실패하면 ready()=false 로 떨어지고, 호출부는
 * 규칙/DB 기반 폴백으로 동작한다(데모가 절대 죽지 않게).
 *
 * NOTE: Spring AI 버전에 따라 ChatClient 미디어 API 시그니처가 다를 수 있음.
 *       (1.0+: user(u -> u.text(..).media(mimeType, resource)))
 */
@Service
public class AiService {

    private static final Logger log = LoggerFactory.getLogger(AiService.class);

    private final ObjectProvider<OllamaChatModel> ollamaProvider;
    private final String provider;        // ollama | mock
    private volatile Boolean ollamaUp;    // 캐시된 헬스체크 결과

    public AiService(ObjectProvider<OllamaChatModel> ollamaProvider,
                     @Value("${kiosk.ai.provider:ollama}") String provider) {
        this.ollamaProvider = ollamaProvider;
        this.provider = provider == null ? "ollama" : provider.trim().toLowerCase();
    }

    /** 실제 AI 호출이 가능한 상태인지. */
    public boolean ready() {
        if (!"ollama".equals(provider)) return false;
        if (ollamaUp != null) return ollamaUp;
        boolean up = ollamaProvider.getIfAvailable() != null;
        // 가벼운 호출로 실제 연결 확인은 첫 호출 때 try/catch 로 처리(여기선 빈 존재만)
        return up;
    }

    private ChatClient client() {
        OllamaChatModel model = ollamaProvider.getIfAvailable();
        if (model == null) throw new IllegalStateException("Ollama ChatModel 빈 없음");
        return ChatClient.create(model);
    }

    /** 텍스트 추론. 실패 시 null 반환(호출부가 폴백). */
    public String generate(String system, String user) {
        if (!ready()) return null;
        try {
            String out = client().prompt().system(system).user(user).call().content();
            ollamaUp = true;
            return out;
        } catch (Exception e) {
            ollamaUp = false;
            log.warn("Ollama 텍스트 호출 실패 → 폴백: {}", e.getMessage());
            return null;
        }
    }

    /** 이미지 + 프롬프트(화면 읽기). 실패 시 null. */
    public String generateWithImage(String system, String user, byte[] image, String mime) {
        if (!ready() || image == null || image.length == 0) return null;
        try {
            MimeType mimeType = (mime == null || mime.isBlank())
                    ? MimeTypeUtils.IMAGE_PNG : MimeTypeUtils.parseMimeType(mime);
            ByteArrayResource resource = new ByteArrayResource(image);
            String out = client().prompt()
                    .system(system)
                    .user(u -> u.text(user).media(mimeType, resource))
                    .call()
                    .content();
            ollamaUp = true;
            return out;
        } catch (Exception e) {
            ollamaUp = false;
            log.warn("Ollama 비전 호출 실패 → 폴백: {}", e.getMessage());
            return null;
        }
    }

    /* ===== [추후] OpenAI / Claude 비교용 자리 =====
       build.gradle 의 starter 주석을 풀고, application.properties 에 키를 넣은 뒤
       ObjectProvider<OpenAiChatModel> / ObjectProvider<AnthropicChatModel> 를 주입해
       provider 스위치(openai|claude)로 분기하면 됨.
       두 모델로 같은 프롬프트를 돌려 화면 인식 정확도를 비교한 뒤 더 나은 쪽을 기본값으로. */
}
