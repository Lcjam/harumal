import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.PUBLIC_URL ?? "http://localhost:3000"),
  title: {
    default: "한판 — 가볍게 즐기는 미니게임",
    template: "%s | 한판",
  },
  description: "혼자서도 친구와도 바로 즐길 수 있는 작고 재미있는 게임 모음",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "한판 — 가볍게 즐기는 미니게임",
    description: "잠깐이면 충분한 작고 재미있는 게임들을 만나보세요.",
    type: "website",
    images: [{ url: "/og-hanpan.png", width: 1730, height: 909 }],
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
