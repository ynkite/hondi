package com.jingdari.hondi.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * ObjectMapper 빈을 명시적으로 등록.
 * - Spring Boot 4는 모듈화되어 IDE가 자동설정 빈을 못 볼 수 있어 "No beans of 'ObjectMapper'" 경고가 뜬다.
 *   직접 빈으로 두면 경고 제거 + 런타임 보장.
 * - findAndAddModules() 로 클래스패스의 Jackson 모듈(파라미터 이름 모듈 등)을 자동 등록 →
 *   record(예: KioskInfo, ChatRequest) JSON 역직렬화가 확실히 동작.
 */
@Configuration
public class JacksonConfig {

    @Bean
    public ObjectMapper objectMapper() {
        return JsonMapper.builder()
                .findAndAddModules()
                .build();
    }
}
