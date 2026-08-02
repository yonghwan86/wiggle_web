import { CURRICULUM_STAGES } from "@/lib/lesson-content";
import { Logo } from "./Logo";

export function ActivityChooser() {
  return <main className="app-shell activity-chooser-page">
    <header className="app-header"><Logo /><a className="small-button" href="/student">← 처음 화면</a></header>
    <section className="activity-chooser-hero"><p className="eyebrow">내가 고르는 그림 여행</p><h1>어떤 활동을 해 볼까?</h1><p>순서는 추천이에요. 원하는 활동부터 시작해도 좋아요.</p></section>
    <div className="activity-stage-list">{CURRICULUM_STAGES.map((stage) => <a className={`activity-stage-card stage-${stage.stage}`} href={stage.path} key={stage.stage}><span aria-hidden="true">{stage.emoji}</span><div><small>{stage.stage}단계 · 언제든 시작</small><h2>{stage.title}</h2><p>{stage.description}</p></div><b>활동 보기 →</b></a>)}</div>
  </main>;
}
