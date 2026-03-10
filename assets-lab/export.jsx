import { SharedDefs } from "./shared/ui.jsx";
import { CW, CH } from "./shared/constants.js";
import { BOMB_FRAMES } from "./shared/bomb.js";

// 각 스킨의 컴포넌트와 팔레트를 정적으로 import
import * as crystal from "./crystal/components.jsx";
import * as abyssal from "./abyssal/components.jsx";
import * as circuit from "./circuit/components.jsx";
import * as sakura from "./sakura/components.jsx";
import * as forge from "./forge/components.jsx";
import * as prism from "./prism/components.jsx";
import * as fossil from "./fossil/components.jsx";
import * as classic from "./classic/components.jsx";

const skins = {
  crystal, abyssal, circuit, sakura, forge, prism, fossil, classic,
};

const BODY_H = 60; // NineSlice용 바디 높이
const BTN_SIZE = 60; // 버튼 export 크기

function SvgWrap({ id, w, h, children }) {
  return (
    <div id={id} style={{ width: w, height: h, display: "inline-block" }}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} xmlns="http://www.w3.org/2000/svg">
        <SharedDefs glowIntensity={3} />
        {children}
      </svg>
    </div>
  );
}

function SkinExports({ skinId, C }) {
  return (
    <>
      {/* 노트 헤드 */}
      <SvgWrap id={`${skinId}--note-single`} w={CW} h={CH}>
        <C.NoteContainer x={0} y={0} type="single" />
      </SvgWrap>
      <SvgWrap id={`${skinId}--note-double`} w={CW} h={CH}>
        <C.NoteContainer x={0} y={0} type="double" />
      </SvgWrap>

      {/* 터미널 캡 */}
      <SvgWrap id={`${skinId}--terminal-single`} w={CW} h={CH}>
        <C.TerminalCap x={0} y={0} type="single" />
      </SvgWrap>
      <SvgWrap id={`${skinId}--terminal-double`} w={CW} h={CH}>
        <C.TerminalCap x={0} y={0} type="double" />
      </SvgWrap>

      {/* 바디 (released) */}
      <SvgWrap id={`${skinId}--body-single`} w={CW} h={BODY_H}>
        <C.BodySegment x={0} y={0} height={BODY_H} type="single" held={false} />
      </SvgWrap>
      <SvgWrap id={`${skinId}--body-double`} w={CW} h={BODY_H}>
        <C.BodySegment x={0} y={0} height={BODY_H} type="double" held={false} />
      </SvgWrap>

      {/* 바디 (held) */}
      <SvgWrap id={`${skinId}--body-single-held`} w={CW} h={BODY_H}>
        <C.BodySegment x={0} y={0} height={BODY_H} type="single" held={true} />
      </SvgWrap>
      <SvgWrap id={`${skinId}--body-double-held`} w={CW} h={BODY_H}>
        <C.BodySegment x={0} y={0} height={BODY_H} type="double" held={true} />
      </SvgWrap>

      {/* 봄 16프레임 */}
      {BOMB_FRAMES.map((_, fi) => (
        <SvgWrap key={fi} id={`${skinId}--bomb-${String(fi).padStart(2, "0")}`} w={80} h={80}>
          <C.BombFrame cx={40} cy={40} frame={fi} id={`${skinId}_export_${fi}`} />
        </SvgWrap>
      ))}

      {/* 버튼 (idle × 4, pressed × 4) */}
      {C.ButtonExport && [false, true].map(pressed =>
        [1, 2, 3, 4].map(lane => (
          <SvgWrap
            key={`btn-${pressed ? "p" : "i"}-${lane}`}
            id={`${skinId}--button-${pressed ? "pressed" : "idle"}-${lane}`}
            w={BTN_SIZE}
            h={BTN_SIZE}
          >
            <C.ButtonExport cx={BTN_SIZE / 2} cy={BTN_SIZE / 2} pressed={pressed} />
          </SvgWrap>
        ))
      )}
    </>
  );
}

export default function ExportPage() {
  return (
    <div>
      {Object.entries(skins).map(([skinId, C]) => (
        <SkinExports key={skinId} skinId={skinId} C={C} />
      ))}
      {/* 스크립트가 모든 요소가 렌더링되었음을 알 수 있도록 마커 */}
      <div id="export-ready" data-count={Object.keys(skins).length} />
    </div>
  );
}
