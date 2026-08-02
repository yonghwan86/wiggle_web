"use client";

import { useEffect, useRef } from "react";
import type { GuideMark, Lesson } from "@/lib/lesson-content";

function traceMark(context: CanvasRenderingContext2D, mark: GuideMark, size: number) {
  context.beginPath();
  if (mark.kind === "ellipse") {
    context.ellipse(mark.x * size, mark.y * size, mark.rx * size, mark.ry * size, 0, 0, Math.PI * 2);
  } else if (mark.kind === "rect") {
    context.rect(mark.x * size, mark.y * size, mark.width * size, mark.height * size);
  } else if (mark.kind === "curve") {
    const [start, first, second, end] = mark.points;
    context.moveTo(start[0] * size, start[1] * size);
    context.bezierCurveTo(first[0] * size, first[1] * size, second[0] * size, second[1] * size, end[0] * size, end[1] * size);
  } else {
    const [start, ...rest] = mark.points;
    context.moveTo(start[0] * size, start[1] * size);
    for (const point of rest) context.lineTo(point[0] * size, point[1] * size);
  }
}

export function LessonIllustration({ lesson, currentStep, className = "" }: { lesson: Lesson; currentStep?: number; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const size = 480;
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, size, size);
    const gradient = context.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, lesson.mode === "observe" ? "#fffdf4" : "#f7fdff");
    gradient.addColorStop(1, lesson.mode === "observe" ? "#f4f0df" : "#eaf8ff");
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    context.lineCap = "round";
    context.lineJoin = "round";

    for (const mark of lesson.guide) {
      const highlighted = currentStep !== undefined && mark.step === currentStep + 1;
      const future = currentStep !== undefined && mark.step > currentStep + 1;
      context.strokeStyle = highlighted ? "#098bb8" : future ? "rgba(27,58,87,.2)" : "#1b3a57";
      context.lineWidth = highlighted ? 10 : 7;
      traceMark(context, mark, size);
      context.stroke();
    }
  }, [currentStep, lesson]);

  return <canvas ref={canvasRef} className={`lesson-illustration ${className}`.trim()} aria-label={`${lesson.title} 전체 참고 그림`} />;
}
