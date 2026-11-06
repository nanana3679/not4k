export type SettingsSection = 'controls' | 'gameplay' | 'skin' | 'advanced' | 'profile';

interface SettingsSectionState {
  section: SettingsSection;
  profileMounted: boolean;
}

export function createSettingsSectionState(section: SettingsSection): SettingsSectionState {
  return { section, profileMounted: section === 'profile' };
}

export function selectSettingsSection(state: SettingsSectionState, section: SettingsSection): SettingsSectionState {
  return { section, profileMounted: state.profileMounted || section === 'profile' };
}
