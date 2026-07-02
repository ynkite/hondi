package com.jingdari.omong.dto;

import com.jingdari.omong.model.AppUser;

/**
 * 프런트가 헤더/주문서에 쓰는 최소 정보.
 *   loggedIn      : 세션 여부
 *   kakaoEnabled  : 서버에 카카오 키가 설정됐는지(안 됐으면 버튼이 곧장 간편가입으로 우회)
 */
public record AuthUserResponse(
        boolean loggedIn,
        boolean kakaoEnabled,
        String name,
        String phone,
        String provider
) {
    public static AuthUserResponse guest(boolean kakaoEnabled) {
        return new AuthUserResponse(false, kakaoEnabled, null, null, null);
    }

    public static AuthUserResponse of(AppUser u, boolean kakaoEnabled) {
        return new AuthUserResponse(true, kakaoEnabled, u.getName(), u.getPhone(), u.getProvider());
    }
}
