import { JoinClient } from "@/app/components/JoinClient";

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const rawCode = (await searchParams).code ?? "";
  const sanitizedCode = /^\d{4}$/.test(rawCode) ? rawCode : "";
  return <JoinClient initialEntry={sanitizedCode} isQrEntry={false} />;
}
