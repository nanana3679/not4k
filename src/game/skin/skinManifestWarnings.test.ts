import { describe, expect, it } from 'vitest';
import { CLASSIC_NOTE_ASSET_VERSIONS } from '../../lab/noteAssetDesigns';
import { findSkinManifestWarnings } from './skinManifestWarnings';
import { getSkinManifest, SKIN_LIST } from './skins';
import type { SkinManifest } from './types';

const classic = getSkinManifest('classic');

/** Classic에서 테마를 덮어쓰고 지정한 에셋 키를 뺀 매니페스트 */
function classicWith(
  theme: Partial<SkinManifest['theme']>,
  omit: (keyof SkinManifest['assets'])[] = [],
): SkinManifest {
  const assets = Object.fromEntries(
    Object.entries(classic.assets).filter(([key]) => !(omit as string[]).includes(key)),
  ) as SkinManifest['assets'];
  return { theme: { ...classic.theme, ...theme }, assets };
}

describe('findSkinManifestWarnings: 접촉 그림자 설정·이미지 불일치', () => {
  it('theme.pointContactShadow만 있고 assets.pointContactShadow가 없는 스킨 "contact-no-image"는 싱글·더블 그림자 대체를 알리는 경고 1개를 반환한다', () => {
    const manifest = classicWith({ id: 'contact-no-image' }, ['pointContactShadow']);

    expect(findSkinManifestWarnings(manifest)).toEqual([
      '스킨 "contact-no-image"에 theme.pointContactShadow는 있지만 assets.pointContactShadow가 없습니다. '
      + '싱글·더블 포인트에 접촉 그림자를 그리지 않고, pointShadow가 있으면 그것으로 대신합니다.',
    ]);
  });

  it('theme.pointContactShadow 없이 assets.pointContactShadow·pointContactShadowTrill을 선언하면 두 에셋을 한 경고에 나열한다', () => {
    const manifest = classicWith({ id: 'image-no-contact', pointContactShadow: undefined });

    expect(findSkinManifestWarnings(manifest)).toEqual([
      '스킨 "image-no-contact"에 theme.pointContactShadow가 없어 불러온 접촉 그림자 이미지를 쓰지 않습니다: '
      + 'assets.pointContactShadow, assets.pointContactShadowTrill. 접촉 그림자를 쓰려면 theme.pointContactShadow도 선언합니다.',
    ]);
  });

  it('theme.pointContactShadow 없이 assets.pointContactShadowTrill만 선언해도 그 에셋 1개를 담은 경고를 반환한다', () => {
    const manifest = classicWith({ id: 'trill-image-no-contact', pointContactShadow: undefined }, ['pointContactShadow']);

    expect(findSkinManifestWarnings(manifest)).toEqual([
      '스킨 "trill-image-no-contact"에 theme.pointContactShadow가 없어 불러온 접촉 그림자 이미지를 쓰지 않습니다: '
      + 'assets.pointContactShadowTrill. 접촉 그림자를 쓰려면 theme.pointContactShadow도 선언합니다.',
    ]);
  });

  it('theme.pointContactShadow와 assets.pointContactShadowTrill만 있고 assets.pointContactShadow가 없으면 트릴만 접촉 그림자를 쓰므로 싱글·더블 경고 1개를 반환한다', () => {
    const manifest = classicWith({ id: 'trill-only-contact' }, ['pointContactShadow']);

    expect(findSkinManifestWarnings(manifest)).toEqual([
      '스킨 "trill-only-contact"에 theme.pointContactShadow는 있지만 assets.pointContactShadow가 없습니다. '
      + '싱글·더블 포인트에 접촉 그림자를 그리지 않고, pointShadow가 있으면 그것으로 대신합니다.',
    ]);
  });

  it('theme·assets.pointContactShadow가 있고 pointContactShadowTrill만 없으면 트릴이 의도대로 기존 그림자를 쓰므로 경고하지 않는다', () => {
    const manifest = classicWith({ id: 'no-trill-contact' }, ['pointContactShadowTrill']);

    expect(findSkinManifestWarnings(manifest)).toEqual([]);
  });

  it('theme.pointContactShadow와 접촉 그림자 이미지 2종을 모두 생략한 스킨은 경고하지 않는다', () => {
    const manifest = classicWith(
      { id: 'no-contact', pointContactShadow: undefined },
      ['pointContactShadow', 'pointContactShadowTrill'],
    );

    expect(findSkinManifestWarnings(manifest)).toEqual([]);
  });
});

describe('findSkinManifestWarnings: heldEffect: false 스킨의 켜짐 에셋 선언', () => {
  it('heldEffect: false 스킨 "no-effect-declared"가 켜짐 에셋 5종을 모두 선언하면 5개 키를 나열한 경고 1개를 반환한다', () => {
    const manifest = classicWith({ id: 'no-effect-declared', heldEffect: false });

    expect(findSkinManifestWarnings(manifest)).toEqual([
      'heldEffect: false인 스킨 "no-effect-declared"에 선언한 켜짐 에셋은 불러오지 않습니다: '
      + 'assets.bodySingleHeld, assets.bodyDoubleHeld, assets.bodyDoublePartialHeldLeft, assets.bodyDoublePartialHeldRight, assets.bodyTrillHeld. '
      + '효과 없는 스킨이면 이 선언을 지웁니다.',
    ]);
  });

  it('heldEffect: false 스킨이 bodyTrillHeld 1개만 선언해도 그 키만 담은 경고를 반환한다', () => {
    const manifest = classicWith(
      { id: 'no-effect-trill', heldEffect: false },
      ['bodySingleHeld', 'bodyDoubleHeld', 'bodyDoublePartialHeldLeft', 'bodyDoublePartialHeldRight'],
    );

    expect(findSkinManifestWarnings(manifest)).toEqual([
      'heldEffect: false인 스킨 "no-effect-trill"에 선언한 켜짐 에셋은 불러오지 않습니다: '
      + 'assets.bodyTrillHeld. 효과 없는 스킨이면 이 선언을 지웁니다.',
    ]);
  });

  it('heldEffect: false 스킨이 켜짐 에셋을 하나도 선언하지 않으면 경고하지 않는다', () => {
    const manifest = classicWith(
      { id: 'no-effect-clean', heldEffect: false },
      ['bodySingleHeld', 'bodyDoubleHeld', 'bodyDoublePartialHeldLeft', 'bodyDoublePartialHeldRight', 'bodyTrillHeld'],
    );

    expect(findSkinManifestWarnings(manifest)).toEqual([]);
  });

  it('접촉 그림자 이미지 누락과 heldEffect: false 켜짐 에셋 선언이 겹치면 그림자 경고, 켜짐 경고 순으로 2개를 반환한다', () => {
    const manifest = classicWith({ id: 'two-problems', heldEffect: false }, ['pointContactShadow']);

    const warnings = findSkinManifestWarnings(manifest);

    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain('assets.pointContactShadow가 없습니다');
    expect(warnings[1]).toContain('heldEffect: false인 스킨 "two-problems"');
  });
});

describe('findSkinManifestWarnings: 등록 스킨과 보관 버전', () => {
  it('등록 스킨 crystal·prism·simple·note-asset-lab·classic 5개를 모두 검사 대상으로 삼는다', () => {
    expect(SKIN_LIST.map((skin) => skin.theme.id)).toEqual(['crystal', 'prism', 'simple', 'note-asset-lab', 'classic']);
  });

  it.each(SKIN_LIST.map((skin) => [skin.theme.id, skin] as const))('등록 스킨 %s는 경고가 없다', (_id, manifest) => {
    expect(findSkinManifestWarnings(manifest)).toEqual([]);
  });

  it('Classic 보관 버전 v014·v013·v012·v002·v001 5개를 모두 검사 대상으로 삼는다', () => {
    expect(CLASSIC_NOTE_ASSET_VERSIONS.map((version) => version.id)).toEqual(['v014', 'v013', 'v012', 'v002', 'v001']);
  });

  it.each(CLASSIC_NOTE_ASSET_VERSIONS.map((version) => [version.id, version.design.skinManifest!] as const))(
    'Classic 보관 버전 %s 매니페스트는 경고가 없다',
    (_id, manifest) => {
      expect(findSkinManifestWarnings(manifest)).toEqual([]);
    },
  );
});
