import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "에듀링크 차량 운행 관리",
  description: "학원 차량 운행 정보와 변경 내용을 한눈에 관리합니다.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
