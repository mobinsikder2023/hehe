import "./globals.css";
import type { Metadata } from "next";
export const metadata:Metadata={title:"Science Bee One-Link Studio",description:"Science Bee editorial poster studio"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="bn"><body>{children}</body></html>}