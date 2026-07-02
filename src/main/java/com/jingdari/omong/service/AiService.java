package com.jingdari.omong.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.anthropic.AnthropicChatModel;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.ollama.OllamaChatModel;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.stereotype.Service;
import org.springframework.util.MimeType;
import org.springframework.util.MimeTypeUtils;

import java.util.ArrayList;
import java.util.List;

/**
 * AI 호출의 단일 진입점. AI가 맡는 부분:
 *   ① 모르는 화면 사진 읽기  ② 자유 발화 이해  ③ 다국어 번역  ④ 가게 맞춤 좁혀가기 질문 생성
 *
 * provider = mindlogic(기본) | claude | ollama | mock.
 * provider=mindlogic 이면 하나의 MindLogic 키로 kiosk.ai.models 목록을
 *   claude → openai → groq → gemini 순으로 시도하고, 첫 성공을 사용한다.
 *   - 한 모델이 실패(400 등)하면 다음 모델로
 *   - 게이트웨이 자체에 못 닿으면(네트워크 down) 체인 중단 → 호출부가 규칙 폴백
 * (데모가 절대 죽지 않게)
 */
@Service
public class AiService {

    private static final Logger log = LoggerFactory.getLogger(AiService.class);

    private final MindLogicClient mindLogic;
    private final ObjectProvider<AnthropicChatModel> anthropicProvider;
    private final ObjectProvider<OllamaChatModel> ollamaProvider;
    private final String provider;        // mindlogic | claude | ollama | mock
    private final List<String> models;    // 폴백 순서 (mindlogic 전용)

    public AiService(MindLogicClient mindLogic,
                     ObjectProvider<AnthropicChatModel> anthropicProvider,
                     ObjectProvider<OllamaChatModel> ollamaProvider,
                     @Value("${kiosk.ai.provider:mindlogic}") String provider,
                     @Value("${kiosk.ai.models:${kiosk.ai.model:claude-sonnet-4-6}}") String models) {
        this.mindLogic = mindLogic;
        this.anthropicProvider = anthropicProvider;
        this.ollamaProvider = ollamaProvider;
        this.provider = provider == null ? "mindlogic" : provider.trim().toLowerCase();
        this.models = new ArrayList<>();
        if (models != null) {
            for (String m : models.split(",")) {
                String t = m.trim();
                if (!t.isEmpty()) this.models.add(t);
            }
        }
        if (this.models.isEmpty()) this.models.add("claude-sonnet-4-6");
    }

    private ChatModel activeModel() {
        if ("claude".equals(provider)) return anthropicProvider.getIfAvailable();
        if ("ollama".equals(provider)) return ollamaProvider.getIfAvailable();
        return null;
    }

    /** 실제 AI 호출이 가능한 상태인지. */
    public boolean ready() {
        if ("mock".equals(provider)) return false;
        if ("mindlogic".equals(provider)) return mindLogic.configured() && !models.isEmpty();
        return activeModel() != null;
    }

    private ChatClient client() {
        ChatModel model = activeModel();
        if (model == null) throw new IllegalStateException("활성 ChatModel 빈 없음(provider=" + provider + ")");
        return ChatClient.create(model);
    }

    /** 텍스트 추론. 실패 시 null(호출부가 폴백). */
    public String generate(String system, String user) {
        if (!ready()) return null;
        if ("mindlogic".equals(provider)) {
            for (String model : models) {
                MindLogicClient.Result r = mindLogic.generate(model, system, user);
                if (r.content() != null) return r.content();
                if (!r.reachable()) break;   // 네트워크 불가 → 체인 중단
            }
            return null;
        }
        try {
            return client().prompt().system(system).user(user).call().content();
        } catch (Exception e) {
            log.warn("AI({}) 텍스트 호출 실패 → 폴백: {}", provider, e.getMessage());
            return null;
        }
    }

    /** 이미지 + 프롬프트(화면 읽기). 실패 시 null. */
    public String generateWithImage(String system, String user, byte[] image, String mime) {
        if (!ready() || image == null || image.length == 0) return null;
        if ("mindlogic".equals(provider)) {
            for (String model : models) {
                MindLogicClient.Result r = mindLogic.generateWithImage(model, system, user, image, mime);
                if (r.content() != null) return r.content();
                if (!r.reachable()) break;
            }
            return null;
        }
        try {
            MimeType mimeType = (mime == null || mime.isBlank())
                    ? MimeTypeUtils.IMAGE_PNG : MimeTypeUtils.parseMimeType(mime);
            ByteArrayResource resource = new ByteArrayResource(image);
            return client().prompt()
                    .system(system)
                    .user(u -> u.text(user).media(mimeType, resource))
                    .call()
                    .content();
        } catch (Exception e) {
            log.warn("AI({}) 비전 호출 실패 → 폴백: {}", provider, e.getMessage());
            return null;
        }
    }

    public String provider() { return provider; }
    public List<String> models() { return List.copyOf(models); }
}
