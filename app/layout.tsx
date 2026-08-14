import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.PUBLIC_URL ?? "http://localhost:3000"),
  title: {
    default: "하루말 — 친구들과 매일 한 단어",
    template: "%s | 하루말",
  },
  description: "최대 6명의 친구가 각자 문제를 내고, 자음과 모음 단서로 서로의 단어를 맞히는 하루 한 판 게임",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "하루말 — 오늘의 한 단어, 여섯 명의 속도전",
    description: "각자 한 문제씩 내고 친구들의 단어를 자모 단서로 맞혀보세요.",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630 }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#2146d0",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="ko">
      <body>{children}</body>
      <Script
        src="https://t1.kakaocdn.net/kakao_js_sdk/2.8.1/kakao.min.js"
        strategy="afterInteractive"
        crossOrigin="anonymous"
        integrity="sha384-OL+ylM/iuPLtW5U3XcvLSGhE8JzReKDank5InqlHGWPhb4140/yrBw0bg0y7+C9J"
        nonce={nonce}
      />
    </html>
  );
}
