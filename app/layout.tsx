import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Matcha Café | منيو وطلبات',
    template: '%s | Matcha Café',
  },
  description: 'منيو Matcha Café للطلب بسهولة من الكافيه أو تيك أواي.',
  applicationName: 'Matcha Café',
  icons: {
    icon: '/matcha-logo.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="flex min-h-screen flex-col">
        {children}
        <footer className="mt-auto border-t border-[#E5E3B2] bg-white/70 px-4 py-5 text-center backdrop-blur">
          <p className="brand-name text-[11px] uppercase tracking-[.18em] text-[#6B8136]">Matcha Café</p>
          <p dir="ltr" className="mt-1.5 text-xs font-semibold tracking-wide text-[#705331]">
            Developed by HEXA PLUS
            <span aria-hidden="true" className="mx-1.5 text-[#c9c9bb]">·</span>
            Technical Lead: Eng. Angluos Rezq
          </p>
        </footer>
      </body>
    </html>
  );
}
