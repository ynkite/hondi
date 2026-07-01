package com.jingdari.hondi.controller;

import com.jingdari.hondi.model.Language;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

/** 화면(Thymeleaf) 라우팅. */
@Controller
public class PageController {

    @GetMapping("/")
    public String home(Model model) {
        model.addAttribute("languages", Language.values());
        return "index";
    }

    /** 발표용 가짜 키오스크 화면(키오스크 쪽을 옆에 띄워 시연). */
    @GetMapping("/demo/{brandId}")
    public String demoKiosk(@PathVariable String brandId, Model model) {
        model.addAttribute("brandId", brandId);
        return "demo";
    }
}
