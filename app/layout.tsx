import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Matcha Café | منيو وطلبات',
    template: '%s | Matcha Café',
  },
  description: 'منيو Matcha Café للطلب بسهولة من الكافيه أو تيك أواي.',
  applicationName: 'Matcha Café',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="flex min-h-screen flex-col">
        {children}
        <footer className="mt-auto px-4 py-4 text-center text-xs text-[#888579]">
          تم التطوير بواسطة <span dir="ltr" className="inline-block font-semibold text-[#6b4a2e]">Eng- Anlous Rezq</span>
        </footer>
      </body>
    </html>
  );
}
