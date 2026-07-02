package com.jingdari.omong.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * 오몽 사용자. 로그인은 두 갈래뿐이라 최소 정보만 담는다(배리어프리 · 실버 타깃).
 *   - 카카오: kakaoId + 닉네임(name). 전화번호는 카카오 검수 전엔 못 받으므로 null 가능.
 *   - 간편가입(local): 이름 + 전화번호만. phone 이 사실상 신원(재가입 시 같은 계정).
 * 비밀번호 · 이메일 · 인증코드는 일부러 두지 않는다(피로감 0 이 대전제).
 */
@Entity
@Table(name = "app_user")
public class AppUser {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 카카오 회원번호(문자열). 간편가입 사용자는 null. 있으면 유일. */
    @Column(length = 64, unique = true)
    private String kakaoId;

    @Column(length = 60)
    private String name;

    /** 숫자만 저장(01012345678). 간편가입의 신원. MariaDB 는 NULL 중복을 허용하므로 카카오-only 계정 공존 OK. */
    @Column(length = 20, unique = true)
    private String phone;

    /** kakao | local */
    @Column(length = 16)
    private String provider;

    private Instant createdAt;

    protected AppUser() {}

    public AppUser(String kakaoId, String name, String phone, String provider) {
        this.kakaoId = kakaoId;
        this.name = name;
        this.phone = phone;
        this.provider = provider;
        this.createdAt = Instant.now();
    }

    public Long getId() { return id; }
    public String getKakaoId() { return kakaoId; }
    public String getName() { return name; }
    public String getPhone() { return phone; }
    public String getProvider() { return provider; }
    public Instant getCreatedAt() { return createdAt; }

    public void setName(String v) { this.name = v; }
    public void setPhone(String v) { this.phone = v; }
    public void setKakaoId(String v) { this.kakaoId = v; }
    public void setProvider(String v) { this.provider = v; }
}
