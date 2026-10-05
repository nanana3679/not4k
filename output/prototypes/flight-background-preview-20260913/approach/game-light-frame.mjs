// 게임 배경의 프레임별 광원·잔광 구성. 이륙·침투의 GPU 경로가 매 프레임 호출한다.
// 결과 배열과 광원·선분 객체는 내부 버퍼를 다시 쓰므로 다음 build 호출 전에만 유효하다.
// 같은 입력이면 visibleLights·visibleRunwayLights·liftoffObjectLights·proceduralTrailSegments를
// 새 객체로 계산한 결과와 같은 값을 만든다.
import { visibleLights } from './motion.mjs';
import { visibleRunwayLights, writeLiftoffLights } from './runway.mjs';
import { TrailSegmentFrame, proceduralTrailSegments } from './procedural-trails.mjs';
import { renderQualityProfile } from './render-quality.mjs';
import { VisibleLightFrame } from './visible-light-frame.mjs';

export function createApproachLightFrames(scenario, lights, quality = 'gpu') {
  const objectOptions = Object.freeze({ palette:scenario, scenario, seed:42, scale:1, secondary:.15, quality });
  const trailOptions = { altitude:0, maxSegments:renderQualityProfile(quality).maxTrailSegments };
  const objectFrame = new VisibleLightFrame(), runwayFrame = new VisibleLightFrame(), trailFrame = new TrailSegmentFrame();
  const liftoffLights = [];
  const result = { lights:liftoffLights, trails:trailFrame.segments };
  return {
    build(travel, view, altitude) {
      const objects = visibleLights(lights, travel, view, 'surface', objectOptions, undefined, objectFrame);
      result.lights = scenario === 'liftoff'
        ? writeLiftoffLights(liftoffLights, objects, visibleRunwayLights(travel, view, undefined, quality, runwayFrame), altitude)
        : objects;
      trailOptions.altitude = altitude;
      result.trails = proceduralTrailSegments(result.lights, view, trailOptions, trailFrame);
      return result;
    },
  };
}
