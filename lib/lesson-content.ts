export type Lesson = { slug: string; title: string; topic: string; emoji: string; mode: "practice" | "guided"; description: string; steps: string[]; openSteps: number[]; guide: "lines" | "shapes" | "dog" | "bike" | "hanok" };

export const LESSONS: Lesson[] = [
  { slug: "line-play", title: "선이 춤춰요", topic: "직선과 곡선", emoji: "〰️", mode: "practice", description: "곧은 선과 구불구불한 선을 그려요.", guide: "lines", openSteps: [3, 5], steps: ["위에서 아래로 선을 그어요.", "옆으로 긴 선을 그어요.", "구불구불한 선을 그어요.", "좋아하는 선을 골라요.", "선 두 개를 이어 모양을 만들어요.", "내 마음대로 선을 더해요."] },
  { slug: "shape-town", title: "도형 마을", topic: "동그라미·세모·네모", emoji: "🔺", mode: "practice", description: "도형을 이어 새로운 물건을 만들어요.", guide: "shapes", openSteps: [4, 6], steps: ["큰 동그라미를 그어요.", "작은 세모를 그어요.", "네모를 하나 그어요.", "도형 색을 내가 골라요.", "도형 두 개를 이어 봐요.", "무엇이 되었는지 이름 붙여요.", "내 마음대로 하나 더 그려요."] },
  { slug: "friendly-dog", title: "친구 강아지", topic: "강아지", emoji: "🐶", mode: "guided", description: "동그라미에서 귀여운 친구가 태어나요.", guide: "dog", openSteps: [4, 7], steps: ["가운데에 큰 동그라미를 그어요.", "위쪽에 귀 두 개를 그어요.", "눈 두 개를 콕 그어요.", "코 모양은 내가 골라요.", "입에서 짧은 선을 그어요.", "몸과 다리를 이어 그어요.", "어떤 꼬리인지 내가 정해요.", "강아지가 있는 곳을 그어요.", "내 마음대로 이야기를 더해요."] },
  { slug: "delivery-bike", title: "달리는 자전거", topic: "자전거", emoji: "🚲", mode: "guided", description: "동그라미 두 개를 이어 자전거를 만들어요.", guide: "bike", openSteps: [5, 8], steps: ["같은 크기 동그라미 두 개를 그어요.", "두 바퀴 사이를 선으로 이어요.", "가운데에 세모를 만들어요.", "안장과 손잡이를 그어요.", "바구니 모양을 내가 골라요.", "페달을 작은 동그라미로 그어요.", "길을 길게 그어요.", "어디로 가는지 내가 정해요.", "내 마음대로 짐이나 친구를 더해요."] },
  { slug: "hanok-day", title: "한옥의 하루", topic: "한옥", emoji: "🏠", mode: "guided", description: "지붕과 기둥을 보고 오늘의 일을 만들어요.", guide: "hanok", openSteps: [4, 8], steps: ["지붕 중심에 점을 찍어요.", "양쪽으로 지붕 선을 그어요.", "아래에 기둥 두 개를 그어요.", "문 모양은 내가 골라요.", "지붕 끝을 살짝 올려요.", "마당 선을 길게 그어요.", "창문이나 계단을 더해요.", "누가 사는지 내가 정해요.", "오늘 생긴 일을 그어요.", "내 마음대로 하나 더 그려요."] },
];

export function lessonBySlug(slug: string) { return LESSONS.find((lesson) => lesson.slug === slug); }
