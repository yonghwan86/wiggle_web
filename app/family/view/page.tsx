import type { Metadata } from "next";
import { FamilyView } from "@/app/components/FamilyView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "가족 성장 기록",
  description: "승인된 작품과 과정 기록을 보는 비공개 가족 화면",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false, noimageindex: true } },
  referrer: "no-referrer",
};

export default function FamilyPage() {
  return <FamilyView />;
}
