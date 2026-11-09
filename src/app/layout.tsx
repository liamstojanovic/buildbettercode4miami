import type { Metadata } from "next";
import "@fontsource/cormorant-garamond/400-italic.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Laser Focus | Every record, a way forward",
  description: "Turn scattered nonprofit records into thoughtful follow-ups and reports you can stand behind. A synthetic hackathon demonstration.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
