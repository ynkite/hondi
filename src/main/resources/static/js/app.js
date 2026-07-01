// 누구나 키오스크 도우미 — 프론트 로직
// 사진·말·버튼 + 음성·다국어(자동감지) + 큰글씨/큰소리 + 장바구니 + 접근성(ARIA/포커스)
const state = { language: "KO", brandId: null, screenId: null, big: false, autoLang: true };
const cart = [];              // [{label, labelKo, price}]
let pendingProduct = null;    // 화면 흐름 중 임시 선택(결제 화면 도달 시 cart에 커밋)
const $ = (s) => document.querySelector(s);
function t(key){ return (I18N[state.language] || I18N.KO)[key]; }

/* ---------- 언어 자동 감지 (스크립트 기반, 오프라인·즉시) ---------- */
function detectLang(text){
  if(!text) return null;
  if(/[가-힣]/.test(text)) return "KO";                 // 한글
  if(/[぀-ヿ]/.test(text)) return "JA";                 // 히라가나/가타카나
  if(/[ăâđêôơưĂÂĐÊÔƠƯàáạảãằắặẳẵầấậẩẫèéẹẻẽềếệểễìíịỉĩòóọỏõồốộổỗờớợởỡùúụủũừứựửữỳýỵỷỹ]/i.test(text)) return "VI";
  if(/[一-鿿]/.test(text)) return "ZH";                 // 한자(가나 없음)
  if(/[a-z]/i.test(text)) return "EN";
  return null;
}
function maybeAutoSwitch(text){
  if(!state.autoLang) return;
  const d = detectLang(text);
  if(d && d !== state.language){
    setLanguage(d, false);
    addMsg("bot", "🌐 " + (I18N[d].langSwitched));
    speak(I18N[d].langSwitched);
  }
}

/* ---------- 언어 / 큰글씨 모드 ---------- */
function buildFlags(){
  const wrap = $("#flags"); wrap.innerHTML = "";
  Object.keys(FLAGS).forEach(code => {
    const b = document.createElement("button");
    b.className = "flag" + (code===state.language ? " active":"");
    b.textContent = FLAGS[code] + " " + NATIVE[code];
    b.setAttribute("aria-pressed", code===state.language ? "true":"false");
    b.setAttribute("aria-label", NATIVE[code]);
    b.onclick = () => setLanguage(code, true);
    wrap.appendChild(b);
  });
}
// regreet=true 면 인사부터 다시(수동 전환). 자동 전환은 false(대화 흐름 유지).
function setLanguage(code, regreet){
  state.language = code;
  buildFlags(); applyUiText(); renderCart();
  if(regreet) sendChat({});
}
function applyUiText(){
  $("#title").textContent = t("title");
  $("#subtitle").textContent = t("subtitle");
  $("#bigBtn").textContent = "🔎 " + t("bigMode");
  $("#text").placeholder = t("type");
  $("#cam").setAttribute("aria-label", t("photo"));
  $("#mic").setAttribute("aria-label", t("speak"));
  $("#send").setAttribute("aria-label", t("send"));
  $("#cartTitle").textContent = t("cart");
  document.documentElement.lang = BCP47[state.language].split("-")[0];
}
function toggleBig(){
  state.big = !state.big;
  document.body.classList.toggle("big", state.big);
  const b = $("#bigBtn"); b.classList.toggle("on", state.big);
  b.setAttribute("aria-pressed", state.big ? "true":"false");
}

/* ---------- 렌더 ---------- */
function addMsg(role, text, koText){
  const div = document.createElement("div");
  div.className = "msg " + (role==="me" ? "me":"bot");
  div.textContent = text || "";
  if(koText && koText!==text){ const s=document.createElement("span"); s.className="ko"; s.textContent=koText; div.appendChild(s); }
  $("#chat").appendChild(div); scrollDown();
}
function renderOptions(options){
  if(!options || !options.length) return;
  const box = document.createElement("div"); box.className="options"; box.setAttribute("role","group");
  options.forEach(o => {
    const b = document.createElement("button"); b.className="opt";
    const aria = [o.label, o.price!=null ? o.price+" "+t("won") : "", o.position||""].filter(Boolean).join(", ");
    b.setAttribute("aria-label", aria);
    const left = document.createElement("div");
    left.innerHTML = `<div class="name">${esc(o.label)}</div>` +
                     (o.labelKo && o.labelKo!==o.label ? `<div class="ko">${esc(o.labelKo)}</div>`:"") +
                     (o.position ? `<div class="pos">📍 ${esc(o.position)}</div>`:"");
    const right = document.createElement("div");
    if(o.price!=null) right.innerHTML = `<span class="price">${o.price.toLocaleString()}₩</span>`;
    if(o.color){ const sw=document.createElement("span"); sw.className="swatch"; sw.style.background=colorHex(o.color); right.prepend(sw); }
    b.appendChild(left); b.appendChild(right);
    b.onclick = () => {
      if(o.price!=null) pendingProduct = { label:o.label, labelKo:o.labelKo, price:o.price };
      addMsg("me", o.label, o.labelKo);
      sendChat({ selectedItemId: o.id });
    };
    box.appendChild(b);
  });
  $("#chat").appendChild(box); scrollDown();
  const first = box.querySelector(".opt"); if(first) first.focus();   // 포커스 이동(키보드/스크린리더)
}
function renderGuide(guide){
  if(!guide || !guide.length) return;
  const box = document.createElement("div"); box.className="guide"; box.setAttribute("role","list");
  guide.forEach(g => {
    const row = document.createElement("div"); row.className="step"; row.setAttribute("role","listitem");
    const dot = document.createElement("span"); dot.className="dot";
    if(g.color) dot.style.borderColor = colorHex(g.color);
    const txt = document.createElement("div"); txt.className="txt";
    txt.textContent = `${g.step}. ${g.instruction}`;
    row.appendChild(dot); row.appendChild(txt); box.appendChild(row);
  });
  $("#chat").appendChild(box); scrollDown();
}

/* ---------- 장바구니 ---------- */
function renderCart(){
  const bar=$("#cartbar"), list=$("#cartList");
  if(!cart.length){ bar.classList.add("hidden"); return; }
  bar.classList.remove("hidden");
  $("#cartTitle").textContent = t("cart");
  list.innerHTML="";
  let total=0;
  cart.forEach(c=>{
    total += (c.price||0);
    const li=document.createElement("li");
    li.innerHTML = `<span>${esc(c.label)}</span><span class="p">${(c.price||0).toLocaleString()}₩</span>`;
    list.appendChild(li);
  });
  $("#cartTotal").textContent = t("total")+" "+total.toLocaleString()+"₩";
}
function cartSummaryText(){
  const lines = cart.map(c=>`• ${c.label}`).join("\n");
  const total = cart.reduce((s,c)=>s+(c.price||0),0);
  return lines + "\n" + t("total") + " " + total.toLocaleString() + "₩";
}

/* ---------- 서버 호출 ---------- */
async function sendChat(extra){
  const body = { language: state.language, brandId: state.brandId, screenId: state.screenId,
                 message: extra.message || null, selectedItemId: extra.selectedItemId || null };
  try{
    const res = await fetch("/api/chat", { method:"POST",
      headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body) });
    handleChat(await res.json());
  }catch(e){ addMsg("bot", "⚠️ 서버 연결을 확인해 주세요. (" + e.message + ")"); }
}
function handleChat(res){
  if(res.brandId!==undefined) state.brandId = res.brandId;
  if(res.screenId!==undefined) state.screenId = res.screenId;
  addMsg("bot", res.reply); speak(res.reply);

  // 결제 화면(=pay 선택지 존재)에 도달하면 임시 선택을 장바구니에 커밋
  if(res.options && res.options.some(o => o.id==="pay")){
    if(pendingProduct){ cart.push(pendingProduct); pendingProduct=null; renderCart();
      addMsg("bot", "🛒 " + cart[cart.length-1].label + " — " + t("added")); }
  }
  renderOptions(res.options);
  renderGuide(res.guide);

  if(res.done){
    if(cart.length){
      const sum = cartSummaryText();
      addMsg("bot", "✅ " + sum); speak(t("done"));
    } else {
      addMsg("bot", "✅ " + (res.summary || t("done"))); speak(res.summary || t("done"));
    }
  }
}
async function onPhoto(file){
  if(!file) return;
  addMsg("me", "📷 " + t("photo"));
  const fd = new FormData();
  fd.append("image", file); fd.append("language", state.language);
  if(state.brandId) fd.append("brandId", state.brandId);
  try{
    const res = await fetch("/api/analyze", { method:"POST", body: fd });
    const a = await res.json();
    if(a.brandId) state.brandId = a.brandId;
    if(a.screenId) state.screenId = a.screenId;
    addMsg("bot", a.narration); speak(a.narration);
    renderOptions(a.items);
  }catch(e){ addMsg("bot", "⚠️ 사진 분석 실패: " + e.message); }
}

/* ---------- 음성 입력(STT) / 출력(TTS) ---------- */
let recog = null, recording = false;
function micToggle(){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SR){ alert("이 브라우저는 음성 입력을 지원하지 않아요. 입력창을 사용해 주세요."); return; }
  if(recording){ recog && recog.stop(); return; }
  recog = new SR();
  recog.lang = BCP47[state.language]; recog.interimResults = false; recog.maxAlternatives = 1;
  recording = true; $("#mic").classList.add("rec"); $("#mic").textContent = "■";
  recog.onresult = (ev) => {
    const said = ev.results[0][0].transcript;
    $("#text").value = said;
    maybeAutoSwitch(said);       // 말한 내용으로 언어 자동 전환
    submitText();
  };
  recog.onstart = () => { addMsg("bot", "🎤 " + t("listening")); };
  recog.onend = () => { recording=false; $("#mic").classList.remove("rec"); $("#mic").textContent="🎤"; };
  recog.onerror = (e) => {
    recording=false; $("#mic").classList.remove("rec"); $("#mic").textContent="🎤";
    const why = e && e.error;
    const msg = why==="not-allowed" || why==="service-not-allowed"
        ? "마이크 권한이 막혀 있어요. 주소창 왼쪽 자물쇠/마이크 아이콘에서 허용해 주세요."
      : why==="no-speech" ? "소리가 안 들렸어요. 🎤를 다시 누르고 말해 주세요."
      : why==="audio-capture" ? "마이크 장치를 찾을 수 없어요."
      : "음성 인식 오류: " + why;
    addMsg("bot", "🎤 " + msg); speak(msg);
  };
  try { recog.start(); }
  catch(err){ recording=false; $("#mic").classList.remove("rec"); $("#mic").textContent="🎤";
    addMsg("bot", "🎤 음성 인식을 시작할 수 없어요: " + err.message); }
}
function speak(text){
  if(!text || !window.speechSynthesis) return;
  try{
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = BCP47[state.language];
    u.rate = state.big ? 0.9 : 1.0; u.volume = 1.0;
    window.speechSynthesis.speak(u);
  }catch(e){ /* TTS 미지원 무시 */ }
}

/* ---------- 입력창 ---------- */
function submitText(){
  const v = $("#text").value.trim();
  if(!v) return;
  maybeAutoSwitch(v);            // 입력 내용으로 언어 자동 전환
  addMsg("me", v); $("#text").value="";
  sendChat({ message: v });
}

/* ---------- 마이크 진단 ---------- */
async function runMicDiagnostics(){
  addMsg("bot","🔧 마이크 진단을 시작합니다…");
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  addMsg("bot","· 브라우저 음성인식 지원: " + (SR ? "O" : "X (크롬/엣지 권장)"));
  addMsg("bot","· 보안 컨텍스트(HTTPS/localhost): " + (window.isSecureContext ? "O" : "X → 마이크 차단됨"));

  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    addMsg("bot","· getUserMedia 미지원 — 브라우저 또는 보안 컨텍스트 문제입니다."); return;
  }
  try{
    if(navigator.permissions){
      const st = await navigator.permissions.query({ name: "microphone" });
      addMsg("bot","· 크롬 마이크 권한 상태: " + st.state + " (granted=허용 / denied=거부 / prompt=물어봄)");
    }
  }catch(e){ addMsg("bot","· 권한 상태 조회 불가: " + e.message); }

  try{
    const devs = await navigator.mediaDevices.enumerateDevices();
    const mics = devs.filter(d => d.kind === "audioinput");
    addMsg("bot","· 브라우저가 본 마이크 개수: " + mics.length);
    mics.forEach((m,i)=> addMsg("bot","   ["+(i+1)+"] " + (m.label || "(이름 숨김 — 권한 허용 전)")));
    if(mics.length === 0)
      addMsg("bot","→ 크롬이 마이크를 하나도 못 봅니다. Windows '마이크 접근'이 크롬에 막혀 있을 가능성이 큽니다.");
  }catch(e){ addMsg("bot","· 장치 목록 조회 실패: " + e.message); }

  try{
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    addMsg("bot","✅ 마이크 캡처 성공! 장치·권한 모두 정상입니다. 이제 🎤가 됩니다.");
    stream.getTracks().forEach(t => t.stop());
  }catch(e){
    addMsg("bot","❌ 마이크 캡처 실패: " + e.name + " — " + e.message);
    if(e.name==="NotAllowedError")  addMsg("bot","→ 권한 거부. 주소창 왼쪽 아이콘 → 마이크 '허용' 후 새로고침.");
    if(e.name==="NotFoundError")    addMsg("bot","→ 장치 없음. Windows 설정 › 시스템 › 소리 › 입력 에서 마이크 확인.");
    if(e.name==="NotReadableError") addMsg("bot","→ 다른 앱(줌·팀즈 등)이 마이크를 잡고 있을 수 있어요. 종료 후 재시도.");
  }
}

/* ---------- 유틸 ---------- */
function colorHex(ko){
  const k=(ko||"").toLowerCase();
  if(k.includes("파")||k.includes("blue")) return "var(--blue)";
  if(k.includes("빨")||k.includes("red"))  return "var(--red)";
  if(k.includes("초")||k.includes("녹")||k.includes("green")) return "var(--green)";
  if(k.includes("주")||k.includes("orange")) return "var(--orange)";
  if(k.includes("회")||k.includes("gray")) return "var(--gray)";
  return "var(--accent)";
}
function esc(s){ return (s||"").replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])); }
function scrollDown(){ const c=$("#chat"); c.scrollTop=c.scrollHeight; }

/* ---------- 초기화 ---------- */
window.addEventListener("DOMContentLoaded", () => {
  buildFlags(); applyUiText(); renderCart();
  $("#bigBtn").onclick = toggleBig;
  const dg=$("#diagBtn"); if(dg) dg.onclick = runMicDiagnostics;
  $("#mic").onclick = micToggle;
  $("#send").onclick = submitText;
  $("#cam").onclick = () => $("#photo").click();
  $("#photo").onchange = (e) => onPhoto(e.target.files[0]);
  $("#text").addEventListener("keydown", (e)=>{ if(e.key==="Enter") submitText(); });
  sendChat({}); // 인사 + 데모 키오스크 선택지
});
