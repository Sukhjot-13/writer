import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Writer App — Online Writer + Practice",
    template: "%s — Writer App",
  },
  description: "Write paragraphs and Q&A practice content as blocks; convert to styled HTML and A4 PDF.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* M7 round 7: apply the saved dark-mode preference BEFORE first paint
            (the palette vars in globals.css do the rest — no flash of light). */}
        <Script id="theme-init" strategy="beforeInteractive">
          {`try{if(localStorage.getItem("writer-app:theme")==="dark")document.documentElement.classList.add("dark")}catch(e){}`}
        </Script>
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
