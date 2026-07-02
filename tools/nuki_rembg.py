# 상품 썸네일 배경 제거(누끼) — 인터넷 되는 PC에서 1회 실행
#
# 준비:  pip install rembg onnxruntime pillow
# 실행:  (프로젝트 루트 E:\thon\omong 에서)
#        python tools/nuki_rembg.py
#        # 특정 폴더만:  python tools/nuki_rembg.py src/main/resources/static/kiosk/paik/crops/coffee
#
# 동작: 대상 폴더의 *_thumb.jpg 를 모두 배경 제거해서 같은 이름의 *_cut.png(투명 PNG)로 저장.
#       앱은 _cut.png 가 있으면 그걸 카드에 쓰고, 없으면 _thumb.jpg 로 자동 폴백한다.
#       (첫 실행 시 U2Net 모델이 자동 다운로드됨 — 인터넷 필요)

import sys, glob, os

try:
    from rembg import remove, new_session
    from PIL import Image
except ImportError:
    print("먼저 설치하세요:  pip install rembg onnxruntime pillow")
    sys.exit(1)

DEFAULT = "src/main/resources/static/kiosk/paik/crops/coffee"
folder = sys.argv[1] if len(sys.argv) > 1 else DEFAULT

if not os.path.isdir(folder):
    print("폴더 없음:", folder)
    sys.exit(1)

session = new_session("u2netp")   # 가벼운 모델. 품질 더 원하면 "u2net"
targets = sorted(glob.glob(os.path.join(folder, "*_thumb.jpg")))
if not targets:
    print("_thumb.jpg 파일이 없습니다:", folder)
    sys.exit(0)

for src in targets:
    out = src.replace("_thumb.jpg", "_cut.png")
    img = Image.open(src).convert("RGBA")
    cut = remove(img, session=session, post_process_mask=True)
    cut.save(out)
    print("누끼:", os.path.basename(out))

print(f"완료: {len(targets)}개 → {folder}")
