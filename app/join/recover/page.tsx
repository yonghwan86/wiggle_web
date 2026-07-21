import { JoinClient } from "@/app/components/JoinClient";
export default async function RecoverPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) { return <JoinClient recoveryToken={(await searchParams).token ?? ""} />; }
