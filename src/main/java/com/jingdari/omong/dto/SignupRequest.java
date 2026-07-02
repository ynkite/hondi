package com.jingdari.omong.dto;

/** 간편가입/전화번호 입력. 이름·전화번호 둘뿐(피로감 0). */
public record SignupRequest(String name, String phone) {}
