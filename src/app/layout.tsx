import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "CareerPrep AI", description: "AI resume analysis and mock interview preparation" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
