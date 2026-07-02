package com.jingdari.omong.controller;

import com.jingdari.omong.dto.AuthUserResponse;
import com.jingdari.omong.dto.SignupRequest;
import com.jingdari.omong.model.AppUser;
import com.jingdari.omong.service.KakaoOAuthClient;
import com.jingdari.omong.service.UserService;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.Map;
import java.util.UUID;

/**
 * 로그인/가입 엔드포인트. 세션(HttpSession)만 사용 — 토큰/비밀번호 없음.
 * 로그인은 앱 사용의 "전제"가 아니라 "선택"이다(게스트-우선). 로그아웃 상태에서도 모든 기능이 동작한다.
 */
@RestController
public class AuthController {

    private static final String SESSION_UID = "uid";
    private static final String SESSION_STATE = "kakaoState";

    private final KakaoOAuthClient kakao;
    private final UserService userService;

    public AuthController(KakaoOAuthClient kakao, UserService userService) {
        this.kakao = kakao;
        this.userService = userService;
    }

    /** 현재 로그인 상태. 프런트가 헤더/주문서/버튼 분기를 여기에 맞춘다. */
    @GetMapping(value = "/auth/me", produces = MediaType.APPLICATION_JSON_VALUE)
    public AuthUserResponse me(HttpSession session) {
        Long uid = (Long) session.getAttribute(SESSION_UID);
        return userService.byId(uid)
                .map(u -> AuthUserResponse.of(u, kakao.configured()))
                .orElseGet(() -> AuthUserResponse.guest(kakao.configured()));
    }

    /** 카카오 동의화면으로 이동. 키 미설정이면 프런트가 애초에 안 부르지만, 방어적으로 홈 우회. */
    @GetMapping("/login/kakao")
    public void kakaoStart(HttpSession session, HttpServletResponse res) throws IOException {
        if (!kakao.configured()) { res.sendRedirect("/?login=unconfigured"); return; }
        String state = UUID.randomUUID().toString();
        session.setAttribute(SESSION_STATE, state);
        res.sendRedirect(kakao.authorizeUrl(state));
    }

    /** 카카오 콜백: code → 토큰 → 프로필 → 계정 업서트 → 세션. 실패해도 홈으로 부드럽게 복귀. */
    @GetMapping("/login/kakao/callback")
    public void kakaoCallback(@RequestParam(required = false) String code,
                              @RequestParam(required = false) String state,
                              @RequestParam(required = false) String error,
                              HttpSession session, HttpServletResponse res) throws IOException {
        String saved = (String) session.getAttribute(SESSION_STATE);
        session.removeAttribute(SESSION_STATE);
        if (error != null || code == null || state == null || !state.equals(saved)) {
            res.sendRedirect("/?login=fail"); return;
        }
        String token = kakao.exchangeCode(code);
        KakaoOAuthClient.Profile p = token == null ? null : kakao.fetchProfile(token);
        if (p == null) { res.sendRedirect("/?login=fail"); return; }

        AppUser u = userService.loginWithKakao(p.kakaoId(), p.nickname());
        session.setAttribute(SESSION_UID, u.getId());
        res.sendRedirect("/?login=ok");
    }

    /** 간편가입/로그인: 이름 + 전화번호. 카카오가 없거나 안 되는 사용자의 길. */
    @PostMapping(value = "/auth/signup", consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<AuthUserResponse> signup(@RequestBody SignupRequest req, HttpSession session) {
        try {
            AppUser u = userService.signupLocal(req.name(), req.phone());
            session.setAttribute(SESSION_UID, u.getId());
            return ResponseEntity.ok(AuthUserResponse.of(u, kakao.configured()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(AuthUserResponse.guest(kakao.configured()));
        }
    }

    /** 로그인 사용자의 전화번호만 보완(주문서에 필요할 때). */
    @PostMapping(value = "/auth/phone", consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<AuthUserResponse> phone(@RequestBody Map<String, String> body, HttpSession session) {
        Long uid = (Long) session.getAttribute(SESSION_UID);
        if (uid == null) return ResponseEntity.status(401).body(AuthUserResponse.guest(kakao.configured()));
        AppUser u = userService.updatePhone(uid, body.get("phone"));
        return ResponseEntity.ok(AuthUserResponse.of(u, kakao.configured()));
    }

    @PostMapping(value = "/auth/logout", produces = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> logout(HttpSession session) {
        session.invalidate();
        return Map.of("ok", true);
    }
}
