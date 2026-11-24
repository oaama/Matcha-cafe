import type { Metadata } from 'next';
import './globals.css';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://matcha-cafe-two.vercel.app';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Matcha Café | منيو ماتشا كافيه وطلبات أونلاين',
    template: '%s | Matcha Café',
  },
  description:
    'منيو Matcha Café الكامل: قهوة، مشروبات ساخنة، ماتشا، ميلك شيك، أعصار فريش وحلويات. اطلب من الكافيه أو تيك أواي أو ديليفري. Browse the full Matcha Café menu and order dine-in, takeaway or delivery.',
  applicationName: 'Matcha Café',
  keywords: [
    'ماتشا كافيه',
    'Matcha Café',
    'منيو ماتشا',
    'قهوة',
    'ماتشا',
    'كافيه',
    'coffee menu',
    'matcha latte',
    'cafe delivery',
  ],
  alternates: {
    canonical: '/',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'Matcha Café',
    title: 'Matcha Café | منيو ماتشا كافيه وطلبات أونلاين',
    description:
      'منيو Matcha Café الكامل: قهوة، ماتشا، مشروبات ساخنة وحلويات. اطلب من الكافيه أو تيك أواي أو ديليفري.',
    locale: 'ar_EG',
    alternateLocale: ['en_US'],
    images: [
      {
        url: '/matcha-logo.png',
        width: 840,
        height: 840,
        alt: 'Matcha Café logo — شعار ماتشا كافيه',
      },
    ],
  },
  twitter: {
    card: 'summary',
    title: 'Matcha Café | منيو ماتشا كافيه وطلبات أونلاين',
    description: 'منيو Matcha Café الكامل واطلب أونلاين — dine-in, takeaway or delivery.',
    images: ['/matcha-logo.png'],
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
  },
  icons: {
    icon: '/matcha-logo.png',
    apple: '/matcha-logo.png',
  },
  manifest: '/manifest.webmanifest',
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
