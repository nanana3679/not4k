import { Children, createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadEditorChartAsset } from '../chartAssetLoad';
import { openEditorChart } from '../openEditorChart';
import { toChartSaveJson } from '../savedChart';
import { isSongDirty } from '../songState';
import { useEditorStore } from '../stores/editorStore';
import { PAUSE_TO_EDIT_COPY, SONG_INFO_DRAWER_COPY } from '../editorCopy';
import { OWN_KEYS_REGION_ATTRIBUTE } from '../hooks/useEditorKeyboard';
import { PreviewRangeSelector } from './PreviewRangeSelector';
import { RangeField, SongInfoDrawer, type SongInfoDrawerProps } from './SongInfoDrawer';
import { editGameplayRange } from '../songInfoEditing';

// 서버 렌더의 zustand 훅은 store 초기값을 읽는다. 훅이 테스트가 넣은 현재 store 값을 읽게 한다.
vi.mock('../stores', async importOriginal => {
  const actual = await importOriginal<typeof import('../stores')>();
  const store = actual.useEditorStore;
  const readCurrent = <T,>(selector: (state: ReturnType<typeof store.getState>) => T): T => selector(store.getState());
  return { ...actual, useEditorStore: Object.assign(readCurrent, store) };
});
vi.mock('../../shared/toast', () => ({ showToast: vi.fn() }));

const store = () => useEditorStore.getState();
const loadedSong = { title: '곡', artist: '작곡가', jacketUrl: null, audioUrl: 'audio.ogg',
  previewUrl: null, previewStart: 10, previewEnd: 20, duration: 120,
  gameplayStart: null, gameplayEnd: null, gameplayFadeIn: null, gameplayFadeOut: null,
  timing: null, revision: 42 };

const props = (overrides: Partial<SongInfoDrawerProps> = {}): SongInfoDrawerProps => ({
  compact: false, audioBuffer: null, audioPick: null, onPickAudio() {},
  charts: { status: 'loaded', rows: [{ id: 'row-normal', difficultyLabel: 'normal' }, { id: 'row-hard', difficultyLabel: 'hard' }] },
  onSwitchChart() {}, onRequestClose() {}, toPublicUrl: path => `https://cdn.test/${path}`,
  ...overrides,
});
const render = (overrides: Partial<SongInfoDrawerProps> = {}) => renderToStaticMarkup(createElement(SongInfoDrawer, props(overrides)));

type ElementProps = {
  children?: ReactNode; defaultValue?: string; type?: string; accept?: string; disabled?: boolean; tabIndex?: number;
  hidden?: boolean; 'aria-label'?: string; 'aria-current'?: string; title?: string;
  onBlur?: (event: { currentTarget: { value: string } }) => void;
  onClick?: () => void;
  onChange?: (event: { currentTarget: { files: File[] } }) => void;
};
/** 렌더하지 않은 요소 트리에서 태그(또는 컴포넌트)와 key·props를 모은다. 함수 컴포넌트는 펼치지 않는다. */
function elements(node: ReactNode): { type: unknown; key: string | null; props: ElementProps }[] {
  return Children.toArray(node).flatMap(child => isValidElement<ElementProps>(child)
    ? [{ type: child.type, key: child.key, props: child.props }, ...elements(child.props.children)] : []);
}
/** 드로어를 한 번 렌더하며 트리를 받는다. 훅은 이 Probe의 것이다. */
function tree(overrides: Partial<SongInfoDrawerProps> = {}) {
  let found: ReturnType<typeof elements> = [];
  function Probe() {
    const node = SongInfoDrawer(props(overrides));
    found = elements(node);
    return node;
  }
  renderToStaticMarkup(createElement(Probe));
  return found;
}
const input = (found: ReturnType<typeof tree>, value: string) => found.find(e => e.type === 'input' && e.props.defaultValue === value)!.props;
const button = (found: ReturnType<typeof tree>, label: string) => found.find(e => e.type === 'button'
  && (e.props['aria-label'] === label || Children.toArray(e.props.children).join('') === label))!.props;
const inputOf = (markup: string, name: string) => markup.match(new RegExp(`<span>${name}</span><input[^>]*>`))?.[0] ?? '';

beforeEach(() => {
  useEditorStore.setState(useEditorStore.getInitialState(), true);
  const base = useEditorStore.getInitialState().chart;
  openEditorChart(loadEditorChartAsset(toChartSaveJson(base, 2).chartJson, null, loadedSong), loadedSong,
    { id: 'row-normal', difficultyLabel: 'normal', revision: 3, chartPath: null, chartExtraPath: null });
});

describe('곡 정보 드로어의 곡 공통 값', () => {
  it('Title 곡·Artist 작곡가·Offset 0을 입력칸에 보이고 곡 공통 적용 범위를 알린다', () => {
    const markup = render();

    expect(markup).toContain('aria-label="Song Info"');
    expect(inputOf(markup, 'Title')).toContain('value="곡"');
    expect(inputOf(markup, 'Artist')).toContain('value="작곡가"');
    expect(inputOf(markup, 'Offset \\(ms\\)')).toContain('value="0"');
    expect(markup).toContain(SONG_INFO_DRAWER_COPY.scope);
  });

  it('드로어 aside는 키를 자기가 쓰는 영역(OWN_KEYS_REGION_ATTRIBUTE)이라 안의 버튼·체크박스 키를 에디터 단축키가 가로채지 않는다', () => {
    expect(render()).toMatch(new RegExp(`<aside[^>]*${OWN_KEYS_REGION_ATTRIBUTE}=""[^>]*aria-label="Song Info"`));
  });

  it('Title 입력칸을 새 제목으로 바꾸고 포커스를 옮기면 곡 제목이 새 제목이 되어 곡이 미저장이다', () => {
    input(tree(), '곡').onBlur!({ currentTarget: { value: '새 제목' } });

    expect(store().chart.meta.title).toBe('새 제목');
    expect(isSongDirty(store().chart, store().song)).toBe(true);
  });

  it('Artist 입력칸을 새 작곡가로 바꾸고 포커스를 옮기면 곡 아티스트가 바뀐다', () => {
    input(tree(), '작곡가').onBlur!({ currentTarget: { value: '새 작곡가' } });

    expect(store().chart.meta.artist).toBe('새 작곡가');
  });

  it('자켓 next.png를 고르면 대기 자켓 파일이 되고 미리보기가 그 파일을 보인다', () => {
    const jacket = new File(['j'], 'next.png', { type: 'image/png' });
    tree().find(e => e.type === 'input' && e.props.accept === 'image/*')!.props.onChange!({ currentTarget: { files: [jacket] } });

    expect(store().song?.pendingJacketFile).toBe(jacket);
    expect(render()).toMatch(/<img[^>]*src="blob:/);
  });

  it('저장된 자켓 songs/x/jacket.png가 있으면 공개 URL로 미리보기를 보인다', () => {
    store().setChart({ ...store().chart, meta: { ...store().chart.meta, imageFile: 'songs/x/jacket.png' } });

    expect(render()).toContain('src="https://cdn.test/songs/x/jacket.png"');
  });

  it('음원 파일을 고르면 onPickAudio로 넘긴다', () => {
    const onPickAudio = vi.fn();
    const audio = new File(['a'], 'next.ogg');
    tree({ onPickAudio }).find(e => e.type === 'input' && e.props.accept === 'audio/*')!.props.onChange!({ currentTarget: { files: [audio] } });

    expect(onPickAudio).toHaveBeenCalledExactlyOnceWith(audio);
  });

  it('음원 버퍼가 없으면 구간 선택기 없이 안내를 보이고, 120초 버퍼가 있으면 프리뷰·인게임 구간 2개를 그린다', () => {
    expect(tree().filter(e => e.type === RangeField)).toHaveLength(0);
    expect(render()).toContain('Select an audio file');

    const ranges = tree({ audioBuffer: { duration: 120 } as AudioBuffer }).filter(e => e.type === RangeField);
    expect(ranges).toHaveLength(2);
  });

  it('고른 음원을 불러오는 중이면 Loading audio를 보이고 음원 선택 입력과 Upload Audio 버튼을 막는다', () => {
    const found = tree({ audioPick: { file: new File(['a'], 'next.ogg'), status: 'loading' } });

    expect(found.find(e => e.type === 'input' && e.props.accept === 'audio/*')!.props.disabled).toBe(true);
    expect(button(found, 'Upload Audio').disabled).toBe(true);
    expect(render({ audioPick: { file: new File(['a'], 'next.ogg'), status: 'loading' } })).toContain('Loading audio');
  });

  it('자켓·음원 고르기는 키보드로 닿는 Upload Jacket·Upload Audio 버튼이고 숨은 파일 입력은 탭 순서에서 빠진다', () => {
    const found = tree();

    for (const label of ['Upload Jacket', 'Upload Audio']) {
      expect(found.find(e => e.type === 'button' && Children.toArray(e.props.children).join('') === label)?.props)
        .toMatchObject({ type: 'button' });
    }
    for (const accept of ['image/*', 'audio/*']) {
      expect(found.find(e => e.type === 'input' && e.props.accept === accept)!.props).toMatchObject({ tabIndex: -1, hidden: true });
    }
  });
});

describe('곡 정보 드로어의 오프셋(재생 중 제한, RFD 0099)', () => {
  it('정지 중 Offset 입력에 45를 넣고 포커스를 옮기면 오프셋 45가 되고, +10 버튼은 오프셋을 55로 만든다', () => {
    input(tree(), '0').onBlur!({ currentTarget: { value: '45' } });
    expect(store().chart.meta.offsetMs).toBe(45);

    button(tree(), '+10').onClick!();
    expect(store().chart.meta.offsetMs).toBe(55);
  });

  it('재생 중 Offset 입력과 -10·-1·+1·+10은 비활성이고 정지 안내 title을 달며 Title·Artist·자켓·음원은 활성이다', () => {
    store().setIsPlaying(true);
    const markup = render();

    expect(inputOf(markup, 'Offset \\(ms\\)')).toContain('disabled=""');
    expect(inputOf(markup, 'Offset \\(ms\\)')).toContain(`title="${PAUSE_TO_EDIT_COPY}"`);
    for (const label of ['-10', '-1', '\\+1', '\\+10']) {
      expect(markup).toMatch(new RegExp(`<button[^>]*disabled=""[^>]*title="${PAUSE_TO_EDIT_COPY}"[^>]*>${label}</button>`));
    }
    for (const name of ['Title', 'Artist']) expect(inputOf(markup, name)).not.toContain('disabled');
    expect(markup).not.toMatch(/<input[^>]*accept="(image|audio)\/\*"[^>]*disabled/);
  });

  it('재생 중 Offset 45 확정 시도는 오프셋 0과 이력을 그대로 두고 입력칸을 0으로 되돌린다', () => {
    store().setIsPlaying(true);
    const field = { value: '45' };

    input(tree(), '0').onBlur!({ currentTarget: field });

    expect(store().chart.meta.offsetMs).toBe(0);
    expect(store().historyPast).toHaveLength(0);
    expect(field.value).toBe('0');
  });

  it('Offset 입력에 숫자가 아닌 값을 넣으면 오프셋을 바꾸지 않고 입력칸을 0으로 되돌린다', () => {
    const field = { value: 'abc' };

    input(tree(), '0').onBlur!({ currentTarget: field });

    expect(store().chart.meta.offsetMs).toBe(0);
    expect(field.value).toBe('0');
  });
});

describe('곡 정보 드로어의 차트 목록·닫기', () => {
  it('열린 normal은 현재 차트로 표시해 비활성이고 hard(BREAKTHROUGH)를 누르면 hard로 전환을 요청한다', () => {
    const onSwitchChart = vi.fn();
    const found = tree({ onSwitchChart });
    const normal = found.find(e => e.type === 'button' && e.props.title === 'normal')!;
    const hard = found.find(e => e.type === 'button' && e.props.title === 'hard')!;

    expect(render()).toMatch(/<button[^>]*title="hard"[^>]*>BREAKTHROUGH<\/button>/);
    expect(normal.props).toMatchObject({ disabled: true, 'aria-current': 'true' });
    expect(hard.props.disabled).toBe(false);
    hard.props.onClick!();
    expect(onSwitchChart).toHaveBeenCalledExactlyOnceWith('hard');
  });

  it('차트 목록을 불러오는 중이면 불러오는 중, 실패하면 실패 안내를 보인다', () => {
    expect(render({ charts: { status: 'loading' } })).toContain(SONG_INFO_DRAWER_COPY.chartsLoading);
    expect(render({ charts: { status: 'failed' } })).toContain(SONG_INFO_DRAWER_COPY.chartsFailed);
  });

  it('닫기 버튼은 곡 정보 확인을 거치도록 onRequestClose를 부른다', () => {
    const onRequestClose = vi.fn();

    button(tree({ onRequestClose }), SONG_INFO_DRAWER_COPY.close).onClick!();

    expect(onRequestClose).toHaveBeenCalledOnce();
  });
});

describe('드로어의 구간 선택기 적용(RangeField)', () => {
  const initial = { startTime: 10, endTime: 20, enabled: true, fadeInTime: 0.5, fadeOutTime: 0.5 };
  type Range = typeof initial;
  /** 선택기 안의 다른 입력칸(Fade Out). 포커스가 이리로 옮겨 가면 선택기를 떠난 것이 아니다. */
  const fadeOut = {};
  const wrapperNode = { contains: (node: unknown) => node === fadeOut };
  /**
   * RangeField 한 번의 렌더에서 선택기 알림 뒤 손 떼기(선택기의 onDragEnd)·포커스 이동을 차례로 흉내 낸다. 손 떼기는 선택기가 놓은
   * 위치로 계산한 구간을 넘긴다. 포커스 이동은 선택기 안의 Fade Out(inside) 또는 선택기 밖(outside)으로 간다.
   */
  function probe(notifications: (Range | null)[], finishes: ({ dragEnd: Range | null } | { blurTo: 'inside' | 'outside' })[]) {
    const onCommit = vi.fn();
    let done = false;
    function Probe() {
      const outer = RangeField({ selector: { audioBuffer: { duration: 120 } as AudioBuffer, label: '프리뷰 구간' }, onCommit }) as
        { type: (props: unknown) => ReactNode; props: unknown };
      // RangeField는 선택기를 감싼 칸(key로 다시 그린다)을 돌려준다. 그 칸도 이 Probe의 훅으로 그린다.
      const wrapper = outer.type(outer.props) as { props: { onBlur: (event: unknown) => void; children: ReactNode } };
      if (done) return null;
      done = true;
      const selector = elements(wrapper.props.children).find(e => e.type === PreviewRangeSelector)!
        .props as unknown as { onChange: (range: Range | null) => void; onDragEnd: (range: Range | null) => void };
      for (const range of notifications) selector.onChange(range);
      for (const finish of finishes) {
        if ('dragEnd' in finish) selector.onDragEnd(finish.dragEnd);
        else wrapper.props.onBlur({ currentTarget: wrapperNode, relatedTarget: finish.blurTo === 'inside' ? fadeOut : null });
      }
      return null;
    }
    renderToStaticMarkup(createElement(Probe));
    return onCommit;
  }

  it('선택기의 첫 알림 10～20초는 적용하지 않고 손을 뗀 구간도 10～20초 그대로면 적용하지 않는다', () => {
    expect(probe([initial], [{ dragEnd: initial }])).not.toHaveBeenCalled();
  });

  it('30～40초로 끈 뒤 손을 떼면 30～40초·페이드 0.5초를 한 번 적용한다', () => {
    const dragged = { ...initial, startTime: 30, endTime: 40 };
    expect(probe([initial, dragged], [{ dragEnd: dragged }]))
      .toHaveBeenCalledExactlyOnceWith({ startTime: 30, endTime: 40, fadeInTime: 0.5, fadeOutTime: 0.5 });
  });

  it('마지막 알림이 25～35초에 머문 채 30～40초에서 손을 떼면 알림이 아니라 손을 뗀 위치 30～40초를 적용한다', () => {
    expect(probe([initial, { ...initial, startTime: 25, endTime: 35 }], [{ dragEnd: { ...initial, startTime: 30, endTime: 40 } }]))
      .toHaveBeenCalledExactlyOnceWith({ startTime: 30, endTime: 40, fadeInTime: 0.5, fadeOutTime: 0.5 });
  });

  it('30～40초를 적용한 뒤 다시 10～20초로 끌어 손을 떼면 처음 구간이어도 10～20초를 적용한다', () => {
    const onCommit = probe([initial], [{ dragEnd: { ...initial, startTime: 30, endTime: 40 } }, { dragEnd: initial }]);

    expect(onCommit).toHaveBeenCalledTimes(2);
    expect(onCommit).toHaveBeenLastCalledWith({ startTime: 10, endTime: 20, fadeInTime: 0.5, fadeOutTime: 0.5 });
  });

  it('페이드 입력을 1초로 바꾸고 선택기 밖으로 포커스를 옮기면 페이드 1초를 적용한다', () => {
    expect(probe([initial, { ...initial, fadeInTime: 1 }], [{ blurTo: 'outside' }]))
      .toHaveBeenCalledExactlyOnceWith({ startTime: 10, endTime: 20, fadeInTime: 1, fadeOutTime: 0.5 });
  });

  it('Fade In을 1초로 바꾸고 같은 선택기의 Fade Out으로 포커스를 옮기면 아직 적용하지 않고, 선택기를 떠날 때 한 번 적용한다', () => {
    const changed = { ...initial, fadeInTime: 1 };
    expect(probe([initial, changed], [{ blurTo: 'inside' }])).not.toHaveBeenCalled();
    expect(probe([initial, changed], [{ blurTo: 'inside' }, { blurTo: 'outside' }]))
      .toHaveBeenCalledExactlyOnceWith({ startTime: 10, endTime: 20, fadeInTime: 1, fadeOutTime: 0.5 });
  });

  it('프리뷰 사용을 꺼 null을 알리면 구간을 지우지 않는다', () => {
    expect(probe([initial, null], [{ blurTo: 'outside' }])).not.toHaveBeenCalled();
  });
});

describe('드로어의 구간 선택기 key', () => {
  it('120초 음원에서 인게임 페이드를 1초로 적용해도 두 구간 선택기의 key는 음원으로만 정해져 그대로다', () => {
    const audioBuffer = { duration: 120 } as AudioBuffer;
    const keys = () => tree({ audioBuffer }).filter(e => e.type === RangeField).map(e => e.key);
    const before = keys();

    editGameplayRange({ startTime: 0, endTime: 120, fadeInTime: 1, fadeOutTime: 0 });

    expect(keys()).toEqual(before);
    expect(before).toHaveLength(2);
  });
});
