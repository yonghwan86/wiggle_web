export type LessonMode = "practice" | "guided" | "observe";
export type GuideMark =
  | { step: number; kind: "line"; points: Array<[number, number]> }
  | { step: number; kind: "ellipse"; x: number; y: number; rx: number; ry: number }
  | { step: number; kind: "rect"; x: number; y: number; width: number; height: number }
  | { step: number; kind: "curve"; points: [[number, number], [number, number], [number, number], [number, number]] };
export type LessonStep = { instruction: string; choices?: string[]; activity?: "color" | "free" };
export type Lesson = {
  slug: string;
  stage: 1 | 2 | 3;
  order: number;
  mode: LessonMode;
  title: string;
  topic: string;
  emoji: string;
  description: string;
  referenceImage?: string;
  observationWords?: string[];
  steps: LessonStep[];
  guide: GuideMark[];
  finalFree: true;
};

const line = (step: number, ...points: Array<[number, number]>): GuideMark => ({ step, kind: "line", points });
const ellipse = (step: number, x: number, y: number, rx: number, ry = rx): GuideMark => ({ step, kind: "ellipse", x, y, rx, ry });
const rect = (step: number, x: number, y: number, width: number, height: number): GuideMark => ({ step, kind: "rect", x, y, width, height });
const curve = (step: number, ...points: [[number, number], [number, number], [number, number], [number, number]]): GuideMark => ({ step, kind: "curve", points });

export const LESSONS: Lesson[] = [
  {
    slug: "straight-lines", stage: 1, order: 1, mode: "practice", title: "쭉쭉 직선", topic: "직선", emoji: "📏", description: "세로와 가로, 비스듬한 선을 힘 있게 그어요.", finalFree: true,
    steps: [
      { instruction: "위에서 아래로 선을 그어요." }, { instruction: "왼쪽에서 오른쪽으로 그어요." },
      { instruction: "비스듬한 선을 두 개 그어요.", choices: ["위로 올라가요", "아래로 내려가요"] },
      { instruction: "긴 선과 짧은 선을 그어요.", choices: ["긴 선 먼저", "짧은 선 먼저"] },
      { instruction: "선들을 이어 길을 만들어요." }, { instruction: "내 마음대로 선을 더해요." },
    ],
    guide: [line(1, [.22, .18], [.22, .78]), line(2, [.34, .28], [.82, .28]), line(3, [.38, .72], [.76, .42])],
  },
  {
    slug: "zigzag-path", stage: 1, order: 2, mode: "practice", title: "번개 지그재그", topic: "꺾은선", emoji: "⚡", description: "방향을 바꾸며 꺾이는 선을 그어요.", finalFree: true,
    steps: [
      { instruction: "산처럼 선을 꺾어 그어요." }, { instruction: "작은 지그재그를 이어 그어요." },
      { instruction: "큰 지그재그를 하나 그어요.", choices: ["뾰족하게", "넓게"] },
      { instruction: "방향을 바꾸어 다시 그어요.", choices: ["왼쪽으로", "오른쪽으로"] },
      { instruction: "두 선을 이어 번개를 만들어요." }, { instruction: "내 마음대로 무늬를 더해요." },
    ],
    guide: [line(1, [.16, .62], [.32, .36], [.46, .62], [.62, .36], [.82, .62]), line(2, [.2, .74], [.3, .64], [.4, .74], [.5, .64])],
  },
  {
    slug: "curvy-river", stage: 1, order: 3, mode: "practice", title: "구불구불 강", topic: "곡선", emoji: "〰️", description: "부드럽게 휘어지는 여러 곡선을 만나요.", finalFree: true,
    steps: [
      { instruction: "느린 물결선을 그어요." }, { instruction: "큰 곡선을 길게 그어요." },
      { instruction: "작은 곡선을 이어 그어요.", choices: ["촘촘하게", "넓게"] },
      { instruction: "두 곡선 사이를 꾸며요.", choices: ["돌을 놓아요", "물고기를 놓아요"] },
      { instruction: "강이 흐르는 곳을 정해요." }, { instruction: "내 마음대로 강가를 더해요." },
    ],
    guide: [curve(1, [.14, .32], [.32, .12], [.52, .54], [.84, .3]), curve(2, [.18, .62], [.4, .4], [.58, .88], [.86, .58])],
  },
  {
    slug: "circle-bubbles", stage: 1, order: 4, mode: "practice", title: "동글동글 방울", topic: "동그라미", emoji: "🫧", description: "크기가 다른 동그라미를 그려요.", finalFree: true,
    steps: [
      { instruction: "큰 동그라미를 그어요." }, { instruction: "작은 동그라미를 그어요." },
      { instruction: "겹치는 동그라미를 그어요.", choices: ["조금 겹쳐요", "많이 겹쳐요"] },
      { instruction: "방울의 색을 골라요.", choices: ["한 가지 색", "여러 가지 색"] },
      { instruction: "동그라미를 이어 모양을 만들어요." }, { instruction: "내 마음대로 방울을 더해요." },
    ],
    guide: [ellipse(1, .38, .46, .18), ellipse(2, .66, .34, .1), ellipse(3, .62, .64, .14)],
  },
  {
    slug: "triangle-mountains", stage: 1, order: 5, mode: "practice", title: "세모 산", topic: "세모", emoji: "🔺", description: "점을 이어 크고 작은 세모를 만들어요.", finalFree: true,
    steps: [
      { instruction: "점 세 개를 찍어요." }, { instruction: "점을 이어 세모를 만들어요." },
      { instruction: "옆에 다른 세모를 그어요.", choices: ["큰 세모", "작은 세모"] },
      { instruction: "산꼭대기를 꾸며요.", choices: ["눈을 올려요", "구름을 놓아요"] },
      { instruction: "세모 아래에 땅을 그어요." }, { instruction: "내 마음대로 산 친구를 더해요." },
    ],
    guide: [line(1, [.22, .7], [.46, .24], [.7, .7], [.22, .7]), line(3, [.58, .7], [.74, .42], [.88, .7])],
  },
  {
    slug: "square-windows", stage: 1, order: 6, mode: "practice", title: "네모 창문", topic: "네모", emoji: "🪟", description: "가로와 세로 선으로 네모를 만들어요.", finalFree: true,
    steps: [
      { instruction: "가로선 두 개를 그어요." }, { instruction: "세로선 두 개로 이어요." },
      { instruction: "안에 작은 네모를 그어요.", choices: ["가운데에", "한쪽에"] },
      { instruction: "창문 무늬를 골라요.", choices: ["십자 무늬", "점무늬"] },
      { instruction: "네모 옆에 손잡이를 그어요." }, { instruction: "내 마음대로 창밖을 더해요." },
    ],
    guide: [rect(1, .24, .22, .52, .56), line(3, [.5, .22], [.5, .78]), line(4, [.24, .5], [.76, .5])],
  },
  {
    slug: "size-position-play", stage: 1, order: 7, mode: "practice", title: "크고 작고 여기저기", topic: "크기와 위치", emoji: "🔵", description: "모양의 크기와 자리를 바꾸어 봐요.", finalFree: true,
    steps: [
      { instruction: "위에 작은 동그라미를 그어요." }, { instruction: "아래에 큰 네모를 그어요." },
      { instruction: "옆에 세모를 하나 놓아요.", choices: ["왼쪽에", "오른쪽에"] },
      { instruction: "가장 큰 모양을 골라요.", choices: ["동그라미", "네모", "세모"] },
      { instruction: "모양 사이를 선으로 이어요." }, { instruction: "내 마음대로 자리를 바꿔 더해요." },
    ],
    guide: [ellipse(1, .3, .25, .08), rect(2, .38, .5, .34, .3), line(3, [.18, .7], [.3, .48], [.4, .7], [.18, .7])],
  },
  {
    slug: "color-shape-rhythm", stage: 1, order: 8, mode: "practice", title: "색깔 모양 리듬", topic: "색과 반복", emoji: "🎨", description: "색과 모양을 차례로 반복해요.", finalFree: true,
    steps: [
      { instruction: "동그라미와 세모를 나란히 그어요." }, { instruction: "두 모양에 다른 색을 칠해요." },
      { instruction: "같은 차례로 한 번 더 그어요.", choices: ["동그라미 먼저", "세모 먼저"] },
      { instruction: "새 색 하나를 골라요.", choices: ["밝은 색", "어두운 색"] },
      { instruction: "모양 줄을 길게 이어요." }, { instruction: "내 마음대로 리듬을 바꿔요." },
    ],
    guide: [ellipse(1, .2, .5, .09), line(1, [.36, .59], [.45, .39], [.54, .59], [.36, .59]), ellipse(3, .7, .5, .09)],
  },
  {
    slug: "shape-robot", stage: 1, order: 9, mode: "practice", title: "도형 로봇", topic: "도형 조합", emoji: "🤖", description: "동그라미와 네모를 이어 로봇을 만들어요.", finalFree: true,
    steps: [
      { instruction: "머리 네모를 그어요." }, { instruction: "몸 네모를 아래에 그어요." },
      { instruction: "팔 모양을 골라 이어요.", choices: ["긴 팔", "짧은 팔"] },
      { instruction: "눈 모양을 골라요.", choices: ["동그란 눈", "네모난 눈"] },
      { instruction: "다리와 발을 그어요." }, { instruction: "내 마음대로 로봇 도구를 더해요." },
    ],
    guide: [rect(1, .36, .16, .28, .22), rect(2, .3, .42, .4, .34), line(3, [.3, .5], [.16, .68]), line(3, [.7, .5], [.84, .68])],
  },
  {
    slug: "shape-town", stage: 1, order: 10, mode: "practice", title: "도형 마을", topic: "도형 조합", emoji: "🏘️", description: "여러 도형을 이어 나만의 마을을 만들어요.", finalFree: true,
    steps: [
      { instruction: "큰 네모로 집을 그어요." }, { instruction: "세모로 지붕을 올려요." },
      { instruction: "창문 모양을 골라요.", choices: ["동그란 창문", "네모난 창문"] },
      { instruction: "길의 방향을 골라요.", choices: ["구불구불", "곧게"] },
      { instruction: "옆에 작은 집을 더해요." }, { instruction: "내 마음대로 마을 친구를 더해요." },
    ],
    guide: [rect(1, .26, .42, .34, .34), line(2, [.22, .42], [.43, .2], [.64, .42]), curve(4, [.12, .82], [.34, .66], [.62, .96], [.9, .76])],
  },
  {
    slug: "friendly-dog", stage: 2, order: 1, mode: "guided", title: "친구 강아지", topic: "강아지", emoji: "🐶", description: "큰 처진 귀와 웃는 입, 점무늬가 있는 귀여운 강아지를 그려요.", finalFree: true,
    steps: [
      { instruction: "볼이 통통한 머리 바깥선을 그어요." }, { instruction: "양옆에 크고 부드럽게 처진 귀를 그어요." },
      { instruction: "반짝이는 눈, 큰 주둥이와 웃는 입을 그어요.", choices: ["갈색 눈", "파란 눈"] }, { instruction: "머리 아래에 몸과 앞다리를 이어요." },
      { instruction: "뒷발과 꼬리, 목걸이와 점무늬를 더해요.", choices: ["빨간 목걸이", "노란 목걸이"] },
      { instruction: "좋아하는 색으로 강아지를 색칠해요.", choices: ["따뜻한 갈색", "알록달록 무늬"], activity: "color" }, { instruction: "내 마음대로 뼈다귀나 공을 더해요.", activity: "free" },
    ],
    guide: [curve(1, [.34, .19], [.4, .09], [.6, .09], [.66, .19]), curve(1, [.66, .19], [.74, .3], [.69, .43], [.58, .48]), curve(1, [.58, .48], [.53, .51], [.47, .51], [.42, .48]), curve(1, [.42, .48], [.31, .43], [.26, .3], [.34, .19]), curve(2, [.35, .2], [.22, .1], [.13, .17], [.16, .34]), curve(2, [.16, .34], [.18, .45], [.28, .47], [.35, .34]), curve(2, [.35, .34], [.39, .28], [.38, .23], [.35, .2]), curve(2, [.65, .2], [.78, .1], [.87, .17], [.84, .34]), curve(2, [.84, .34], [.82, .45], [.72, .47], [.65, .34]), curve(2, [.65, .34], [.61, .28], [.62, .23], [.65, .2]), ellipse(3, .41, .29, .055, .065), ellipse(3, .41, .29, .02, .03), ellipse(3, .59, .29, .02, .03), ellipse(3, .5, .4, .13, .085), line(3, [.5, .35], [.46, .38], [.5, .41], [.54, .38], [.5, .35]), curve(3, [.5, .41], [.48, .46], [.44, .45], [.43, .42]), curve(3, [.5, .41], [.52, .46], [.56, .45], [.57, .42]), ellipse(3, .5, .46, .035, .045), curve(4, [.4, .48], [.29, .58], [.31, .79], [.43, .85]), curve(4, [.43, .85], [.48, .89], [.52, .89], [.57, .85]), curve(4, [.57, .85], [.69, .79], [.71, .58], [.6, .48]), line(4, [.44, .62], [.43, .84], [.5, .84]), line(4, [.56, .62], [.57, .84], [.5, .84]), ellipse(5, .36, .84, .1, .045), ellipse(5, .64, .84, .1, .045), curve(5, [.65, .66], [.85, .5], [.93, .65], [.79, .75]), curve(5, [.79, .75], [.73, .79], [.69, .75], [.66, .7]), curve(5, [.4, .53], [.46, .57], [.54, .57], [.6, .53]), ellipse(5, .5, .57, .025), ellipse(5, .4, .68, .035, .025), ellipse(5, .61, .73, .04, .03)],
  },
  {
    slug: "curious-cat", stage: 2, order: 2, mode: "guided", title: "궁금한 고양이", topic: "고양이", emoji: "🐱", description: "세모 귀와 긴 수염을 차례로 그어요.", finalFree: true,
    // 얼굴에서 꼬리로 건너뛰면 몸 없는 고양이가 된다. 몸·다리 단계를 거쳐야 완성된 고양이가 나온다.
    steps: [
      { instruction: "볼과 턱을 둥글게 이어요." }, { instruction: "귀 두 개와 머리 위를 한 번에 이어요." },
      { instruction: "눈, 코, 입과 긴 수염을 그어요.", choices: ["초록 눈", "파란 눈"] }, { instruction: "가슴부터 몸과 두 앞다리를 천천히 이어요." },
      { instruction: "둥근 뒷발과 위로 살랑이는 꼬리를 더해요.", choices: ["줄무늬 꼬리", "점무늬 꼬리"] },
      { instruction: "좋아하는 색으로 고양이를 색칠해요.", choices: ["하얀 고양이", "회색 고양이"], activity: "color" }, { instruction: "내 마음대로 고양이 장난감을 더해요.", activity: "free" },
    ],
    // 머리 위에 귀 삼각형을 포개던 이전 가이드는 그대로 따라도 선이 겹쳤다.
    // 1단계는 볼·턱 윤곽, 2단계는 귀와 정수리를 한 줄로 이어 완성 실루엣이 깨끗하게 닫힌다.
    guide: [curve(1, [.34, .2], [.24, .3], [.28, .43], [.42, .48]), curve(1, [.42, .48], [.47, .52], [.53, .52], [.58, .48]), curve(1, [.58, .48], [.72, .43], [.76, .3], [.66, .2]), line(2, [.34, .2], [.33, .065], [.46, .165]), curve(2, [.46, .165], [.48, .145], [.52, .145], [.54, .165]), line(2, [.54, .165], [.67, .065], [.66, .2]), ellipse(3, .42, .29, .025, .035), ellipse(3, .58, .29, .025, .035), line(3, [.5, .33], [.47, .36], [.5, .38], [.53, .36], [.5, .33]), curve(3, [.5, .38], [.48, .43], [.44, .43], [.42, .4]), curve(3, [.5, .38], [.52, .43], [.56, .43], [.58, .4]), line(3, [.37, .36], [.23, .33]), line(3, [.37, .4], [.22, .43]), line(3, [.63, .36], [.77, .33]), line(3, [.63, .4], [.78, .43]), curve(4, [.4, .46], [.36, .52], [.37, .62], [.42, .68]), curve(4, [.6, .46], [.64, .52], [.63, .62], [.58, .68]), curve(4, [.41, .51], [.45, .56], [.55, .56], [.59, .51]), line(4, [.45, .57], [.44, .8]), curve(4, [.44, .8], [.44, .85], [.49, .85], [.5, .81]), line(4, [.55, .57], [.56, .8]), curve(4, [.56, .8], [.56, .85], [.51, .85], [.5, .81]), curve(5, [.42, .67], [.3, .7], [.3, .82], [.43, .84]), curve(5, [.43, .84], [.47, .87], [.49, .87], [.5, .84]), curve(5, [.58, .67], [.7, .7], [.7, .82], [.57, .84]), curve(5, [.57, .84], [.53, .87], [.51, .87], [.5, .84]), curve(5, [.65, .7], [.82, .68], [.88, .5], [.78, .48]), curve(5, [.78, .48], [.7, .47], [.72, .6], [.65, .63])],
  },
  {
    slug: "bouncy-rabbit", stage: 2, order: 3, mode: "guided", title: "깡충 토끼", topic: "토끼", emoji: "🐰", description: "긴 귀와 동그란 몸을 이어 그어요.", finalFree: true,
    steps: [
      { instruction: "작은 동그라미로 머리를 그어요." }, { instruction: "긴 귀 두 개를 그어요." },
      { instruction: "귀 안쪽과 눈, 코를 그어요.", choices: ["분홍 귀", "하늘 귀"] }, { instruction: "큰 타원으로 몸을 이어요." },
      { instruction: "앞발, 뒷발과 동그란 꼬리를 그어요.", choices: ["빨간 목도리", "노란 목도리"] },
      { instruction: "귀와 몸에 좋아하는 색을 칠해요.", choices: ["하얀 토끼", "갈색 토끼"], activity: "color" }, { instruction: "내 마음대로 토끼 먹이를 더해요.", activity: "free" },
    ],
    guide: [curve(1, [.36, .27], [.38, .16], [.6, .16], [.64, .27]), curve(1, [.64, .27], [.7, .4], [.62, .49], [.49, .48]), curve(1, [.49, .48], [.34, .49], [.29, .39], [.36, .27]), curve(2, [.39, .22], [.31, .05], [.4, .02], [.46, .22]), curve(2, [.46, .22], [.44, .26], [.41, .25], [.39, .22]), curve(2, [.52, .2], [.55, .02], [.65, .04], [.61, .25]), curve(2, [.61, .25], [.58, .27], [.54, .24], [.52, .2]), curve(3, [.37, .2], [.35, .11], [.39, .08], [.43, .21]), curve(3, [.56, .2], [.58, .08], [.62, .1], [.6, .23]), ellipse(3, .43, .33, .02, .028), ellipse(3, .56, .33, .02, .028), line(3, [.5, .37], [.48, .39], [.5, .41], [.52, .39], [.5, .37]), curve(3, [.5, .41], [.48, .44], [.46, .44], [.45, .42]), curve(4, [.42, .47], [.29, .57], [.3, .78], [.46, .83]), curve(4, [.46, .83], [.58, .88], [.7, .76], [.64, .55]), curve(4, [.64, .55], [.61, .48], [.54, .46], [.49, .48]), curve(5, [.39, .63], [.45, .67], [.5, .66], [.55, .62]), line(5, [.43, .64], [.43, .79]), line(5, [.52, .64], [.52, .8]), ellipse(5, .36, .83, .1, .045), ellipse(5, .58, .83, .1, .045), ellipse(5, .69, .65, .065)],
  },
  {
    slug: "little-fish", stage: 2, order: 4, mode: "guided", title: "반짝 물고기", topic: "물고기", emoji: "🐟", description: "타원 몸과 세모 꼬리를 이어 그어요.", finalFree: true,
    steps: [
      { instruction: "옆으로 긴 타원을 그어요." }, { instruction: "뒤에 세모 꼬리를 붙여요." },
      { instruction: "위아래 지느러미를 붙여요.", choices: ["빨간 지느러미", "노란 지느러미"] }, { instruction: "눈과 웃는 입을 그어요." },
      { instruction: "몸에 둥근 비늘을 세 개 그어요.", choices: ["파란 비늘", "무지개 비늘"] },
      { instruction: "몸과 지느러미를 예쁘게 색칠해요.", choices: ["파란 물고기", "무지개 물고기"], activity: "color" }, { instruction: "내 마음대로 바닷속 친구를 더해요.", activity: "free" },
    ],
    guide: [curve(1, [.16, .48], [.28, .27], [.58, .24], [.72, .46]), curve(1, [.72, .46], [.59, .69], [.29, .7], [.16, .48]), curve(2, [.71, .46], [.82, .3], [.9, .31], [.84, .48]), curve(2, [.84, .48], [.91, .64], [.82, .66], [.71, .5]), curve(3, [.44, .3], [.53, .17], [.62, .25], [.58, .36]), curve(3, [.43, .66], [.52, .79], [.62, .7], [.58, .59]), curve(3, [.45, .45], [.55, .35], [.59, .48], [.49, .55]), ellipse(4, .29, .43, .028), curve(4, [.19, .52], [.24, .58], [.31, .59], [.36, .54]), curve(4, [.2, .39], [.25, .35], [.31, .34], [.36, .37]), curve(5, [.4, .38], [.44, .43], [.46, .48], [.47, .54]), curve(5, [.5, .37], [.54, .43], [.56, .49], [.56, .56]), curve(5, [.59, .38], [.63, .44], [.64, .49], [.63, .54])],
  },
  {
    slug: "smiling-flower", stage: 2, order: 5, mode: "guided", title: "웃는 꽃", topic: "꽃", emoji: "🌼", description: "가운데에서 꽃잎을 하나씩 펼쳐요.", finalFree: true,
    steps: [
      { instruction: "가운데 동그라미를 그어요." }, { instruction: "둘레에 꽃잎을 그어요." },
      { instruction: "꽃 가운데에 웃는 얼굴을 그어요.", choices: ["노란 얼굴", "주황 얼굴"] }, { instruction: "아래로 줄기를 길게 그어요." },
      { instruction: "줄기 양쪽에 잎을 그어요.", choices: ["초록 잎", "연두 잎"] },
      { instruction: "꽃잎과 잎을 좋아하는 색으로 칠해요.", choices: ["분홍 꽃", "주황 꽃"], activity: "color" }, { instruction: "내 마음대로 꽃밭 친구를 더해요.", activity: "free" },
    ],
    guide: [ellipse(1, .5, .34, .1), curve(2, [.45, .25], [.42, .09], [.58, .09], [.55, .25]), curve(2, [.58, .28], [.7, .16], [.8, .31], [.62, .36]), curve(2, [.59, .39], [.77, .37], [.73, .55], [.57, .44]), curve(2, [.54, .44], [.58, .6], [.41, .6], [.46, .44]), curve(2, [.42, .4], [.28, .54], [.2, .37], [.39, .35]), curve(2, [.39, .31], [.21, .28], [.3, .13], [.44, .26]), ellipse(3, .46, .33, .014), ellipse(3, .54, .33, .014), curve(3, [.45, .37], [.47, .42], [.53, .42], [.55, .37]), curve(4, [.5, .44], [.46, .58], [.55, .71], [.5, .86]), curve(4, [.5, .44], [.54, .58], [.45, .71], [.5, .86]), curve(5, [.51, .62], [.38, .53], [.3, .65], [.48, .71]), curve(5, [.5, .72], [.63, .61], [.72, .75], [.52, .8])],
  },
  {
    slug: "tiny-car", stage: 2, order: 6, mode: "guided", title: "씽씽 자동차", topic: "자동차", emoji: "🚗", description: "네모 몸과 동그란 바퀴를 이어 그어요.", finalFree: true,
    steps: [
      { instruction: "긴 네모로 차 몸을 그어요." }, { instruction: "위에 지붕과 창문을 그어요." },
      { instruction: "아래에 같은 크기 바퀴 두 개를 그어요.", choices: ["검은 바퀴", "파란 바퀴"] }, { instruction: "앞뒤에 작은 불빛을 그어요." },
      { instruction: "차 아래로 길을 길게 그어요.", choices: ["낮 길", "밤 길"] },
      { instruction: "자동차에 좋아하는 색을 칠해요.", choices: ["파란 자동차", "빨간 자동차"], activity: "color" }, { instruction: "내 마음대로 자동차 짐을 더해요.", activity: "free" },
    ],
    guide: [curve(1, [.14, .54], [.18, .45], [.27, .42], [.35, .42]), curve(1, [.35, .42], [.49, .4], [.68, .41], [.79, .48]), curve(1, [.79, .48], [.86, .52], [.87, .64], [.8, .66]), line(1, [.8, .66], [.17, .66]), curve(1, [.17, .66], [.12, .64], [.11, .58], [.14, .54]), curve(2, [.3, .42], [.39, .24], [.61, .23], [.72, .43]), line(2, [.45, .26], [.45, .42]), line(2, [.6, .25], [.61, .42]), line(2, [.35, .42], [.43, .28], [.58, .28], [.67, .42]), ellipse(3, .3, .66, .09), ellipse(3, .71, .66, .09), ellipse(3, .3, .66, .04), ellipse(3, .71, .66, .04), rect(4, .14, .53, .035, .06), rect(4, .81, .52, .035, .06), line(4, [.49, .48], [.58, .48]), curve(5, [.1, .78], [.34, .74], [.66, .82], [.9, .77]), line(5, [.42, .78], [.53, .78])],
  },
  {
    slug: "delivery-bike", stage: 2, order: 7, mode: "guided", title: "달리는 자전거", topic: "자전거", emoji: "🚲", description: "동그라미 두 개와 선을 이어 자전거를 만들어요.", finalFree: true,
    steps: [
      { instruction: "같은 크기 바퀴 두 개를 그어요." }, { instruction: "두 바퀴 사이에 세모 틀을 만들어요." },
      { instruction: "가운데에 페달 동그라미를 그어요.", choices: ["빨간 자전거", "파란 자전거"] }, { instruction: "앞 포크, 손잡이와 안장을 그어요." },
      { instruction: "손잡이 앞에 바구니를 달아요.", choices: ["꽃 바구니", "과일 바구니"] },
      { instruction: "자전거와 바구니를 색칠해요.", choices: ["민트 자전거", "빨간 자전거"], activity: "color" }, { instruction: "내 마음대로 길 위 이야기를 더해요.", activity: "free" },
    ],
    guide: [ellipse(1, .25, .68, .15), ellipse(1, .73, .68, .15), line(2, [.25, .68], [.43, .42], [.55, .68], [.25, .68]), line(2, [.43, .42], [.62, .43], [.55, .68]), line(2, [.43, .42], [.53, .68]), ellipse(3, .55, .68, .035), line(3, [.55, .68], [.48, .77]), line(3, [.55, .68], [.63, .61]), line(4, [.62, .43], [.73, .68]), line(4, [.62, .43], [.67, .27], [.76, .25]), curve(4, [.75, .25], [.8, .22], [.82, .25], [.84, .27]), line(4, [.35, .4], [.49, .4]), curve(4, [.35, .4], [.36, .34], [.43, .33], [.48, .36]), rect(5, .7, .3, .18, .12), line(5, [.75, .25], [.76, .3]), line(5, [.73, .35], [.85, .35]), ellipse(5, .76, .35, .025), ellipse(5, .82, .35, .025)],
  },
  {
    slug: "ice-cream-cone", stage: 2, order: 8, mode: "guided", title: "달콤 아이스크림", topic: "아이스크림", emoji: "🍦", description: "세모 과자 위에 동그란 아이스크림을 올려요.", finalFree: true,
    steps: [
      { instruction: "아래에 긴 세모를 그어요." }, { instruction: "위에 동그라미를 올려요." },
      { instruction: "아이스크림 위에 작은 한 덩이를 더 올려요.", choices: ["딸기 맛", "초코 맛"] }, { instruction: "과자에 사선 격자를 그어요." },
      { instruction: "아이스크림에 눈과 웃는 입을 그어요.", choices: ["별 토핑", "과일 토핑"] },
      { instruction: "두 가지 맛으로 예쁘게 색칠해요.", choices: ["딸기와 민트", "초코와 바닐라"], activity: "color" }, { instruction: "내 마음대로 토핑을 더해요.", activity: "free" },
    ],
    guide: [curve(1, [.36, .46], [.4, .62], [.45, .75], [.5, .87]), curve(1, [.5, .87], [.55, .75], [.6, .62], [.64, .46]), line(1, [.36, .46], [.64, .46]), curve(2, [.33, .42], [.28, .34], [.35, .27], [.42, .29]), curve(2, [.42, .29], [.45, .18], [.59, .18], [.61, .3]), curve(2, [.61, .3], [.71, .28], [.75, .39], [.66, .45]), curve(2, [.66, .45], [.58, .51], [.42, .51], [.33, .42]), curve(3, [.39, .29], [.35, .21], [.42, .14], [.48, .18]), curve(3, [.48, .18], [.5, .06], [.64, .08], [.62, .21]), curve(3, [.62, .21], [.69, .2], [.71, .27], [.65, .31]), line(4, [.39, .55], [.57, .74]), line(4, [.39, .66], [.52, .8]), line(4, [.61, .55], [.43, .74]), line(4, [.61, .66], [.48, .8]), ellipse(5, .45, .38, .015), ellipse(5, .55, .38, .015), curve(5, [.45, .42], [.48, .46], [.52, .46], [.55, .42]), line(5, [.5, .16], [.5, .12])],
  },
  {
    slug: "moon-rocket", stage: 2, order: 9, mode: "guided", title: "달나라 로켓", topic: "로켓", emoji: "🚀", description: "긴 몸과 뾰족한 머리로 로켓을 그어요.", finalFree: true,
    steps: [
      { instruction: "길쭉한 로켓 몸을 그어요." }, { instruction: "위에 뾰족한 머리를 그어요." },
      { instruction: "가운데에 둥근 창문을 그어요.", choices: ["하늘 창문", "보라 창문"] }, { instruction: "양옆에 날개 두 개를 붙여요." },
      { instruction: "아래에 큰 불꽃과 작은 불꽃을 그어요.", choices: ["노란 불꽃", "주황 불꽃"] },
      { instruction: "로켓과 불꽃에 멋진 색을 칠해요.", choices: ["빨간 로켓", "파란 로켓"], activity: "color" }, { instruction: "내 마음대로 우주 친구를 더해요.", activity: "free" },
    ],
    guide: [curve(1, [.4, .3], [.36, .44], [.38, .62], [.46, .7]), curve(1, [.46, .7], [.48, .73], [.52, .73], [.54, .7]), curve(1, [.54, .7], [.62, .62], [.64, .44], [.6, .3]), line(1, [.4, .3], [.6, .3]), curve(2, [.4, .3], [.42, .18], [.47, .09], [.5, .06]), curve(2, [.5, .06], [.53, .09], [.58, .18], [.6, .3]), ellipse(3, .5, .39, .08), ellipse(3, .5, .39, .05), curve(3, [.46, .55], [.49, .58], [.51, .58], [.54, .55]), line(4, [.4, .48], [.26, .69], [.4, .64]), line(4, [.6, .48], [.74, .69], [.6, .64]), line(4, [.31, .62], [.37, .7]), line(4, [.69, .62], [.63, .7]), curve(5, [.44, .7], [.4, .8], [.47, .79], [.5, .92]), curve(5, [.5, .92], [.53, .79], [.6, .8], [.56, .7]), curve(5, [.47, .71], [.46, .78], [.49, .79], [.5, .85]), curve(5, [.5, .85], [.51, .79], [.54, .78], [.53, .71])],
  },
  {
    slug: "happy-dinosaur", stage: 2, order: 10, mode: "guided", title: "꼬마 공룡", topic: "공룡", emoji: "🦕", description: "큰 몸과 긴 목을 부드러운 선으로 이어요.", finalFree: true,
    steps: [
      { instruction: "큰 타원으로 몸을 그어요." }, { instruction: "긴 목과 작은 머리를 이어요." },
      { instruction: "눈과 등에 세모 가시를 그어요.", choices: ["노란 가시", "보라 가시"] }, { instruction: "몸 아래에 튼튼한 다리 네 개를 그어요." },
      { instruction: "몸 뒤로 긴 꼬리를 이어요.", choices: ["초록 공룡", "파란 공룡"] },
      { instruction: "몸과 가시를 좋아하는 색으로 칠해요.", choices: ["민트 공룡", "파란 공룡"], activity: "color" }, { instruction: "내 마음대로 공룡 시대를 더해요.", activity: "free" },
    ],
    guide: [curve(1, [.34, .47], [.42, .35], [.65, .35], [.74, .48]), curve(1, [.74, .48], [.8, .58], [.72, .7], [.57, .71]), curve(1, [.57, .71], [.42, .72], [.28, .63], [.34, .47]), curve(2, [.35, .49], [.24, .42], [.2, .29], [.27, .2]), curve(2, [.27, .2], [.31, .14], [.42, .15], [.45, .21]), curve(2, [.45, .21], [.49, .29], [.44, .4], [.38, .47]), curve(2, [.27, .2], [.2, .17], [.18, .24], [.25, .27]), ellipse(3, .33, .2, .016), curve(3, [.27, .24], [.3, .27], [.34, .27], [.36, .24]), line(3, [.41, .4], [.46, .31], [.51, .4]), line(3, [.51, .37], [.57, .28], [.62, .39]), line(3, [.62, .39], [.68, .32], [.72, .43]), ellipse(3, .52, .51, .035, .025), ellipse(3, .62, .58, .028, .022), line(4, [.36, .63], [.34, .82], [.42, .82], [.44, .68]), line(4, [.48, .69], [.48, .85], [.56, .85], [.57, .71]), line(4, [.62, .69], [.63, .82], [.7, .82], [.7, .65]), line(4, [.71, .62], [.76, .79], [.82, .78]), curve(5, [.73, .48], [.84, .43], [.91, .35], [.9, .28]), curve(5, [.9, .28], [.86, .34], [.86, .48], [.76, .56])],
  },
  {
    slug: "hanok-day", stage: 3, order: 1, mode: "observe", title: "한옥의 하루", topic: "한옥", emoji: "🏠", description: "지붕과 처마, 기둥을 천천히 관찰해요.", referenceImage: "/lessons/observe/hanok-day.webp", observationWords: ["굽은 지붕", "올라간 처마", "나무 기둥", "창살문"], finalFree: true,
    steps: [
      { instruction: "지붕 양끝과 가운데를 이어요." }, { instruction: "양쪽으로 올라가는 처마를 그어요." },
      { instruction: "대들보와 기둥 네 개를 세워요.", choices: ["갈색 기둥", "검은 기둥"] }, { instruction: "가운데 문과 창살을 그어요." },
      { instruction: "지붕 기와와 마당선을 살펴 더해요.", choices: ["맑은 낮", "별이 뜬 밤"] }, { instruction: "내 마음대로 한옥의 오늘 이야기를 더해요." },
    ],
    guide: [line(1, [.14, .4], [.5, .16], [.86, .4]), curve(2, [.1, .42], [.28, .49], [.42, .43], [.5, .38]), curve(2, [.5, .38], [.58, .43], [.72, .49], [.9, .42]), line(3, [.2, .47], [.8, .47]), line(3, [.27, .47], [.27, .82]), line(3, [.42, .47], [.42, .82]), line(3, [.58, .47], [.58, .82]), line(3, [.73, .47], [.73, .82]), line(3, [.22, .82], [.78, .82]), rect(4, .42, .52, .16, .3), line(4, [.5, .52], [.5, .82]), line(4, [.42, .62], [.58, .62]), line(4, [.42, .72], [.58, .72]), line(5, [.27, .29], [.73, .29]), line(5, [.2, .36], [.8, .36]), curve(5, [.12, .86], [.34, .8], [.66, .9], [.88, .84])],
  },
  {
    slug: "calm-capybara", stage: 3, order: 2, mode: "observe", title: "느긋한 카피바라", topic: "카피바라", emoji: "🦫", description: "둥근 몸과 짧은 귀, 네 발을 관찰해요.", referenceImage: "/lessons/observe/calm-capybara.webp", observationWords: ["긴 둥근 몸", "큰 주둥이", "작은 귀", "짧은 네 발"], finalFree: true,
    steps: [
      { instruction: "길고 둥근 몸의 바깥선을 그어요." }, { instruction: "앞쪽에 머리와 튀어나온 주둥이를 이어요." },
      { instruction: "작은 귀, 눈, 코를 찾아 그어요.", choices: ["갈색 털", "연한 갈색 털"] }, { instruction: "몸 아래에 짧은 다리 네 개를 그어요." },
      { instruction: "발밑에 풀과 물가 선을 더해요.", choices: ["물가", "풀밭"] }, { instruction: "내 마음대로 카피바라 친구를 더해요." },
    ],
    guide: [ellipse(1, .58, .55, .28, .19), ellipse(2, .31, .46, .16, .14), curve(2, [.2, .46], [.13, .48], [.14, .58], [.25, .58]), ellipse(3, .28, .32, .038), ellipse(3, .23, .43, .018), ellipse(3, .15, .51, .025, .018), line(3, [.18, .55], [.22, .57]), line(4, [.42, .68], [.4, .83], [.47, .83], [.49, .71]), line(4, [.55, .72], [.54, .85], [.61, .85], [.62, .72]), line(4, [.68, .7], [.68, .83], [.75, .83], [.77, .67]), line(4, [.79, .63], [.81, .78], [.86, .77]), curve(5, [.12, .88], [.35, .82], [.66, .92], [.9, .86]), line(5, [.3, .86], [.27, .79]), line(5, [.33, .86], [.36, .78])],
  },
  {
    slug: "old-tree", stage: 3, order: 3, mode: "observe", title: "오래된 나무", topic: "나무", emoji: "🌳", description: "줄기의 갈라짐과 잎 덩어리를 관찰해요.", referenceImage: "/lessons/observe/old-tree.webp", observationWords: ["굵은 줄기", "갈라진 가지", "둥근 잎 덩어리", "퍼진 뿌리"], finalFree: true,
    steps: [
      { instruction: "굵은 줄기와 뿌리를 아래에서 올려요." }, { instruction: "양쪽으로 갈라지는 가지를 살펴 그어요." },
      { instruction: "구름 같은 잎 덩어리를 여러 개 그어요.", choices: ["초록 잎", "주황 잎"] }, { instruction: "줄기에 짧은 껍질 무늬를 그어요." },
      { instruction: "나무 아래 땅과 떨어진 잎을 더해요.", choices: ["봄 나무", "가을 나무"] }, { instruction: "내 마음대로 나무 아래 이야기를 더해요." },
    ],
    guide: [line(1, [.35, .86], [.43, .78], [.46, .43], [.54, .43], [.58, .78], [.67, .86]), line(1, [.43, .82], [.5, .88], [.58, .82]), line(2, [.48, .5], [.33, .27]), line(2, [.5, .43], [.5, .2]), line(2, [.52, .48], [.7, .25]), ellipse(3, .34, .25, .17, .13), ellipse(3, .5, .18, .19, .14), ellipse(3, .67, .27, .18, .13), ellipse(3, .5, .34, .23, .13), line(4, [.47, .56], [.52, .52]), line(4, [.46, .66], [.53, .62]), line(4, [.45, .75], [.51, .71]), line(5, [.16, .87], [.84, .87]), line(5, [.24, .82], [.28, .78], [.32, .82])],
  },
  {
    slug: "snail-closeup", stage: 3, order: 4, mode: "observe", title: "달팽이 가까이", topic: "달팽이", emoji: "🐌", description: "나선 껍데기와 더듬이를 자세히 봐요.", referenceImage: "/lessons/observe/snail-closeup.webp", observationWords: ["빙글 껍데기", "긴 몸", "긴 더듬이", "작은 눈"], finalFree: true,
    steps: [
      { instruction: "큰 동그라미 껍데기를 그어요." }, { instruction: "안쪽 나선을 천천히 그어요." },
      { instruction: "껍데기 아래에 긴 몸을 이어 닫아요.", choices: ["노란 몸", "연두 몸"] }, { instruction: "머리에 더듬이 두 개와 눈을 그어요." },
      { instruction: "달팽이 뒤에 반짝이는 길을 그어요.", choices: ["나뭇잎 길", "돌멩이 길"] }, { instruction: "내 마음대로 작은 발견을 더해요." },
    ],
    guide: [ellipse(1, .43, .43, .21), curve(2, [.43, .43], [.62, .24], [.7, .59], [.45, .58]), curve(2, [.45, .58], [.3, .57], [.31, .36], [.45, .36]), curve(2, [.45, .36], [.54, .36], [.54, .5], [.45, .49]), curve(3, [.18, .66], [.4, .56], [.66, .69], [.82, .61]), curve(3, [.18, .66], [.25, .8], [.7, .8], [.84, .66]), curve(4, [.72, .63], [.75, .52], [.76, .44], [.78, .38]), curve(4, [.79, .63], [.83, .53], [.84, .46], [.87, .41]), ellipse(4, .78, .37, .015), ellipse(4, .87, .4, .015), curve(5, [.16, .78], [.34, .9], [.58, .84], [.78, .88])],
  },
  {
    slug: "rainy-umbrella", stage: 3, order: 5, mode: "observe", title: "비 오는 우산", topic: "우산", emoji: "☂️", description: "둥근 덮개와 반복되는 살을 관찰해요.", referenceImage: "/lessons/observe/rainy-umbrella.webp", observationWords: ["둥근 덮개", "반복되는 살", "긴 막대", "굽은 손잡이"], finalFree: true,
    steps: [
      { instruction: "우산의 큰 곡선을 그어요." }, { instruction: "아래쪽 물결선을 살펴요." },
      { instruction: "가운데에서 퍼지는 우산살을 그어요.", choices: ["노란 우산", "파란 우산"] }, { instruction: "가운데 손잡이를 내려 굽혀요." },
      { instruction: "우산 둘레에 빗방울을 더해요.", choices: ["보슬비", "소나기"] }, { instruction: "내 마음대로 빗속 장면을 더해요." },
    ],
    guide: [curve(1, [.14, .48], [.28, .12], [.72, .12], [.86, .48]), curve(2, [.14, .48], [.23, .59], [.32, .59], [.38, .48]), curve(2, [.38, .48], [.45, .59], [.52, .59], [.58, .48]), curve(2, [.58, .48], [.66, .59], [.77, .59], [.86, .48]), line(3, [.5, .2], [.38, .48]), line(3, [.5, .2], [.58, .48]), line(3, [.5, .2], [.14, .48]), line(3, [.5, .2], [.86, .48]), line(4, [.5, .2], [.5, .78]), curve(4, [.5, .78], [.5, .91], [.66, .91], [.66, .81]), line(5, [.23, .65], [.2, .72]), line(5, [.78, .62], [.75, .7]), line(5, [.32, .76], [.29, .83]), line(5, [.84, .75], [.81, .83])],
  },
  {
    slug: "playground-watch", stage: 3, order: 6, mode: "observe", title: "놀이터 관찰", topic: "놀이터", emoji: "🛝", description: "미끄럼틀의 높이와 사다리 간격을 살펴요.", referenceImage: "/lessons/observe/playground-watch.webp", observationWords: ["높은 발판", "사다리 칸", "안전 손잡이", "굽은 미끄럼판"], finalFree: true,
    steps: [
      { instruction: "높은 기둥 두 개와 발판을 그어요." }, { instruction: "평행한 두 선으로 미끄럼틀을 이어요." },
      { instruction: "사다리 칸을 같은 간격으로 그어요.", choices: ["빨간 미끄럼틀", "파란 미끄럼틀"] }, { instruction: "위에 안전 손잡이를 올려요." },
      { instruction: "아래에 모래밭과 공을 더해요.", choices: ["노란 공", "무지개 공"] }, { instruction: "내 마음대로 놀이터 사건을 더해요." },
    ],
    guide: [line(1, [.3, .27], [.3, .78]), line(1, [.48, .27], [.48, .78]), line(1, [.3, .31], [.58, .31]), curve(2, [.55, .31], [.62, .45], [.75, .62], [.84, .77]), curve(2, [.48, .38], [.57, .53], [.69, .7], [.8, .81]), line(3, [.3, .42], [.48, .42]), line(3, [.3, .54], [.48, .54]), line(3, [.3, .66], [.48, .66]), curve(4, [.34, .3], [.34, .16], [.42, .13], [.46, .28]), curve(4, [.49, .3], [.49, .16], [.57, .13], [.59, .3]), curve(5, [.12, .85], [.34, .79], [.66, .91], [.9, .84]), ellipse(5, .19, .76, .045)],
  },
  {
    slug: "fruit-basket", stage: 3, order: 7, mode: "observe", title: "과일 바구니", topic: "과일", emoji: "🧺", description: "겹쳐 있는 과일의 크기와 위치를 살펴요.", referenceImage: "/lessons/observe/fruit-basket.webp", observationWords: ["큰 사과", "길쭉한 배", "작은 귤", "겹친 잎"], finalFree: true,
    steps: [
      { instruction: "넓은 바구니와 둥근 손잡이를 그어요." }, { instruction: "큰 사과와 배를 먼저 놓아요." },
      { instruction: "작은 귤 두 개를 사이에 놓아요.", choices: ["빨간 사과", "초록 사과"] }, { instruction: "과일 꼭지와 잎을 살펴 그어요." },
      { instruction: "바구니에 가로세로 무늬를 그어요.", choices: ["갈색 바구니", "노란 바구니"] }, { instruction: "내 마음대로 새로운 과일을 더해요." },
    ],
    guide: [curve(1, [.18, .51], [.25, .86], [.75, .86], [.82, .51]), line(1, [.18, .51], [.82, .51]), curve(1, [.29, .5], [.28, .2], [.72, .2], [.71, .5]), ellipse(2, .4, .43, .13), curve(2, [.55, .5], [.54, .31], [.68, .28], [.7, .49]), ellipse(3, .29, .49, .08), ellipse(3, .75, .48, .075), line(4, [.4, .3], [.42, .24]), curve(4, [.42, .26], [.47, .21], [.5, .26], [.45, .29]), line(4, [.64, .31], [.62, .25]), line(4, [.29, .4], [.27, .35]), line(5, [.23, .62], [.77, .62]), line(5, [.26, .73], [.74, .73]), line(5, [.36, .53], [.36, .8]), line(5, [.5, .53], [.5, .82]), line(5, [.64, .53], [.64, .8])],
  },
  {
    slug: "bus-stop", stage: 3, order: 8, mode: "observe", title: "우리 동네 버스 정류장", topic: "버스 정류장", emoji: "🚏", description: "기둥과 표지판, 기다리는 사람을 관찰해요.", referenceImage: "/lessons/observe/bus-stop.webp", observationWords: ["둥근 표지판", "정류장 지붕", "긴 의자", "기다리는 사람"], finalFree: true,
    steps: [
      { instruction: "긴 기둥과 위쪽 표지판을 그어요." }, { instruction: "표지판 안에 작은 버스를 그어요." },
      { instruction: "옆에 지붕과 긴 의자를 그어요.", choices: ["파란 정류장", "초록 정류장"] }, { instruction: "기다리는 사람의 머리와 몸을 그어요." },
      { instruction: "아래에 차도 선을 길게 그어요.", choices: ["낮 풍경", "저녁 풍경"] }, { instruction: "내 마음대로 정류장 이야기를 더해요." },
    ],
    guide: [line(1, [.24, .28], [.24, .83]), rect(1, .13, .16, .22, .17), rect(2, .17, .21, .14, .065), ellipse(2, .2, .29, .018), ellipse(2, .28, .29, .018), line(3, [.43, .28], [.84, .28], [.84, .72]), line(3, [.43, .28], [.43, .72]), line(3, [.47, .59], [.78, .59]), line(3, [.5, .59], [.5, .73]), line(3, [.75, .59], [.75, .73]), ellipse(4, .58, .42, .045), line(4, [.58, .47], [.58, .62]), line(4, [.58, .52], [.52, .58]), line(4, [.58, .52], [.64, .58]), line(5, [.1, .85], [.9, .85]), line(5, [.44, .9], [.63, .9])],
  },
  {
    slug: "seaside-lighthouse", stage: 3, order: 9, mode: "observe", title: "바닷가 등대", topic: "등대", emoji: "🚨", description: "위는 좁고 아래는 넓은 등대 모양을 살펴요.", referenceImage: "/lessons/observe/seaside-lighthouse.webp", observationWords: ["넓은 아래", "좁은 위", "줄무늬", "양쪽 불빛"], finalFree: true,
    steps: [
      { instruction: "아래가 넓고 위가 좁은 탑을 닫아 그어요." }, { instruction: "맨 위에 불빛 방과 삼각 지붕을 그어요." },
      { instruction: "탑에 줄무늬와 문을 그어요.", choices: ["빨간 줄무늬", "파란 줄무늬"] }, { instruction: "불빛 방에서 양쪽으로 빛을 뻗어요." },
      { instruction: "탑 아래에 출렁이는 파도를 그어요.", choices: ["잔잔한 바다", "바람 부는 바다"] }, { instruction: "내 마음대로 바닷가 사건을 더해요." },
    ],
    guide: [line(1, [.35, .8], [.44, .31], [.56, .31], [.65, .8], [.35, .8]), rect(2, .39, .2, .22, .12), line(2, [.37, .2], [.5, .09], [.63, .2]), line(2, [.36, .34], [.64, .34]), line(3, [.41, .48], [.59, .48]), line(3, [.38, .62], [.62, .62]), rect(3, .47, .66, .06, .14), line(4, [.39, .24], [.14, .17]), line(4, [.39, .29], [.14, .36]), line(4, [.61, .24], [.86, .17]), line(4, [.61, .29], [.86, .36]), curve(5, [.12, .85], [.28, .73], [.38, .92], [.5, .82]), curve(5, [.5, .82], [.62, .72], [.72, .91], [.88, .82])],
  },
  {
    slug: "favorite-sneaker", stage: 3, order: 10, mode: "observe", title: "내 운동화", topic: "운동화", emoji: "👟", description: "신발의 바닥선과 끈 모양을 자세히 봐요.", referenceImage: "/lessons/observe/favorite-sneaker.webp", observationWords: ["둥근 앞코", "두꺼운 밑창", "교차한 끈", "뒤꿈치"], finalFree: true,
    steps: [
      { instruction: "신발의 긴 밑창 위아래 선을 그어요." }, { instruction: "뒤꿈치에서 발등과 앞코를 이어요." },
      { instruction: "혀와 세 쌍의 교차 끈을 그어요.", choices: ["하얀 끈", "무지개 끈"] }, { instruction: "옆면에 번개 무늬를 그어요." },
      { instruction: "밑창에 짧은 홈을 반복해요.", choices: ["학교 가는 길", "공원 가는 길"] }, { instruction: "내 마음대로 신나는 발걸음을 더해요." },
    ],
    guide: [line(1, [.16, .7], [.84, .7]), line(1, [.16, .78], [.84, .78]), line(1, [.16, .7], [.16, .78]), line(1, [.84, .7], [.84, .78]), curve(2, [.19, .69], [.23, .36], [.42, .34], [.54, .53]), curve(2, [.54, .53], [.64, .63], [.76, .57], [.84, .7]), line(2, [.23, .42], [.24, .69]), line(3, [.38, .38], [.55, .61]), line(3, [.5, .39], [.35, .56]), line(3, [.43, .45], [.6, .64]), line(3, [.56, .46], [.4, .62]), line(3, [.49, .52], [.65, .66]), line(3, [.62, .52], [.47, .67]), line(4, [.62, .58], [.7, .51], [.68, .59], [.77, .57]), line(5, [.28, .72], [.28, .77]), line(5, [.4, .72], [.4, .77]), line(5, [.52, .72], [.52, .77]), line(5, [.64, .72], [.64, .77]), line(5, [.76, .72], [.76, .77])],
  },
];

export const CURRICULUM_STAGES = [
  { stage: 1 as const, mode: "practice" as const, title: "선·도형 기초", description: "선과 도형을 손에 익혀요.", path: "/student/practice", emoji: "✏️" },
  { stage: 2 as const, mode: "guided" as const, title: "따라 그리기", description: "한 번에 한 단계씩 그려요.", path: "/student/guided", emoji: "🐶" },
  { stage: 3 as const, mode: "observe" as const, title: "관찰 그리기", description: "특징을 찾아 내 생각을 더해요.", path: "/student/observe", emoji: "🔎" },
  { stage: 4 as const, mode: "free" as const, title: "AI 가이드 자유 창작", description: "필요할 때만 그리미를 불러요.", path: "/student/draw/new?mode=free", emoji: "✨" },
];

export const DEFAULT_ACTIVITY_KEY = `lesson:${LESSONS[0].slug}`;
export const FREE_ACTIVITY_KEY = "free";
export const ACTIVITY_KEYS = new Set([FREE_ACTIVITY_KEY, ...LESSONS.map((lesson) => `lesson:${lesson.slug}`)]);

const legacyActivities = new Map<string, string>([
  ["자유롭게 그리기", FREE_ACTIVITY_KEY],
  ["선과 도형 놀이터", "lesson:straight-lines"],
  ["친구 강아지 따라 그리기", "lesson:friendly-dog"],
  ["한옥 관찰해서 그리기", "lesson:hanok-day"],
  ["선이 춤춰요", "lesson:straight-lines"],
  ["도형 마을", "lesson:shape-town"],
  ["친구 강아지", "lesson:friendly-dog"],
  ["달리는 자전거", "lesson:delivery-bike"],
  ["한옥의 하루", "lesson:hanok-day"],
]);

export function lessonBySlug(slug: string | null | undefined) {
  return LESSONS.find((lesson) => lesson.slug === slug);
}

export function lessonsForStage(stage: 1 | 2 | 3) {
  return LESSONS.filter((lesson) => lesson.stage === stage);
}

export function normalizeActivityKey(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (ACTIVITY_KEYS.has(raw)) return raw;
  return legacyActivities.get(raw) ?? DEFAULT_ACTIVITY_KEY;
}

export function activityLabel(value: string | null | undefined) {
  const key = normalizeActivityKey(value);
  if (key === FREE_ACTIVITY_KEY) return "AI 가이드 자유 창작";
  return lessonBySlug(key.replace(/^lesson:/, ""))?.title ?? LESSONS[0].title;
}

export function isActivityKey(value: string) {
  return ACTIVITY_KEYS.has(value);
}
