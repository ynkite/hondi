// 오몽(omong) — 제주 키오스크 도우미 (웹앱 · 핸드폰 목업)
// 대화 기록 로그(사용자·AI 발화 모두 표시) + 답 버튼. 음성은 상시 듣기(Web Speech).
// 흐름: 진입 → 좁혀가기(쉬운 질문) → 메뉴 확정 → [더 담기/완료하기]
//   → (완료) 바로 조작가이드(결제까지) → 하단 [직원에게 보여주기 / QR]
// iPhone(Safari)/Galaxy(Chrome) 공통 + 스크린리더 지원 + i18n 자동.

const DEMO_BRAND = "paik";
const IS_MOBILE = /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent) || ((navigator.maxTouchPoints||0)>1 && window.matchMedia && matchMedia("(pointer:coarse)").matches);
const state = {
  language:"KO", brandId:null, brandLabel:null,
  sound:"high", big:false, autoLang:true,
  screen:"home", stage:"entry", payMethod:null,
  listening:false, speaking:false, ttsUnlocked:false,
  user:null, kakaoEnabled:false,
  plan:[], planCursor:0, planReady:false,
  knownBrands:new Set(["paik","momstouch","mcdonalds","megacoffee"])
};
const cart = [];
let paikData=null, cropCache={};
const $  = (s)=>document.querySelector(s);
const $$ = (s)=>document.querySelectorAll(s);
function t(k){ return (I18N[state.language]||I18N.KO)[k]; }
const won = (n)=>(n||0).toLocaleString()+"₩";
function esc(s){ return (s||"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])); }

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
  try{
    const r=await fetch("/api/brands/"+encodeURIComponent(brand));
    if(r.ok){ cropCache[key]=await r.json(); return cropCache[key]; }
  }catch(e){}
  if(SPEC_FILES[brand]){
    try{ cropCache[key]=await (await fetch(SPEC_FILES[brand])).json(); return cropCache[key]; }catch(e){}
  }
  return null;
}

/* ============ 화면 라우터 ============ */
const SCREENS=["home","order","guide","qr","staff","report","reportDone","login","signup"];
function show(name){
  flushSpeech();
  state.screen=name;
  SCREENS.forEach(s=>{ const el=document.getElementById("scr-"+s); if(el) el.classList.toggle("active", s===name); });
  if(name==="home"){ stopListening(); cart.length=0; renderCart(); refreshReorder(); }
  const lb=document.getElementById("langbar"); if(lb) lb.classList.toggle("hidden", name!=="home");
  onEnter(name);
  const scr=document.getElementById("scr-"+name);
  if(scr){ const f=scr.querySelector("h1,h2,.scrtitle,.hbtn,.linkbtn"); if(f){ f.setAttribute("tabindex","-1"); try{f.focus();}catch(e){} } }
}
function onEnter(name){
  if(name==="guide"){ openGuide(); }
  if(name==="qr"){ buildQR(); renderOrderForm("#qrOrder"); srSay(t("qrTitle")); }
  if(name==="staff"){ renderStaffOrder("#staffOrder"); speak(t("staffTitle")); }
}

/* ============ 대화 로그 (사용자·AI 발화 모두 기록) ============ */
function openOrder(title){ $("#orderTitle").textContent=title||""; $("#log").innerHTML=""; show("order"); }
function logEl(){ return $("#log"); }
function scrollDown(){ const c=$("#orderbody"); if(c) c.scrollTop=c.scrollHeight; }
function addBot(text, opt){
  const d=document.createElement("div"); d.className="m-bot"; d.textContent=text||"";
  logEl().appendChild(d); scrollDown();
  if(!opt || opt.speak!==false) speak(text, opt);
  else if(opt && opt.onEnd) setTimeout(opt.onEnd,10);
  return d;
}
function addUser(text){ const d=document.createElement("div"); d.className="m-user"; d.textContent=text||""; logEl().appendChild(d); scrollDown(); return d; }
function addNote(text){ const d=document.createElement("div"); d.className="m-note"; d.textContent=text||""; logEl().appendChild(d); scrollDown(); return d; }
function addMediaMsg(src){ const d=document.createElement("div"); d.className="m-media"; d.innerHTML=`<img src="${src}" alt="">`; logEl().appendChild(d); scrollDown(); return d; }
function clearActiveOpts(){ logEl().querySelectorAll(".ask-opts,.options,.photo-grid").forEach(e=>e.remove()); }
function addOpts(n, extra){
  clearActiveOpts();
  const el=document.createElement("div");
  el.className="ask-opts"+((n===2||n===4)?" two":"")+(extra?(" "+extra):"");
  el.setAttribute("role","group"); el.setAttribute("aria-label", t("pickOne"));
  logEl().appendChild(el); scrollDown(); return el;
}
function focusLastOpt(){
  const list=logEl().querySelectorAll(".ask-opts,.options,.photo-grid");
  const last=list[list.length-1]; const b=last && last.querySelector("button,[role=button]");
  if(b) try{b.focus();}catch(e){}
}

/* ============ 홈 진입 ============ */
const KNOWN=[
  { id:"paik",       re:/빽다방|백다방|빽|paik/i,                    label:"빽다방" },
  { id:"momstouch",  re:/맘스터치|맘스|moms?\s?touch/i,             label:"맘스터치" },
  { id:"mcdonalds",  re:/맥도날드|맥도널드|맥날|mcdonald|빅맥/i,      label:"맥도날드" },
  { id:"megacoffee", re:/메가\s?커피|메가엠지씨|mega\s?coffee|메가/i, label:"메가커피" }
];
function goSpeak(){
  openOrder(t("btnSpeak"));
  state.stage="entry";
  addBot(t("greetShort"), {onEnd:()=>{ if(!state.listening) startListening(); }});   // 인사(음성) — 끝나면 듣기 시작
  addNote(t("greetNote"));                                                            // 지원 매장 안내(화면만)
  renderBrandButtons();
}
function renderBrandButtons(){
  const el=addOpts(4, "brandpick");
  KNOWN.forEach(k=>{
    const b=document.createElement("button"); b.className="qbtn"; b.type="button"; b.setAttribute("aria-label",k.label);
    b.innerHTML=`<span class="qt">${esc(k.label)}</span>`;
    b.onclick=()=>{ addUser(k.label); startBrand(k.id,k.label); };
    el.appendChild(b);
  });
  focusLastOpt();
}

/* ===== 사진 고르기: 키오스크(실사진)/메뉴판/간판 × 4브랜드 = 4×3 ===== */
const BRANDS4=[
  {id:"paik",label:"빽다방"},{id:"momstouch",label:"맘스터치"},
  {id:"mcdonalds",label:"맥도날드"},{id:"megacoffee",label:"메가커피"}
];
function photoRows(){ return [
  { key:"kiosk", icon:"🖥️", label:t("pgKiosk"), img:(id)=>"/demo/"+id+".jpg", ready:true },
  { key:"menu",  icon:"📋", label:t("pgMenu"),  img:()=>null, ready:false },
  { key:"sign",  icon:"🪧", label:t("pgSign"),  img:()=>null, ready:false }
]; }
function goPhoto(){
  openOrder(t("btnPhoto"));
  state.stage="entry";
  addBot(t("entryPhotoAsk"));
  addNote(t("demoPick"));
  // 내 사진 올리기
  const up=addOpts(1);
  const b=document.createElement("button"); b.className="qbtn"; b.type="button";
  const upIcon=IS_MOBILE?"📷":"📁", upLabel=IS_MOBILE?t("takePhoto"):t("uploadFile");
  b.innerHTML=`<span class="qi" aria-hidden="true">${upIcon}</span><span class="qt">${esc(upLabel)}</span>`;
  b.onclick=()=>{ $("#homePhoto").value=""; $("#homePhoto").click(); };
  up.appendChild(b);
  renderPhotoGrid();
}
function renderPhotoGrid(){
  const block=document.createElement("div"); block.className="photo-grid";
  photoRows().forEach(row=>{
    const rl=document.createElement("div"); rl.className="pg-rowlabel";
    rl.innerHTML=`<span aria-hidden="true">${row.icon}</span> ${esc(row.label)}`;
    block.appendChild(rl);
    const grid=document.createElement("div"); grid.className="pg-row";
    BRANDS4.forEach(br=>{
      const src=row.img(br.id);
      const cell=document.createElement("button"); cell.type="button"; cell.className="pg-cell"+(row.ready?"":" soon");
      cell.setAttribute("aria-label", br.label+" "+row.label+(row.ready?"":" — "+t("pgSoon")));
      cell.innerHTML = (src
        ? `<img src="${src}" alt="" loading="lazy">`
        : `<span class="pg-ph" aria-hidden="true">${row.icon}</span>`)
        + `<span class="pg-cap">${esc(br.label)}</span>`;
      cell.onclick=()=>{ addUser(br.label+" "+row.label); if(row.ready && src) useDemoPhoto({brand:br.id,label:br.label,src}); else startBrand(br.id,br.label); };
      grid.appendChild(cell);
    });
    block.appendChild(grid);
  });
  logEl().appendChild(block); scrollDown();
}
async function useDemoPhoto(d){
  clearActiveOpts();
  if(d.src) addMediaMsg(d.src);
  addBot(t("recognizing"));
  try{
    const blob=await (await fetch(d.src)).blob();
    const fd=new FormData(); fd.append("image", new File([blob],"demo.jpg",{type:"image/jpeg"}));
    const a=await (await fetch("/api/recognize",{method:"POST",body:fd})).json();
    if(a && a.brandId && a.brandId!=="NONE"){
      if(isKnownBrand(a.brandId)) return startBrand(a.brandId, a.brandName||a.brandId);
      return photoComingSoon(a.brandName);
    }
  }catch(e){}
  const hit=KNOWN.find(k=>k.id===d.brand);
  startBrand(d.brand, hit?hit.label:d.label);
}
function isKnownBrand(id){ return !!SPEC_FILES[id] || state.knownBrands.has(id); }
/* 아는 브랜드가 아니어도 사진에서 상호/종류를 인식 → "○○이네요" + 다음 안내 */
function comingSoonMsg(name){ return name ? t("comingSoonNamed").replace("{name}", name) : t("brandSoon"); }
/* 말하기/입력: 준비중 안내만. 돌아가지 않고 계속 대화. */
function entryComingSoon(name){
  clearActiveOpts();
  addBot(comingSoonMsg(name));
}
/* 사진찍기: 준비중 안내 + 5초 후 메인 복귀(음성은 전체 낭독). */
function photoComingSoon(name){
  clearActiveOpts();
  addBot(comingSoonMsg(name));
  addBot(t("returnHome"));
  setTimeout(()=>{ if(state.screen==="order") show("home"); }, 5000);
}
/* 메뉴판 사진 → AI가 메뉴 추출·등록(/api/report) → 바로 주문 도우기 */
async function onMenuPhoto(file){
  if(!file) return;
  clearActiveOpts(); addMediaMsg(URL.createObjectURL(file)); addBot(t("recognizing"));
  const fd=new FormData(); fd.append("image",file);
  try{
    const j=await (await fetch("/api/report",{method:"POST",body:fd})).json();
    if(j && j.ok && j.brandId){ openOrder(j.brandName||t("btnPhoto")); return startBrand(j.brandId, j.brandName||j.brandId); }
  }catch(e){}
  addBot(t("photoUnclear"));
}
async function handleEntry(text){
  const hit=KNOWN.find(k=>k.re.test(text));
  if(hit) return startBrand(hit.id, hit.label);
  if(/(사진.?못|못\s*찍|못\s*해|안\s*찍)/.test(text)) return entrySoon();
  // 스마트 대화: 잡담도 자연스럽게 받되 가게를 추측해 확인
  try{
    const r=await fetch("/api/converse",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text})});
    if(r.ok){ const j=await r.json();
      if(j.reply) addBot(j.reply);
      if(j.brandId && j.brandId!=="NONE"){
        if(isKnownBrand(j.brandId)) return confirmBrand(j.brandId, j.brandName||j.brandId);
        return entryComingSoon(j.brandName);
      }
      return;   // 잡담 → 계속 대화 (다음 발화/입력 대기)
    }
  }catch(e){}
  entryUnknown();
}
/* AI가 추측한 가게가 맞는지 확인 */
function confirmBrand(id,label){
  const el=addOpts(2);
  const yes=document.createElement("button"); yes.className="qbtn"; yes.type="button";
  yes.innerHTML=`<span class="qi" aria-hidden="true">✅</span><span class="qt">${esc(t("confirmYes"))}</span>`;
  yes.onclick=()=>{ addUser(t("confirmYes")); startBrand(id,label); };
  const no=document.createElement("button"); no.className="qbtn"; no.type="button";
  no.innerHTML=`<span class="qi" aria-hidden="true">🔄</span><span class="qt">${esc(t("confirmNo"))}</span>`;
  no.onclick=()=>{ addUser(t("confirmNo")); addBot(t("greetShort")); };
  el.appendChild(yes); el.appendChild(no); focusLastOpt();
}
async function startBrand(brandId, label){
  state.brandId=brandId; state.brandLabel=label;
  cropCache={}; state.spec=null; cart.length=0; renderCart();
  clearActiveOpts();
  try{ state.spec=await getSpec("coffee.v2"); }catch(e){}
  if(!coffeeItems().length){ brandSoon(label); return; }
  state.stage="funnel";
  addBot(label+t("recognizedSuffix"));
  resetFunnel(); loadPlan(); setTimeout(funnelStep, 350);
}
function brandSoon(label){
  clearActiveOpts();
  addBot((label?label+": ":"")+t("brandSoon"));
  setTimeout(()=>show("home"), 2800);
}
function entryUnknown(){
  addBot(t("notKnown"));
  const el=addOpts(2);
  const b1=document.createElement("button"); b1.className="qbtn"; b1.type="button";
  b1.innerHTML=`<span class="qi" aria-hidden="true">📷</span><span class="qt">${esc(t("takePhoto"))}</span>`;
  b1.onclick=()=>{ $("#homePhoto").value=""; $("#homePhoto").click(); };
  const b2=document.createElement("button"); b2.className="qbtn"; b2.type="button";
  b2.innerHTML=`<span class="qi" aria-hidden="true">🙅</span><span class="qt">${esc(t("cantPhoto"))}</span>`;
  b2.onclick=()=>{ addUser(t("cantPhoto")); entrySoon(); };
  el.appendChild(b1); el.appendChild(b2); focusLastOpt();
}
function entrySoon(){ clearActiveOpts(); addBot(t("soonUpdate")); }
async function onHomePhoto(file){
  if(!file) return;
  openOrder(t("btnPhoto")); state.stage="entry";
  addMediaMsg(URL.createObjectURL(file));
  addBot(t("recognizing"));
  const fd=new FormData(); fd.append("image",file); fd.append("language",state.language);
  try{
    const res=await fetch("/api/recognize",{method:"POST",body:fd});
    const a=await res.json();
    if(a && a.brandId && a.brandId!=="NONE"){
      if(isKnownBrand(a.brandId)) return startBrand(a.brandId, a.brandName||a.brandId);
      return photoComingSoon(a.brandName);
    }
    photoComingSoon((a&&a.brandName)||null);
  }catch(e){ photoComingSoon(null); }
}

/* ============ 좁혀가기(funnel) ============ */
let remainingIds=[], askedDims=new Set();
function resetFunnel(){ remainingIds = coffeeItems().map(it=>it.id); askedDims=new Set(); state.planCursor=0; }
function itemsByIds(ids){ const m=new Map(coffeeItems().map(it=>[it.id,it])); return ids.map(id=>m.get(id)).filter(Boolean); }
/* 매장 메뉴 기반 '질문 계획'을 AI에게 한 번 받아둔다(백그라운드). 준비되면 funnelStep이 즉시 걸어감. */
function loadPlan(){
  state.plan=[]; state.planCursor=0; state.planReady=false;
  const items=coffeeItems(); if(items.length<3) return;
  fetch("/api/plan",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({language:state.language, brandName:state.brandLabel, items:items.map(i=>({id:i.id,name:i.name}))})})
    .then(r=>r.ok?r.json():[]).then(arr=>{ if(Array.isArray(arr)&&arr.length){ state.plan=arr; state.planReady=true; } }).catch(()=>{});
}
/* 계획에서 지금 남은 후보를 실제로 갈라주는 다음 질문 하나를 즉시 반환(빈 그룹 제거, 못 나누면 건너뜀). */
function planNext(items){
  if(!state.planReady || !state.plan) return null;
  const remain=new Set(items.map(it=>it.id));
  while(state.planCursor < state.plan.length){
    const q=state.plan[state.planCursor]; state.planCursor++;
    const opts=(q.options||[]).map(o=>({label:o.label,icon:o.icon,ids:(o.ids||[]).filter(id=>remain.has(id))})).filter(o=>o.ids.length);
    if(opts.length>=2 && opts.some(o=>o.ids.length<items.length)) return {question:q.question, options:opts.slice(0,4)};
  }
  return null;
}
/* 종류(cat)로 먼저 크게 나누는 질문: 버거/치킨/사이드/음료 등 (최대 4개, 초과 시 '그 밖에') */
const CAT_ICON={ "버거":"🍔","치킨":"🍗","사이드":"🍟","음료":"🥤","커피":"☕","디저트":"🍰","세트":"🍱","스무디":"🧋","쉐이크":"🥤","에이드":"🥤","차":"🍵","아이스크림":"🍦","밥":"🍚","면":"🍜","분식":"🍢","빵":"🥐" };
// 어르신·아이도 아는 쉬운 말(그림과 함께 표시)
const CAT_LABEL={
  "버거":"햄버거","치킨":"치킨","사이드":"짭짤한 간식","음료":"마실 것","커피":"커피",
  "디저트":"달콤한 후식","세트":"묶음 세트","스무디":"시원한 스무디","쉐이크":"쉐이크",
  "에이드":"상큼한 에이드","차":"따뜻한 차","아이스크림":"아이스크림","밥":"밥 종류","면":"면 종류","분식":"분식","빵":"빵·베이커리"
};
function categoryQuestion(items){
  const map={}; items.forEach(it=>{ if(it.cat){ (map[it.cat]=map[it.cat]||[]).push(it.id); } });
  const keys=Object.keys(map);
  if(keys.length<2) return null;
  let opts;
  if(keys.length<=4){ opts=keys.map(c=>({label:CAT_LABEL[c]||c,icon:CAT_ICON[c]||"🍽️",ids:map[c]})); }
  else{ opts=keys.slice(0,3).map(c=>({label:CAT_LABEL[c]||c,icon:CAT_ICON[c]||"🍽️",ids:map[c]}));
        opts.push({label:"다른 메뉴",icon:"🍽️",ids:[].concat(...keys.slice(3).map(c=>map[c]))}); }
  return { question:"무엇을 드시겠어요?", options:opts };
}
/* 선택 화면용 보기 좋은 이름: 옵션 줄임말 괄호(쉼표 든 것)는 떼고, HOT/ICED는 풀어씀. (장바구니·주문서엔 원래 이름 그대로 사용) */
function displayName(name){
  let n=name||"";
  n=n.replace(/\([^)]*,[^)]*\)/g,"");                       // "(아,샷,추)" 같은 옵션 줄임말 제거
  n=n.replace(/\(\s*HOT\s*\)/gi,"(따뜻한)").replace(/\(\s*(ICED|ICE|아이스)\s*\)/gi,"(시원한)");
  return n.replace(/\s{2,}/g," ").trim();
}
/* 이름을 몰라도 알 수 있게, 이름에서 짧은 특징(맛·재료)을 뽑아 보여준다. */
function itemHint(it){
  const n=it.name||""; const tags=[];
  if(it.cat && it.cat!=="버거") tags.push(CAT_LABEL[it.cat]||it.cat);
  if(/매콤|매운|불사|핫|스파이시|할라피뇨|불싸이/.test(n)) tags.push("매콤한 맛");
  else if(/순한|화이트|담백/.test(n)) tags.push("순한 맛");
  if(/불고기/.test(n)) tags.push("불고기");
  if(/새우/.test(n)) tags.push("새우");
  if(/갈비/.test(n)) tags.push("갈비");
  if(/치즈/.test(n)) tags.push("치즈");
  if(/강정|양념|데리야?끼/.test(n)) tags.push("달콤한 양념");
  if(/후라이드|후레이크|바삭|크리스피/.test(n)) tags.push("바삭한 튀김");
  if(/순살/.test(n)) tags.push("뼈 없는 순살");
  return [...new Set(tags)].slice(0,2).join(" · ");
}

async function funnelStep(){
  const items = itemsByIds(remainingIds);
  if(items.length<=1){ if(items[0]) resolveItem(items[0]); return; }
  let q = planNext(items) || categoryQuestion(items) || clientQuestion(items);
  if(!q){ renderFinalPick(items); return; }              // 못 나누면 후보 목록(최대 4개)
  if(q.options && q.options.length>4) q.options=q.options.slice(0,4);   // 선택지 최대 4개
  renderQuestion(q);
}
function renderQuestion(q){
  state.currentQ=q;
  addBot(q.question);
  const wrap=addOpts(q.options.length);
  q.options.forEach(o=>{
    const b=document.createElement("button"); b.className="qbtn"; b.type="button";
    b.setAttribute("aria-label", o.label);
    b.innerHTML = (o.icon?`<span class="qi" aria-hidden="true">${o.icon}</span>`:"")+`<span class="qt">${esc(o.label)}</span>`
      + (o.sub?`<span class="qs">${esc(o.sub)}</span>`:"");
    b.onclick=()=>{ addUser(o.label); chooseFunnel(q,o); };
    wrap.appendChild(b);
  });
  focusLastOpt();
}
function chooseFunnel(q,o){
  const next = (o.ids && o.ids.length) ? o.ids.filter(id=>remainingIds.includes(id)) : remainingIds;
  remainingIds = next.length ? next : remainingIds;
  if(q.dim) askedDims.add(q.dim);
  funnelStep();
}
function renderFinalPick(items){
  items=items.slice(0,4);                              // 한 번에 최대 4개만
  addBot(t("pickOne"));
  clearActiveOpts();
  const box=document.createElement("div"); box.className="options"; box.setAttribute("role","group");
  items.forEach(it=>{
    const hint=itemHint(it); const dn=displayName(it.name);
    const b=document.createElement("button"); b.className="opt"; b.type="button";
    b.setAttribute("aria-label", dn+(hint?", "+hint:"")+", "+it.price+" "+t("won"));
    b.innerHTML=`<span class="name">${esc(dn)}${hint?'<span class="opt-hint">'+esc(hint)+'</span>':''}</span><span class="price">${won(it.price)}</span>`;
    b.onclick=()=>{ addUser(dn); resolveItem(it); };
    box.appendChild(b);
  });
  logEl().appendChild(box); scrollDown(); focusLastOpt();
}
function resolveItem(it){
  state.currentQ=null;
  cart.push({ id:it.id, label:it.name, price:it.price, qty:1 });
  renderCart();
  addBot(it.name+" — "+t("chosen"));
  askCartDecision();
}

/* ============ 더 담기 / 완료하기 ============ */
function askCartDecision(){
  state.stage="cartDecision";
  addBot(t("addedCart"));
  const el=addOpts(2);
  const more=document.createElement("button"); more.className="qbtn"; more.type="button";
  more.innerHTML=`<span class="qi" aria-hidden="true">➕</span><span class="qt">${esc(t("addMore"))}</span><span class="qs">${esc(t("addMoreSub"))}</span>`;
  more.onclick=()=>{ addUser(t("addMore")); addMore(); };
  const fin=document.createElement("button"); fin.className="qbtn"; fin.type="button";
  fin.innerHTML=`<span class="qi" aria-hidden="true">✅</span><span class="qt">${esc(t("finish"))}</span><span class="qs">${esc(t("finishSub"))}</span>`;
  fin.onclick=()=>{ addUser(t("finish")); askDine(); };
  el.appendChild(more); el.appendChild(fin); focusLastOpt();
}
/* 완료 후 매장/포장 선택 (말하기·버튼 둘 다). 선택은 조작가이드의 '어디서 드실건가요?' 단계에 반영된다. */
function askDine(){
  state.stage="dine";
  addBot("🍽️ 어디서 드실 건가요? 매장, 포장 중에 골라 주세요."); speak("어디서 드실 건가요? 매장에서 드시면 매장, 가져가시면 포장을 골라 주세요.");
  const el=addOpts(2);
  [["here","🏪","매장","여기서 먹고 가요"],["togo","🛍️","포장","가지고 갈게요"]].forEach(([id,ic,label,sub])=>{
    const b=document.createElement("button"); b.className="qbtn"; b.type="button"; b.setAttribute("aria-label",label);
    b.innerHTML=`<span class="qi" aria-hidden="true">${ic}</span><span class="qt">${esc(label)}</span><span class="qs">${esc(sub)}</span>`;
    b.onclick=()=>{ state.dineType=id; addUser(label); finishOrder(); };
    el.appendChild(b);
  });
  focusLastOpt();
}
function addMore(){ state.stage="funnel"; resetFunnel(); funnelStep(); }
function finishOrder(){ saveLastOrder(); state.stage="guide"; show("guide"); }

/* ============ 조작 가이드 ============ */
let guideSteps=[], guideIdx=0;
async function openGuide(){
  $("#guideTitle").textContent=t("guideTitle");
  state.payMethod=null;
  const item = cart[0];
  let spec=null; try{ spec=await getSpec("coffee.v2"); }catch(e){}
  guideSteps=[];
  const dine = state.dineType || "here";   // 말하기 흐름에서 고른 매장/포장 반영
  guideSteps.push({ kind:"dine", target:dine, hint: dine==="togo" ? "먼저 '포장'을 눌러요" : t("guideStore") });
  if(spec) guideSteps.push({ kind:"kiosk", spec, targetId:item?item.id:null, hint:(item?item.label+" ":"")+t("guideTapThis") });
  guideSteps.push({ kind:"cart", hint:"결제하기 "+t("guideTapThis") });
  guideSteps.push({ kind:"pay", hint:t("askPay") });
  guideIdx=0; renderGuideStep();
}
function tagFinger(el, label){
  el.style.position="relative";
  const tag=document.createElement("div"); tag.className="ktag"; tag.textContent="👆 "+(label||"");
  const fin=document.createElement("div"); fin.className="kfinger"; fin.setAttribute("aria-hidden","true"); fin.textContent="👆";
  el.appendChild(tag); el.appendChild(fin);
}
function wrongTap(){ speak(t("guideFollow")); flashHint(t("guideFollow")); }
function renderGuideStep(){
  const st=guideSteps[guideIdx], k=$("#kiosk");
  k.innerHTML=""; k.style.background="";
  $("#guideStep").textContent=(guideIdx+1)+" / "+guideSteps.length;
  $("#guideHint").innerHTML=`<span class="gh-ic" aria-hidden="true">👆</span><span>${esc(st.hint)}</span>`;
  speak(st.hint);
  if(st.kind==="dine") renderDine(k, st.target);
  else if(st.kind==="kiosk") renderKiosk(k, st.spec, st.targetId);
  else if(st.kind==="cart") renderCartScreen(k);
  else if(st.kind==="pay") renderPayScreen(k);
  else if(st.kind==="payinfo") renderPayInfo(k, st.method);
  else if(st.kind==="receipt") renderReceiptScreen(k);
  else if(st.kind==="staffshow") renderStaffShow(k);
}
function choosePay(id){
  state.payMethod=id;
  const rest = id==="cash"
    ? [{ kind:"staffshow", hint:t("cashToStaff") }]
    : [{ kind:"payinfo", method:id, hint: id==="mobile"?t("payMobileOn"):t("payInsertCard") },
       { kind:"receipt", hint:"영수증 받기 "+t("guideTapThis") }];
  guideSteps = guideSteps.slice(0, guideIdx+1).concat(rest);
  advanceGuide();
}
function renderPayScreen(k){
  k.style.background="#f4f6fb";
  const w=document.createElement("div"); w.className="k-pay";
  w.innerHTML=`<div class="k-ptitle">${esc(t("askPay"))}</div>`;
  const grid=document.createElement("div"); grid.className="k-paygrid";
  [["card","💳",t("payCard"),true],["cash","💵",t("payCash"),false],["mobile","📱",t("payMobile"),false]].forEach(([id,ic,label,rec])=>{
    const b=document.createElement("div"); b.className="k-paybtn"; b.setAttribute("role","button"); b.tabIndex=0; b.setAttribute("aria-label",label);
    b.innerHTML=`<span class="pi" aria-hidden="true">${ic}</span><span>${esc(label)}</span>`;
    if(rec){ b.classList.add("khl"); tagFinger(b,t("payEasiest")); }
    b.onclick=()=>choosePay(id);
    b.onkeydown=(e)=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); choosePay(id); } };
    grid.appendChild(b);
  });
  w.appendChild(grid); k.appendChild(w);
}
function renderPayInfo(k, method){
  k.style.background="#f4f6fb";
  const w=document.createElement("div"); w.className="k-pay";
  w.innerHTML=`<div class="k-ptitle">${method==="mobile"?esc(t("payMobile")):esc(t("payCard"))}</div>`;
  const ico=document.createElement("div"); ico.className="k-pico"; ico.setAttribute("aria-hidden","true"); ico.textContent=method==="mobile"?"📱":"💳";
  const ins=document.createElement("div"); ins.className="k-pinfo"; ins.textContent=method==="mobile"?t("payMobileOn"):t("payInsertCard");
  const nx=document.createElement("div"); nx.className="k-bigbtn khl"; nx.setAttribute("role","button"); nx.tabIndex=0; nx.textContent=t("done");
  tagFinger(nx,t("done")); nx.onclick=advanceGuide; nx.onkeydown=(e)=>{ if(e.key==="Enter"||e.key===" "){e.preventDefault();advanceGuide();} };
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
  const w=document.createElement("div"); w.className="k-pay";
  w.innerHTML=`<div class="k-ptitle">${esc(t("cart"))}</div>`;
  let total=0;
  cart.forEach(it=>{ total+=(it.price||0)*(it.qty||1);
    const row=document.createElement("div"); row.className="k-orow";
    row.innerHTML=`<span>${esc(it.label)}</span><span>${((it.price||0)*(it.qty||1)).toLocaleString()}원</span>`;
    w.appendChild(row);
  });
  const tot=document.createElement("div"); tot.className="k-otot";
  tot.innerHTML=`<span>${esc(t("total"))}</span><b>${total.toLocaleString()}원</b>`;
  const pay=document.createElement("div"); pay.className="k-bigbtn khl"; pay.setAttribute("role","button"); pay.tabIndex=0; pay.textContent="결제하기";
  tagFinger(pay,"결제하기"); pay.onclick=advanceGuide; pay.onkeydown=(e)=>{ if(e.key==="Enter"||e.key===" "){e.preventDefault();advanceGuide();} };
  w.appendChild(tot); w.appendChild(pay); k.appendChild(w);
}
function renderReceiptScreen(k){
  k.style.background="#f4f6fb";
  const w=document.createElement("div"); w.className="k-pay";
  w.innerHTML=`<div class="k-ptitle">영수증 받으실래요?</div>`;
  const grid=document.createElement("div"); grid.className="k-paygrid";
  const get=document.createElement("div"); get.className="k-paybtn khl"; get.setAttribute("role","button"); get.tabIndex=0;
  get.innerHTML=`<span class="pi" aria-hidden="true">🧾</span><span>영수증 받기</span>`;
  tagFinger(get,"영수증 받기"); get.onclick=advanceGuide; get.onkeydown=(e)=>{ if(e.key==="Enter"||e.key===" "){e.preventDefault();advanceGuide();} };
  const no=document.createElement("div"); no.className="k-paybtn dim"; no.setAttribute("role","button"); no.tabIndex=0;
  no.innerHTML=`<span class="pi" aria-hidden="true">🚫</span><span>안 받기</span>`; no.onclick=wrongTap;
  grid.appendChild(get); grid.appendChild(no);
  w.appendChild(grid); k.appendChild(w);
}
function renderDine(k, targetId){
  k.style.background="#e9edf1";
  const wrap=document.createElement("div"); wrap.className="k-dine";
  const q=document.createElement("div"); q.className="q"; q.textContent="어디서 드실건가요?";
  const btns=document.createElement("div"); btns.className="btns";
  [["here","🏪","매장"],["togo","🛍️","포장"]].forEach(([id,ic,nm])=>{
    const b=document.createElement("div"); b.className="k-dinebtn"; b.setAttribute("role","button"); b.tabIndex=0; b.setAttribute("aria-label",nm);
    b.innerHTML=`<span class="di" aria-hidden="true">${ic}</span><span>${nm}</span>`;
    if(id===targetId){ b.classList.add("khl"); tagFinger(b,nm); b.onclick=advanceGuide; b.onkeydown=(e)=>{ if(e.key==="Enter"||e.key===" "){e.preventDefault();advanceGuide();} }; }
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
    const tab=document.createElement("div"); tab.className="k-tab"+(name===spec.activeCategory?" on":"");
    if(name===spec.activeCategory) tab.style.background=th.tabActiveBg||"#d7d9e0";
    tab.textContent=name; side.appendChild(tab);
  });
  const main=document.createElement("div"); main.className="k-main";
  const title=document.createElement("div"); title.className="k-title"; title.textContent=spec.title||"";
  const grid=document.createElement("div"); grid.className="k-grid"; grid.style.gridTemplateColumns=`repeat(${spec.cols||4},1fr)`;
  (spec.items||[]).forEach(it=>{
    const card=document.createElement("div"); card.className="k-card"; card.style.background=th.cardBg||"#fff";
    card.style.gridColumn=(it.c+1); card.style.gridRow=(it.r+1);
    card.setAttribute("role","button"); card.tabIndex=0; card.setAttribute("aria-label",it.name);
    const thumb=document.createElement("div"); thumb.className="k-thumb"; thumb.style.background="#fff"; // 이미지가 짧으면 흰 배경으로 채움
    if(it.cut||it.thumb){
      const img=document.createElement("img"); img.alt=""; img.src=it.cut||it.thumb;
      img.onerror=()=>{ if(it.thumb && img.getAttribute("src")!==it.thumb){ img.src=it.thumb; } };
      thumb.appendChild(img);
    } else { const em=document.createElement("span"); em.className="k-emoji"; em.setAttribute("aria-hidden","true"); em.textContent=it.emoji||"🍽️"; thumb.appendChild(em); }
    const nm=document.createElement("div"); nm.className="k-name"; nm.textContent=it.name;
    const pr=document.createElement("div"); pr.className="k-price"; pr.style.color=th.price||"#3a3f5a"; pr.textContent=(it.price||0).toLocaleString()+"원";
    card.appendChild(thumb); card.appendChild(nm); card.appendChild(pr);
    if(it.id===targetId){ card.classList.add("khl"); tagFinger(card,null); card.onclick=advanceGuide; card.onkeydown=(e)=>{ if(e.key==="Enter"||e.key===" "){e.preventDefault();advanceGuide();} }; }
    else { card.classList.add("dim"); card.onclick=wrongTap; }
    grid.appendChild(card);
  });
  const bottom=document.createElement("div"); bottom.className="k-bottom";
  bottom.innerHTML=`<span class="k-togo">${esc(spec.togoLabel||"포장주문")} ›</span><span class="k-cart" aria-hidden="true">🛒</span>`;
  main.appendChild(title); main.appendChild(grid); main.appendChild(bottom);
  k.appendChild(side); k.appendChild(main);
}
function flashHint(msg){ const h=$("#guideHint"); h.innerHTML=`<span class="gh-ic" aria-hidden="true">✋</span><span>${esc(msg)}</span>`; }
function advanceGuide(){ guideIdx++; if(guideIdx>=guideSteps.length) return guideDone(); renderGuideStep(); }
function guideDone(){
  const k=$("#kiosk"); k.style.background="#fff";
  k.innerHTML=`<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center">
    <div class="done-check" aria-hidden="true">✓</div>
    <div style="font-size:1.3rem;font-weight:800">${esc(t("guideDone"))}</div>
    <div style="color:var(--stone)">${esc(cart.map(c=>c.label).join(", "))}</div></div>`;
  $("#guideStep").textContent="✓";
  $("#guideHint").innerHTML=`<span class="gh-ic" aria-hidden="true">🎉</span><span>${esc(t("guideDone"))}</span>`;
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
  if(d && d!==state.language){ setLanguage(d); srSay(I18N[d].langSwitched); } }
function browserLang(){
  const l=(navigator.languages&&navigator.languages[0])||navigator.language||"ko";
  const p=l.toLowerCase();
  if(p.startsWith("ko")) return "KO";
  if(p.startsWith("ja")) return "JA";
  if(p.startsWith("vi")) return "VI";
  if(p.startsWith("zh")) return "ZH";
  if(p.startsWith("en")) return "EN";
  return "KO";
}
function buildFlags(){
  const wrap=$("#flags"); wrap.innerHTML="";
  Object.keys(FLAGS).forEach(code=>{
    const b=document.createElement("button"); b.type="button";
    b.className="flag"+(code===state.language?" active":"");
    b.textContent=NATIVE[code];   // 각 나라 언어로 표기 (한국어 | English | ...)
    b.setAttribute("aria-pressed", code===state.language?"true":"false");
    b.setAttribute("aria-label", NATIVE[code]); b.title=NATIVE[code];
    b.onclick=()=>setLanguage(code);
    wrap.appendChild(b);
  });
}
function setLanguage(code){ state.language=code; buildFlags(); applyUiText(); renderCart();
  document.documentElement.lang=BCP47[code].split("-")[0]; }

/* ============ UI 문구 ============ */
function set0(id,txt){ const e=document.getElementById(id); if(e) e.textContent=txt; }
function applyUiText(){
  const setk=(id,key)=>set0(id,t(key));
  setk("loginTitle","loginTitle"); set0("kakaoLbl",t("kakaoStart")); set0("noKakaoBtn",t("noKakao")); setk("guestOk","guestOk");
  setk("signupTitle","signupTitle"); setk("signupSub","signupSub"); setk("nameLabel","nameLabel"); setk("phoneLabel","phoneLabel");
  const _su=$("#suSubmit"); if(_su) _su.textContent=t("startBtn");
  const _sn=$("#suName"); if(_sn) _sn.placeholder=t("namePh");
  const _sp=$("#suPhone"); if(_sp) _sp.placeholder=t("phonePh");
  renderAuth();
  set0("soundLbl", soundKey());                                   // ← 값 직접(버그 수정)
  set0("fontLbl", state.big ? t("fontSmall") : t("fontBig"));     // ← 값 직접(버그 수정)
  setk("heroBadge","heroBadge"); setk("homeTitle","homeTitle"); setk("homeSub","homeSub");
  setk("qrTitle","qrTitle"); setk("qrHint","qrHint");
  setk("guideTitle","guideTitle"); setk("staffTitle","staffTitle"); setk("staffHint","staffHint");
  setk("reportTitle","reportTitle"); setk("reportHint","reportHint");
  setk("reportDone","reportThanks"); setk("reportDoneSub","reportCrowd"); setk("crowdDef","crowdDef");
  setk("cartTitle","cart");
  const ru=$("#reportUpload"); if(ru) ru.textContent=t("reportBtn");
  const th=$("#toHomeBtn"); if(th) th.textContent=t("toHome");
  if($("#text")) $("#text").placeholder=t("directType");
  $$("[data-k]").forEach(e=>e.textContent=t(e.getAttribute("data-k")));
  set0("langNote", t("langDemoNote"));
  const pl=document.querySelector(".hbtn-photo .hlabel"); if(pl) pl.textContent = state.big ? t("btnPhotoShort") : t("btnPhoto");
  const rl=document.querySelector(".hbtn-report .hlabel"); if(rl) rl.textContent = state.big ? t("btnReportShort") : t("btnReport");
  setListenUI(state.listening);
  refreshReorder();
}

/* ============ 접근성: 글자 크게 / 소리 ============ */
function toggleFont(){
  state.big=!state.big;
  document.documentElement.classList.toggle("big", state.big);
  const btn=$("#fontToggle"); if(btn) btn.setAttribute("aria-pressed", state.big?"true":"false");
  const ic=btn && btn.querySelector(".ac-ic"); if(ic) ic.textContent = state.big ? "가－" : "가";
  applyUiText();
  speak(state.big ? t("fontBig") : t("fontSmall"));
}
function soundKey(){ return state.sound==="high"?t("soundHigh"):state.sound==="mid"?t("soundMid"):t("soundOff"); }
function cycleSound(){
  state.sound = state.sound==="high"?"mid":state.sound==="mid"?"off":"high";
  set0("soundLbl", soundKey());
  const ic=$("#soundIcon"); if(ic) ic.textContent = state.sound==="off"?"🔇":"🔊";
  const btn=$("#soundBtn"); if(btn) btn.setAttribute("aria-pressed", state.sound==="off"?"false":"true");
  if(state.sound==="off"){ flushSpeech(); }
  else speak(soundKey());
}

/* ============ 상시 듣기 UI ============ */
function setListenUI(on){
  const st=$("#listenState"), lbl=$("#listenLbl"), mic=$("#mic"), micLbl=$("#micLbl");
  if(st) st.classList.toggle("on", !!on);
  if(lbl) lbl.textContent = on ? t("alwaysListening") : "";
  if(mic){ mic.classList.toggle("rec", !!on); mic.setAttribute("aria-pressed", on?"true":"false"); }
  if(micLbl) micLbl.textContent = on ? t("micStop") : t("micTap");
}

/* ============ 주문 / 장바구니 ============ */
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
function renderMiniOrder(sel){ renderOrderInto(sel); }
function renderStaffOrder(sel){ renderOrderInto(sel); }
function renderOrderInto(sel){
  const box=$(sel); if(!box) return; box.innerHTML="";
  if(!cart.length){ box.innerHTML=`<p class="center-sub">${esc(t("orderEmpty"))}</p>`; return; }
  if(state.brandLabel){ const bh=document.createElement("div"); bh.className="order-brand"; bh.textContent=state.brandLabel; box.appendChild(bh); }
  if(state.user && state.user.name){ const cu=document.createElement("div"); cu.className="order-customer";
    cu.textContent="🧑 "+state.user.name+(state.user.phone?" · "+fmtPhone(state.user.phone):""); box.appendChild(cu); }
  const ul=document.createElement("ul"); ul.className="order-list"; let total=0;
  cart.forEach(c=>{ const q=c.qty||1; total+=(c.price||0)*q;
    const li=document.createElement("li");
    li.innerHTML=`<span>${esc(c.label)} <b class="qy">×${q}</b></span><span>${won((c.price||0)*q)}</span>`; ul.appendChild(li); });
  const sum=document.createElement("div"); sum.className="order-total";
  sum.innerHTML=`<span>${esc(t("total"))}</span><b>${won(total)}</b>`;
  box.appendChild(ul); box.appendChild(sum);
}

/* ============ QR ============ */
function buildQR(){
  const box=$("#qrBox"); box.innerHTML="";
  if(window.QRCode){
    try{ new QRCode(box,{text:orderText(),width:256,height:256,correctLevel:QRCode.CorrectLevel.L}); box.setAttribute("role","img"); box.setAttribute("aria-label","주문 QR 코드"); return; }catch(e){ box.innerHTML=""; }
  }
  const N=21;
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

/* ============ 표준 주문서 / 최근 주문 ============ */
function pad(n){ return String(n).padStart(2,"0"); }
function nowStr(){ const d=new Date(); return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())+" "+pad(d.getHours())+":"+pad(d.getMinutes()); }
function orderNo(){
  const d=new Date(); const ymd=d.getFullYear()+pad(d.getMonth()+1)+pad(d.getDate());
  const seed=(state.brandId||"om")+cart.map(c=>c.id).join(""); let h=0;
  for(const ch of seed) h=(h*31+ch.charCodeAt(0))&0xffff;
  return "OM-"+ymd+"-"+String(h).padStart(4,"0");
}
function payName(){ const m=state.payMethod; return m==="cash"?t("payCash"):m==="mobile"?t("payMobile"):t("payCard"); }
function orderText(){
  // ⚠ QR 라이브러리(qrcodejs 1.0.0)는 한글 등 멀티바이트에서 'code length overflow' 로 실패한다.
  //   그래서 QR 에는 ASCII 만 담는다(brandId/itemId/숫자). 사람이 읽는 주문서는 '직원에게 보여주기' 화면에 있음.
  let total=0; const lines=cart.map(c=>{ const q=c.qty||1; total+=(c.price||0)*q; return c.id+" x"+q; }).join("\n");
  return "OMONG ORDER\nNo "+orderNo()+"\nStore "+(state.brandId||"-")+"\n"+lines+"\nTotal "+total+" KRW";
}
function renderOrderForm(sel){
  const box=$(sel); if(!box) return; box.innerHTML="";
  if(!cart.length){ box.innerHTML=`<p class="center-sub">${esc(t("orderEmpty"))}</p>`; return; }
  let total=0; const rows=cart.map(c=>{ const q=c.qty||1, amt=(c.price||0)*q; total+=amt;
    return `<tr><td class="of-nm">${esc(c.label)}</td><td class="of-q">${q}</td><td class="of-a">${amt.toLocaleString()}</td></tr>`; }).join("");
  const form=document.createElement("div"); form.className="order-form";
  form.innerHTML=
    `<div class="of-head"><span class="of-title">${esc(t("ofTitle"))}</span><span class="of-badge">omong</span></div>`+
    `<div class="of-meta">`+
      `<div><span>${esc(t("ofStore"))}</span><b>${esc(state.brandLabel||"")}</b></div>`+
      `<div><span>${esc(t("ofNo"))}</span><b>${orderNo()}</b></div>`+
      `<div><span>${esc(t("ofDate"))}</span><b>${nowStr()}</b></div>`+
    `</div>`+
    `<table class="of-tbl"><thead><tr><th>${esc(t("ofItems"))}</th><th>${esc(t("ofQty"))}</th><th>${esc(t("ofAmount"))} (₩)</th></tr></thead><tbody>${rows}</tbody></table>`+
    `<div class="of-total"><span>${esc(t("ofTotal"))}</span><b>${total.toLocaleString()}₩</b></div>`+
    `<div class="of-pay"><span>${esc(t("ofPay"))}</span><b>${esc(payName())}</b></div>`;
  box.appendChild(form);
}
function saveLastOrder(){
  if(!cart.length || !state.brandId) return;
  try{ localStorage.setItem("omong_last", JSON.stringify({ brandId:state.brandId, brandLabel:state.brandLabel, payMethod:state.payMethod||null, cart:cart.map(c=>({id:c.id,label:c.label,price:c.price,qty:c.qty||1})), ts:Date.now() })); }catch(e){}
}
function loadLastOrder(){ try{ return JSON.parse(localStorage.getItem("omong_last")||"null"); }catch(e){ return null; } }
function refreshReorder(){
  const b=$("#reorderBtn"); if(!b) return; const lo=loadLastOrder();
  if(state.user && lo && lo.cart && lo.cart.length){
    b.classList.remove("hidden");
    b.textContent="🕘 "+(state.big?t("recentShort"):t("recentOrder"))+" · "+(lo.brandLabel||"")+" ("+lo.cart.length+")";
    b.onclick=()=>reorder(lo);
  } else b.classList.add("hidden");
}
function reorder(lo){
  if(!lo) lo=loadLastOrder(); if(!lo) return;
  state.brandId=lo.brandId; state.brandLabel=lo.brandLabel; state.payMethod=lo.payMethod||null;
  cropCache={}; state.spec=null;
  cart.length=0; (lo.cart||[]).forEach(c=>cart.push({id:c.id,label:c.label,price:c.price,qty:c.qty||1}));
  renderCart(); state.stage="guide"; show("guide");   // 바로 키오스크 조작 화면
}

/* ============ 실시간 음성 (연속 듣기 + 에코 방지) ============ */
let recog=null;
function micToggle(){ state.listening ? stopListening() : startListening(); }
function startListening(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){ srSay("이 브라우저는 음성 인식을 지원하지 않아요. 아래 입력창이나 버튼을 사용해 주세요."); return; }
  state.listening=true; setListenUI(true);
  if(!state.speaking) listenOnce();
}
function stopListening(){
  state.listening=false; state.speaking=false; setListenUI(false);
  if(recog){ try{ recog.onend=null; recog.stop(); }catch(e){} recog=null; }
}
function listenOnce(){
  if(!state.listening || state.speaking || recog) return;
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition; if(!SR) return;
  recog=new SR(); recog.lang=BCP47[state.language]; recog.interimResults=false; recog.maxAlternatives=1;
  recog.onresult=(ev)=>{ const said=(ev.results[0][0].transcript||"").trim();
    if(!said) return;
    const ns=said.replace(/\s/g,""), nl=(state.lastSpoken||"").replace(/\s/g,"");
    if(nl && ns.length>=3 && (nl.includes(ns)||ns.includes(nl))) return;   // 앱 음성 에코 무시
    addUser(said); routeUtterance(said);
  };
  recog.onerror=(e)=>{ const w=e&&e.error;
    if(w==="not-allowed"||w==="service-not-allowed"){ srSay("마이크 권한을 허용해 주세요."); stopListening(); } };
  recog.onend=()=>{ recog=null; if(state.listening && !state.speaking) setTimeout(listenOnce, 250); };
  try{ recog.start(); }catch(e){ recog=null; if(state.listening) setTimeout(listenOnce, 400); }
}
function routeUtterance(text){
  maybeAutoSwitch(text);
  if(/다른\s*가게|다른\s*데|가게\s*바꾸|바꾸고\s*싶|처음으로|처음부터|취소|리셋|홈으로|change\s*store|different\s*store/i.test(text)) return backToEntry();
  if(state.screen==="guide") return guideVoice(text);
  if(state.stage==="entry") return handleEntry(text);
  if(state.stage==="cartDecision") return decisionVoice(text);
  if(state.stage==="dine") return dineVoice(text);
  if(state.stage==="funnel" && state.currentQ){ return resolveFunnelUtterance(text); }
  const it=matchItem(text); if(it) return resolveItem(it);
  aiPick(text);
}
/* 다른 가게로 바꾸기 (어느 단계에서든) */
function backToEntry(){
  flushSpeech();
  state.brandId=null; state.brandLabel=null; state.spec=null; state.currentQ=null;
  cart.length=0; renderCart(); state.stage="entry";
  addBot(t("greetShort")); addNote(t("greetNote")); renderBrandButtons();
}
/* 발화/입력 → 현재 질문의 '선택지' 매칭 (시원한거/차가운거/얼음/이시린거 등 동의어) */
const OPT_SYN=[
 {label:/시원|아이스|차가|ICED|얼음|콜드/i, user:/시원|차가|아이스|얼음|시린|찬거|찬것|찬\s|콜드|cold|ice/i},
 {label:/따뜻|뜨거|HOT|핫|뜨신/i,          user:/뜨거|따뜻|핫|뜨신|따신|hot|warm/i},
 {label:/달콤|단|달달|꿀/i,                 user:/달콤|단거|단것|달달|달달한|꿀|sweet/i},
 {label:/안\s*단|쓴|깔끔|진한/i,            user:/안단|안달|안\s*단|쓴|깔끔|진한|씁쓸|bitter/i},
 {label:/커피/i,                            user:/커피|라떼|아메리카노|아메|에스프레소|coffee|latte/i},
 {label:/아닌|과일|차|음료/i,               user:/과일|차\s|음료|주스|스무디|에이드|아닌|아니/i},
 {label:/많이|빽사이즈|큰/i,                user:/많이|많은|큰거|크게|빽사이즈|곱빼기|라지|large|big/i},
 {label:/보통|적게/i,                       user:/보통|적게|작은|기본|normal|small/i},
 {label:/치킨/i,                            user:/치킨|닭|chicken/i},
 {label:/소고기|비프|불고기/i,              user:/소고기|비프|불고기|beef/i},
 {label:/매콤|매운/i,                       user:/매콤|매운|맵|spicy/i},
 {label:/순한|안\s*매/i,                    user:/순한|안매|안맵|mild/i}
];
function matchOption(text, opts){
  if(!opts) return null;
  const sflat=text.replace(/\s/g,"");
  for(const o of opts){ const l=(o.label||"").replace(/\s/g,""); if(l && (sflat.includes(l)||(l.length>=2 && l.includes(sflat)))) return o; }
  for(const grp of OPT_SYN){ if(grp.user.test(text)){ const o=opts.find(x=>grp.label.test(x.label||"")); if(o) return o; } }
  return null;
}
/* AI 우선: 현재 질문의 선택지를 AI가 판단(‘이 시린 거’ 등도) → 실패 시 동의어 규칙 폴백 */
async function aiPickOptionReturn(text){
  const q=state.currentQ; if(!q) return null;
  try{
    const items=q.options.map((o,i)=>({id:String(i),name:o.label}));
    const r=await fetch("/api/pick",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({text, language:state.language, items})});
    if(r.ok){ const j=await r.json(); if(j&&j.itemId&&j.itemId!=="NONE"){ const o=q.options[parseInt(j.itemId,10)]; if(o) return o; } }
  }catch(e){}
  return null;
}
async function resolveFunnelUtterance(text){
  const q=state.currentQ; if(!q){ addBot(t("pickFromMenu")); return; }
  // 1) 사용자가 구체 메뉴를 바로 말함 → 즉시 확정
  const it=matchItem(text); if(it){ addUser(it.name); return resolveItem(it); }
  // 2) 동의어 규칙 먼저(즉시): 시원/따뜻/달/안단/커피 등
  const o=matchOption(text, q.options);
  if(o){ addUser(o.label); return chooseFunnel(q, o); }
  // 3) 규칙으로 애매하면 그때만 AI가 선택지 판단
  const ai=await aiPickOptionReturn(text);
  if(ai){ addUser(ai.label); return chooseFunnel(q, ai); }
  // 4) AI가 전체 메뉴에서 구체 메뉴 추론
  const items=coffeeItems();
  try{
    const r=await fetch("/api/pick",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({text, language:state.language, items:items.map(i=>({id:i.id,name:i.name}))})});
    if(r.ok){ const j=await r.json(); if(j&&j.itemId&&j.itemId!=="NONE"){ const f=items.find(i=>i.id===j.itemId); if(f){ addUser(f.name); return resolveItem(f); } } }
  }catch(e){}
  addBot(t("pickFromMenu"));
}
const RE_CARD=/카드|card|thẻ|the|刷卡|カード/i;
const RE_CASH=/현금|cash|tiền\s*mặt|tien\s*mat|现金|現金/i;
const RE_MOBILE=/모바일|페이|pay|mobile|di\s*động|di\s*dong|移动|モバイル|バーコード/i;
function guideVoice(text){
  const st=guideSteps[guideIdx];
  if(st && st.kind==="pay"){
    if(RE_CASH.test(text)) return choosePay("cash");
    if(RE_MOBILE.test(text)) return choosePay("mobile");
    if(RE_CARD.test(text)) return choosePay("card");
  }
  if(/다음|넘어|확인|네|예|맞아|next|ok|okay|xong|下一|次/i.test(text)){
    const cur=$("#kiosk .khl"); if(cur && cur.onclick){ cur.onclick(); }
  }
}
function decisionVoice(text){
  if(/완료|끝|그만|됐|충분|없|아니|finish|done|no|xong|完成|就这|完了|終わり|いい/i.test(text)) return askDine();
  if(/더|추가|또|하나|more|add|thêm|them|添加|再|追加|もう/i.test(text)) return addMore();
  const it=matchItem(text); if(it){ addMore(); setTimeout(()=>resolveItem(it),50); }
}
/* 매장/포장 음성 인식 */
function dineVoice(text){
  if(/포장|가져|테이크|to\s*go|takeout|take\s*away|mang\s*về|mang\s*ve|打包|带走|持ち帰|テイクアウト/i.test(text)){ state.dineType="togo"; addUser("포장"); return finishOrder(); }
  if(/매장|먹고|여기|먹을|안에서|dine|eat\s*in|here|tại\s*quán|tai\s*quan|堂食|店内|ここ/i.test(text)){ state.dineType="here"; addUser("매장"); return finishOrder(); }
  // 못 알아들으면 기본 매장으로 진행(막히지 않게)
  state.dineType="here"; finishOrder();
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
  addBot(t("pickFromMenu"));
}

/* ============ TTS + 스크린리더 라이브 ============ */
function srSay(text){ const el=$("#srLive"); if(el){ el.textContent=""; setTimeout(()=>{ el.textContent=text||""; }, 30); } }
function unlockTTS(){
  if(state.ttsUnlocked || !window.speechSynthesis) return;
  try{ const u=new SpeechSynthesisUtterance(" "); u.volume=0; window.speechSynthesis.speak(u); state.ttsUnlocked=true; }catch(e){}
}
function stripEmoji(s){ return (s||"").replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{1F1E6}-\u{1F1FF}]/gu,"").replace(/\s+/g," ").trim(); }
let voicesCache=[];
function loadVoices(){ try{ voicesCache=window.speechSynthesis.getVoices()||[]; }catch(e){} }
function pickVoice(){
  if(!voicesCache.length) loadVoices();
  const two=(BCP47[state.language]||"ko-KR").slice(0,2).toLowerCase();
  const cand=voicesCache.filter(v=>v.lang && v.lang.toLowerCase().startsWith(two));
  return cand.find(v=>/google|natural|neural|siri|yuna|premium|enhanced|wavenet/i.test(v.name))
      || cand.find(v=>v.localService) || cand[0] || null;
}
let speakQ=[];
function flushSpeech(){ speakQ=[]; try{ if(window.speechSynthesis) window.speechSynthesis.cancel(); }catch(e){} state.speaking=false; }
/* 연속 낭독 큐: 여러 말풍선이 잇달아 떠도 이전 문장을 끊지 않고 전부 읽는다. */
function speak(text, opt){
  const onEnd = opt && opt.onEnd;
  const clean = stripEmoji(text);                    // 이모지는 읽지 않음
  if(!clean || state.sound==="off" || !window.speechSynthesis){
    if(onEnd) setTimeout(onEnd, 10);
    if(state.listening && !state.speaking && !speakQ.length) setTimeout(listenOnce,150);
    return;
  }
  speakQ.push({clean, onEnd});
  if(!state.speaking) playQueue();
}
function playQueue(){
  if(!window.speechSynthesis) return;
  if(!speakQ.length){ state.speaking=false; if(state.listening) setTimeout(listenOnce,500); return; }
  state.speaking=true;
  if(recog){ try{ recog.onend=null; recog.stop(); }catch(e){} recog=null; }   // 낭독 중 듣기 정지(에코 방지)
  const item=speakQ.shift();
  state.lastSpoken=item.clean;
  try{
    window.speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(item.clean);
    u.lang=BCP47[state.language]; u.rate=1.0; u.pitch=1.0; u.volume=state.sound==="mid"?0.85:1.0;
    const v=pickVoice(); if(v) u.voice=v;
    u.onend=u.onerror=()=>{ if(item.onEnd) item.onEnd(); playQueue(); };
    window.speechSynthesis.speak(u);
  }catch(e){ if(item.onEnd) item.onEnd(); playQueue(); }
}

/* ============ 직접 입력 ============ */
function submitText(){
  const v=$("#text").value.trim(); if(!v) return;
  $("#text").value=""; addUser(v); routeUtterance(v);
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

/* ============ 규칙 폴백 질문 ============ */
function isSweet(it){ return /꿀|헤이즐넛|피스타치오|생크림|라떼|바닐라|초코|할메가|강정|양념|데리야/.test(it.name); }
function isHot(it){ return /HOT|에스프레소/.test(it.name); }
function isIce(it){ return /ICED|ICE|아이스/.test(it.name); }
function isBig(it){ return /빽사이즈|메가리카노/.test(it.name); }
function isChicken(it){ return /치킨|싸이|크리스피|상하이|텐더/.test(it.name); }
function isBeef(it){ return /비프|불고기|쿼터파운더|빅맥|소고기/.test(it.name); }
function isSpicy(it){ return /매콤|스파이시|싸이|상하이/.test(it.name); }
function clientQuestion(items){
  const ids = a => a.map(it=>it.id);
  const split=(dim,question,aLabel,aIcon,a,bLabel,bIcon,b)=>(
    { dim, question, options:[{label:aLabel,icon:aIcon,ids:ids(a)},{label:bLabel,icon:bIcon,ids:ids(b)}] });
  if(!askedDims.has("coffee")){
    const re=/커피|아메리카노|americano|라떼|latte|에스프레소|원조/i;
    const coffee=items.filter(it=>re.test(it.name)), other=items.filter(it=>!re.test(it.name));
    if(coffee.length && other.length)
      return split("coffee","커피 맛으로 드릴까요, 아닌 걸로 드릴까요?","커피 맛","☕",coffee,"커피 아닌 것","🍑",other);
  }
  if(!askedDims.has("patty")){
    const ck=items.filter(isChicken), bf=items.filter(it=>isBeef(it)&&!isChicken(it));
    if(ck.length && bf.length)
      return split("patty","바삭한 치킨버거가 좋으세요, 든든한 소고기버거가 좋으세요?","바삭한 치킨","🍗",ck,"든든한 소고기","🍔",bf);
  }
  if(!askedDims.has("spicy")){
    const sp=items.filter(isSpicy), mild=items.filter(it=>!isSpicy(it));
    if(sp.length && mild.length && items.some(isChicken))
      return split("spicy","살짝 매콤한 맛도 괜찮으세요, 순한 맛이 좋으세요?","매콤해도 좋아요","🌶️",sp,"순한 맛으로","🙂",mild);
  }
  if(!askedDims.has("sweet")){
    const sweet=items.filter(isSweet), strong=items.filter(it=>!isSweet(it));
    if(sweet.length && strong.length && !items.some(isChicken))
      return split("sweet","달콤한 게 좋으세요, 안 단 게 좋으세요?","달콤한 거","🍯",sweet,"안 단 거","☕",strong);
  }
  if(!askedDims.has("temp") && items.every(it=>isHot(it)||isIce(it))){
    const hot=items.filter(isHot), ice=items.filter(it=>isIce(it)&&!isHot(it));
    if(hot.length && ice.length)
      return split("temp","따뜻한 게 좋으세요, 시원한 게 좋으세요?","따뜻한 거","🔥",hot,"시원한 거","🧊",ice);
  }
  if(!askedDims.has("size")){
    const big=items.filter(isBig), norm=items.filter(it=>!isBig(it));
    if(big.length && norm.length && !items.some(isChicken))
      return split("size","얼마나 많이 드시겠어요?","보통 양","🥤",norm,"많이 (빽사이즈)","🪣",big);
  }
  return null;
}

/* ============ 제보 (사진 올리면 감사 + 크라우드소싱 안내) ============ */
function initReport(){
  $("#reportUpload").onclick=()=>$("#reportFile").click();
  $("#reportFile").onchange=(e)=>{
    const f=e.target.files[0]; if(!f) return;
    $("#reportPreview").innerHTML=`<img src="${URL.createObjectURL(f)}" alt="제보 사진 미리보기">`;
    try{ const fd=new FormData(); fd.append("image",f); if(state.user&&state.user.name) fd.append("reporterName",state.user.name); fetch("/api/report",{method:"POST",body:fd}).catch(()=>{}); }catch(err){}
    applyUiText();
    show("reportDone");
    speak(t("reportThanks")+" "+t("reportCrowd"));
  };
}

/* ============ 로그인 / 간편가입 (선택 · 게스트 우선) ============ */
let _toastTimer;
function toast(msg){
  let el=$("#toast");
  if(!el){ el=document.createElement("div"); el.id="toast"; el.className="toast"; el.setAttribute("role","status"); el.setAttribute("aria-live","polite"); document.body.appendChild(el); }
  el.textContent=msg; el.classList.add("show");
  clearTimeout(_toastTimer); _toastTimer=setTimeout(()=>el.classList.remove("show"), 1800);
}
function fmtPhone(p){ if(!p) return ""; const d=p.replace(/\D/g,""); return d.length===11 ? d.replace(/(\d{3})(\d{4})(\d{4})/,"$1-$2-$3") : d; }
function greetName(u){ return (u&&u.name?u.name:"")+(u&&u.name?t("hiSuffix"):""); }
async function checkAuth(){
  try{
    const r=await fetch("/auth/me",{headers:{Accept:"application/json"}});
    if(r.ok){ const j=await r.json();
      state.kakaoEnabled=!!j.kakaoEnabled;
      state.user = j.loggedIn ? { name:j.name, phone:j.phone, provider:j.provider, admin:!!j.admin } : null;
    }
  }catch(e){}
  renderAuth(); refreshReorder();
}
function renderAuth(){
  const box=$("#authArea"); if(!box) return; box.innerHTML="";
  if(state.user){
    const who=document.createElement("span"); who.className="who"; who.textContent=greetName(state.user)||t("login"); box.appendChild(who);
    const out=document.createElement("button"); out.className="ghostbtn"; out.type="button"; out.textContent=t("logout"); out.onclick=doLogout; box.appendChild(out);
  } else {
    const inb=document.createElement("button"); inb.className="ghostbtn"; inb.type="button"; inb.textContent=t("login"); inb.setAttribute("aria-label",t("login")); inb.onclick=()=>{ unlockTTS(); show("login"); }; box.appendChild(inb);
  }
  // 관리자 페이지 상시 접근(데모)
  const adm=document.createElement("a"); adm.className="ghostbtn admin-link"; adm.href="/admin"; adm.textContent="관리자"; adm.setAttribute("aria-label","관리자 페이지"); box.appendChild(adm);
}
function goKakao(){
  if(state.kakaoEnabled){ location.href="/login/kakao"; }
  else { show("signup"); toast(t("noKakao")); speak(t("noKakao")); }
}
async function submitSignup(e){
  if(e) e.preventDefault();
  const name=$("#suName").value.trim(), phone=$("#suPhone").value.trim(), err=$("#suErr");
  if(!name || phone.replace(/\D/g,"").length<8){ err.hidden=false; err.textContent=t("signupErr"); speak(t("signupErr")); (!name?$("#suName"):$("#suPhone")).focus(); return; }
  err.hidden=true;
  try{
    const r=await fetch("/auth/signup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,phone})});
    if(r.ok){ const j=await r.json(); state.user={ name:j.name, phone:j.phone, provider:j.provider, admin:!!j.admin }; renderAuth(); afterLogin(); }
    else { err.hidden=false; err.textContent=t("signupErr"); speak(t("signupErr")); }
  }catch(e2){ err.hidden=false; err.textContent=t("signupErr"); }
}
function afterLogin(){ show("home"); toast(t("loginOkMsg")); speak(t("loginOkMsg")); }
async function doLogout(){
  try{ await fetch("/auth/logout",{method:"POST"}); }catch(e){}
  state.user=null; renderAuth(); refreshReorder(); toast(t("loggedOutMsg")); speak(t("loggedOutMsg"));
}
function handleLoginRedirect(){
  const q=new URLSearchParams(location.search), r=q.get("login"); if(!r) return;
  if(r==="ok"){ setTimeout(()=>{ toast(t("loginOkMsg")); speak(t("loginOkMsg")); },300); }
  else if(r==="fail"||r==="unconfigured"){ setTimeout(()=>{ show("signup"); toast(t("loginFailMsg")); speak(t("loginFailMsg")); },200); }
  history.replaceState(null,"",location.pathname);
}

/* ============ 초기화 ============ */
async function loadKnownBrands(){
  try{ const list=await (await fetch("/api/kiosks")).json();
    (list||[]).forEach(k=>{ if(k.brandId) state.knownBrands.add(k.brandId); }); }catch(e){}
}
window.addEventListener("DOMContentLoaded", ()=>{
  state.language = browserLang();
  document.documentElement.lang=BCP47[state.language].split("-")[0];
  buildFlags(); applyUiText(); renderCart(); loadPaik(); loadKnownBrands();
  if(window.speechSynthesis){ loadVoices(); try{ window.speechSynthesis.onvoiceschanged=loadVoices; }catch(e){} }
  if(!IS_MOBILE){ ["homePhoto","menuPhoto","photo","reportFile"].forEach(id=>{ const el=document.getElementById(id); if(el) el.removeAttribute("capture"); }); }

  $$("[data-go]").forEach(b=>b.onclick=()=>{ const g=b.getAttribute("data-go");
    unlockTTS();
    if(g==="speak") return goSpeak();
    if(g==="photo") return goPhoto();
    show(g); });
  $$("[data-back]").forEach(b=>b.onclick=()=>show(b.getAttribute("data-back")));
  $("#brandHome").onclick=()=>show("home");
  $("#kakaoBtn").onclick=goKakao;
  $("#noKakaoBtn").onclick=()=>show("signup");
  $("#signupForm").addEventListener("submit", submitSignup);
  $("#fontToggle").onclick=toggleFont;
  $("#soundBtn").onclick=cycleSound;
  $("#gfStaff").onclick=()=>show("staff");
  $("#gfQr").onclick=()=>show("qr");
  $("#mic").onclick=()=>{ unlockTTS(); micToggle(); };
  $("#send").onclick=submitText;
  $("#cam").onclick=()=>{ $("#homePhoto").value=""; $("#homePhoto").click(); };
  $("#homePhoto").onchange=(e)=>onHomePhoto(e.target.files[0]);
  $("#menuPhoto").onchange=(e)=>onMenuPhoto(e.target.files[0]);
  $("#text").addEventListener("keydown",(e)=>{ if(e.key==="Enter") submitText(); });
  initReport();
  show("home");
  handleLoginRedirect();
  checkAuth();
});
