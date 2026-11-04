---
name: "mascot-silhouette-logo"
description: "사용자가 준 캐릭터·이모티콘 이미지에서 얼굴(머리) 실루엣만 추출해 눈코입 없는 단색 SVG 로고 심볼과 워드마크를 만들 때 사용"
---

# 마스코트 얼굴 실루엣 로고

사용자가 "이 캐릭터 얼굴만 따서 심볼로", "눈코입 없이"라고 하면 원본 윤곽을 그대로 살린 단색 실루엣을 만든다. 손으로 다시 그리지 말고 원본에서 추출한다. 응답은 한국어.

## 1. 머리 영역 추출 (OpenCV + SciPy)

```python
import cv2, numpy as np
from scipy import ndimage as ndi
im=cv2.imread(SRC,cv2.IMREAD_UNCHANGED)
if im.shape[2]==4:
    a=im[:,:,3:4]/255.0; im=(im[:,:,:3]*a+255*(1-a)).astype(np.uint8)
g=cv2.cvtColor(im,cv2.COLOR_BGR2GRAY)
free=(g>=110).astype(np.uint8)            # 검은 외곽선이 아닌 곳
lab,_=ndi.label(free)
head=ndi.binary_fill_holes(lab==lab[SEED_Y,SEED_X])  # 이마 쪽 한 점을 시드로
k=cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(25,25))
mask=cv2.dilate(head.astype(np.uint8)*255,k)        # 외곽선 두께만큼 포함
```

- 시드는 머리 안쪽 빈 공간(눈·볼 피해서 이마). 결과 마스크를 이미지로 저장해 Read로 한 번 확인한다. 몸통·팔이 섞이면 시드나 임계값을 바꾼다.
- `binary_fill_holes`가 눈코입 구멍을 메워 단색 실루엣이 된다.

## 2. 벡터화

```python
m=cv2.GaussianBlur(mask,(31,31),0); _,m=cv2.threshold(m,127,255,cv2.THRESH_BINARY)
c=max(cv2.findContours(m,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE)[0],key=cv2.contourArea)
c=cv2.approxPolyDP(c.astype(np.float32),3.5,True)[:,0,:].astype(float)
# 48x48 viewBox에 맞춰 정규화(패딩 1) 후 Catmull-Rom → 3차 베지어
# c1=p1+(p2-p0)/6, c2=p2-(p3-p1)/6
```

- 블러가 작으면 가장자리가 지글거린다. 31 정도로 매끈하게, 원래의 복슬복슬한 굴곡은 살아 있게.
- 결과 path는 `fill="currentColor"`로 둬서 색을 CSS로 바꿀 수 있게 한다.

## 3. 적용

- 페이지: `<symbol id="i-logo" viewBox="0 0 48 48">`로 넣고 헤더·제품 화면에서 `<use>`로 재사용. 색이 반전되는 자리(빨간 화면 위 흰 로고)도 `color`만 바꾸면 된다.
- 워드마크: 브랜드명(일부 포인트 컬러, 굵게) + 그 아래 작은 영문 업종 태그(모노 폰트, 자간 넓게, 예: ELECTRONICS).
- 파일: `assets/logo-mark.svg`(심볼만, 포인트 컬러), `assets/logo-lockup.svg`(심볼 + 워드마크).
- headless Chrome으로 큰 크기·32px·반전 배경에서 렌더링해 한 번 확인하고, SendUserFile로 두 SVG를 보여 준다.

## 4. 다른 방향 요청

"더 토끼 느낌/업종 느낌"처럼 콘셉트 요청이면 원본 추출 대신 기하학 심볼(긴 귀 알약, 둥근 머리, LED 같은 점 눈, 신호 아크 등)을 시안으로 먼저 보여 준다. 사용자가 원본 기반을 원하면 위 1~3을 따른다. 요청과 다르게 붙였던 요소(예: 신호 아크)를 뺐다면 답변에서 한 줄로 알리고 다시 넣을 수 있다고 제안한다.
