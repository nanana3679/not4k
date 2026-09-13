const assets = {
  liftoff: './sky.png',
  infiltration: './sky-infiltration.png',
};

export const skyAsset = scenario => assets[scenario] ?? assets.liftoff;
export const skyAssetPaths = [...new Set(Object.values(assets))];
