// 타임랩스 재생/일시정지 상태 전이의 순수 로직. 컴포넌트 없이 테스트할 수 있다.
export type PlaybackState = { playing: boolean; frame: number };

/**
 * 재생 버튼을 눌렀을 때의 다음 상태. 재생 중이면 그 자리에서 멈춘다(일시정지는 그대로 동작).
 * 멈춰 있다가(끝까지 봤든, 중간에 멈췄든, 슬라이더로 옮겼든) 다시 누르면 항상 0프레임부터
 * 새로 재생한다 — "처음부터"와 별개로, 멈춤→재생 전환은 항상 처음부터 시작해야 한다.
 */
export function resolvePlayToggle(playing: boolean, frame: number): PlaybackState {
  if (playing) return { playing: false, frame };
  return { playing: true, frame: 0 };
}

/** 재생 중 타이머 한 틱: 마지막 동작까지 왔으면 멈추고, 아니면 한 프레임 진행한다. */
export function advancePlaybackFrame(frame: number, totalOps: number): { frame: number; stop: boolean } {
  if (frame >= totalOps) return { frame, stop: true };
  return { frame: frame + 1, stop: false };
}
