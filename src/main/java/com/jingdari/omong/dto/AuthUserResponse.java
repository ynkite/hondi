package com.jingdari.omong.dto;

import com.jingdari.omong.model.AppUser;

/**
 * 프런트가 헤더/주문서/버튼 분기에 쓰는 최소 정보.
 *   loggedIn      : 세션 여부
 *   kakaoEnabled  : 서버에 카카오 키가 설정됐는지(안 됐으면 버튼이 곧장 간편가입으로 우회)
 *   admin         : 관리자(ADMIN) 여부 → true 면 헤더에 [관리자] 진입 버튼 노출
 */
public record AuthUserResponse(
        boolean loggedIn,
        boolean kakaoEnabled,
        boolean admin,
        String name,
        String phone,
        String provider
) {
    public static AuthUserResponse guest(boolean kakaoEnabled) {
        return new AuthUserResponse(false, kakaoEnabled, false, null, null, null);
    }

    public static AuthUserResponse of(AppUser u, boolean kakaoEnabled) {
        return new AuthUserResponse(true, kakaoEnabled, u.isAdmin(), u.getName(), u.getPhone(), u.getProvider());
    }
}
