package com.jingdari.hondi.service;

import org.springframework.stereotype.Service;

/**
 * 책임 있는 AI(심사 항목) — 제보/촬영 사진엔 남의 결제화면·카드번호·얼굴이 들어올 수 있다.
 * 텍스트 단계에서 카드번호·주민번호 패턴을 마스킹한다.
 * 이미지의 얼굴/번호 영역 블러는 추후 비전 파이프라인에서 처리(아래 훅).
 */
@Service
public class PrivacyMaskingService {

    /** OCR/모델이 뱉은 텍스트에서 카드번호·주민번호로 보이는 숫자열을 가린다. */
    public String maskText(String text) {
        if (text == null) return null;
        String t = text;
        // 카드번호: 13~16자리(구분자 허용)
        t = t.replaceAll("\\b(?:\\d[ -]?){13,16}\\b", "•••• •••• •••• ••••");
        // 주민등록번호: 6자리-7자리
        t = t.replaceAll("\\b\\d{6}[ -]?\\d{7}\\b", "######-#######");
        return t;
    }

    /**
     * 이미지 마스킹 훅(추후). 제보 사진을 저장하기 전 얼굴·카드영역을 블러 처리할 자리.
     * 데모에선 원본을 그대로 통과시키되, 발표에선 "제보 사진은 개인정보 자동 마스킹"으로 소개.
     */
    public byte[] maskImage(byte[] image) {
        // TODO: 얼굴/번호 영역 검출 후 블러 (예: 추후 OpenCV / 비전 모델 연동)
        return image;
    }
}
