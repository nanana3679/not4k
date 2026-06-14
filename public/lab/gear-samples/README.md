# Gear Sample Storage

AI로 생성한 기어 이미지 실험물은 모두 이 디렉터리 아래에 저장한다.
이미지 파일, 이미지 생성 프롬프트, 생성 run별 메타데이터는 Git에 커밋하지 않는다.
이 README만 경로와 기록 규칙을 남기기 위해 추적한다.

## Directory Layout

새 생성물은 한 번의 생성 요청 또는 한 콘셉트 묶음마다 별도 디렉터리를 만든다.

```text
public/lab/gear-samples/<YYYYMMDD-HHMMSS>-<short-concept>/
  gear-source.png
  gear-source.md
  metadata.json
```

여러 안을 한 번에 만들 때는 같은 timestamp 아래 variant suffix를 붙인다.

```text
public/lab/gear-samples/20260614-113000-input-matrix-01/
public/lab/gear-samples/20260614-113000-input-matrix-02/
public/lab/gear-samples/20260614-113000-input-matrix-03/
```

## Required Files

- `gear-source.png`: 이미지 생성기가 반환한 원본 bitmap 이미지
- `gear-source.md`: `gear-source.png`를 생성하기 위해 에이전트가 이미지 생성기에 실제로 전달한 최종 프롬프트
- `metadata.json`: 생성 일시, 콘셉트명, 생성 모델/도구, 이미지 크기, 후속 분리 작업 메모

프롬프트 markdown에는 사용자가 채팅에 쓴 원문 요청을 그대로 저장하지 않는다.
반드시 에이전트가 디자인 문서를 반영해 이미지 생성용으로 재작성한 최종 프롬프트만 저장한다.

이미지가 여러 장이면 각 이미지와 같은 basename의 `.md` 파일을 둔다.

```text
gear-source.png
gear-source.md
gear-gauge.png
gear-gauge.md
```

## Git Ignore Scope

`.gitignore`는 `public/lab/gear-samples/**` 전체를 제외한다.
따라서 `gear-source.png`, 같은 basename의 prompt `.md`, `metadata.json`은 모두 로컬에만 남는다.

ignore 적용 여부는 다음처럼 확인한다.

```bash
git check-ignore -v public/lab/gear-samples/<sample>/gear-source.png
git check-ignore -v public/lab/gear-samples/<sample>/gear-source.md
git check-ignore -v public/lab/gear-samples/<sample>/metadata.json
```

`README.md`만 기본 예외로 추적한다. 단, lab 시연이나 실제 스킨 후보로 채택된 fixture는 필요한 런타임 파일만 `.gitignore`에서 개별 allowlist로 열 수 있다. 프롬프트 `.md`와 생성 run 메타데이터는 계속 로컬 전용으로 둔다.

```bash
git check-ignore -v public/lab/gear-samples/README.md
```

위 명령은 `!public/lab/gear-samples/README.md` 예외 규칙을 보여야 한다.

현재 allowlist 예시:

```text
public/lab/gear-samples/compact-set-03/gear-source.png
public/lab/gear-samples/compact-set-03/gear-back.png
public/lab/gear-samples/compact-set-03/gear-front.png
public/lab/gear-samples/compact-set-03/skin-runtime-config.json
public/lab/gear-samples/option-21/gear-source.png
public/lab/gear-samples/option-21/gear-base.png
public/lab/gear-samples/option-21/gear-glow.png
public/lab/gear-samples/option-21/gear-gauge.png
public/lab/gear-samples/option-21/gear-metadata.json
```

## Pair Check

이미지와 프롬프트의 쌍은 같은 variant 디렉터리 안에서 확인한다.

```text
public/lab/gear-samples/<sample>/
  gear-source.png
  gear-source.md
  metadata.json
```

확인 규칙:

- 이미지 파일과 같은 basename의 `.md` 파일이 같은 디렉터리에 있으면 한 쌍이다.
- 예: `gear-source.png`의 프롬프트는 `gear-source.md`다.
- `metadata.json`의 `sourceImage` 값은 `gear-source.png`여야 한다.
- `metadata.json`의 `promptFile` 값은 `gear-source.md`여야 한다.
- 여러 장을 한 번에 만들었더라도 variant 디렉터리를 나눠 1 이미지 = 1 프롬프트 쌍으로 둔다.

수동 확인:

```bash
ls public/lab/gear-samples/<sample>/
sed -n '1,120p' public/lab/gear-samples/<sample>/gear-source.md
cat public/lab/gear-samples/<sample>/metadata.json
```

전체 샘플 중 쌍이 깨진 디렉터리를 찾을 때:

```bash
find public/lab/gear-samples -mindepth 1 -maxdepth 1 -type d \
  ! -exec test -f '{}/gear-source.png' ';' -print -o \
  ! -exec test -f '{}/gear-source.md' ';' -print -o \
  ! -exec test -f '{}/metadata.json' ';' -print
```

## metadata.json Example

```json
{
  "createdAt": "2026-06-14T11:30:00+09:00",
  "concept": "Input Matrix",
  "tool": "image_gen",
  "sourceImage": "gear-source.png",
  "promptFile": "gear-source.md",
  "width": 1672,
  "height": 941,
  "notes": [
    "16:9 gameplay mockup",
    "gauge should be separated later",
    "keyboard hit-light areas are not separated yet"
  ]
}
```

## Promotion Rule

이 디렉터리의 이미지는 실험물이다.
실제 게임 에셋으로 채택할 때만 필요한 파일을 `public/skins/` 또는 해당 스킨 디렉터리로 복사하고, 그때는 스펙 문서와 레이어 메타데이터를 함께 정리한다.
