import { Logo } from "./components/Logo";
import { LandingCodeForm } from "./components/LandingCodeForm";

export default function Home() {
  return (
    <main className="landing landing-centered">
      <nav className="topbar">
        <Logo />
        <a className="button secondary teacher-link" href="/teacher">
          <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" />
          </svg>
          교사 수업 열기
        </a>
      </nav>
      <section className="landing-hero">
        <div className="landing-illustration-wrap">
          <img className="landing-illustration" src="/brand/landing-scene-v2.png" alt="교실에서 함께 그림을 그리는 아이들" />
          <div className="landing-copy">
            <p className="eyebrow landing-eyebrow">AI 그림 학습 · 교실 창작 코칭</p>
            <h1 className="landing-headline"><span>오늘은</span> <strong>어떤 생각을 그려볼까요?</strong></h1>
            <p className="landing-subtitle">함께 그리고, 서로의 생각을 발견하는 교실.</p>
          </div>
          <div className="landing-student-tag">
            <b>학생</b>
            <span>수업 코드로 바로 참여해요</span>
          </div>
          <div className="landing-code-card">
            <h2 className="landing-code-card-title">수업 코드 입력</h2>
            <LandingCodeForm />
          </div>
          <p className="landing-trust-note">학생 이메일 · 실명 없이 안전하게</p>
        </div>
      </section>
    </main>
  );
}
