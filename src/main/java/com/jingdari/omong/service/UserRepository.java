package com.jingdari.omong.service;

import com.jingdari.omong.model.AppUser;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

/** 오몽 사용자 저장소. */
public interface UserRepository extends JpaRepository<AppUser, Long> {
    Optional<AppUser> findByKakaoId(String kakaoId);
    Optional<AppUser> findByPhone(String phone);
}
