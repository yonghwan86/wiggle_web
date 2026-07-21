import { Logo } from "./components/Logo";

export default function Home() {
  return (
    <main className="landing">
      <nav className="topbar"><Logo /><span className="top-note">AI 그림 학습 · 교실 창작 코칭</span></nav>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">설치 없이, 바로 시작하는 그림 수업</p>
          <h1>선을 긋고,<br /><span>생각을 키워요.</span></h1>
          <p className="hero-lead">기초 도형부터 나만의 이야기까지. 아이의 그림을 대신하지 않고, 스스로 다음 선을 찾도록 돕습니다.</p>
          <div className="hero-actions"><a className="button primary large" href="/join">학생으로 입장</a><a className="button secondary large" href="/teacher">교사 수업 열기</a></div>
          <p className="privacy-note">학생 이메일과 실명을 받지 않아요 · 점수와 순위가 없어요</p>
        </div>
        <div className="hero-art" aria-label="도형이 그림으로 자라는 모습">
          <div className="paper-card paper-back"><span>△</span><span>○</span><span>□</span></div>
          <div className="paper-card paper-front"><div className="sun-shape" /><div className="house-shape"><i /><b /></div><div className="ground-line" /><div className="idea-bubble">내 생각을<br />하나 더!</div></div>
        </div>
      </section>
      <section className="promise-grid" aria-label="Wiggle의 약속">
        <article><span>✏️</span><h2>아이가 그려요</h2><p>그리미는 그림을 대신 완성하지 않아요.</p></article>
        <article><span>💬</span><h2>한 번에 하나씩</h2><p>짧은 질문과 바로 그릴 다음 행동을 줘요.</p></article>
        <article><span>🌱</span><h2>과정이 이어져요</h2><p>그림과 아이의 말을 다음 수업까지 기억해요.</p></article>
      </section>
    </main>
  );
}
