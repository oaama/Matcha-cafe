'use client';

import { Amiri } from 'next/font/google';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BaristaRecipe, FoundationPage } from '@/lib/barista-catalog';
import type { CategoryGuide } from '@/lib/barista-guides';

const amiri = Amiri({ subsets: ['arabic', 'latin'], weight: ['400', '700'], display: 'swap' });

export type BookPage = {
  kind: 'product';
  id: string;
  category: string;
  categoryId: string;
  ar: string;
  en: string;
  image?: string;
  recipe: BaristaRecipe;
  guide?: CategoryGuide;
};

type Leaf =
  | { kind: 'cover' }
  | { kind: 'toc' }
  | { kind: 'foundation'; page: FoundationPage }
  | BookPage;

const ink = '#3b2a1a';
const gold = '#9a6b2f';

function Ornament() {
  return <div aria-hidden="true" className="my-3 flex items-center justify-center gap-3 text-[#9a6b2f]"><span className="h-px w-16 bg-gradient-to-l from-[#9a6b2f] to-transparent" /><span>❦</span><span className="h-px w-16 bg-gradient-to-r from-[#9a6b2f] to-transparent" /></div>;
}

function Stage({ image, name }: { image?: string; name: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (x: number, y: number) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (x - rect.left) / rect.width - 0.5;
    const py = (y - rect.top) / rect.height - 0.5;
    el.style.setProperty('--ry', `${px * 28}deg`);
    el.style.setProperty('--rx', `${-py * 20}deg`);
    el.style.setProperty('--paused', 'paused');
  };
  const reset = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--ry', '0deg');
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--paused', 'running');
  };
  return (
    <div
      ref={ref}
      className="relative mx-auto aspect-square w-full max-w-[340px] [perspective:900px]"
      onPointerMove={(e) => move(e.clientX, e.clientY)}
      onPointerLeave={reset}
      onPointerUp={reset}
      style={{ touchAction: 'pan-y' }}
    >
      <div className="absolute inset-x-6 bottom-2 h-6 rounded-[50%] bg-[#2a1a0c]/35 blur-xl" />
      <div className="book-float absolute inset-0 [transform-style:preserve-3d]" style={{ transform: 'rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg))', transition: 'transform .15s ease-out', animationPlayState: 'var(--paused, running)' as never }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {image ? <img src={image} alt={name} draggable={false} className="h-full w-full rounded-[1.6rem] object-cover shadow-[0_26px_44px_-14px_rgba(42,26,12,.65),0_6px_14px_rgba(42,26,12,.35)] ring-4 ring-[#fffaf0]" style={{ transform: 'translateZ(40px)' }} /> : <div className="flex h-full w-full items-center justify-center rounded-[1.6rem] bg-[#efe1c3] text-6xl shadow-xl">☕</div>}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[1.6rem] bg-gradient-to-tr from-white/25 via-transparent to-black/10" style={{ transform: 'translateZ(41px)' }} />
      </div>
    </div>
  );
}

function ProductLeaf({ page }: { page: BookPage }) {
  const r = page.recipe;
  return (
    <div className="space-y-5">
      <header className="text-center">
        <p className="text-sm tracking-wide" style={{ color: gold }}>{page.category}</p>
        <h1 className="mt-1 text-3xl font-bold leading-tight" style={{ color: ink }}>{page.ar}</h1>
        <p dir="ltr" className="text-base italic text-[#7a5b3a]">{page.en}</p>
        <Ornament />
      </header>
      <Stage image={page.image} name={page.ar} />
      <div className="grid grid-cols-3 gap-2 text-center text-[13px]">
        {[['الكأس', r.glass], ['الوقت', r.time], ['الحرارة', r.temp]].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-[#d9c49b] bg-[#fbf3e1] px-1.5 py-2 shadow-sm">
            <p style={{ color: gold }} className="text-xs">{label}</p>
            <p className="mt-0.5 font-bold leading-5" style={{ color: ink }}>{value}</p>
          </div>
        ))}
      </div>
      {r.note ? <p className="rounded-xl border border-dashed border-[#c9a96a] bg-[#fff8e6] px-3 py-2 text-sm leading-6" style={{ color: ink }}>{r.note}</p> : null}

      <section>
        <h2 className="mb-2 border-b-2 border-[#d9c49b] pb-1 text-xl font-bold" style={{ color: ink }}>المقادير</h2>
        <ul className="divide-y divide-[#e8d9b6] rounded-xl border border-[#e0cfa6] bg-[#fffaf0]">
          {r.ingredients.map(([name, qty]) => (
            <li key={name} className="flex items-start justify-between gap-3 px-3 py-2 text-[15px] leading-6">
              <span style={{ color: ink }}>{name}</span>
              <span dir="auto" className="shrink-0 text-end font-bold" style={{ color: gold }}>{qty}</span>
            </li>
          ))}
        </ul>
      </section>

      {page.guide ? (
        <section>
          <h2 className="mb-2 border-b-2 border-[#d9c49b] pb-1 text-xl font-bold" style={{ color: ink }}>قبل ما تبدأ</h2>
          <ul className="space-y-1.5 text-[15px] leading-7" style={{ color: ink }}>
            {page.guide.prep.map((item) => <li key={item} className="flex gap-2"><span style={{ color: gold }}>☐</span><span>{item}</span></li>)}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="mb-2 border-b-2 border-[#d9c49b] pb-1 text-xl font-bold" style={{ color: ink }}>طريقة التحضير خطوة بخطوة</h2>
        <ol className="space-y-3">
          {r.steps.map((step, index) => (
            <li key={step} className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#6b4a2e] text-sm font-bold text-[#fff5dc] shadow-md">{index + 1}</span>
              <p className="pt-0.5 text-[16px] leading-8" style={{ color: ink }}>{step}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-2xl border border-[#c9a96a] bg-gradient-to-b from-[#fff4d6] to-[#f8e7bd] p-4 shadow-inner">
        <h2 className="mb-2 text-lg font-bold" style={{ color: ink }}>نصائح الاحتراف</h2>
        <ul className="space-y-2 text-[15px] leading-7" style={{ color: ink }}>
          {r.tips.map((tip) => <li key={tip} className="flex gap-2"><span style={{ color: gold }}>✦</span><span>{tip}</span></li>)}
        </ul>
      </section>

      {page.guide ? (
        <div className="grid gap-3">
          <section className="rounded-2xl border border-[#d8b0a5] bg-[#fff1ee] p-4">
            <h2 className="mb-1.5 text-lg font-bold text-[#7a2e22]">أخطاء شائعة</h2>
            <ul className="space-y-1.5 text-[15px] leading-7 text-[#5a2a22]">{page.guide.mistakes.map((m) => <li key={m} className="flex gap-2"><span>✕</span><span>{m}</span></li>)}</ul>
          </section>
          <section className="rounded-2xl border border-[#b8c79a] bg-[#f1f6e4] p-4">
            <h2 className="mb-1.5 text-lg font-bold text-[#3f5a1d]">إزاي تعرف إنه مظبوط</h2>
            <p className="text-[15px] leading-7 text-[#34481a]">{page.guide.perfect}</p>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function LeafView({ leaf, categories, go, foundations }: { leaf: Leaf; categories: Array<{ id: string; ar: string }>; go: (to: number) => void; foundations: FoundationPage[] }) {
  if (leaf.kind === 'cover') {
    return (
      <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-4 text-center">
        <div className="rounded-full border-4 border-double border-[#9a6b2f] p-3 shadow-[0_10px_30px_rgba(42,26,12,.35)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/matcha-logo.png" alt="Matcha Café" className="h-32 w-32 rounded-full object-cover" />
        </div>
        <p className="text-sm tracking-[0.3em]" style={{ color: gold }}>MATCHA CAFÉ</p>
        <h1 className="text-5xl font-bold leading-snug" style={{ color: ink }}>كتالوج الباريستا</h1>
        <Ornament />
        <p className="max-w-xs text-lg leading-8" style={{ color: ink }}>المرجع الكامل لتحضير كل صنف في المنيو: مقادير بالجرام، خطوات واضحة، ونصائح تضمن نفس الجودة في كل مرة.</p>
        <p className="mt-2 text-sm text-[#7a5b3a]">اسحب أو اضغط «التالي» لتقليب الصفحة</p>
      </div>
    );
  }
  if (leaf.kind === 'toc') {
    return (
      <div>
        <h1 className="text-center text-3xl font-bold" style={{ color: ink }}>الفهرس</h1>
        <Ornament />
        <p className="mb-3 text-center text-sm text-[#7a5b3a]">أساسيات المهنة أولًا، ثم الأصناف حسب القسم</p>
        <div className="mb-4 rounded-2xl border border-[#d9c49b] bg-[#fffaf0] p-3">
          <p className="mb-1 font-bold" style={{ color: ink }}>أساسيات</p>
          <div className="flex flex-wrap gap-2">
            {foundations.map((f, i) => <button key={f.id} type="button" onClick={() => go(2 + i)} className="rounded-full border border-[#d9c49b] bg-[#f6ead0] px-3 py-1.5 text-sm" style={{ color: ink }}>{f.icon} {f.title}</button>)}
          </div>
        </div>
        {categories.map((c) => (
          <div key={c.id} className="mb-2">
            <button type="button" onClick={() => go(-1 - categories.findIndex((x) => x.id === c.id))} className="flex w-full items-center justify-between rounded-xl border border-[#d9c49b] bg-[#fffaf0] px-4 py-3 text-start text-lg font-bold shadow-sm active:scale-[.99]" style={{ color: ink }}>
              <span>{c.ar}</span><span className="text-[#9a6b2f]">‹</span>
            </button>
          </div>
        ))}
      </div>
    );
  }
  if (leaf.kind === 'foundation') {
    return (
      <div className="space-y-4">
        <header className="text-center">
          <p className="text-5xl">{leaf.page.icon}</p>
          <h1 className="mt-2 text-3xl font-bold" style={{ color: ink }}>{leaf.page.title}</h1>
          <Ornament />
        </header>
        {leaf.page.points.map(([title, text]) => (
          <section key={title} className="rounded-2xl border border-[#e0cfa6] bg-[#fffaf0] p-4 shadow-sm">
            <h2 className="mb-1 text-lg font-bold" style={{ color: gold }}>{title}</h2>
            <p className="text-[16px] leading-8" style={{ color: ink }}>{text}</p>
          </section>
        ))}
      </div>
    );
  }
  return <ProductLeaf page={leaf} />;
}

export default function BaristaBook({ pages, foundations, categories }: { pages: BookPage[]; foundations: FoundationPage[]; categories: Array<{ id: string; ar: string }> }) {
  const leaves = useMemo<Leaf[]>(() => [{ kind: 'cover' }, { kind: 'toc' }, ...foundations.map((page) => ({ kind: 'foundation' as const, page })), ...pages], [pages, foundations]);
  const [index, setIndex] = useState(0);
  const [turn, setTurn] = useState<{ from: number; dir: 1 | -1 } | null>(null);
  const touch = useRef<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const goTo = useCallback((next: number) => {
    setIndex((current) => {
      const target = Math.max(0, Math.min(leaves.length - 1, next));
      if (target === current) return current;
      setTurn({ from: current, dir: target > current ? 1 : -1 });
      window.setTimeout(() => setTurn(null), 650);
      return target;
    });
    scroller.current?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  }, [leaves.length]);

  const jumpToCategory = useCallback((encoded: number) => {
    if (encoded >= 0) return goTo(encoded);
    const category = categories[-1 - encoded];
    const first = leaves.findIndex((leaf) => leaf.kind === 'product' && leaf.categoryId === category.id);
    if (first >= 0) goTo(first);
  }, [categories, goTo, leaves]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') goTo(index + 1);
      if (event.key === 'ArrowRight') goTo(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goTo, index]);

  const leaf = leaves[index];
  const label = leaf.kind === 'product' ? leaf.category : leaf.kind === 'foundation' ? 'أساسيات' : leaf.kind === 'toc' ? 'الفهرس' : '';
  const nextImage = leaves[index + 1]?.kind === 'product' ? (leaves[index + 1] as BookPage).image : undefined;

  return (
    <main
      dir="rtl"
      className={`${amiri.className} min-h-dvh bg-[radial-gradient(ellipse_at_top,#6b4a2e_0%,#3b2a1a_60%,#25190e_100%)] px-2 pb-24 pt-3 sm:px-6`}
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touch.current === null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        touch.current = null;
        if (Math.abs(dx) < 70) return;
        goTo(dx < 0 ? index + 1 : index - 1);
      }}
    >
      <div className="mx-auto max-w-xl [perspective:1800px]">
        <div className="mb-2 flex items-center justify-between px-1 text-sm text-[#e9d6a8]">
          <a href="/" className="rounded-full bg-white/10 px-3 py-1 hover:bg-white/20">المنيو</a>
          <span>{label}</span>
          <a href="/dashboard/cashier" className="rounded-full bg-white/10 px-3 py-1 hover:bg-white/20">الداشبورد</a>
        </div>
        <div className="relative">
          <div aria-hidden="true" className="absolute -bottom-2 inset-x-3 h-4 rounded-b-3xl bg-[#1d1309] opacity-70 blur-md" />
          <div aria-hidden="true" className="absolute inset-y-2 -right-1.5 w-3 rounded-r-lg bg-gradient-to-l from-[#4a2f15] to-[#7a5128]" />
          <div ref={scroller} className="paper relative overflow-hidden rounded-[1.4rem] border border-[#c9a96a] px-4 pb-8 pt-6 shadow-[0_30px_60px_-20px_rgba(0,0,0,.8),inset_-18px_0_26px_-18px_rgba(90,55,20,.55)] sm:px-8">
            <LeafView leaf={turn && turn.dir === -1 ? leaves[turn.from] : leaf} categories={categories} go={jumpToCategory} foundations={foundations} />
            <p className="mt-6 text-center text-sm text-[#9a6b2f]">— {index + 1} —</p>
            {turn ? (
              <div className={`paper absolute inset-0 z-10 overflow-hidden rounded-[1.4rem] px-4 pb-8 pt-6 sm:px-8 ${turn.dir === 1 ? 'turn-next' : 'turn-prev'}`} aria-hidden="true">
                <LeafView leaf={turn.dir === 1 ? leaves[turn.from] : leaf} categories={categories} go={() => {}} foundations={foundations} />
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {nextImage ? <link rel="preload" as="image" href={nextImage} /> : null}
      <nav aria-label="تقليب الصفحات" className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 bg-gradient-to-t from-[#25190e] via-[#25190e]/90 to-transparent px-4 pb-4 pt-6">
        <button type="button" onClick={() => goTo(index - 1)} disabled={index === 0} className="min-h-12 flex-1 rounded-2xl bg-[#e9d6a8] px-4 text-lg font-bold text-[#3b2a1a] shadow-lg disabled:opacity-35 active:scale-95">السابق ›</button>
        <button type="button" onClick={() => goTo(1)} aria-label="الفهرس" className="min-h-12 rounded-2xl bg-white/15 px-4 text-lg text-[#e9d6a8]">☰</button>
        <button type="button" onClick={() => goTo(index + 1)} disabled={index === leaves.length - 1} className="min-h-12 flex-1 rounded-2xl bg-[#9a6b2f] px-4 text-lg font-bold text-white shadow-lg disabled:opacity-35 active:scale-95">‹ التالي</button>
      </nav>
    </main>
  );
}
