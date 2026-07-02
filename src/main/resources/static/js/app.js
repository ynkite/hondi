// 오몽(omong) — 제주 키오스크 도우미
// 지원 브랜드: 빽다방·맘스터치·맥도날드·메가커피 (말하기/사진 진입 → AI 인식)
// 흐름: 진입 → AI 좁혀가기(쉬운 질문 2~4버튼) → 메뉴 확정 → 결제수단
//   → 매핑판별 → QR / 조작가이드(실사진 크롭 재구성+음성+강조) / 직원보여주기
// AI: 백엔드 /api/funnel·/api/recognize·/api/intent, 실패 시 규칙 폴백(데모 안 죽음).

const DEMO_BRAND = "paik";
const state = {
  language:"KO", brandId:null, brandLabel:null,
  fontScale:17, sound:"high", autoLang:true,
  screen:"home", knownBrands:new Set(["paik","momstouch","mcdonalds","megacoffee"]),
  user:null, kakaoEnabled:false   // 로그인은 선택(게스트-우선). user=null 이어도 모든 기능 동작.
};
const cart = [];
let paikData=null, cropCache={};
const $  = (s)=>document.querySelector(s);
const $$ = (s)=>document.querySelectorAll(s);
function t(k){ return (I18N[state.language]||I18N.KO)[k]; }
const won = (n)=>(n||0).toLocaleString()+"₩";

/* ============ 데이터 ============ */
async function loadPaik(){
  try{ paikData = await (await fetch("/data/brands/"+DEMO_BRAND+".json")).json(); }
  catch(e){ paikData={screens:[]}; }
}
function coffeeItems(){
  if(state.spec && Array.isArray(state.spec.items)) return state.spec.items;
  if((state.brandId||"paik")==="paik" && paikData){
    const s = paikData.screens.find(x=>x.id==="menu_coffee");
    return s ? s.items : [];
  }
  return [];
}
// 브랜드별 정적 스펙(서버 DB가 꺼져 있어도 데모가 안 죽는 폴백)
const SPEC_FILES={
  paik:"/kiosk/paik/crops/coffee.v2.json",
  momstouch:"/kiosk/momstouch/crops/menu.v2.json",
  mcdonalds:"/kiosk/mcdonalds/crops/menu.v2.json",
  megacoffee:"/kiosk/megacoffee/crops/menu.v2.json"
};
async function getSpec(name){
  const brand = state.brandId || "paik";
  const key = brand+"|"+name;
  if(cropCache[key]) return cropCache[key];
  // DB(제보/시드) 우선
  try{
    const r=await fetch("/api/brands/"+encodeURIComponent(brand));
    if(r.ok){ cropCache[key]=await r.json(); return cropCache[key]; }
  }catch(e){}
  // 정적 폴백
  if(SPEC_FILES[brand]){
    try{ cropCache[key]=await (await fetch(SPEC_FILES[brand])).json(); return cropCache[key]; }catch(e){}
  }
  return null;
}

/* ============ 화면 라우터 ============ */
const SCREENS=["home","chat","mapped","qr","guide","staff","unmapped","report","reportDone","login","signup"];
function show(name){
  state.screen=name;
  SCREENS.forEach(s=>{ const el=document.getElementById("scr-"+s); if(el) el.classList.toggle("active", s===name); });
  $("#safetyBtn").classList.toggle("hidden", ["home","reportDone","staff","login","signup"].includes(name));
  onEnter(name);
  const scr=document.getElementById("scr-"+name);
  if(scr){ const f=scr.querySelector("h1,h2,.hbtn,.choice,.linkbtn"); if(f){ f.setAttribute("tabindex","-1"); f.focus(); } }
}
function onEnter(name){
  if(name==="mapped"){ $("#knownBrand").textContent=(state.brandLabel||t("knownBrand")); speak(t("chooseHelp")); }
  if(name==="qr"){ buildQR(); renderMiniOrder("#qrOrder"); }
  if(name==="guide"){ openGuide(); }
  if(name==="staff"){ renderStaffOrder("#staffOrder"); speak(t("staffTitle")); }
  if(name==="unmapped"){ runUnmapped(); }
  if(name==="login"){ speak(t("loginTitle")+". "+t("guestOk")); }
  if(name==="signup"){ speak(t("signupTitle")); const n=$("#suName"); if(n) setTimeout(()=>n.focus(),200); }
}

/* ============ 홈 진입 ============ */
// 이름으로 아는 가게(4개 브랜드 모두 실제 데이터 보유)
const KNOWN=[
  { id:"paik",       re:/빽다방|백다방|빽|paik/i,                    label:"빽다방" },
  { id:"momstouch",  re:/맘스터치|맘스|moms?\s?touch/i,             label:"맘스터치" },
  { id:"mcdonalds",  re:/맥도날드|맥도널드|맥날|mcdonald|빅맥/i,      label:"맥도날드" },
  { id:"megacoffee", re:/메가\s?커피|메가엠지씨|mega\s?coffee|메가/i, label:"메가커피" }
];
function openChat(title){ state.stage="entry"; $("#chatTitle").textContent=title; show("chat"); $("#chat").innerHTML=""; }
function goSpeak(){
  openChat(t("btnSpeak"));
  addMsg("bot","🍊 "+t("entryAsk")); speak(t("entryAsk"));
  setTimeout(micToggle, 500);
}
/* 데모 테스트용 키오스크 이미지(실사진). 선택 → 실제 /api/recognize 로 인식 */
const DEMO_PHOTOS=[
  { brand:"paik",       label:"빽다방 ①",   src:"/demo/paik.jpg" },
  { brand:"paik",       label:"빽다방 ②",   src:"/demo/paik2.jpg" },
  { brand:"momstouch",  label:"맘스터치 ①", src:"/demo/momstouch.jpg" },
  { brand:"momstouch",  label:"맘스터치 ②", src:"/demo/momstouch2.jpg" },
  { brand:"mcdonalds",  label:"맥도날드 ①", src:"/demo/mcdonalds.jpg" },
  { brand:"mcdonalds",  label:"맥도날드 ②", src:"/demo/mcdonalds2.jpg" },
  { brand:"megacoffee", label:"메가커피 ①", src:"/demo/megacoffee.jpg" },
  { brand:"megacoffee", label:"메가커피 ②", src:"/demo/megacoffee2.jpg" }
];
function goPhoto(){
  openChat(t("btnPhoto"));
  addMsg("bot","📷 "+t("entryPhotoAsk")); speak(t("entryPhotoAsk"));
  const wrap=document.createElement("div"); wrap.className="qwrap";
  const up=document.createElement("button"); up.className="qbtn";
  up.innerHTML=`<span class="qi">📁</span><span class="qt">${esc(t("reportBtn"))}</span>`;
  up.onclick=()=>{ $("#homePhoto").value=""; $("#homePhoto").click(); };
  wrap.appendChild(up); $("#chat").appendChild(wrap);
  addMsg("bot","🧪 "+t("demoPick"));
  const strip=document.createElement("div"); strip.className="demo-strip";
  DEMO_PHOTOS.forEach(d=>{
    const b=document.createElement("button"); b.className="demo-card";
    b.setAttribute("aria-label", d.label);
    b.innerHTML=`<img src="${d.src}" alt="${esc(d.label)}" loading="lazy"><span>${esc(d.label)}</span>`;
    b.onclick=()=>useDemoPhoto(d);
    strip.appendChild(b);
  });
  $("#chat").appendChild(strip); scrollDown();
}
function addPhotoMsg(src){
  const div=document.createElement("div"); div.className="msg me msg-img";
  div.innerHTML=`<img class="chatimg" src="${src}" alt="보낸 사진">`;
  $("#chat").appendChild(div); scrollDown();
}
async function useDemoPhoto(d){
  addPhotoMsg(d.src);
  addMsg("bot","🔎 "+t("recognizing")); speak(t("recognizing"));
  try{
    const blob=await (await fetch(d.src)).blob();
    const fd=new FormData(); fd.append("image", new File([blob],"demo.jpg",{type:"image/jpeg"}));
    const a=await (await fetch("/api/recognize",{method:"POST",body:fd})).json();
    if(a && a.brandId && a.brandId!=="NONE") return startBrand(a.brandId, a.brandName||a.brandId);
  }catch(e){}
  // AI가 잠시 응답 못 해도 데모 이미지는 브랜드를 알고 있으니 흐름을 이어간다
  const hit=KNOWN.find(k=>k.id===d.brand);
  startBrand(d.brand, hit?hit.label:d.label);
}
/* 발화/입력으로 가게 판단: 키워드 우선 → AI 보조(/api/intent) → 미인식 안내 */
async function handleEntry(text){
  const hit=KNOWN.find(k=>k.re.test(text));
  if(hit) return startBrand(hit.id, hit.label);
  if(/(몰라|모르|못\s*찍|못\s*해|안\s*돼|안돼|없어|어렵)/.test(text)) return entrySoon();
  let brand=null;
  try{
    const r=await fetch("/api/intent",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text})});
    if(r.ok){ const j=await r.json(); if(j && j.brandId && j.brandId!=="NONE") brand=j; }
  }catch(e){}
  if(brand) startBrand(brand.brandId, brand.brandName||brand.brandId);
  else entryUnknown();
}
async function startBrand(brandId, label){
  state.brandId=brandId; state.brandLabel=label;
  cropCache={}; state.spec=null;
  try{ state.spec=await getSpec("coffee.v2"); }catch(e){}
  if(!coffeeItems().length){ brandSoon(label); return; }   // 데이터 없는 브랜드 → 준비중
  state.stage="funnel";
  addMsg("bot","🍊 "+label+t("recognizedSuffix")); speak(label+t("recognizedSuffix"));
  resetFunnel(); funnelStep();
}
/* 아직 지원 안 하는 브랜드 → 준비중 안내 후 홈으로 */
function brandSoon(label){
  const msg=(label?label+": ":"")+t("brandSoon");
  addMsg("bot","🛠️ "+msg); speak(msg);
  setTimeout(()=>show("home"), 2800);
}
function entryUnknown(){
  addMsg("bot","🙂 "+t("notKnown")); speak(t("notKnown"));
  entryChoices();
}
function entryChoices(){
  const wrap=document.createElement("div"); wrap.className="qwrap";
  const b1=document.createElement("button"); b1.className="qbtn";
  b1.innerHTML=`<span class="qi">📷</span><span class="qt">${esc(t("takePhoto"))}</span>`;
  b1.onclick=()=>{ $("#homePhoto").value=""; $("#homePhoto").click(); };
  const b2=document.createElement("button"); b2.className="qbtn";
  b2.innerHTML=`<span class="qi">🙅</span><span class="qt">${esc(t("cantPhoto"))}</span>`;
  b2.onclick=entrySoon;
  wrap.appendChild(b1); wrap.appendChild(b2);
  $("#chat").appendChild(wrap); scrollDown();
}
function entrySoon(){ addMsg("bot","🛠️ "+t("soonUpdate")); speak(t("soonUpdate")); }
/* 사진 업로드 → AI 비전 인식(/api/recognize) */
async function onHomePhoto(file){
  if(!file) return;
  openChat(t("btnPhoto"));
  addPhotoMsg(URL.createObjectURL(file));
  addMsg("bot","🔎 "+t("recognizing")); speak(t("recognizing"));
  const fd=new FormData(); fd.append("image",file); fd.append("language",state.language);
  try{
    const res=await fetch("/api/recognize",{method:"POST",body:fd});
    const a=await res.json();
    if(a && a.brandId && a.brandId!=="NONE") return startBrand(a.brandId, a.brandName||a.brandId);
    brandSoon("");   // 미지원/미인식 브랜드 → 준비중 안내 후 홈
  }catch(e){ brandSoon(""); }
}

/* ============ AI 좁혀가기(funnel) ============ */
let remainingIds=[], askedDims=new Set();
function resetFunnel(){ remainingIds = coffeeItems().map(it=>it.id); askedDims=new Set(); }
function itemsByIds(ids){ const m=new Map(coffeeItems().map(it=>[it.id,it])); return ids.map(id=>m.get(id)).filter(Boolean); }

async function funnelStep(){
  const items = itemsByIds(remainingIds);
  if(items.length<=1){ if(items[0]) resolveItem(items[0]); return; }
  let q = null;
  try{
    const res = await fetch("/api/funnel",{ method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ language:state.language, brandName:state.brandLabel,
        items: items.map(it=>({id:it.id,name:it.name})) }) });
    if(res.ok){ const j = await res.json(); if(j && j.question && j.options && j.options.length) q = j; }
  }catch(e){}
  if(!q) q = clientQuestion(items);          // 폴백: 규칙 기반
  if(!q){ renderFinalPick(items); return; }  // 더 못 좁히면 후보 직접 선택
  renderQuestion(q);
}
function renderQuestion(q){
  addMsg("bot","🍊 "+q.question); speak(q.question);
  const wrap=document.createElement("div"); wrap.className="qwrap"+(q.options.length<=2?" qgrid2":"");
  q.options.forEach(o=>{
    const b=document.createElement("button"); b.className="qbtn"+(q.options.length<=2?" q-2":"");
    b.setAttribute("aria-label", o.label);
    b.innerHTML = (o.icon?`<span class="qi">${o.icon}</span>`:"")+`<span class="qt">${esc(o.label)}</span>`
      + (o.sub?`<span class="qs">${esc(o.sub)}</span>`:"");
    b.onclick=()=>{
      addMsg("me", o.label);
      const next = (o.ids && o.ids.length) ? o.ids.filter(id=>remainingIds.includes(id)) : remainingIds;
      remainingIds = next.length ? next : remainingIds;
      if(q.dim) askedDims.add(q.dim);
      funnelStep();
    };
    wrap.appendChild(b);
  });
  $("#chat").appendChild(wrap); scrollDown();
  const f=wrap.querySelector(".qbtn"); if(f) f.focus();
}
function renderFinalPick(items){
  addMsg("bot","🍊 "+t("pickOne")); speak(t("pickOne"));
  const box=document.createElement("div"); box.className="options";
  items.forEach(it=>{
    const b=document.createElement("button"); b.className="opt";
    b.setAttribute("aria-label", it.name+", "+it.price+" "+t("won"));
    b.innerHTML=`<div class="name">${esc(it.name)}</div><div class="price">${won(it.price)}</div>`;
    b.onclick=()=>resolveItem(it);
    box.appendChild(b);
  });
  $("#chat").appendChild(box); scrollDown();
  const f=box.querySelector(".opt"); if(f) f.focus();
}
function resolveItem(it){
  cart.length=0; cart.push({ id:it.id, label:it.name, price:it.price, qty:1 });
  renderCart();
  addMsg("me", it.name);
  addMsg("bot","🛒 "+it.name+" — "+t("chosen"));
  speak(t("chosen"));
  askPay();
  refreshNextCta();
}
/* 결제수단 챗봇 유도 (선택 저장 → 가이드 결제 단계에서 강조) */
function askPay(){
  addMsg("bot","💳 "+t("askPay")); speak(t("askPay"));
  const wrap=document.createElement("div"); wrap.className="qwrap";
  // 카드·현금을 앞에 두고 추천 표시(제일 쉬운 방법으로 유도)
  [["card","💳",t("payCard"),t("payEasiest")],
   ["cash","💵",t("payCash"),t("payCashSub")],
   ["mobile","📱",t("payMobile"),null]].forEach(([id,ic,label,sub])=>{
    const b=document.createElement("button"); b.className="qbtn";
    b.setAttribute("aria-label",label);
    b.innerHTML=`<span class="qi">${ic}</span><span class="qt">${esc(label)}</span>`
      +(sub?`<span class="qs">${esc(sub)}</span>`:"");
    b.onclick=()=>{
      state.payMethod=id; addMsg("me",label);
      const guideMsg = id==="cash" ? t("cashToStaff") : id==="mobile" ? t("payMobileOn") : t("payInsertCard");
      addMsg("bot","🧭 "+guideMsg); speak(guideMsg);
      refreshNextCta();
    };
    wrap.appendChild(b);
  });
  $("#chat").appendChild(wrap); scrollDown();
}

/* 규칙 기반 폴백 질문 — 카페(단맛→온도→크기) / 버거(치킨·소고기→매콤→크기).
   AI 좁혀가기 실패 시에도 어르신·아이 눈높이 질문으로 데모가 이어진다. */
function isSweet(it){ return /꿀|헤이즐넛|피스타치오|생크림|라떼|바닐라|초코|할메가/.test(it.name); }
function isHot(it){ return /HOT|에스프레소/.test(it.name); }
function isIce(it){ return /ICED|ICE|아이스/.test(it.name); }
function isBig(it){ return /빽사이즈|메가리카노/.test(it.name); }
function isChicken(it){ return /치킨|싸이|크리스피|상하이|텐더/.test(it.name); }
function isBeef(it){ return /비프|불고기|쿼터파운더|빅맥|소고기/.test(it.name); }
function isSpicy(it){ return /매콤|스파이시|싸이|상하이/.test(it.name); }
function isDouble(it){ return /더블|Kick/.test(it.name); }
function clientQuestion(items){
  const ids = a => a.map(it=>it.id);
  const split=(dim,question,aLabel,aIcon,a,bLabel,bIcon,b)=>(
    { dim, question, options:[{label:aLabel,icon:aIcon,ids:ids(a)},{label:bLabel,icon:bIcon,ids:ids(b)}] });
  // ── 버거류 ──
  if(!askedDims.has("patty")){
    const ck=items.filter(isChicken), bf=items.filter(it=>isBeef(it)&&!isChicken(it));
    if(ck.length && bf.length)
      return split("patty","바삭한 치킨버거가 좋으세요, 든든한 소고기버거가 좋으세요?",
        "바삭한 치킨","🍗",ck,"든든한 소고기","🍔",bf);
  }
  if(!askedDims.has("spicy")){
    const sp=items.filter(isSpicy), mild=items.filter(it=>!isSpicy(it));
    if(sp.length && mild.length && items.some(isChicken))
      return split("spicy","살짝 매콤한 맛도 괜찮으세요, 순한 맛이 좋으세요?",
        "매콤해도 좋아요","🌶️",sp,"순한 맛으로","🙂",mild);
  }
  if(!askedDims.has("double")){
    const dbl=items.filter(isDouble), norm=items.filter(it=>!isDouble(it));
    if(dbl.length && norm.length && items.some(isChicken))
      return split("double","많이 배고프세요? 큼직한 거랑 알맞은 거가 있어요.",
        "큼직한 거","💪",dbl,"알맞은 거","👌",norm);
  }
  // ── 카페류 ──
  if(!askedDims.has("sweet")){
    const sweet=items.filter(isSweet), strong=items.filter(it=>!isSweet(it));
    if(sweet.length && strong.length && !items.some(isChicken))
      return split("sweet","달콤한 게 좋으세요, 안 단 게 좋으세요?",
        "달콤한 거","🍯",sweet,"안 단 거","☕",strong);
  }
  if(!askedDims.has("temp") && items.every(it=>isHot(it)||isIce(it))){
    const hot=items.filter(isHot), ice=items.filter(it=>isIce(it)&&!isHot(it));
    if(hot.length && ice.length)
      return split("temp","따뜻한 게 좋으세요, 시원한 게 좋으세요?",
        "따뜻한 거","🔥",hot,"시원한 거","🧊",ice);
  }
  if(!askedDims.has("size")){
    const big=items.filter(isBig), norm=items.filter(it=>!isBig(it));
    if(big.length && norm.length && !items.some(isChicken))
      return split("size","양은 얼마나 드릴까요?",
        "보통으로","🥤",norm,"넉넉하게 많이","🧋",big);
  }
  return null;
}

/* ============ 매핑 판별 / CTA ============ */
function haveOrder(){ return cart.length>0; }
function decideBranch(){ show(state.brandId && state.knownBrands.has(state.brandId) ? "mapped" : "unmapped"); }
function refreshNextCta(){
  let cta=$("#nextCta");
  if(haveOrder()){
    if(!cta){ cta=document.createElement("button"); cta.id="nextCta"; cta.className="primary sticky-cta";
      cta.onclick=decideBranch; $("#scr-chat").appendChild(cta); }
    cta.textContent=t("chooseHelp")+"  ›"; cta.classList.remove("hidden");
  } else if(cta){ cta.classList.add("hidden"); }
}

/* ============ 조작 가이드: 범용 JS 키오스크 재현 + 강조 + 음성 ============ */
let guideSteps=[], guideIdx=0;
async function openGuide(){
  $("#guideTitle").textContent=t("guideTitle");
  const item = cart[0];
  let spec=null; try{ spec=await getSpec("coffee.v2"); }catch(e){}
  const method = state.payMethod || "card";
  guideSteps=[];
  guideSteps.push({ kind:"dine", target:"here", hint:t("guideStore") });
  if(spec) guideSteps.push({ kind:"kiosk", spec, targetId:item?item.id:null,
    hint:(item?item.label+" ":"")+t("guideTapThis") });
  guideSteps.push({ kind:"cart", hint:"결제하기 "+t("guideTapThis") });
  guideSteps.push({ kind:"pay", method, hint:payLabel(method)+" "+t("guideTapThis") });
  if(method==="cash"){
    guideSteps.push({ kind:"staffshow", hint:t("cashToStaff") });   // 현금 → 직원에게 주문서
  } else {
    guideSteps.push({ kind:"payinfo", method, hint: method==="mobile"?t("payMobileOn"):t("payInsertCard") });
    guideSteps.push({ kind:"receipt", hint:"영수증 받기 "+t("guideTapThis") });
  }
  guideIdx=0; renderGuideStep();
}
function payLabel(id){ return id==="cash"?"현금":id==="mobile"?"모바일페이":"카드"; }
function tagFinger(el, label){
  el.style.position="relative";
  const tag=document.createElement("div"); tag.className="ktag"; tag.textContent="여기! "+(label||"");
  const fin=document.createElement("div"); fin.className="kfinger"; fin.textContent="👆";
  el.appendChild(tag); el.appendChild(fin);
}
function wrongTap(){ speak(t("guideFollow")); flashHint(t("guideFollow")); }
function renderGuideStep(){
  const st=guideSteps[guideIdx], k=$("#kiosk");
  k.innerHTML=""; k.style.background="";
  $("#guideStep").textContent=(guideIdx+1)+" / "+guideSteps.length;
  $("#guideHint").innerHTML=`<span class="gh-ic">👆</span><span>${esc(st.hint)}</span>`;
  speak(st.hint);
  if(st.kind==="dine") renderDine(k, st.target);
  else if(st.kind==="kiosk") renderKiosk(k, st.spec, st.targetId);
  else if(st.kind==="cart") renderCartScreen(k);
  else if(st.kind==="pay") renderPayScreen(k, st.method);
  else if(st.kind==="payinfo") renderPayInfo(k, st.method);
  else if(st.kind==="receipt") renderReceiptScreen(k);
  else if(st.kind==="staffshow") renderStaffShow(k);
}
function renderPayInfo(k, method){
  k.style.background="#f4f6fb";
  const w=document.createElement("div"); w.className="k-pay";
  w.innerHTML=`<div class="k-ptitle">${method==="mobile"?"모바일페이":"카드 결제"}</div>`;
  const ico=document.createElement("div"); ico.className="k-pico"; ico.textContent=method==="mobile"?"📱":"💳";
  const ins=document.createElement("div"); ins.className="k-pinfo"; ins.textContent=method==="mobile"?"바코드를 리더기에 대주세요":"카드를 넣어 주세요";
  const nx=document.createElement("div"); nx.className="k-bigbtn khl"; nx.textContent="결제 완료";
  tagFinger(nx,"결제 완료"); nx.onclick=advanceGuide;
  w.appendChild(ico); w.appendChild(ins); w.appendChild(nx); k.appendChild(w);
}
function renderStaffShow(k){
  k.style.background="#fff";
  const w=document.createElement("div"); w.className="k-pay";
  w.innerHTML=`<div class="k-ptitle">${esc(t("staffTitle"))}</div>`;
  const box=document.createElement("div"); box.id="_gstaff"; box.style.width="100%"; box.style.maxWidth="330px";
  const note=document.createElement("div"); note.className="k-staffnote"; note.textContent=t("cashToStaff");
  w.appendChild(box); w.appendChild(note); k.appendChild(w);
  renderOrderInto("#_gstaff");
  $("#guideStep").textContent="✓";
}
function renderCartScreen(k){
  k.style.background="#f4f6fb";
  const it=cart[0];
  const w=document.createElement("div"); w.className="k-pay";
  w.innerHTML=`<div class="k-ptitle">장바구니</div>`;
  const row=document.createElement("div"); row.className="k-orow";
  row.innerHTML=`<span>${esc(it?it.label:"")}</span><span>${(it?it.price:0).toLocaleString()}원</span>`;
  const tot=document.createElement("div"); tot.className="k-otot";
  tot.innerHTML=`<span>합계</span><b>${(it?it.price:0).toLocaleString()}원</b>`;
  const pay=document.createElement("div"); pay.className="k-bigbtn khl"; pay.textContent="결제하기";
  tagFinger(pay,"결제하기"); pay.onclick=advanceGuide;
  w.appendChild(row); w.appendChild(tot); w.appendChild(pay); k.appendChild(w);
}
function renderPayScreen(k, method){
  k.style.background="#f4f6fb";
  const w=document.createElement("div"); w.className="k-pay";
  w.innerHTML=`<div class="k-ptitle">결제 방법을 골라요</div>`;
  const grid=document.createElement("div"); grid.className="k-paygrid";
  [["card","💳","카드"],["cash","💵","현금"],["mobile","📱","모바일페이"]].forEach(([id,ic,label])=>{
    const b=document.createElement("div"); b.className="k-paybtn";
    b.innerHTML=`<span class="pi">${ic}</span><span>${label}</span>`;
    if(id===method){ b.classList.add("khl"); tagFinger(b,label); b.onclick=advanceGuide; }
    else b.onclick=wrongTap;
    grid.appendChild(b);
  });
  w.appendChild(grid); k.appendChild(w);
}
function renderReceiptScreen(k){
  k.style.background="#f4f6fb";
  const w=document.createElement("div"); w.className="k-pay";
  w.innerHTML=`<div class="k-ptitle">영수증 받으실래요?</div>`;
  const grid=document.createElement("div"); grid.className="k-paygrid two";
  const get=document.createElement("div"); get.className="k-paybtn khl";
  get.innerHTML=`<span class="pi">🧾</span><span>영수증 받기</span>`;
  tagFinger(get,"영수증 받기"); get.onclick=advanceGuide;
  const no=document.createElement("div"); no.className="k-paybtn dim";
  no.innerHTML=`<span class="pi">🚫</span><span>안 받기</span>`; no.onclick=wrongTap;
  grid.appendChild(get); grid.appendChild(no);
  w.appendChild(grid); k.appendChild(w);
}
function renderDine(k, targetId){
  k.style.background="#e9edf1";
  const wrap=document.createElement("div"); wrap.className="k-dine";
  const q=document.createElement("div"); q.className="q"; q.textContent="어디서 드실건가요?";
  const btns=document.createElement("div"); btns.className="btns";
  [["here","🏪","매장"],["togo","🛍️","포장"]].forEach(([id,ic,nm])=>{
    const b=document.createElement("div"); b.className="k-dinebtn";
    b.innerHTML=`<span class="di">${ic}</span><span>${nm}</span>`;
    if(id===targetId){ b.classList.add("khl"); tagFinger(b,nm); b.onclick=advanceGuide; }
    else b.onclick=wrongTap;
    btns.appendChild(b);
  });
  wrap.appendChild(q); wrap.appendChild(btns); k.appendChild(wrap);
}
function renderKiosk(k, spec, targetId){
  const th=spec.theme||{};
  k.style.background=th.pageBg||"#e9edf1";
  const side=document.createElement("div"); side.className="k-sidebar"; side.style.background=th.sidebarBg||"#eef1f6";
  (spec.sidebar||[]).forEach(name=>{
    const tab=document.createElement("div");
    tab.className="k-tab"+(name===spec.activeCategory?" on":"");
    if(name===spec.activeCategory) tab.style.background=th.tabActiveBg||"#d7d9e0";
    tab.textContent=name; side.appendChild(tab);
  });
  const main=document.createElement("div"); main.className="k-main";
  const title=document.createElement("div"); title.className="k-title"; title.textContent=spec.title||"";
  const grid=document.createElement("div"); grid.className="k-grid";
  grid.style.gridTemplateColumns=`repeat(${spec.cols||4},1fr)`;
  (spec.items||[]).forEach(it=>{
    const card=document.createElement("div"); card.className="k-card"; card.style.background=th.cardBg||"#fff";
    card.style.gridColumn=(it.c+1); card.style.gridRow=(it.r+1);
    const thumb=document.createElement("div"); thumb.className="k-thumb"; thumb.style.background=th.thumbBg||"#faf6ea";
    if(it.cut||it.thumb){
      const img=document.createElement("img"); img.alt=it.name; img.src=it.cut||it.thumb;
      img.onerror=()=>{ if(it.thumb && img.getAttribute("src")!==it.thumb){ img.src=it.thumb; } };
      thumb.appendChild(img);
    } else {
      const em=document.createElement("span"); em.className="k-emoji"; em.textContent=it.emoji||"🍽️";
      thumb.appendChild(em);
    }
    const nm=document.createElement("div"); nm.className="k-name"; nm.textContent=it.name;
    const pr=document.createElement("div"); pr.className="k-price"; pr.style.color=th.price||"#3a3f5a";
    pr.textContent=(it.price||0).toLocaleString()+"원";
    card.appendChild(thumb); card.appendChild(nm); card.appendChild(pr);
    if(it.id===targetId){ card.classList.add("khl"); tagFinger(card,null); card.onclick=advanceGuide; }
    else { card.classList.add("dim"); card.onclick=wrongTap; }
    grid.appendChild(card);
  });
  const bottom=document.createElement("div"); bottom.className="k-bottom";
  bottom.innerHTML=`<span class="k-togo">${esc(spec.togoLabel||"포장주문")} ›</span><span class="k-cart">🛒</span>`;
  main.appendChild(title); main.appendChild(grid); main.appendChild(bottom);
  k.appendChild(side); k.appendChild(main);
}
function flashHint(msg){ const h=$("#guideHint"); h.innerHTML=`<span class="gh-ic">✋</span><span>${esc(msg)}</span>`; }
function advanceGuide(){
  guideIdx++;
  if(guideIdx>=guideSteps.length) return guideDone();
  renderGuideStep();
}
function guideDone(){
  const k=$("#kiosk"); k.style.background="#fff";
  k.innerHTML=`<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center">
    <div class="done-check">✓</div>
    <div style="font-size:1.3rem;font-weight:800">${esc(t("guideDone"))}</div>
    <div style="color:var(--stone)">${esc(cart[0]?cart[0].label:"")}</div></div>`;
  $("#guideStep").textContent="✓";
  $("#guideHint").innerHTML=`<span class="gh-ic">🎉</span><span>${esc(t("guideDone"))}</span>`;
  speak(t("guideDone"));
}

/* ============ 언어 ============ */
function detectLang(text){
  if(!text) return null;
  if(/[가-힣]/.test(text)) return "KO";
  if(/[぀-ヿ]/.test(text)) return "JA";
  if(/[ăâđêôơưĂÂĐÊÔƠƯàáạảãằắặẳẵầấậẩẫèéẹẻẽềếệểễìíịỉĩòóọỏõồốộổỗờớợởỡùúụủũừứựửữỳýỵỷỹ]/i.test(text)) return "VI";
  if(/[一-鿿]/.test(text)) return "ZH";
  if(/[a-z]/i.test(text)) return "EN";
  return null;
}
function maybeAutoSwitch(text){ if(!state.autoLang) return; const d=detectLang(text);
  if(d && d!==state.language){ setLanguage(d); speak(I18N[d].langSwitched); } }
function buildFlags(){
  const wrap=$("#flags"); wrap.innerHTML="";
  Object.keys(FLAGS).forEach(code=>{
    const b=document.createElement("button");
    b.className="flag"+(code===state.language?" active":"");
    b.textContent=FLAGS[code]+" "+NATIVE[code];
    b.setAttribute("aria-pressed", code===state.language?"true":"false");
    b.setAttribute("aria-label", NATIVE[code]);
    b.onclick=()=>setLanguage(code);
    wrap.appendChild(b);
  });
}
function setLanguage(code){ state.language=code; buildFlags(); applyUiText(); renderCart();
  document.documentElement.lang=BCP47[code].split("-")[0]; }

/* ============ UI 문구 ============ */
function applyUiText(){
  const set=(id,key)=>{ const e=document.getElementById(id); if(e) e.textContent=t(key); };
  // 로그인/간편가입 화면 문구
  set("loginTitle","loginTitle"); set("kakaoLbl","kakaoStart"); set("noKakaoBtn","noKakao"); set("guestOk","guestOk");
  set("signupTitle","signupTitle"); set("signupSub","signupSub");
  set("nameLabel","nameLabel"); set("phoneLabel","phoneLabel"); set("suSubmit","startBtn");
  const nph=$("#suName"); if(nph) nph.placeholder=t("namePh");
  const pph=$("#suPhone"); if(pph) pph.placeholder=t("phonePh");
  renderAuth();   // 헤더의 로그인/이름·로그아웃 라벨도 언어에 맞춰 갱신
  const sl=$("#soundLbl"); if(sl) sl.textContent=soundKey();
  const fl=$("#fontLbl"); if(fl) fl.textContent = state.big ? t("fontSmall") : t("fontBig");
  set("heroBadge","heroBadge"); set("homeTitle","homeTitle"); set("homeSub","homeSub"); set("homeFoot","homeFoot");
  set("chooseHelp","chooseHelp"); set("qrTitle","qrTitle"); set("qrHint","qrHint");
  set("guideTitle","guideTitle"); set("staffTitle","staffTitle"); set("staffHint","staffHint");
  set("unmappedTitle","unmappedTitle"); set("unmappedSub","unmappedSub");
  set("reportTitle","reportTitle"); set("reportHint","reportHint");
  set("reportDone","reportDone"); set("reportDoneSub","reportDoneSub");
  set("cartTitle","cart"); set("safetyLbl","staffShow");
  const ru=$("#reportUpload"); if(ru) ru.textContent=t("reportBtn");
  const th=$("#toHomeBtn"); if(th) th.textContent=t("toHome");
  if($("#text")) $("#text").placeholder=t("type");
  $$("[data-k]").forEach(e=>e.textContent=t(e.getAttribute("data-k")));
  if(state.screen==="mapped" && state.brandLabel) $("#knownBrand").textContent=state.brandLabel;
  refreshNextCta();
}

/* ============ 접근성 ============ */
/* 글자 크게: 단일 토글(보통↔완전 크게). 버튼 라벨·부호도 스왑. */
function toggleFont(){
  state.big=!state.big;
  document.body.classList.toggle("big", state.big);
  const btn=$("#fontToggle");
  if(btn){ btn.setAttribute("aria-pressed", state.big?"true":"false");
    const s=btn.querySelector("small"); if(s) s.textContent=state.big?"−":"+"; }
  const fl=$("#fontLbl"); if(fl) fl.textContent = state.big ? t("fontSmall") : t("fontBig");
  speak(state.big ? t("fontBig") : t("fontSmall"));
}
function soundKey(){ return state.sound==="high"?t("soundHigh"):state.sound==="mid"?t("soundMid"):t("soundOff"); }
function cycleSound(){
  state.sound = state.sound==="high"?"mid":state.sound==="mid"?"off":"high";
  const sl=$("#soundLbl"); if(sl) sl.textContent=soundKey();
  $("#soundBtn").firstChild.textContent = state.sound==="off"?"🔇 ":"🔊 ";
  if(state.sound!=="off") speak(soundKey());
}

/* ============ 대화 / 주문 ============ */
function addMsg(role,text,koText){
  const div=document.createElement("div"); div.className="msg "+(role==="me"?"me":"bot");
  div.textContent=text||"";
  if(koText&&koText!==text){ const s=document.createElement("span"); s.className="ko"; s.textContent=koText; div.appendChild(s); }
  $("#chat").appendChild(div); scrollDown();
}
function renderCart(){
  const bar=$("#cartbar"), list=$("#cartList"); if(!bar) return;
  if(!cart.length){ bar.classList.add("hidden"); return; }
  bar.classList.remove("hidden"); $("#cartTitle").textContent=t("cart");
  list.innerHTML=""; let total=0;
  cart.forEach(c=>{ const q=c.qty||1; total+=(c.price||0)*q;
    const li=document.createElement("li");
    li.innerHTML=`<span>${esc(c.label)} <b style="color:var(--stone)">×${q}</b></span><span class="p">${won((c.price||0)*q)}</span>`; list.appendChild(li); });
  $("#cartTotal").textContent=t("total")+" "+won(total);
}
function orderTotal(){ return cart.reduce((s,c)=>s+(c.price||0)*(c.qty||1),0); }
function renderMiniOrder(sel){ renderOrderInto(sel); }
function renderStaffOrder(sel){ renderOrderInto(sel); }
function renderOrderInto(sel){
  const box=$(sel); if(!box) return; box.innerHTML="";
  if(!cart.length){ box.innerHTML=`<p class="center-sub">${t("orderEmpty")}</p>`; return; }
  if(state.brandLabel){
    const bh=document.createElement("div"); bh.className="order-brand";
    bh.textContent=state.brandLabel; box.appendChild(bh);
  }
  // 로그인한 경우 주문서에 이름/전화번호 자동 표기(직원 응대 편의)
  if(state.user && state.user.name){
    const cu=document.createElement("div"); cu.className="order-customer";
    cu.textContent="🧑 "+state.user.name+(state.user.phone?" · "+fmtPhone(state.user.phone):"");
    box.appendChild(cu);
  }
  const ul=document.createElement("ul"); ul.className="order-list"; let total=0;
  cart.forEach(c=>{ const q=c.qty||1; total+=(c.price||0)*q;
    const li=document.createElement("li");
    li.innerHTML=`<span>${esc(c.label)} <b class="qy">×${q}</b></span><span>${won((c.price||0)*q)}</span>`; ul.appendChild(li); });
  const sum=document.createElement("div"); sum.className="order-total";
  sum.innerHTML=`<span>${t("total")}</span><b>${won(total)}</b>`;
  box.appendChild(ul); box.appendChild(sum);
}

/* ============ QR / 미매핑 ============ */
function buildQR(){
  const box=$("#qrBox"); box.innerHTML=""; const N=21;
  const seed=(state.brandId||"paik")+"|"+cart.map(c=>c.id).join(",");
  let h=2166136261>>>0; for(let i=0;i<seed.length;i++){ h=(h^seed.charCodeAt(i))>>>0; h=(h*16777619)>>>0; }
  const inFinder=(r,c)=>{ const z=[[0,0],[0,N-7],[N-7,0]];
    for(const q of z){ const rr=r-q[0],cc=c-q[1];
      if(rr>=0&&rr<7&&cc>=0&&cc<7){ const e=rr===0||rr===6||cc===0||cc===6,co=rr>=2&&rr<=4&&cc>=2&&cc<=4; return (e||co)?1:-1; } } return 0; };
  const grid=document.createElement("div"); grid.className="qr-grid"; grid.style.gridTemplateColumns=`repeat(${N},1fr)`;
  for(let r=0;r<N;r++) for(let c=0;c<N;c++){ h=(h*1103515245+12345)&0x7fffffff;
    const f=inFinder(r,c); const on=f===1?true:f===-1?false:(h%100)<46;
    const cell=document.createElement("i"); if(on) cell.className="on"; grid.appendChild(cell); }
  box.appendChild(grid);
}
function runUnmapped(){
  const keys=["stepRecog","stepOrder","stepStaff"]; const ol=$("#unmappedSteps"); ol.innerHTML="";
  keys.forEach(k=>{ const li=document.createElement("li"); li.textContent=t(k); ol.appendChild(li); });
  const lis=ol.querySelectorAll("li");
  lis.forEach((li,i)=>setTimeout(()=>{ li.classList.add("on"); if(i===lis.length-1) renderOrderInto("#unmappedOrder"); }, 500*(i+1)));
}

/* ============ 실시간 음성 비서(연속 듣기 + 에코 방지 + AI 해석) ============ */
let recog=null;
function micToggle(){ state.listening ? stopListening() : startListening(); }
function startListening(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){ addMsg("bot","🎤 이 브라우저는 음성이 안 돼요. 아래 입력창을 사용해 주세요."); return; }
  state.listening=true;
  $("#mic").classList.add("rec"); $("#mic").textContent="■";
  addMsg("bot","🎧 "+t("listening")); speak(t("listening"));  // speak 끝나면 자동으로 듣기 시작
}
function stopListening(){
  state.listening=false; state.speaking=false;
  $("#mic").classList.remove("rec"); $("#mic").textContent="🎤";
  if(recog){ try{ recog.onend=null; recog.stop(); }catch(e){} recog=null; }
}
function listenOnce(){
  if(!state.listening || state.speaking || recog) return;
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition; if(!SR) return;
  recog=new SR(); recog.lang=BCP47[state.language]; recog.interimResults=false; recog.maxAlternatives=1;
  recog.onresult=(ev)=>{ const said=(ev.results[0][0].transcript||"").trim();
    if(said){ maybeAutoSwitch(said); addMsg("me",said); routeUtterance(said); } };
  recog.onerror=(e)=>{ const w=e&&e.error;
    if(w==="not-allowed"||w==="service-not-allowed"){ addMsg("bot","🎤 마이크 권한을 허용해 주세요(주소창 왼쪽 아이콘)."); stopListening(); } };
  recog.onend=()=>{ recog=null; if(state.listening && !state.speaking) setTimeout(listenOnce, 200); };
  try{ recog.start(); }catch(e){ recog=null; if(state.listening) setTimeout(listenOnce, 400); }
}
/* 발화 라우팅: 진입이면 가게 판단, 주문이면 메뉴 매칭→AI 해석 */
function routeUtterance(text){
  if(state.stage==="entry"){ handleEntry(text); return; }
  const it=matchItem(text);
  if(it) return resolveItem(it);
  aiPick(text);
}
async function aiPick(text){
  const items=coffeeItems();
  if(items.length){
    try{
      const r=await fetch("/api/pick",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({text, language:state.language, items:items.map(i=>({id:i.id,name:i.name}))})});
      if(r.ok){ const j=await r.json(); if(j&&j.itemId&&j.itemId!=="NONE"){ const f=items.find(i=>i.id===j.itemId); if(f) return resolveItem(f); } }
    }catch(e){}
  }
  addMsg("bot","🍊 "+t("pickFromMenu")); speak(t("pickFromMenu"));
}
function speak(text){
  if(!text||state.sound==="off"||!window.speechSynthesis){ if(state.listening && !state.speaking) setTimeout(listenOnce,150); return; }
  try{
    window.speechSynthesis.cancel();
    if(state.listening){ state.speaking=true; if(recog){ try{ recog.onend=null; recog.stop(); }catch(e){} recog=null; } }
    const u=new SpeechSynthesisUtterance(text);
    u.lang=BCP47[state.language]; u.rate=state.big?0.9:1.0; u.volume=state.sound==="mid"?0.6:1.0;
    u.onend=u.onerror=()=>{ if(state.speaking){ state.speaking=false; if(state.listening) setTimeout(listenOnce,200); } };
    window.speechSynthesis.speak(u);
  }catch(e){ state.speaking=false; if(state.listening) setTimeout(listenOnce,200); }
}

/* ============ 입력창(메뉴 직접 언급 시 바로 확정) ============ */
function submitText(){
  const v=$("#text").value.trim(); if(!v) return;
  maybeAutoSwitch(v); addMsg("me",v); $("#text").value="";
  if(state.stage==="entry"){ handleEntry(v); return; }   // 진입: 가게 판단
  const it=matchItem(v);
  if(it) resolveItem(it);
  else { addMsg("bot","🍊 "+t("pickFromMenu")); speak(t("pickFromMenu")); }
}
function matchItem(text){
  const items=coffeeItems(); const q=text.replace(/\s/g,"");
  let best=items.find(it=>it.name.replace(/\s/g,"").includes(q)||q.includes(it.name.replace(/\s/g,"")));
  if(best) return best;
  const wantHot=/(뜨|따뜻|hot|nóng|热|ホット)/i.test(text), wantIce=/(차|시원|아이스|ice|iced|lạnh|冰|アイス)/i.test(text);
  const base=/(아메리카노|americano|아메)/i.test(text)?"아메리카노":/(라떼|latte)/i.test(text)?"카페라떼":/(원조|origin)/i.test(text)?"원조커피":null;
  if(base){ const pool=items.filter(it=>it.name.includes(base));
    if(wantHot){ const h=pool.find(it=>it.name.includes("HOT")); if(h) return h; }
    if(wantIce){ const c=pool.find(it=>it.name.includes("ICED")); if(c) return c; }
    if(pool[0]) return pool[0]; }
  return null;
}

/* ============ 제보 ============ */
function initReport(){
  $("#reportUpload").onclick=()=>$("#reportFile").click();
  $("#reportFile").onchange=async (e)=>{
    const f=e.target.files[0]; if(!f) return;
    $("#reportPreview").innerHTML=`<img src="${URL.createObjectURL(f)}" alt="제보 사진 미리보기">`;
    const btn=$("#reportUpload"), orig=btn.textContent;
    btn.disabled=true; btn.textContent=t("reportAnalyzing"); speak(t("reportAnalyzing"));
    const fd=new FormData(); fd.append("image",f);
    try{
      const j=await (await fetch("/api/report",{method:"POST",body:fd})).json();
      btn.disabled=false; btn.textContent=orig;
      if(j && j.ok){
        openChat(j.brandName);
        addMsg("bot","🎉 "+j.brandName+" "+t("reportRegistered")+" ("+j.itemCount+")");
        startBrand(j.brandId, j.brandName);   // 제보한 키오스크로 바로 주문 도와주기
      } else {
        $("#reportHint").textContent=(j&&j.message)?j.message:t("photoUnclear");
      }
    }catch(err){ btn.disabled=false; btn.textContent=orig; $("#reportHint").textContent=t("photoUnclear"); }
  };
}

/* ============ 로그인 / 간편가입 (선택 · 게스트-우선) ============ */
/* 로그인은 절대 앱 사용의 전제가 아니다. 안 해도 모든 기능이 동작하고,
   해두면 주문서에 이름/전화번호가 자동으로 채워져 직원에게 보여주기가 편해진다. */
async function checkAuth(){
  try{
    const r=await fetch("/auth/me",{headers:{Accept:"application/json"}});
    if(r.ok){ const j=await r.json();
      state.kakaoEnabled=!!j.kakaoEnabled;
      state.user = j.loggedIn ? { name:j.name, phone:j.phone, provider:j.provider, admin:!!j.admin } : null;
    }
  }catch(e){}
  renderAuth();
}
function greetName(u){ return (u&&u.name?u.name:"")+(u&&u.name?t("hiSuffix"):""); }
function renderAuth(){
  const box=$("#authArea"); if(!box) return; box.innerHTML="";
  if(state.user){
    const who=document.createElement("span"); who.className="who";
    who.textContent=greetName(state.user)||t("login");
    box.appendChild(who);
    if(state.user.admin){   // 관리자만 대시보드 진입 버튼
      const adm=document.createElement("a"); adm.className="ghostbtn admin-link"; adm.href="/admin";
      adm.textContent="관리자"; adm.setAttribute("aria-label","관리자 대시보드");
      box.appendChild(adm);
    }
    const out=document.createElement("button"); out.className="ghostbtn"; out.id="logoutBtn";
    out.textContent=t("logout"); out.onclick=doLogout;
    box.appendChild(out);
  } else {
    const inb=document.createElement("button"); inb.className="ghostbtn"; inb.id="loginEntry";
    inb.textContent=t("login"); inb.setAttribute("aria-label",t("login"));
    inb.onclick=()=>show("login");
    box.appendChild(inb);
  }
}
function goKakao(){
  if(state.kakaoEnabled){ location.href="/login/kakao"; }   // 서버가 카카오로 리다이렉트
  else { show("signup"); toast(t("noKakao")); speak(t("noKakao")); }   // 키 미설정 → 간편가입 우회
}
async function submitSignup(e){
  if(e) e.preventDefault();
  const name=$("#suName").value.trim(), phone=$("#suPhone").value.trim();
  const err=$("#suErr");
  if(!name || phone.replace(/\D/g,"").length<8){
    err.hidden=false; err.textContent=t("signupErr"); speak(t("signupErr"));
    (!name?$("#suName"):$("#suPhone")).focus(); return;
  }
  err.hidden=true;
  try{
    const r=await fetch("/auth/signup",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({name,phone})});
    if(r.ok){ const j=await r.json();
      state.user={ name:j.name, phone:j.phone, provider:j.provider };
      renderAuth(); afterLogin();
    } else { err.hidden=false; err.textContent=t("signupErr"); speak(t("signupErr")); }
  }catch(err2){ $("#suErr").hidden=false; $("#suErr").textContent=t("signupErr"); }
}
function afterLogin(){
  show("home");
  toast(t("loginOkMsg")); speak(t("loginOkMsg"));
}
async function doLogout(){
  try{ await fetch("/auth/logout",{method:"POST"}); }catch(e){}
  state.user=null; renderAuth();
  toast(t("loggedOutMsg")); speak(t("loggedOutMsg"));
}
/* 카카오 콜백 후 홈으로 돌아온 결과(?login=ok/fail/unconfigured) 처리 후 URL 정리 */
function handleLoginRedirect(){
  const p=new URLSearchParams(location.search); const r=p.get("login");
  if(!r) return;
  if(r==="ok"){ /* checkAuth 가 이미 이름을 채움 */ setTimeout(()=>{ toast(t("loginOkMsg")); speak(t("loginOkMsg")); }, 300); }
  else if(r==="fail"||r==="unconfigured"){ setTimeout(()=>{ show("signup"); toast(t("loginFailMsg")); speak(t("loginFailMsg")); }, 200); }
  history.replaceState(null,"",location.pathname);
}
function fmtPhone(p){ if(!p) return ""; const d=p.replace(/\D/g,"");
  return d.length===11 ? d.replace(/(\d{3})(\d{4})(\d{4})/,"$1-$2-$3") : d; }
/* 입력 중 자동 하이픈: 숫자만 남기고 3-4-4 로(예: 01012345678 → 010-1234-5678). 사용자가 - 안 쳐도 됨. */
function autoHyphen(v){
  const d=(v||"").replace(/\D/g,"").slice(0,11);
  if(d.length<4) return d;
  if(d.length<8) return d.slice(0,3)+"-"+d.slice(3);
  return d.slice(0,3)+"-"+d.slice(3,7)+"-"+d.slice(7);
}

/* ============ 유틸 ============ */
function esc(s){ return (s||"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])); }
function scrollDown(){ const c=$("#chat"); if(c) c.scrollTop=c.scrollHeight; }
let _toastTimer=null;
function toast(msg){
  let el=$("#toast");
  if(!el){ el=document.createElement("div"); el.id="toast"; el.className="toast";
    el.setAttribute("role","status"); el.setAttribute("aria-live","polite"); document.body.appendChild(el); }
  el.textContent=msg; el.classList.add("show");
  clearTimeout(_toastTimer); _toastTimer=setTimeout(()=>el.classList.remove("show"), 1800);
}

/* ============ 초기화 ============ */
async function loadKnownBrands(){
  try{ const list=await (await fetch("/api/kiosks")).json();
    (list||[]).forEach(k=>{ if(k.brandId) state.knownBrands.add(k.brandId); }); }catch(e){}
}
window.addEventListener("DOMContentLoaded", ()=>{
  buildFlags(); applyUiText(); renderCart(); loadPaik(); loadKnownBrands();
  $$("[data-go]").forEach(b=>b.onclick=()=>{ const g=b.getAttribute("data-go");
    if(g==="speak") return goSpeak();
    if(g==="photo") return goPhoto(); show(g); });
  $$("[data-back]").forEach(b=>b.onclick=()=>show(b.getAttribute("data-back")));
  $("#brandHome").onclick=()=>show("home");
  $("#kakaoBtn").onclick=goKakao;
  $("#noKakaoBtn").onclick=()=>show("signup");
  $("#signupForm").addEventListener("submit", submitSignup);
  $("#suPhone").addEventListener("input", (e)=>{ e.target.value=autoHyphen(e.target.value); });
  $("#fontToggle").onclick=toggleFont;
  $("#soundBtn").onclick=cycleSound;
  $("#safetyBtn").onclick=()=>show("staff");
  $("#mic").onclick=micToggle;
  $("#send").onclick=submitText;
  $("#cam").onclick=()=>{ $("#homePhoto").value=""; $("#homePhoto").click(); };  // 대화 중 사진도 인식
  $("#homePhoto").onchange=(e)=>onHomePhoto(e.target.files[0]);
  $("#text").addEventListener("keydown",(e)=>{ if(e.key==="Enter") submitText(); });
  initReport();
  checkAuth();            // 로그인 상태 확인 → 헤더 갱신(게스트여도 정상)
  handleLoginRedirect();  // 카카오 콜백 결과(?login=...) 처리
  show("home");
});
