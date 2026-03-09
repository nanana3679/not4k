/** 봄 애니메이션 16프레임 키프레임 데이터 (공통 구조) */
export const BOMB_FRAMES = [
  { coreR:4,  glowR:8,  coreOp:.9, glowOp:.7,  burstLen:0,  burstOp:0,   shardDist:0,  shardSz:0,   shardOp:0,   ringR:0,  ringOp:0,   ringW:0 },
  { coreR:8,  glowR:14, coreOp:1,  glowOp:.8,  burstLen:6,  burstOp:.2,  shardDist:0,  shardSz:0,   shardOp:0,   ringR:0,  ringOp:0,   ringW:0 },
  { coreR:10, glowR:20, coreOp:.9, glowOp:.7,  burstLen:12, burstOp:.4,  shardDist:4,  shardSz:3,   shardOp:.3,  ringR:0,  ringOp:0,   ringW:0 },
  { coreR:9,  glowR:26, coreOp:.7, glowOp:.6,  burstLen:18, burstOp:.5,  shardDist:8,  shardSz:4,   shardOp:.5,  ringR:12, ringOp:.1,  ringW:2 },
  { coreR:7,  glowR:30, coreOp:.55,glowOp:.5,  burstLen:22, burstOp:.5,  shardDist:12, shardSz:5,   shardOp:.55, ringR:18, ringOp:.2,  ringW:2 },
  { coreR:5,  glowR:32, coreOp:.4, glowOp:.45, burstLen:24, burstOp:.45, shardDist:16, shardSz:5,   shardOp:.5,  ringR:24, ringOp:.3,  ringW:1.8 },
  { coreR:4,  glowR:33, coreOp:.3, glowOp:.4,  burstLen:25, burstOp:.4,  shardDist:19, shardSz:5,   shardOp:.45, ringR:28, ringOp:.3,  ringW:1.5 },
  { coreR:3,  glowR:33, coreOp:.25,glowOp:.35, burstLen:25, burstOp:.35, shardDist:22, shardSz:4.5, shardOp:.4,  ringR:30, ringOp:.25, ringW:1.2 },
  { coreR:2,  glowR:32, coreOp:.2, glowOp:.3,  burstLen:24, burstOp:.3,  shardDist:25, shardSz:4,   shardOp:.35, ringR:32, ringOp:.2,  ringW:1 },
  { coreR:0,  glowR:30, coreOp:0,  glowOp:.22, burstLen:22, burstOp:.22, shardDist:28, shardSz:3.5, shardOp:.3,  ringR:33, ringOp:.15, ringW:.8 },
  { coreR:0,  glowR:26, coreOp:0,  glowOp:.15, burstLen:18, burstOp:.15, shardDist:30, shardSz:3,   shardOp:.22, ringR:33, ringOp:.1,  ringW:.6 },
  { coreR:0,  glowR:22, coreOp:0,  glowOp:.1,  burstLen:14, burstOp:.1,  shardDist:32, shardSz:2.5, shardOp:.15, ringR:32, ringOp:.06, ringW:.5 },
  { coreR:0,  glowR:18, coreOp:0,  glowOp:.06, burstLen:10, burstOp:.06, shardDist:33, shardSz:2,   shardOp:.1,  ringR:30, ringOp:.03, ringW:.4 },
  { coreR:0,  glowR:14, coreOp:0,  glowOp:.03, burstLen:6,  burstOp:.03, shardDist:34, shardSz:1.5, shardOp:.06, ringR:28, ringOp:.01, ringW:.3 },
  { coreR:0,  glowR:10, coreOp:0,  glowOp:.015,burstLen:3,  burstOp:.015,shardDist:35, shardSz:1,   shardOp:.03, ringR:25, ringOp:0,   ringW:0 },
  { coreR:0,  glowR:6,  coreOp:0,  glowOp:.005,burstLen:0,  burstOp:0,   shardDist:36, shardSz:.5,  shardOp:.01, ringR:0,  ringOp:0,   ringW:0 },
];

/** 파편 6방향 */
export const SHARD_DIRS = [
  { dx:-1, dy:-1, rot:20 },
  { dx:1,  dy:-1, rot:-25 },
  { dx:-1, dy:1,  rot:-15 },
  { dx:1,  dy:1,  rot:30 },
  { dx:0,  dy:-1.2, rot:45 },
  { dx:0,  dy:1.2,  rot:-40 },
];

/** 버스트 12방향 (30도 간격) */
export const BURST_ANGS = Array.from({ length: 12 }, (_, i) => i * 30);
