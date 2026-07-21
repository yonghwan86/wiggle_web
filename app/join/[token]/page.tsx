import { JoinClient } from "@/app/components/JoinClient";
export default async function JoinTokenPage({ params }: { params: Promise<{ token: string }> }) { return <JoinClient initialEntry={(await params).token} />; }
