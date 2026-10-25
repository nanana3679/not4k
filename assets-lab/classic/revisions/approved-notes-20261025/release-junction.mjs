// Keep the user-confirmed junction annotation separate from the edited sprites.
export const releaseJunctionHtml = `<section id="release-junction" aria-labelledby="release-junction-title">
<h2 id="release-junction-title">릴리즈 · 단차가 만나는 접점</h2>
<p>사용자가 확인한 두 접점입니다. 가로 띠가 중앙의 경사진 테두리와 만나는 위치를 수정 전 도안 위에 표시했습니다.</p>
<svg class="release-junction-diagram" viewBox="0 0 700 240" role="img" aria-labelledby="release-junction-diagram-title" aria-describedby="release-junction-diagram-desc">
<title id="release-junction-diagram-title">가로 띠와 중앙 경사 테두리의 좌우 접점</title>
<desc id="release-junction-diagram-desc">더블 릴리즈의 왼쪽과 오른쪽 가로 띠 안쪽 끝을 분홍 원으로 표시했습니다. 아래 수평 테두리의 모서리보다 위에 있는 두 접점입니다.</desc>
<image href="assets/release-double-palette-body-dual-ends@2x.png" x="50" y="85" width="600" height="120"/>
<g fill="none" stroke="#ffaad8" stroke-width="2.5"><circle cx="206" cy="148" r="17"/><circle cx="494" cy="148" r="17"/><path d="M206 131V56H125M494 131V56H575"/></g>
<g fill="#ffcadf" font-family="system-ui,sans-serif" font-size="18" text-anchor="middle"><text x="125" y="37">왼쪽 접점</text><text x="575" y="37">오른쪽 접점</text></g>
</svg>
<div class="sustain-comparison palette-comparison release-junction-sketches">
<figure><figcaption>지금 설명한 연결 · 선 하나로 이어짐</figcaption><svg viewBox="0 0 280 130" role="img" aria-label="수평선 끝에서 아래로만 꺾이는 연결"><path d="M35 52H140L210 112"/></svg></figure>
<figure><figcaption>제안한 연결 · 위·아래 경계가 갈라짐</figcaption><svg viewBox="0 0 280 130" role="img" aria-label="수평선 끝에서 위아래 두 경계로 갈라져 작은 옆면이 생기는 연결"><path class="junction-side-face" d="M140 52L210 18V112Z"/><path d="M35 52H140L210 112M140 52L210 18"/></svg></figure>
</div>
<p>확인한 구조: 낮은 어두운 면의 경계와 높은 면의 경계를 접점에서 나누고, 그 사이에 짧은 옆면을 보여 줍니다. 선 그림은 연결 구조를 설명하며 실제 적용 모습은 <a href="#release-clean-junctions">아래 접점 수정안</a>에서 비교합니다.</p>
</section>`;

export const releaseJunctionCss = `
.release-junction-diagram{display:block;width:100%;max-width:800px;margin:18px auto}
.release-junction-sketches{max-width:720px;margin:auto}
.release-junction-sketches svg{display:block;width:100%;max-width:280px;margin:auto}
.release-junction-sketches path{fill:none;stroke:#ffcadf;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}
.release-junction-sketches .junction-side-face{fill:#65502b;stroke:none}
.junction-crops{display:flex;justify-content:center;gap:20px}
.junction-crops svg{display:block;width:140px;max-width:calc(50% - 10px);height:auto;background:#080c12}
`;
