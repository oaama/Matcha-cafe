'use client';

import { Amiri, Noto_Naskh_Arabic } from 'next/font/google';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BaristaRecipe, FoundationPage } from '@/lib/barista-catalog';
import type { CategoryGuide } from '@/lib/barista-guides';

const amiri = Amiri({ subsets: ['arabic', 'latin'], weight: ['400', '700'], display: 'swap', variable: '--font-amiri' });
const naskh = Noto_Naskh_Arabic({ subsets: ['arabic', 'latin'], weight: ['400', '500', '700'], display: 'swap' });

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

const ink = '#1f1209';
const gold = '#9a6b2f';

function Ornament() {
  return <div aria-hidden="true" className="my-3 flex items-center justify-center gap-3 text-[#9a6b2f]"><span className="h-px w-16 bg-gradient-to-l from-[#9a6b2f] to-transparent" /><span>❦</span><span className="h-px w-16 bg-gradient-to-r from-[#9a6b2f] to-transparent" /></div>;
}

function Stage({ image, name }: { image?: string; name: string }) {
  return (
    <div className="relative mx-auto flex h-[300px] w-full max-w-[340px] items-end justify-center">
      <div aria-hidden="true" className="absolute bottom-1 left-1/2 h-5 w-[58%] -translate-x-1/2 rounded-[50%] bg-[#2a1a0c]/45 blur-md" />
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt={name} draggable={false} className="relative mb-3 max-h-[280px] w-auto max-w-full select-none object-contain [filter:drop-shadow(0_6px_5px_rgba(42,26,12,.28))]" />
      ) : (
        <span className="relative mb-6 text-8xl">☕</span>
      )}
    </div>
  );
}

function ProductLeaf({ page }: { page: BookPage }) {
  const r = page.recipe;
  return (
    <div className="space-y-5">
      <header className="text-center">
        <p className="text-base tracking-wide" style={{ color: gold }}>{page.category}</p>
        <h1 className="mt-1 text-3xl font-bold leading-tight" style={{ color: ink }}>{page.ar}</h1>
        <p dir="ltr" className="text-base italic text-[#5e4224]">{page.en}</p>
        <Ornament />
      </header>
      <Stage image={page.image} name={page.ar} />
      <div className="grid grid-cols-3 gap-2 text-center text-[17px]">
        {[['الكأس', r.glass], ['الوقت', r.time], ['الحرارة', r.temp]].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-[#d9c49b] bg-[#fbf3e1] px-1.5 py-2 shadow-sm">
            <p style={{ color: gold }} className="text-sm">{label}</p>
            <p className="mt-0.5 font-bold leading-5" style={{ color: ink }}>{value}</p>
          </div>
        ))}
      </div>
      {r.note ? <p className="rounded-xl border border-dashed border-[#c9a96a] bg-[#fff8e6] px-3 py-2 text-base leading-7" style={{ color: ink }}>{r.note}</p> : null}

      <section>
        <h2 className="mb-2 border-b-2 border-[#d9c49b] pb-1 text-2xl font-bold" style={{ color: ink }}>المقادير</h2>
        <ul className="divide-y divide-[#e8d9b6] rounded-xl border border-[#e0cfa6] bg-[#fffaf0]">
          {r.ingredients.map(([name, qty]) => (
            <li key={name} className="flex items-start justify-between gap-3 px-3 py-2 text-[17px] leading-7">
              <span style={{ color: ink }}>{name}</span>
              <span dir="auto" className="shrink-0 text-end font-bold" style={{ color: gold }}>{qty}</span>
            </li>
          ))}
        </ul>
      </section>

      {page.guide ? (
        <section>
          <h2 className="mb-2 border-b-2 border-[#d9c49b] pb-1 text-2xl font-bold" style={{ color: ink }}>قبل ما تبدأ</h2>
          <ul className="space-y-1.5 text-[17px] leading-8" style={{ color: ink }}>
            {page.guide.prep.map((item) => <li key={item} className="flex gap-2"><span style={{ color: gold }}>☐</span><span>{item}</span></li>)}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="mb-2 border-b-2 border-[#d9c49b] pb-1 text-2xl font-bold" style={{ color: ink }}>طريقة التحضير خطوة بخطوة</h2>
        <ol className="space-y-3">
          {r.steps.map((step, index) => (
            <li key={step} className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#6b4a2e] text-sm font-bold text-[#fff5dc] shadow-md">{index + 1}</span>
              <p className="pt-0.5 text-[18px] leading-9" style={{ color: ink }}>{step}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-2xl border border-[#c9a96a] bg-gradient-to-b from-[#fff4d6] to-[#f8e7bd] p-4 shadow-inner">
        <h2 className="mb-2 text-xl font-bold" style={{ color: ink }}>نصايح تفرّق</h2>
        <ul className="space-y-2 text-[17px] leading-8" style={{ color: ink }}>
          {r.tips.map((tip) => <li key={tip} className="flex gap-2"><span style={{ color: gold }}>•</span><span>{tip}</span></li>)}
        </ul>
      </section>

      {page.guide ? (
        <div className="grid gap-3">
          <section className="rounded-2xl border border-[#d8b0a5] bg-[#fff1ee] p-4">
            <h2 className="mb-1.5 text-xl font-bold text-[#7a2e22]">غلطات بتحصل كتير</h2>
            <ul className="space-y-1.5 text-[17px] leading-8 text-[#5a2a22]">{page.guide.mistakes.map((m) => <li key={m} className="flex gap-2"><span>×</span><span>{m}</span></li>)}</ul>
          </section>
          <section className="rounded-2xl border border-[#b8c79a] bg-[#f1f6e4] p-4">
            <h2 className="mb-1.5 text-xl font-bold text-[#3f5a1d]">إزاي تعرف إنه مظبوط</h2>
            <p className="text-[17px] leading-8 text-[#34481a]">{page.guide.perfect}</p>
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
        <p className="max-w-xs text-lg leading-8" style={{ color: ink }}>كل اللي محتاجه عشان تحضّر أي صنف في المنيو: المقادير بالجرام، والخطوات واحدة واحدة، ونصايح تخلّي الطعم زي بعضه كل مرة.</p>
        <p className="mt-2 text-sm text-[#5e4224]">اسحب أو دوس «التالي» عشان تقلب الصفحة</p>
      </div>
    );
  }
  if (leaf.kind === 'toc') {
    return (
      <div>
        <h1 className="text-center text-3xl font-bold" style={{ color: ink }}>الفهرس</h1>
        <Ornament />
        <p className="mb-3 text-center text-sm text-[#5e4224]">الكلمات والأساسيات الأول، وبعدها الأصناف حسب القسم</p>
        <div className="mb-4 rounded-2xl border border-[#d9c49b] bg-[#fffaf0] p-3">
          <p className="mb-1 font-bold" style={{ color: ink }}>أساسيات</p>
          <div className="flex flex-wrap gap-2">
            {foundations.map((f, i) => <button key={f.id} type="button" onClick={() => go(2 + i)} className="rounded-full border border-[#d9c49b] bg-[#f6ead0] px-3 py-1.5 text-sm" style={{ color: ink }}>{f.title}</button>)}
          </div>
        </div>
        {categories.map((c) => (
          <div key={c.id} className="mb-2">
            <button type="button" onClick={() => go(-1 - categories.findIndex((x) => x.id === c.id))} className="flex w-full items-center justify-between rounded-xl border border-[#d9c49b] bg-[#fffaf0] px-4 py-3 text-start text-xl font-bold shadow-sm active:scale-[.99]" style={{ color: ink }}>
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
          <h1 className="text-3xl font-bold" style={{ color: ink }}>{leaf.page.title}</h1>
          <Ornament />
        </header>
        {leaf.page.points.map(([title, text]) => (
          <section key={title} className="rounded-2xl border border-[#e0cfa6] bg-[#fffaf0] p-4 shadow-sm">
            <h2 className="mb-1 text-xl font-bold" style={{ color: gold }}>{title}</h2>
            <p className="text-[18px] leading-9" style={{ color: ink }}>{text}</p>
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
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const audio = useRef<AudioContext | null>(null);
  const touch = useRef<number | null>(null);
  const turnTimer = useRef<number | null>(null);

  const flipSound = useCallback(() => {
    if (mutedRef.current) return;
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = audio.current ?? (audio.current = new AC());
      if (ctx.state === 'suspended') void ctx.resume();
      const now = ctx.currentTime;
      const len = Math.floor(ctx.sampleRate * 0.42);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const k = i / len;
        const rustle = 0.55 + 0.45 * Math.sin(k * 38) * Math.sin(k * 11);
        data[i] = (Math.random() * 2 - 1) * rustle * Math.pow(1 - k, 1.4);
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.Q.value = 0.9;
      band.frequency.setValueAtTime(1400, now);
      band.frequency.exponentialRampToValueAtTime(5200, now + 0.3);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.7, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
      src.connect(band).connect(gain).connect(ctx.destination);
      src.start(now);
    } catch { /* sound is optional */ }
  }, []);

  const goTo = useCallback((next: number) => {
    const target = Math.max(0, Math.min(leaves.length - 1, next));
    if (target === index) return;
    flipSound();
    setTurn({ from: index, dir: target > index ? 1 : -1 });
    setIndex(target);
    if (turnTimer.current) window.clearTimeout(turnTimer.current);
    turnTimer.current = window.setTimeout(() => setTurn(null), 850);
    window.scrollTo({ top: 0 });
  }, [flipSound, index, leaves.length]);

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
  const baseLeaf = turn && turn.dir === -1 ? leaves[turn.from] : leaf;
  const flyLeaf = turn ? (turn.dir === 1 ? leaves[turn.from] : leaf) : null;
  const pageNo = (n: number) => n + 1;

  const pageFrame = (content: Leaf, n: number, interactive: boolean) => (
    <>
      <div className="mb-4 flex items-center justify-between border-b border-[#c9a96a]/60 pb-1.5 text-[13px] tracking-[0.18em] text-[#8a5f28]">
        <span>MATCHA CAFÉ</span>
        <span>كتالوج الباريستا</span>
      </div>
      <LeafView leaf={content} categories={categories} go={interactive ? jumpToCategory : () => {}} foundations={foundations} />
      <div className="mt-8 flex items-center justify-center gap-3 text-[15px] text-[#8a5f28]">
        <span className="h-px w-10 bg-[#c9a96a]/70" /><span>{pageNo(n)}</span><span className="h-px w-10 bg-[#c9a96a]/70" />
      </div>
    </>
  );

  return (
    <main
      dir="rtl"
      className={`${amiri.variable} ${naskh.className} book min-h-dvh overflow-x-hidden bg-[radial-gradient(ellipse_at_top,#6b4a2e_0%,#3b2a1a_60%,#25190e_100%)] px-2 pb-24 pt-3 sm:px-6`}
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touch.current === null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        touch.current = null;
        if (Math.abs(dx) < 70) return;
        goTo(dx < 0 ? index + 1 : index - 1);
      }}
    >
      <div className="mx-auto max-w-xl">
        <div className="mb-2 flex items-center justify-between px-1 text-[15px] text-[#e9d6a8]">
          <a href="/" className="rounded-full bg-white/10 px-3 py-1 hover:bg-white/20">المنيو</a>
          <span>{label}</span>
          <span className="flex items-center gap-2">
            <button type="button" aria-label={muted ? 'تشغيل صوت التقليب' : 'كتم صوت التقليب'} onClick={() => { mutedRef.current = !muted; setMuted(!muted); }} className="rounded-full bg-white/10 px-3 py-1 hover:bg-white/20"><svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />{muted ? <path d="M17 9l5 6M22 9l-5 6" /> : <path d="M16 8.5a5 5 0 010 7M18.5 6a8.5 8.5 0 010 12" />}</svg></button>
            <a href="/dashboard/cashier" className="rounded-full bg-white/10 px-3 py-1 hover:bg-white/20">الداشبورد</a>
          </span>
        </div>
        <div className="relative [perspective:1500px]">
          <div aria-hidden="true" className="absolute -bottom-3 inset-x-4 h-5 rounded-b-3xl bg-[#1d1309] opacity-75 blur-md" />
          <div aria-hidden="true" className="absolute inset-x-2 -bottom-1.5 h-3 rounded-b-2xl border border-[#c9a96a]/70 bg-[#efe0bd]" />
          <div aria-hidden="true" className="absolute inset-x-1 -bottom-[3px] h-3 rounded-b-2xl border border-[#c9a96a]/70 bg-[#f6e9c8]" />
          <div aria-hidden="true" className="absolute inset-y-2 -right-1.5 w-3 rounded-r-lg bg-gradient-to-l from-[#4a2f15] to-[#7a5128]" />
          <div className="paper relative overflow-hidden rounded-[1.2rem] border border-[#c9a96a] px-5 pb-8 pt-5 shadow-[0_30px_60px_-20px_rgba(0,0,0,.8),inset_-18px_0_26px_-18px_rgba(90,55,20,.55),inset_10px_0_18px_-14px_rgba(90,55,20,.25)] sm:px-8">
            {pageFrame(baseLeaf, turn && turn.dir === -1 ? turn.from : index, true)}
            {turn ? <div aria-hidden="true" className={`pointer-events-none absolute inset-0 ${turn.dir === 1 ? 'turn-cast-next' : 'turn-cast-prev'}`} /> : null}
          </div>
          {turn && flyLeaf ? (
            <div key={`${turn.from}-${turn.dir}-${index}`} aria-hidden="true" className={`turn-leaf absolute inset-0 ${turn.dir === 1 ? 'turn-leaf-next' : 'turn-leaf-prev'}`}>
              <div className="turn-face paper overflow-hidden rounded-[1.2rem] border border-[#c9a96a] px-5 pb-8 pt-5 sm:px-8">
                {pageFrame(flyLeaf, turn.dir === 1 ? turn.from : index, false)}
                <div className="turn-shade pointer-events-none absolute inset-0" />
              </div>
              <div className="turn-face turn-back paper rounded-[1.2rem] border border-[#c9a96a]" />
            </div>
          ) : null}
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
