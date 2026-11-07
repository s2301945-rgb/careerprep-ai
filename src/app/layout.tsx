import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "CareerPrep — Resume Workspace", description: "Save, organize, rename, and manage your resume files in a private workspace." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
