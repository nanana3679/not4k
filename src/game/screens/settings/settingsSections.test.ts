import { expect, it } from 'vitest';
import { createSettingsSectionState, selectSettingsSection } from './settingsSections';

it('Controls로 설정을 열고 Gameplay로 이동해도 Profile을 마운트하지 않는다', () => {
  const opened = createSettingsSectionState('controls');
  expect(opened).toEqual({ section: 'controls', profileMounted: false });
  expect(selectSettingsSection(opened, 'gameplay')).toEqual({ section: 'gameplay', profileMounted: false });
});

it('Profile에 직접 복귀하면 첫 선택부터 Profile을 마운트한다', () => {
  expect(createSettingsSectionState('profile')).toEqual({ section: 'profile', profileMounted: true });
});

it('Controls에서 Profile 첫 방문 후 Gameplay로 이동해도 마운트를 유지하고 모달을 다시 열면 초기화한다', () => {
  const profile = selectSettingsSection(createSettingsSectionState('controls'), 'profile');
  expect(profile).toEqual({ section: 'profile', profileMounted: true });
  expect(selectSettingsSection(profile, 'gameplay')).toEqual({ section: 'gameplay', profileMounted: true });
  expect(createSettingsSectionState('controls')).toEqual({ section: 'controls', profileMounted: false });
});
