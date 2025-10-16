import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

interface RootLayoutProps {
  children: ReactNode;
}

export const metadata: Metadata = {
  title: "Enfield World Builder",
  description:
    "Draft immersive universes, document lore, and organize story bibles with Enfield's elegant writing workspace.",
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
