import type { Metadata, Viewport } from "next";
import { Familjen_Grotesk, Spline_Sans_Mono } from "next/font/google";
import "@/styles/globals.css";

const familjen = Familjen_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
  variable: "--font-familjen",
});

const spline = Spline_Sans_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-spline",
});

export const metadata: Metadata = {
  title: "KEPT — spending advisor",
  description:
    "Ask before you buy. KEPT applies the spending policy you wrote, holds the purchases that should wait, and counts the money you never spent.",
};

export const viewport: Viewport = {
  themeColor: "#E8E6DF",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${familjen.variable} ${spline.variable}`}>
      <head>
        {/*
          The reveal start states only apply under `.js-reveal`. This adds the
          class before first paint, and only when reduced motion has not been
          requested — so the reduced-motion render and the no-JS render are both
          the finished app rather than a page of invisible blocks.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(!matchMedia('(prefers-reduced-motion: reduce)').matches){document.documentElement.classList.add('js-reveal')}}catch(e){}",
          }}
        />
      </head>
      <body>
        <a href="#main" className="btn sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:m-2">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
