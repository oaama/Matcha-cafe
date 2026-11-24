import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Matcha Café | ماتشا كافيه',
    short_name: 'Matcha Café',
    description: 'منيو Matcha Café للطلب بسهولة من الكافيه أو تيك أواي أو ديليفري.',
    lang: 'ar',
    dir: 'rtl',
    start_url: '/',
    display: 'standalone',
    background_color: '#FCF5ED',
    theme_color: '#354a2c',
    icons: [
      {
        src: '/matcha-logo.png',
        sizes: '840x840',
        type: 'image/png',
      },
    ],
  };
}
