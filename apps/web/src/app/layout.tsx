import type {Metadata} from "next";import "./globals.css";
export const metadata:Metadata={title:"Nigeria Security Alerts",description:"Public safety information for communities across Nigeria.",applicationName:"NSA"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en-NG"><body>{children}</body></html>;}
