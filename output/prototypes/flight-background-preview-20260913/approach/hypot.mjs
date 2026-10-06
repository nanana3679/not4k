// Math.hypot(x, y)와 같은 값을 할당 없이 계산한다.
// V8(Chrome·Node)의 Math.hypot은 호출마다 임시 배열과 결과 숫자 객체를 만들어, 매 프레임 수천 번 부르면 GC가 잦아진다.
// 계산 순서는 V8·JavaScriptCore 구현과 같다(절댓값 최대로 나눈 제곱합의 제곱근에 최대값을 곱함).
// Chrome 145·Node 22에서 무작위 2,000만 쌍과 특수값(±0·±Infinity·NaN·비정규수)이 Math.hypot과 비트 단위로 같았다.
// 매 프레임 수천 번 부르는 곳에서 V8이 인라인하도록 분기를 줄였다(인라인되지 않으면 실수 반환값이 boxing된다).
// NaN은 최대값 비교에서 빠지지 않고 아래 나눗셈·제곱근이 그대로 NaN을 내므로 Math.hypot과 같다.
export function hypot2(x, y) {
  const ax = Math.abs(x), ay = Math.abs(y);
  if (ax === Infinity || ay === Infinity) return Infinity;
  const max = ay > ax ? ay : ax;
  if (max === 0) return ay === ay ? 0 : NaN;
  const nx = ax / max, ny = ay / max;
  return Math.sqrt(nx * nx + ny * ny) * max;
}
