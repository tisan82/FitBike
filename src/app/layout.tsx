import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Providers } from "@/app/providers";
import { AppLayout } from "@/components/layout/AppLayout";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "FitBike",
    template: "%s | FitBike",
  },
  description: "내 바이크에 맞는 부품 규격과 Fitment 정보를 확인하세요.",
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html className="h-full antialiased" lang="ko">
      <body className="min-h-full">
        <Providers>
          <AppLayout>{children}</AppLayout>
        </Providers>
      </body>
    </html>
  );
}
