import Link from 'next/link';

export const metadata = {
  title: 'الصفحة مش موجودة',
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-[1.5rem] border border-[#E5E3B2] bg-white p-8 text-center shadow-[0_8px_24px_rgba(44,43,35,.045)]">
        <p className="brand-name text-xs tracking-[.14em] text-[#705331]">MATCHA CAFÉ</p>
        <h1 className="mt-2 text-2xl font-bold text-[#232122]">الصفحة دي مش موجودة</h1>
        <p className="mt-2 text-sm text-[#705331]">اللينك اللي فتحته مش شغال، بس المنيو مستنيك.</p>
        <Link
          href="/"
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#354a2c] px-6 py-2.5 text-sm font-bold text-white transition hover:bg-[#2b3e24]"
        >
          افتح المنيو
        </Link>
      </div>
    </main>
  );
}
