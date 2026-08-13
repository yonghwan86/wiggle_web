import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { advancePlaybackFrame, resolvePlayToggle } from "../lib/timelapse-playback.ts";

test("pressing play from the final frame (modal just opened) restarts at 0", () => {
  const next = resolvePlayToggle(false, 12);
  assert.deepEqual(next, { playing: true, frame: 0 });
});

test("pressing play after scrubbing past the end also restarts at 0", () => {
  const next = resolvePlayToggle(false, 20);
  assert.deepEqual(next, { playing: true, frame: 0 });
});

test("pressing play while paused mid-way (not at the end) still restarts at 0, not resumes", () => {
  // 요구사항은 문자 그대로다: 멈춤→재생 전환은 어떤 프레임에서 멈췄든 항상 0부터 다시 튼다.
  const next = resolvePlayToggle(false, 5);
  assert.deepEqual(next, { playing: true, frame: 0 });
});

test("pressing play after scrubbing the slider to some mid frame restarts at 0", () => {
  const next = resolvePlayToggle(false, 1);
  assert.deepEqual(next, { playing: true, frame: 0 });
});

test("pressing play while already playing pauses in place", () => {
  const next = resolvePlayToggle(true, 5);
  assert.deepEqual(next, { playing: false, frame: 5 });
});

test("pressing play on an empty document (0 ops, frame already 0) restarts at 0, not stuck", () => {
  const next = resolvePlayToggle(false, 0);
  assert.deepEqual(next, { playing: true, frame: 0 });
});

test("advancing a frame mid-playback moves forward by one and keeps playing", () => {
  assert.deepEqual(advancePlaybackFrame(3, 12), { frame: 4, stop: false });
});

test("advancing at the last frame stops playback instead of overshooting", () => {
  assert.deepEqual(advancePlaybackFrame(12, 12), { frame: 12, stop: true });
});

test("a full play-through cycle: play from the end replays every frame then stops", () => {
  let state = { playing: false, frame: 8 };
  const totalOps = 8;
  state = resolvePlayToggle(state.playing, state.frame);
  assert.deepEqual(state, { playing: true, frame: 0 });
  const framesSeen = [state.frame];
  for (let tick = 0; tick < totalOps + 2; tick += 1) {
    const next = advancePlaybackFrame(state.frame, totalOps);
    // 멈추는 틱은 프레임이 그대로이므로(중복 push 방지) 여기서 바로 멈추고 빠져나간다 —
    // 실제 컴포넌트도 stop 틱에서는 setFrame으로 같은 값을 되돌릴 뿐 새 프레임을 그리지 않는다.
    if (next.stop) { state = { playing: false, frame: next.frame }; break; }
    state = { playing: state.playing, frame: next.frame };
    framesSeen.push(state.frame);
  }
  assert.deepEqual(framesSeen, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(state.playing, false);
});

test("pause mid-way then press play again: restarts at 0, not resumes from the pause point", () => {
  let state = { playing: false, frame: 8 };
  // 1) 처음 재생: 0부터 시작해 3프레임 진행한 뒤 사용자가 일시정지한다.
  state = resolvePlayToggle(state.playing, state.frame);
  for (let tick = 0; tick < 3; tick += 1) state = { ...state, frame: advancePlaybackFrame(state.frame, 8).frame };
  assert.deepEqual(state, { playing: true, frame: 3 });
  state = resolvePlayToggle(state.playing, state.frame);
  assert.deepEqual(state, { playing: false, frame: 3 });
  // 2) 3프레임에서 멈춘 채로 재생을 다시 누르면, 3부터 이어서가 아니라 0부터 다시 튼다.
  state = resolvePlayToggle(state.playing, state.frame);
  assert.deepEqual(state, { playing: true, frame: 0 });
});

test("TimelapsePlayer wires the play button through the shared toggle instead of a raw boolean flip", async () => {
  const source = await readFile(new URL("../app/components/TimelapsePlayer.tsx", import.meta.url), "utf8");
  assert.match(source, /import \{ advancePlaybackFrame, resolvePlayToggle \} from "@\/lib\/timelapse-playback"/);
  assert.match(source, /function togglePlay\(\)[\s\S]{0,200}resolvePlayToggle\(playing, frame\)/);
  assert.match(source, /onClick=\{togglePlay\}/);
  assert.doesNotMatch(source, /onClick=\{\(\) => setPlaying\(\(value\) => !value\)\}/);
});
