package com.jingdari.omong.service;

import com.jingdari.omong.model.AppUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

/**
 * 로그인/가입의 도메인 로직. 컨트롤러는 세션만 다루고, 여기서 계정 정리를 맡는다.
 *   - 카카오: kakaoId 로 찾고 없으면 생성(닉네임 저장, 전화번호는 나중에).
 *   - 간편가입: 전화번호가 신원. 같은 번호면 같은 계정에 이름만 갱신(재가입=재로그인).
 */
@Service
public class UserService {

    private final UserRepository users;

    public UserService(UserRepository users) {
        this.users = users;
    }

    /** 전화번호에서 숫자만 남긴다. "010-1234-5678" → "01012345678". 빈 값이면 null. */
    public static String normalizePhone(String raw) {
        if (raw == null) return null;
        String digits = raw.replaceAll("\\D", "");
        return digits.isBlank() ? null : digits;
    }

    /** 이름은 공백 정리 + 40자 방어. */
    public static String cleanName(String raw) {
        if (raw == null) return null;
        String n = raw.trim().replaceAll("\\s+", " ");
        if (n.isBlank()) return null;
        return n.length() > 40 ? n.substring(0, 40) : n;
    }

    @Transactional
    public AppUser loginWithKakao(String kakaoId, String nickname) {
        Optional<AppUser> found = users.findByKakaoId(kakaoId);
        if (found.isPresent()) {
            AppUser u = found.get();
            String nm = cleanName(nickname);
            if (nm != null && (u.getName() == null || u.getName().isBlank())) {
                u.setName(nm);   // 닉네임이 비어 있던 계정만 채운다(사용자가 고친 이름은 보존)
            }
            return u;
        }
        return users.save(new AppUser(kakaoId, cleanName(nickname), null, "kakao"));
    }

    /** 간편가입/로그인: 이름+전화번호. 번호가 이미 있으면 그 계정으로 로그인하며 이름만 최신화. */
    @Transactional
    public AppUser signupLocal(String name, String phone) {
        String p = normalizePhone(phone);
        String n = cleanName(name);
        if (p == null) throw new IllegalArgumentException("phone");
        AppUser u = users.findByPhone(p).orElse(null);
        if (u == null) {
            return users.save(new AppUser(null, n, p, "local"));
        }
        if (n != null) u.setName(n);
        return u;
    }

    public Optional<AppUser> byId(Long id) {
        return id == null ? Optional.empty() : users.findById(id);
    }

    /** 자동 로그인 토큰 발급(로그인 시). 쿠키로 내려줄 값을 반환. */
    @Transactional
    public String issueRememberToken(AppUser u) {
        String token = java.util.UUID.randomUUID().toString().replace("-", "");
        u.setRememberToken(token);
        users.save(u);
        return token;
    }

    /** 쿠키 토큰으로 사용자 찾기(재방문 시 세션 복원용). */
    public Optional<AppUser> byRememberToken(String token) {
        return (token == null || token.isBlank()) ? Optional.empty() : users.findByRememberToken(token);
    }

    /** 로그아웃 시 토큰 무효화. */
    @Transactional
    public void clearRememberToken(Long id) {
        if (id == null) return;
        users.findById(id).ifPresent(u -> { u.setRememberToken(null); users.save(u); });
    }

    /** 로그인 사용자의 전화번호 보완(주문서에 필요할 때만 물어보는 용도). */
    @Transactional
    public AppUser updatePhone(Long id, String phone) {
        AppUser u = users.findById(id).orElseThrow();
        String p = normalizePhone(phone);
        if (p != null) u.setPhone(p);
        return u;
    }
}
