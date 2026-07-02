package com.jingdari.omong.controller;

import com.jingdari.omong.dto.AuthUserResponse;
import com.jingdari.omong.dto.SignupRequest;
import com.jingdari.omong.model.AppUser;
import com.jingdari.omong.service.KakaoOAuthClient;
import com.jingdari.omong.service.UserService;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.Map;
import java.util.UUID;

/**
 * 로그인/가입 엔드포인트. 세션(HttpSession) + 자동로그인 쿠키(remember-me)만 사용 — 비밀번호 없음.
 * 로그인은 앱 사용의 "전제"가 아니라 "선택"이다(게스트-우선). 로그아웃 상태에서도 모든 기능이 동작한다.
 * 자동로그인: 로그인 성공 시 토큰을 발급해 장기 쿠키로 내려줌 → 재방문 시 RememberMeFilter 가 세션을 복원.
 *   덕분에 간편가입(이름·전화번호) 사용자도 "한 번만" 입력하면 다음부턴 자동 로그인된다.
 */
@RestController
public class AuthController {

    private static final String SESSION_UID = "uid";
    private static final String SESSION_STATE = "kakaoState";
    public static final String REMEMBER_COOKIE = "omong_remember";
    private static final int REMEMBER_MAX_AGE = 60 * 24 * 60 * 60; // 60일

    private final KakaoOAuthClient kakao;
    private final UserService userService;

    public AuthController(KakaoOAuthClient kakao, UserService userService) {
        this.kakao = kakao;
        this.userService = userService;
    }

    /** 로그인 성공 처리 공통: 세션 저장 + 자동로그인 쿠키 발급. */
    private void login(AppUser u, HttpSession session, HttpServletResponse res) {
        session.setAttribute(SESSION_UID, u.getId());
        String token = userService.issueRememberToken(u);
        Cookie c = new Cookie(REMEMBER_COOKIE, token);
        c.setPath("/"); c.setHttpOnly(true); c.setMaxAge(REMEMBER_MAX_AGE);
        res.addCookie(c);
    }

    /** 자동로그인 쿠키 즉시 만료. */
    private void expireRememberCookie(HttpServletResponse res) {
        Cookie c = new Cookie(REMEMBER_COOKIE, "");
        c.setPath("/"); c.setHttpOnly(true); c.setMaxAge(0);
        res.addCookie(c);
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
        login(u, session, res);
        res.sendRedirect("/?login=ok");
    }

    /** 간편가입/로그인: 이름 + 전화번호. 카카오가 없거나 안 되는 사용자의 길. */
    @PostMapping(value = "/auth/signup", consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<AuthUserResponse> signup(@RequestBody SignupRequest req, HttpSession session,
                                                   HttpServletResponse res) {
        try {
            AppUser u = userService.signupLocal(req.name(), req.phone());
            login(u, session, res);
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
    public Map<String, Object> logout(HttpSession session, HttpServletResponse res) {
        Long uid = (Long) session.getAttribute(SESSION_UID);
        userService.clearRememberToken(uid);   // 서버 토큰 무효화(다른 기기 자동로그인도 해제)
        expireRememberCookie(res);
        session.invalidate();
        return Map.of("ok", true);
    }
}
