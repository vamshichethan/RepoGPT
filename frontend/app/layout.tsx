import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { TooltipProvider } from '@/components/ui/tooltip';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'RepoGPT — Understand Any GitHub Repository in Minutes',
  description:
    'AI-powered repository understanding platform. Clone, analyze, and chat with any GitHub codebase using GPT-4o.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark h-full">
      <body
        className={`${inter.variable} ${inter.className} bg-[#0a0a0f] text-white min-h-screen antialiased`}
      >
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
