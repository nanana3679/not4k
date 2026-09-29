/** Colors sampled from approved concept 04, on the existing body geometry. */
const single = {
  metal: [[0,'#a1aec2'],[.42,'#8295ae'],[.55,'#637b95'],[1,'#536a82']],
  inset: [[0,'#0d2541'],[.5,'#153255'],[1,'#183e69']],
  field: [[0,'#0e2b4e'],[.22,'#11355e'],[.52,'#143b69'],[.78,'#164777'],[1,'#184f80']],
  shine: [[0,'#346295',.25],[.45,'#4777aa',.4],[1,'#285889',.25]],
  spill: [[0,'#1c4a7c',0],[.25,'#1e5390',.25],[.55,'#206bb7',.68],[.8,'#3095df',.9],[1,'#61cffa']],
  core: [[0,'#61d1fe'],[.43,'#6bcffc'],[.8,'#86dfff'],[1,'#d6f8ff']],
  edge: [[0,'#9becfe'],[.12,'#a4eefe'],[.85,'#82e2fc'],[1,'#61d1fe']],
  line: [[0,'#91edff'],[.15,'#68d9ff'],[.85,'#50c9ff'],[1,'#299dea']],
  glow: '#123968', shadow: '#0d223f',
};
const double = {
  ...single,
  inset: [[0,'#142336'],[.5,'#1c3048'],[1,'#29415a']],
  field: [[0,'#45371f'],[.22,'#554324'],[.52,'#6d542a'],[.78,'#775e31'],[1,'#665027']],
  shine: [[0,'#8d7145',.25],[.45,'#ac8d55',.4],[1,'#806339',.25]],
  spill: [[0,'#a3731a',0],[.25,'#b88924',.25],[.55,'#d3a132',.68],[.8,'#edbf42',.9],[1,'#ffe377']],
  core: [[0,'#ffdc4d'],[.43,'#ffe36b'],[.8,'#ffed9c'],[1,'#fff8d9']],
  edge: [[0,'#fff1a3'],[.12,'#fff3b0'],[.85,'#ffe785'],[1,'#ffdb59']],
  line: [[0,'#fff2ad'],[.15,'#ffe385'],[.85,'#ffd45b'],[1,'#e2b238']],
  glow: '#5c481f', shadow: '#111f32',
};

function stops(values, reverse = false) {
  const ordered = reverse ? [...values].reverse().map(([x,c,a]) => [1-x,c,a]) : values;
  return ordered.map(([offset,color,alpha=1]) => `<stop offset="${offset}" stop-color="${color}" stop-opacity="${alpha}"/>`).join('');
}

export function referenceBodySvg(body, flavor) {
  const colors = flavor === 'double' ? double : single;
  const ramps = new Map([
    [2,colors.metal],[4,colors.inset],[6,colors.field],[8,colors.shine],
    [10,[[0,colors.shine[0][1],.14],[1,colors.shine[0][1],0]]],
    [12,[[0,'#102c4b',.55],[1,'#061629',.8]]],
    [14,[[0,'#102c4b',.55],[1,'#061629',.8]]],
    [16,[[0,'#102c4b',.55],[1,'#061629',.8]]],
    [18,[[0,'#102c4b',.55],[1,'#061629',.8]]],
    [20,colors.spill],[22,colors.core],[30,colors.line],[34,colors.line],[36,colors.edge],
  ]);
  let result = body.replace(/<linearGradient\b([^>]*\bid="[^"]*-g(\d+)"[^>]*)>[\s\S]*?<\/linearGradient>/g,
    (gradient, attrs, index) => {
      const number = Number(index);
      const values = ramps.get(number - number % 2);
      return values ? `<linearGradient ${attrs}>${stops(values,number % 2 === 1)}</linearGradient>` : gradient;
    });
  // This layer uses the sampled final colors, so it must bypass the old 64%
  // material dimmer. The outermost rails are excluded by the terminal mask.
  result = result.replace(/slope="0\.64"/g,'slope="1"');
  const baseColors = flavor === 'double'
    ? {'#272a30':colors.shadow,'#514b31':'#1a2d41','#7c7b69':'#263a51','#575343':'#2a2b28'}
    : {'#132434':colors.shadow,'#224361':'#102943','#536c89':'#153255','#3b5066':'#19354c'};
  result = result.replace(/fill="(#[0-9a-f]{6})"/gi,
    (attribute,color) => baseColors[color] ? `fill="${baseColors[color]}"` : attribute);
  result = result.replace('</defs>', `<radialGradient id="reference-depth" gradientUnits="userSpaceOnUse" cx="500" cy="170" r="460" gradientTransform="translate(0 102) scale(1 .4)">${stops([[0,colors.glow],[.65,colors.shadow],[1,'#0b1c31']])}</radialGradient></defs>`)
    .replace(/(<rect x="0" y="0" width="1000" height="200" )fill="[^"]+"/, '$1fill="url(#reference-depth)"');
  return result.replace(/id="([^"]+)"/g, (_, id) => `id="reference-${id}"`)
    .replace(/url\(#([^)]+)\)/g, (_, id) => `url(#reference-${id})`);
}
