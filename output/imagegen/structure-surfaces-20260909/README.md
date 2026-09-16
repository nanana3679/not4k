# 돌파 지표면·천장 구조물 이미지

> 이전 미술 탐색의 설명 기록이다. 당시 이미지·실행 코드·검사 결과는 로컬 원본과 백업에 보관한다. [현재 실행 대상과 보관 범위](../../README.md).

2026-09-09. 내장 `image_gen`으로 이미지별 프롬프트를 사용해 6장을 생성했다. CLI/API 대체 경로는 사용하지 않았다.

원근 없는 정면 표면 이미지이며 어두운 2D 아니메·메카닉 방향을 유지한다. 실제 시연에서 공통 소실점과 고도 변형에 맞춰 원근을 적용한다. 원본 PNG를 그대로 저장했으며 GPU 표시 시에만 1024×1024로 정규화한다.

| 계열 | 지표면 원본 | 천장 원본 |
| --- | --- | --- |
| 장갑 시설 | armor-floor.png (`armor-floor.png`, 로컬 보관) | armor-ceiling.png (`armor-ceiling.png`, 로컬 보관) |
| 배관 시설 | conduit-floor.png (`conduit-floor.png`, 로컬 보관) | conduit-ceiling.png (`conduit-ceiling.png`, 로컬 보관) |
| 거대 골조 | rib-floor.png (`rib-floor.png`, 로컬 보관) | rib-ceiling.png (`rib-ceiling.png`, 로컬 보관) |

전체 최종 프롬프트 세트: prompts.json (`prompts.json`, 로컬 보관). 생성 결과의 원본 위치: sources.json (`sources.json`, 로컬 보관).

시연 경로는 `~/.gstack/projects/nanana3679-not4k/designs/apex-height-prototype-20260909/`다. 이 폴더의 `assets/`에 같은 PNG를 복사해 사용하며 원본은 이 프로젝트 폴더에도 보존한다. `node preview-server.mjs` 실행으로 Tailscale 임시 링크를 만들고, 시연 안의 썸네일을 선택하면 해당 면에 적용된다. 계열 버튼은 두 면을 함께 바꾸며 원본 크게 보기 링크로 채팅 밖에서도 각 이미지를 볼 수 있다.

표면 이미지는 그림의 음영으로 깊이를 표현한다. 입체 구조물의 옆면이나 실제 가림을 재현하지 않는다. 현재 시연의 고도 변화는 면 자체를 기울이므로 이미지도 함께 변형된다. 긴 방향은 앞뒤를 번갈아 반복하며, 원본이 완전한 반복용 텍스처라는 보장은 아니다.

구현 명세: [비행 연출 시연](../../../docs/spec/flight-visual-prototype.md).

검증: 관련 단위 테스트 96개, 기존 조절 브라우저 검사 104개, 구조물 이미지 브라우저 검사 53개 통과. 실제 기기의 성능과 주변시 인지 효과는 별도 사용자 검토 대상이다.
