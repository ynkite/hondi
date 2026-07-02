package com.jingdari.omong.service;

import com.jingdari.omong.model.KioskSpec;
import org.springframework.data.jpa.repository.JpaRepository;

/** 제보/시드된 키오스크 스펙 저장소. */
public interface KioskSpecRepository extends JpaRepository<KioskSpec, String> {}
