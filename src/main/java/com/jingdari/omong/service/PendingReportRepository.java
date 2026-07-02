package com.jingdari.omong.service;

import com.jingdari.omong.model.PendingReport;
import org.springframework.data.jpa.repository.JpaRepository;

/** 검수 대기 중인 제보 저장소. */
public interface PendingReportRepository extends JpaRepository<PendingReport, Long> {}
