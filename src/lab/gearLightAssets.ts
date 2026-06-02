export interface GearLightSample {
  id: string;
  label: string;
  baseSrc: string;
  glowSrc: string;
  metadataSrc: string;
  sourceSrc: string;
}

const makeSample = (id: string, label: string, basePath: string): GearLightSample => ({
  id,
  label,
  sourceSrc: `${basePath}/gear-source.png`,
  baseSrc: `${basePath}/gear-base.png`,
  glowSrc: `${basePath}/gear-glow.png`,
  metadataSrc: `${basePath}/gear-metadata.json`,
});

export const GEAR_LIGHT_SAMPLES: GearLightSample[] = [
  makeSample('original', 'Original', '/lab/gear-light'),
  makeSample('option-01', '01 Violet Rail', '/lab/gear-samples/option-01'),
  makeSample('option-02', '02 Crystal White', '/lab/gear-samples/option-02'),
  makeSample('option-03', '03 Red Industrial', '/lab/gear-samples/option-03'),
  makeSample('option-04', '04 Slim Prism', '/lab/gear-samples/option-04'),
  makeSample('option-05', '05 DJ Reactor', '/lab/gear-samples/option-05'),
  makeSample('option-06', '06 Temple Stage', '/lab/gear-samples/option-06'),
  makeSample('option-07', '07 Speaker Rig', '/lab/gear-samples/option-07'),
  makeSample('option-08', '08 OLED Ribbon', '/lab/gear-samples/option-08'),
  makeSample('option-09', '09 Esports Deck', '/lab/gear-samples/option-09'),
  makeSample('option-10', '10 White Keyboard', '/lab/gear-samples/option-10'),
  makeSample('option-11', '11 Studio Speaker', '/lab/gear-samples/option-11'),
  makeSample('option-12', '12 Compact OLED', '/lab/gear-samples/option-12'),
  makeSample('option-13', '13 Muted Graphite', '/lab/gear-samples/option-13'),
  makeSample('option-14', '14 Ceramic Silver', '/lab/gear-samples/option-14'),
  makeSample('option-15', '15 Studio Rack', '/lab/gear-samples/option-15'),
  makeSample('option-16', '16 Smoked Glass', '/lab/gear-samples/option-16'),
  makeSample('option-17', '17 Touch Keyboard', '/lab/gear-samples/option-17'),
  makeSample('option-18', '18 Input Matrix', '/lab/gear-samples/option-18'),
  makeSample('option-19', '19 Touch Deck', '/lab/gear-samples/option-19'),
  makeSample('option-20', '20 Holographic', '/lab/gear-samples/option-20'),
];

export function getGearLightSample(id: string) {
  return GEAR_LIGHT_SAMPLES.find((sample) => sample.id === id) ?? GEAR_LIGHT_SAMPLES[0];
}
