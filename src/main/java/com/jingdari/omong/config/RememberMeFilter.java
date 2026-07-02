package com.jingdari.omong.config;

import com.jingdari.omong.controller.AuthController;
import com.jingdari.omong.model.AppUser;
import com.jingdari.omong.service.UserService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * 자동 로그인(remember-me): 세션에 로그인 정보가 없고, 브라우저에 유효한 remember 쿠키가 있으면
 * 그 토큰으로 사용자를 찾아 세션을 복원한다. 덕분에 간편가입 사용자도 재방문 시 재입력이 필요 없다.
 * (게스트-우선 원칙 유지 — 쿠키가 없으면 그냥 통과, 아무 것도 강제하지 않음)
 */
@Component
public class RememberMeFilter extends OncePerRequestFilter {

    private static final String SESSION_UID = "uid";

    private final UserService userService;

    public RememberMeFilter(UserService userService) {
        this.userService = userService;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        HttpSession existing = req.getSession(false);
        boolean loggedIn = existing != null && existing.getAttribute(SESSION_UID) != null;
        String token = loggedIn ? null : readRememberCookie(req);
        if (token != null) {
            AppUser u = userService.byRememberToken(token).orElse(null);
            if (u != null) req.getSession(true).setAttribute(SESSION_UID, u.getId());
        }
        chain.doFilter(req, res);
    }

    private String readRememberCookie(HttpServletRequest req) {
        Cookie[] cookies = req.getCookies();
        if (cookies == null) return null;
        for (Cookie c : cookies) {
            if (AuthController.REMEMBER_COOKIE.equals(c.getName())) {
                String v = c.getValue();
                return (v == null || v.isBlank()) ? null : v;
            }
        }
        return null;
    }
}
