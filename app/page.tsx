import CustomerOrdering from '@/components/customer-ordering';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://matcha-cafe-two.vercel.app';

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'CafeOrCoffeeShop',
      '@id': `${siteUrl}/#business`,
      name: 'Matcha Café',
      alternateName: 'ماتشا كافيه',
      url: siteUrl,
      logo: `${siteUrl}/matcha-logo.png`,
      image: `${siteUrl}/matcha-logo.png`,
      telephone: '+201036618656',
      servesCuisine: ['Coffee', 'Matcha', 'Desserts'],
      hasMenu: `${siteUrl}/#menu`,
      sameAs: ['https://maps.app.goo.gl/jYKaTj3xof2xcSoo6'],
    },
    {
      '@type': 'WebSite',
      '@id': `${siteUrl}/#website`,
      url: siteUrl,
      name: 'Matcha Café',
      inLanguage: 'ar',
      publisher: { '@id': `${siteUrl}/#business` },
    },
  ],
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <CustomerOrdering />
    </>
  );
}
