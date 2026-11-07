import Image from 'next/image';

export default function LogoSplash() {
  return (
    <main className="logo-splash" role="status" aria-live="polite" aria-busy="true" aria-label="لحظات ونجهز طلبك">
      <div className="logo-splash__content">
        <div className="logo-splash__mark">
          <Image
            src="/matcha-logo.png"
            alt="Matcha Coffee and Pancakes"
            width={240}
            height={240}
            priority
            className="logo-splash__image"
          />
          <svg className="logo-splash__outline" viewBox="0 0 240 240" aria-hidden="true">
            <circle className="logo-splash__outline-path" cx="120" cy="120" r="115" />
          </svg>
        </div>
        <div className="logo-splash__copy">
          <span className="brand-name">MATCHA CAFÉ</span>
          <span>لحظات ونجهز لك المكان</span>
        </div>
        <div className="logo-splash__progress" aria-hidden="true">
          <span />
        </div>
      </div>
    </main>
  );
}
