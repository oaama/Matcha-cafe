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
        <footer className="mt-auto px-4 py-4 text-center text-xs leading-5 text-[#705331]">
          <span dir="ltr" className="inline-block font-semibold tracking-wide text-[#6B8136]">
            <span className="block sm:inline">Developed by HEXA PLUS</span>
            <span aria-hidden="true" className="hidden sm:inline"> · </span>
            <span className="block sm:inline">Technical Lead: Eng. Angluos Rezq</span>
          </span>
        </footer>
      </body>
    </html>
  );
}
