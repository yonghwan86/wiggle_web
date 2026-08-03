import type { CSSProperties } from "react";
import type { Lesson } from "@/lib/lesson-content";

const GUIDED_FINISHED_SPRITE = "/lessons/guided-finished-sprite.webp";

export function LessonFinishedIllustration({ lesson, className = "" }: { lesson: Lesson; className?: string }) {
  const column = Math.max(0, Math.min(4, (lesson.order - 1) % 5));
  const row = lesson.order > 5 ? 1 : 0;
  const style = {
    backgroundImage: `url(${GUIDED_FINISHED_SPRITE})`,
    backgroundPosition: `${column * 25}% ${row * 100}%`,
    // The bicycle guide is drawn with the basket and front wheel on the right.
    // Mirror only its finished example so the child sees the same viewpoint.
    transform: lesson.slug === "delivery-bike" ? "scaleX(-1)" : undefined,
  } as CSSProperties;

  return <div
    className={`lesson-finished-illustration ${className}`.trim()}
    role="img"
    aria-label={`${lesson.title} 색칠 완성 예시`}
    style={style}
  />;
}
