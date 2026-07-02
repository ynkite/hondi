package com.jingdari.omong.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

/**
 * 카카오 로그인(OAuth2 Authorization Code) 최소 구현.
 * Spring Security 를 붙이면 나머지 /api/** 가 전부 잠기고 게스트-우선 흐름이 깨지므로,
 * 기존 MindLogicClient 처럼 순수 HttpClient 로 필요한 3단계만 직접 호출한다.
 *
 *   1) authorizeUrl() 로 사용자를 카카오 동의화면으로 보냄
 *   2) 콜백의 code 를 exchangeCode() 로 access_token 교환
 *   3) fetchProfile() 로 회원번호 + 닉네임 획득
 *
 * 키(rest-api-key / redirect-uri)가 비어 있으면 configured()=false → 프런트가 간편가입으로 우회.
 */
@Service
public class KakaoOAuthClient {

    private static final Logger log = LoggerFactory.getLogger(KakaoOAuthClient.class);

    private static final String AUTHORIZE = "https://kauth.kakao.com/oauth/authorize";
    private static final String TOKEN = "https://kauth.kakao.com/oauth/token";
    private static final String USERME = "https://kapi.kakao.com/v2/user/me";

    public record Profile(String kakaoId, String nickname) {}

    private final String restApiKey;
    private final String clientSecret;   // 선택(카카오 콘솔에서 client_secret 사용 ON 일 때만)
    private final String redirectUri;
    private final ObjectMapper om;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(6)).build();

    public KakaoOAuthClient(@Value("${kakao.rest-api-key:}") String restApiKey,
                            @Value("${kakao.client-secret:}") String clientSecret,
                            @Value("${kakao.redirect-uri:}") String redirectUri,
                            ObjectMapper om) {
        this.restApiKey = restApiKey == null ? "" : restApiKey.trim();
        this.clientSecret = clientSecret == null ? "" : clientSecret.trim();
        this.redirectUri = redirectUri == null ? "" : redirectUri.trim();
        this.om = om;
    }

    public boolean configured() { return !restApiKey.isBlank() && !redirectUri.isBlank(); }

    /** 동의화면 URL. 닉네임만 요청(전화번호·실명은 카카오 비즈앱 검수 대상이라 데모 범위 밖). */
    public String authorizeUrl(String state) {
        return AUTHORIZE
                + "?response_type=code"
                + "&client_id=" + enc(restApiKey)
                + "&redirect_uri=" + enc(redirectUri)
                + "&scope=" + enc("profile_nickname")
                + (state != null ? "&state=" + enc(state) : "");
    }

    /** code → access_token. 실패 시 null. */
    public String exchangeCode(String code) {
        if (!configured() || code == null || code.isBlank()) return null;
        StringBuilder form = new StringBuilder()
                .append("grant_type=authorization_code")
                .append("&client_id=").append(enc(restApiKey))
                .append("&redirect_uri=").append(enc(redirectUri))
                .append("&code=").append(enc(code));
        if (!clientSecret.isBlank()) form.append("&client_secret=").append(enc(clientSecret));
        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create(TOKEN))
                    .timeout(Duration.ofSeconds(15))
                    .header("Content-Type", "application/x-www-form-urlencoded;charset=utf-8")
                    .POST(HttpRequest.BodyPublishers.ofString(form.toString(), StandardCharsets.UTF_8))
                    .build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() / 100 != 2) {
                log.warn("카카오 토큰 교환 실패 {}: {}", res.statusCode(), truncate(res.body()));
                return null;
            }
            return om.readTree(res.body()).path("access_token").asText(null);
        } catch (Exception e) {
            log.warn("카카오 토큰 교환 오류: {}", e.getMessage());
            return null;
        }
    }

    /** access_token → (회원번호, 닉네임). 실패 시 null. */
    public Profile fetchProfile(String accessToken) {
        if (accessToken == null || accessToken.isBlank()) return null;
        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create(USERME))
                    .timeout(Duration.ofSeconds(15))
                    .header("Authorization", "Bearer " + accessToken)
                    .GET()
                    .build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() / 100 != 2) {
                log.warn("카카오 프로필 조회 실패 {}: {}", res.statusCode(), truncate(res.body()));
                return null;
            }
            JsonNode root = om.readTree(res.body());
            String id = root.path("id").asText(null);
            if (id == null) return null;
            String nick = root.path("kakao_account").path("profile").path("nickname").asText(null);
            if (nick == null || nick.isBlank()) nick = root.path("properties").path("nickname").asText(null);
            return new Profile(id, nick);
        } catch (Exception e) {
            log.warn("카카오 프로필 조회 오류: {}", e.getMessage());
            return null;
        }
    }

    private static String enc(String s) { return URLEncoder.encode(s == null ? "" : s, StandardCharsets.UTF_8); }

    private static String truncate(String s) {
        if (s == null) return "";
        return s.length() > 300 ? s.substring(0, 300) + "…" : s;
    }
}
