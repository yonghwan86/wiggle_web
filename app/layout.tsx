import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

const title = "Wiggle — 함께 그리며 생각해요";
const description =
  "설치 없이 교실에서 기초 도형부터 자유 창작까지 이어지는 어린이 그림 학습 웹앱";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:5173";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);

  return {
    metadataBase,
    title: { default: title, template: "%s | Wiggle" },
    description,
    icons: {
      icon: "/brand/app_icon.png",
      shortcut: "/brand/app_icon.png",
    },
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: new URL("/og.png", metadataBase), width: 1728, height: 910, alt: "Wiggle Web 교실 그림 학습" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [new URL("/og.png", metadataBase)],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
