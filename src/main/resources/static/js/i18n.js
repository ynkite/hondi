// 도우미 UI 문구(5개 언어). 동적 안내문(메뉴·가이드)은 서버에서 번역되어 내려온다.
const I18N = {
  KO: { title: "누구나 키오스크 도우미", subtitle: "사진·말·버튼으로 누구나 쉽게",
        bigMode: "큰 글씨·큰 소리", speak: "말하기", listening: "듣고 있어요…",
        photo: "사진 찍기", type: "여기에 입력하세요", send: "보내기",
        restart: "처음으로", lang: "언어", you: "나", assistant: "도우미",
        pressGuide: "이 버튼을 누르세요", done: "완료",
        cart: "주문 내역", total: "합계", added: "담았어요", emptyCart: "아직 담은 게 없어요",
        won: "원", langSwitched: "한국어로 바꿨어요" },
  EN: { title: "Kiosk Helper for Everyone", subtitle: "Photo, voice or buttons — easy for anyone",
        bigMode: "Bigger text & sound", speak: "Speak", listening: "Listening…",
        photo: "Take photo", type: "Type here", send: "Send",
        restart: "Start over", lang: "Language", you: "You", assistant: "Helper",
        pressGuide: "Press this button", done: "Done",
        cart: "Your order", total: "Total", added: "Added", emptyCart: "Nothing added yet",
        won: "KRW", langSwitched: "Switched to English" },
  VI: { title: "Trợ lý Kiosk cho mọi người", subtitle: "Ảnh, giọng nói hoặc nút bấm — dễ cho ai cũng dùng",
        bigMode: "Chữ to & âm to", speak: "Nói", listening: "Đang nghe…",
        photo: "Chụp ảnh", type: "Nhập tại đây", send: "Gửi",
        restart: "Bắt đầu lại", lang: "Ngôn ngữ", you: "Bạn", assistant: "Trợ lý",
        pressGuide: "Nhấn nút này", done: "Hoàn tất",
        cart: "Đơn của bạn", total: "Tổng", added: "Đã thêm", emptyCart: "Chưa thêm món nào",
        won: "KRW", langSwitched: "Đã chuyển sang tiếng Việt" },
  ZH: { title: "人人可用的自助机助手", subtitle: "拍照·说话·按钮，人人都会用",
        bigMode: "大字·大声", speak: "说话", listening: "正在聆听…",
        photo: "拍照", type: "在此输入", send: "发送",
        restart: "重新开始", lang: "语言", you: "我", assistant: "助手",
        pressGuide: "请按这个按钮", done: "完成",
        cart: "您的订单", total: "合计", added: "已加入", emptyCart: "还没有添加",
        won: "韩元", langSwitched: "已切换为中文" },
  JA: { title: "みんなのキオスク案内", subtitle: "写真・声・ボタンで誰でも簡単",
        bigMode: "大きい文字・大きい音", speak: "話す", listening: "聞いています…",
        photo: "写真をとる", type: "ここに入力", send: "送信",
        restart: "最初へ", lang: "言語", you: "わたし", assistant: "案内",
        pressGuide: "このボタンを押してください", done: "完了",
        cart: "ご注文", total: "合計", added: "追加しました", emptyCart: "まだ何もありません",
        won: "ウォン", langSwitched: "日本語に切り替えました" }
};

const BCP47 = { KO: "ko-KR", EN: "en-US", VI: "vi-VN", ZH: "zh-CN", JA: "ja-JP" };
const FLAGS = { KO: "🇰🇷", EN: "🇺🇸", VI: "🇻🇳", ZH: "🇨🇳", JA: "🇯🇵" };
const NATIVE = { KO: "한국어", EN: "English", VI: "Tiếng Việt", ZH: "中文", JA: "日本語" };
