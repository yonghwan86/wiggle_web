import { Suspense } from "react";
import { DrawingStudio } from "@/app/components/DrawingStudio";
export default function DrawPage() { return <Suspense fallback={<main className="drawing-loading">도화지를 펴는 중…</main>}><DrawingStudio /></Suspense>; }
