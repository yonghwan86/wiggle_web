export type LessonMode = "practice" | "guided" | "observe";
export type GuideMark =
  | { step: number; kind: "line"; points: Array<[number, number]> }
  | { step: number; kind: "ellipse"; x: number; y: number; rx: number; ry: number }
  | { step: number; kind: "rect"; x: number; y: number; width: number; height: number }
  | { step: number; kind: "curve"; points: [[number, number], [number, number], [number, number], [number, number]] };
export type LessonStep = { instruction: string; choices?: string[] };
export type Lesson = {
  slug: string;
  stage: 1 | 2 | 3;
  order: number;
  mode: LessonMode;
  title: string;
  topic: string;
  emoji: string;
  description: string;
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
    slug: "friendly-dog", stage: 2, order: 1, mode: "guided", title: "친구 강아지", topic: "강아지", emoji: "🐶", description: "동그라미에서 다정한 강아지가 태어나요.", finalFree: true,
    steps: [
      { instruction: "큰 동그라미로 얼굴을 그어요." }, { instruction: "위에 귀 두 개를 그어요." },
      { instruction: "눈과 코를 콕 그어요.", choices: ["동그란 코", "세모난 코"] },
      { instruction: "몸과 다리를 이어요." }, { instruction: "꼬리를 골라 그어요.", choices: ["말린 꼬리", "긴 꼬리"] },
      { instruction: "내 마음대로 강아지 친구를 더해요." },
    ],
    guide: [ellipse(1, .5, .34, .2), line(2, [.34, .23], [.24, .1], [.4, .16]), line(2, [.66, .23], [.76, .1], [.6, .16]), ellipse(4, .5, .66, .18, .23)],
  },
  {
    slug: "curious-cat", stage: 2, order: 2, mode: "guided", title: "궁금한 고양이", topic: "고양이", emoji: "🐱", description: "세모 귀와 긴 수염을 차례로 그어요.", finalFree: true,
    steps: [
      { instruction: "동그란 얼굴을 그어요." }, { instruction: "세모 귀 두 개를 올려요." },
      { instruction: "눈 표정을 골라요.", choices: ["동그란 눈", "웃는 눈"] }, { instruction: "코와 수염을 그어요." },
      { instruction: "꼬리 방향을 골라요.", choices: ["위로", "옆으로"] }, { instruction: "내 마음대로 고양이 장난감을 더해요." },
    ],
    guide: [ellipse(1, .5, .34, .2), line(2, [.34, .2], [.34, .06], [.45, .16]), line(2, [.55, .16], [.66, .06], [.66, .2]), curve(5, [.62, .68], [.9, .56], [.9, .86], [.72, .82])],
  },
  {
    slug: "bouncy-rabbit", stage: 2, order: 3, mode: "guided", title: "깡충 토끼", topic: "토끼", emoji: "🐰", description: "긴 귀와 동그란 몸을 이어 그어요.", finalFree: true,
    steps: [
      { instruction: "작은 동그라미로 머리를 그어요." }, { instruction: "긴 귀 두 개를 그어요." },
      { instruction: "귀 안쪽 색을 골라요.", choices: ["분홍색", "좋아하는 색"] }, { instruction: "큰 타원으로 몸을 그어요." },
      { instruction: "토끼 자세를 골라요.", choices: ["앉아 있어요", "뛰고 있어요"] }, { instruction: "내 마음대로 토끼 먹이를 더해요." },
    ],
    guide: [ellipse(1, .5, .32, .15), ellipse(2, .42, .17, .06, .14), ellipse(2, .58, .17, .06, .14), ellipse(4, .5, .65, .2, .25)],
  },
  {
    slug: "little-fish", stage: 2, order: 4, mode: "guided", title: "반짝 물고기", topic: "물고기", emoji: "🐟", description: "타원 몸과 세모 꼬리를 이어 그어요.", finalFree: true,
    steps: [
      { instruction: "옆으로 긴 타원을 그어요." }, { instruction: "뒤에 세모 꼬리를 붙여요." },
      { instruction: "지느러미 모양을 골라요.", choices: ["둥글게", "뾰족하게"] }, { instruction: "눈과 입을 그어요." },
      { instruction: "비늘 무늬를 골라요.", choices: ["점무늬", "줄무늬"] }, { instruction: "내 마음대로 바닷속 친구를 더해요." },
    ],
    guide: [ellipse(1, .46, .48, .26, .16), line(2, [.7, .48], [.86, .32], [.86, .64], [.7, .48]), line(3, [.48, .34], [.58, .2], [.64, .38])],
  },
  {
    slug: "smiling-flower", stage: 2, order: 5, mode: "guided", title: "웃는 꽃", topic: "꽃", emoji: "🌼", description: "가운데에서 꽃잎을 하나씩 펼쳐요.", finalFree: true,
    steps: [
      { instruction: "가운데 동그라미를 그어요." }, { instruction: "둘레에 꽃잎을 그어요." },
      { instruction: "꽃잎 수를 골라요.", choices: ["다섯 장", "여덟 장"] }, { instruction: "아래로 줄기를 그어요." },
      { instruction: "잎의 방향을 골라요.", choices: ["왼쪽", "오른쪽"] }, { instruction: "내 마음대로 꽃밭 친구를 더해요." },
    ],
    guide: [ellipse(1, .5, .35, .09), ellipse(2, .5, .2, .07, .12), ellipse(2, .66, .35, .12, .07), line(4, [.5, .44], [.5, .82])],
  },
  {
    slug: "tiny-car", stage: 2, order: 6, mode: "guided", title: "씽씽 자동차", topic: "자동차", emoji: "🚗", description: "네모 몸과 동그란 바퀴를 이어 그어요.", finalFree: true,
    steps: [
      { instruction: "긴 네모로 차 몸을 그어요." }, { instruction: "위에 창문을 그어요." },
      { instruction: "바퀴 크기를 골라요.", choices: ["큰 바퀴", "작은 바퀴"] }, { instruction: "앞뒤 불빛을 그어요." },
      { instruction: "달릴 길을 골라요.", choices: ["곧은 길", "언덕길"] }, { instruction: "내 마음대로 자동차 짐을 더해요." },
    ],
    guide: [rect(1, .22, .44, .58, .24), line(2, [.34, .44], [.44, .3], [.65, .3], [.74, .44]), ellipse(3, .36, .7, .09), ellipse(3, .68, .7, .09)],
  },
  {
    slug: "delivery-bike", stage: 2, order: 7, mode: "guided", title: "달리는 자전거", topic: "자전거", emoji: "🚲", description: "동그라미 두 개와 선을 이어 자전거를 만들어요.", finalFree: true,
    steps: [
      { instruction: "같은 크기 바퀴 두 개를 그어요." }, { instruction: "두 바퀴 사이를 선으로 이어요." },
      { instruction: "가운데 세모를 만들어요." }, { instruction: "손잡이와 안장을 그어요." },
      { instruction: "바구니 짐을 골라요.", choices: ["꽃", "과일", "장난감"] }, { instruction: "가는 곳을 골라요.", choices: ["공원", "친구 집"] },
      { instruction: "내 마음대로 길 위 이야기를 더해요." },
    ],
    guide: [ellipse(1, .28, .65, .16), ellipse(1, .74, .65, .16), line(2, [.28, .65], [.46, .4], [.58, .65], [.28, .65], [.52, .65], [.74, .65]), line(4, [.46, .4], [.62, .32])],
  },
  {
    slug: "ice-cream-cone", stage: 2, order: 8, mode: "guided", title: "달콤 아이스크림", topic: "아이스크림", emoji: "🍦", description: "세모 과자 위에 동그란 아이스크림을 올려요.", finalFree: true,
    steps: [
      { instruction: "아래에 긴 세모를 그어요." }, { instruction: "위에 동그라미를 올려요." },
      { instruction: "아이스크림 수를 골라요.", choices: ["한 덩이", "두 덩이"] }, { instruction: "과자에 격자무늬를 그어요." },
      { instruction: "맛의 색을 골라요.", choices: ["딸기 맛", "초코 맛", "내가 만든 맛"] }, { instruction: "내 마음대로 토핑을 더해요." },
    ],
    guide: [line(1, [.38, .44], [.5, .84], [.62, .44], [.38, .44]), ellipse(2, .5, .34, .16), line(4, [.42, .55], [.57, .7]), line(4, [.58, .55], [.43, .7])],
  },
  {
    slug: "moon-rocket", stage: 2, order: 9, mode: "guided", title: "달나라 로켓", topic: "로켓", emoji: "🚀", description: "긴 몸과 뾰족한 머리로 로켓을 그어요.", finalFree: true,
    steps: [
      { instruction: "길쭉한 로켓 몸을 그어요." }, { instruction: "위에 뾰족한 머리를 그어요." },
      { instruction: "창문 모양을 골라요.", choices: ["동그라미", "네모"] }, { instruction: "옆에 날개를 붙여요." },
      { instruction: "불꽃 모양을 골라요.", choices: ["길게", "짧고 크게"] }, { instruction: "내 마음대로 우주 친구를 더해요." },
    ],
    guide: [rect(1, .4, .28, .2, .4), line(2, [.4, .28], [.5, .1], [.6, .28]), ellipse(3, .5, .4, .07), line(4, [.4, .54], [.28, .7], [.4, .68])],
  },
  {
    slug: "happy-dinosaur", stage: 2, order: 10, mode: "guided", title: "꼬마 공룡", topic: "공룡", emoji: "🦕", description: "큰 몸과 긴 목을 부드러운 선으로 이어요.", finalFree: true,
    steps: [
      { instruction: "큰 타원으로 몸을 그어요." }, { instruction: "긴 목과 작은 머리를 이어요." },
      { instruction: "등 무늬를 골라요.", choices: ["동그란 점", "세모 가시"] }, { instruction: "다리 네 개를 그어요." },
      { instruction: "꼬리 방향을 골라요.", choices: ["위로", "옆으로"] }, { instruction: "내 마음대로 공룡 시대를 더해요." },
    ],
    guide: [ellipse(1, .5, .58, .28, .2), curve(2, [.34, .52], [.24, .28], [.3, .18], [.4, .22]), ellipse(2, .42, .2, .1, .07), curve(5, [.74, .58], [.9, .5], [.88, .34], [.82, .3])],
  },
  {
    slug: "hanok-day", stage: 3, order: 1, mode: "observe", title: "한옥의 하루", topic: "한옥", emoji: "🏠", description: "지붕과 처마, 기둥을 천천히 관찰해요.", finalFree: true,
    steps: [
      { instruction: "지붕의 가운데를 찾아요." }, { instruction: "양쪽 처마선을 그어요." },
      { instruction: "기둥 두 개를 세워요." }, { instruction: "문 모양을 골라요.", choices: ["미닫이문", "둥근 문"] },
      { instruction: "마당에 누가 있는지 골라요.", choices: ["사람", "동물", "아무도 없어요"] }, { instruction: "내 마음대로 오늘의 사건을 더해요." },
    ],
    guide: [line(1, [.16, .4], [.5, .17], [.84, .4]), curve(2, [.14, .4], [.3, .46], [.7, .46], [.86, .4]), line(3, [.3, .44], [.3, .82]), line(3, [.7, .44], [.7, .82])],
  },
  {
    slug: "calm-capybara", stage: 3, order: 2, mode: "observe", title: "느긋한 카피바라", topic: "카피바라", emoji: "🦫", description: "둥근 몸과 짧은 귀, 네 발을 관찰해요.", finalFree: true,
    steps: [
      { instruction: "큰 타원 몸을 살펴 그어요." }, { instruction: "앞쪽에 머리를 이어요." },
      { instruction: "작은 귀와 눈을 찾아요." }, { instruction: "다리 자세를 골라요.", choices: ["서 있어요", "앉아 있어요"] },
      { instruction: "있는 곳을 골라요.", choices: ["물가", "풀밭"] }, { instruction: "내 마음대로 카피바라 친구를 더해요." },
    ],
    guide: [ellipse(1, .54, .55, .28, .2), ellipse(2, .3, .46, .16, .14), ellipse(3, .26, .32, .045), line(4, [.42, .7], [.4, .82]), line(4, [.68, .7], [.7, .82])],
  },
  {
    slug: "old-tree", stage: 3, order: 3, mode: "observe", title: "오래된 나무", topic: "나무", emoji: "🌳", description: "줄기의 갈라짐과 잎 덩어리를 관찰해요.", finalFree: true,
    steps: [
      { instruction: "굵은 줄기를 아래에서 올려요." }, { instruction: "갈라지는 가지를 살펴요." },
      { instruction: "잎 덩어리 모양을 골라요.", choices: ["둥글게", "구름처럼"] }, { instruction: "껍질 무늬를 그어요." },
      { instruction: "계절을 골라 색을 더해요.", choices: ["봄", "여름", "가을"] }, { instruction: "내 마음대로 나무 아래 이야기를 더해요." },
    ],
    guide: [line(1, [.44, .82], [.46, .44], [.54, .44], [.58, .82]), line(2, [.48, .48], [.32, .26]), line(2, [.52, .46], [.68, .22]), ellipse(3, .5, .24, .3, .18)],
  },
  {
    slug: "snail-closeup", stage: 3, order: 4, mode: "observe", title: "달팽이 가까이", topic: "달팽이", emoji: "🐌", description: "나선 껍데기와 더듬이를 자세히 봐요.", finalFree: true,
    steps: [
      { instruction: "큰 동그라미 껍데기를 그어요." }, { instruction: "안쪽 나선을 천천히 그어요." },
      { instruction: "긴 몸을 아래에 이어요." }, { instruction: "더듬이 표정을 골라요.", choices: ["쭉 펴요", "살짝 굽혀요"] },
      { instruction: "달팽이 길을 골라요.", choices: ["나뭇잎", "돌길"] }, { instruction: "내 마음대로 작은 발견을 더해요." },
    ],
    guide: [ellipse(1, .47, .43, .2), curve(2, [.47, .43], [.62, .28], [.68, .58], [.49, .56]), curve(3, [.26, .66], [.48, .58], [.7, .72], [.82, .62]), line(4, [.72, .61], [.78, .42])],
  },
  {
    slug: "rainy-umbrella", stage: 3, order: 5, mode: "observe", title: "비 오는 우산", topic: "우산", emoji: "☂️", description: "둥근 덮개와 반복되는 살을 관찰해요.", finalFree: true,
    steps: [
      { instruction: "우산의 큰 곡선을 그어요." }, { instruction: "아래쪽 물결선을 살펴요." },
      { instruction: "가운데 손잡이를 내려 그어요." }, { instruction: "우산 무늬를 골라요.", choices: ["줄무늬", "점무늬"] },
      { instruction: "비의 세기를 골라요.", choices: ["보슬비", "소나기"] }, { instruction: "내 마음대로 빗속 장면을 더해요." },
    ],
    guide: [curve(1, [.18, .48], [.34, .14], [.66, .14], [.82, .48]), curve(2, [.18, .48], [.28, .62], [.36, .38], [.46, .5]), line(3, [.5, .28], [.5, .78]), curve(3, [.5, .78], [.5, .9], [.64, .9], [.64, .8])],
  },
  {
    slug: "playground-watch", stage: 3, order: 6, mode: "observe", title: "놀이터 관찰", topic: "놀이터", emoji: "🛝", description: "미끄럼틀의 높이와 사다리 간격을 살펴요.", finalFree: true,
    steps: [
      { instruction: "높은 기둥 두 개를 그어요." }, { instruction: "기울어진 미끄럼틀을 이어요." },
      { instruction: "사다리 칸을 반복해요." }, { instruction: "놀이 기구 색을 골라요.", choices: ["한 가지 색", "여러 색"] },
      { instruction: "놀고 있는 친구를 골라요.", choices: ["한 명", "여러 명"] }, { instruction: "내 마음대로 놀이터 사건을 더해요." },
    ],
    guide: [line(1, [.34, .22], [.34, .76]), line(1, [.52, .22], [.52, .76]), line(2, [.52, .3], [.82, .76]), line(3, [.34, .38], [.52, .38]), line(3, [.34, .54], [.52, .54])],
  },
  {
    slug: "fruit-basket", stage: 3, order: 7, mode: "observe", title: "과일 바구니", topic: "과일", emoji: "🧺", description: "겹쳐 있는 과일의 크기와 위치를 살펴요.", finalFree: true,
    steps: [
      { instruction: "넓은 바구니 모양을 그어요." }, { instruction: "큰 과일을 먼저 놓아요." },
      { instruction: "작은 과일을 사이에 놓아요." }, { instruction: "과일 종류를 골라요.", choices: ["사과", "배", "귤"] },
      { instruction: "바구니 무늬를 골라요.", choices: ["격자", "가로줄"] }, { instruction: "내 마음대로 새로운 과일을 더해요." },
    ],
    guide: [curve(1, [.2, .5], [.28, .86], [.72, .86], [.8, .5]), ellipse(2, .42, .42, .13), ellipse(3, .6, .46, .1), line(5, [.28, .58], [.7, .72])],
  },
  {
    slug: "bus-stop", stage: 3, order: 8, mode: "observe", title: "우리 동네 버스 정류장", topic: "버스 정류장", emoji: "🚏", description: "기둥과 표지판, 기다리는 사람을 관찰해요.", finalFree: true,
    steps: [
      { instruction: "긴 기둥을 곧게 세워요." }, { instruction: "위에 표지판을 그어요." },
      { instruction: "의자의 길이를 살펴 그어요." }, { instruction: "기다리는 사람을 골라요.", choices: ["아이", "어른", "가족"] },
      { instruction: "오는 버스 방향을 골라요.", choices: ["왼쪽", "오른쪽"] }, { instruction: "내 마음대로 정류장 이야기를 더해요." },
    ],
    guide: [line(1, [.28, .22], [.28, .82]), rect(2, .18, .18, .22, .16), line(3, [.46, .62], [.8, .62]), line(3, [.5, .62], [.5, .76]), line(3, [.76, .62], [.76, .76])],
  },
  {
    slug: "seaside-lighthouse", stage: 3, order: 9, mode: "observe", title: "바닷가 등대", topic: "등대", emoji: "🚨", description: "위는 좁고 아래는 넓은 등대 모양을 살펴요.", finalFree: true,
    steps: [
      { instruction: "아래가 넓은 탑을 그어요." }, { instruction: "맨 위에 불빛 방을 그어요." },
      { instruction: "줄무늬 간격을 살펴요." }, { instruction: "빛의 방향을 골라요.", choices: ["왼쪽 바다", "오른쪽 바다"] },
      { instruction: "날씨를 골라요.", choices: ["맑은 날", "바람 부는 날"] }, { instruction: "내 마음대로 바닷가 사건을 더해요." },
    ],
    guide: [line(1, [.36, .78], [.44, .3]), line(1, [.64, .78], [.56, .3]), rect(2, .4, .2, .2, .12), line(3, [.4, .48], [.6, .48]), line(3, [.38, .62], [.62, .62])],
  },
  {
    slug: "favorite-sneaker", stage: 3, order: 10, mode: "observe", title: "내 운동화", topic: "운동화", emoji: "👟", description: "신발의 바닥선과 끈 모양을 자세히 봐요.", finalFree: true,
    steps: [
      { instruction: "신발의 긴 바닥선을 그어요." }, { instruction: "뒤꿈치와 발등을 이어요." },
      { instruction: "끈이 교차하는 모습을 그어요." }, { instruction: "신발 무늬를 골라요.", choices: ["번개", "별", "줄무늬"] },
      { instruction: "신발이 갈 곳을 골라요.", choices: ["학교", "공원", "운동장"] }, { instruction: "내 마음대로 신나는 발걸음을 더해요." },
    ],
    guide: [line(1, [.2, .7], [.82, .7]), curve(2, [.22, .68], [.28, .34], [.48, .36], [.58, .56]), curve(2, [.58, .56], [.66, .64], [.76, .58], [.82, .7]), line(3, [.42, .46], [.58, .58]), line(3, [.5, .44], [.64, .55])],
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
