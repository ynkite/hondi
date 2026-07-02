package com.jingdari.omong.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;

/**
 * MindLogic FactChat API Gateway 호출 (OpenAI 호환, 단일 키로 여러 제공사 라우팅).
 *   Base URL : https://factchat-cloud.mindlogic.ai/v1/gateway
 *   Endpoint : POST {base}/chat/completions/
 *   Auth     : Authorization: Bearer {api-key}
 *   Model    : 호출 시마다 전달(claude/gpt/groq/gemini 등)  ← 폴백 체인은 AiService가 담당
 *
 * 반환은 Result(content, reachable):
 *   - content != null           → 성공
 *   - content == null, reachable=true  → 게이트웨이는 응답했지만 그 모델은 실패(400 등) → 다음 모델 시도
 *   - content == null, reachable=false → 네트워크 자체 불가 → 체인 중단(규칙 폴백)
 */
@Service
public class MindLogicClient {

    private static final Logger log = LoggerFactory.getLogger(MindLogicClient.class);

    public record Result(String content, boolean reachable) {
        static Result ok(String c) { return new Result(c, true); }
        static Result httpFail() { return new Result(null, true); }
        static Result unreachable() { return new Result(null, false); }
    }

    private final String baseUrl;
    private final String apiKey;
    private final double temperature;   // < 0 이면 요청에 temperature 미포함(모델 호환성)
    private final ObjectMapper om;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(6)).build();

    public MindLogicClient(@Value("${mindlogic.base-url:}") String baseUrl,
                           @Value("${mindlogic.api-key:}") String apiKey,
                           @Value("${mindlogic.temperature:-1}") double temperature,
                           ObjectMapper om) {
        this.baseUrl = baseUrl == null ? "" : baseUrl.trim();
        this.apiKey = apiKey == null ? "" : apiKey.trim();
        this.temperature = temperature;
        this.om = om;
    }

    public boolean configured() { return !baseUrl.isBlank() && !apiKey.isBlank(); }

    private String endpoint() { return baseUrl.replaceAll("/+$", "") + "/chat/completions/"; }

    /** 텍스트 추론(모델 지정). */
    public Result generate(String model, String system, String user) {
        return call(buildBody(model, system, user, null, null));
    }

    /** 이미지 + 프롬프트(모델 지정). OpenAI 호환 image_url(base64 data URL). */
    public Result generateWithImage(String model, String system, String user, byte[] image, String mime) {
        if (image == null || image.length == 0) return Result.httpFail();
        String dataUrl = "data:" + (mime == null || mime.isBlank() ? "image/png" : mime)
                + ";base64," + Base64.getEncoder().encodeToString(image);
        return call(buildBody(model, system, user, image, dataUrl));
    }

    private ObjectNode buildBody(String model, String system, String user, byte[] image, String dataUrl) {
        ObjectNode body = om.createObjectNode();
        body.put("model", model);
        if (temperature >= 0) body.put("temperature", temperature);
        ArrayNode msgs = body.putArray("messages");
        if (system != null && !system.isBlank()) {
            ObjectNode s = msgs.addObject();
            s.put("role", "system");
            s.put("content", system);
        }
        ObjectNode u = msgs.addObject();
        u.put("role", "user");
        if (image == null) {
            u.put("content", user);
        } else {
            ArrayNode content = u.putArray("content");
            content.addObject().put("type", "text").put("text", user);
            ObjectNode imgPart = content.addObject();
            imgPart.put("type", "image_url");
            imgPart.putObject("image_url").put("url", dataUrl);
        }
        return body;
    }

    private Result call(ObjectNode body) {
        if (!configured()) return Result.unreachable();
        HttpResponse<String> res;
        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create(endpoint()))
                    .timeout(Duration.ofSeconds(30))
                    .header("Content-Type", "application/json")
                    .header("Authorization", "Bearer " + apiKey)
                    .POST(HttpRequest.BodyPublishers.ofString(om.writeValueAsString(body), StandardCharsets.UTF_8))
                    .build();
            res = http.send(req, HttpResponse.BodyHandlers.ofString());
        } catch (Exception e) {
            // 연결 자체 실패(네트워크 down / DNS / 타임아웃) → 체인 중단 신호
            log.warn("MindLogic 연결 실패 → 폴백: {}", e.getMessage());
            return Result.unreachable();
        }
        try {
            if (res.statusCode() / 100 != 2) {
                log.warn("MindLogic {} (model 실패) → 다음 모델: {}", res.statusCode(), truncate(res.body()));
                return Result.httpFail();
            }
            JsonNode root = om.readTree(res.body());
            String content = root.path("choices").path(0).path("message").path("content").asText(null);
            return (content == null || content.isBlank()) ? Result.httpFail() : Result.ok(content);
        } catch (Exception e) {
            log.warn("MindLogic 응답 파싱 실패 → 다음 모델: {}", e.getMessage());
            return Result.httpFail();
        }
    }

    private String truncate(String s) {
        if (s == null) return "";
        return s.length() > 300 ? s.substring(0, 300) + "…" : s;
    }
}
