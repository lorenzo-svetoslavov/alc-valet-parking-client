// @ts-check
import { defineConfig } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';

import svelte from '@astrojs/svelte';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  output: 'static',

  i18n: {
    locales: ['en', 'nl', 'es'],
    defaultLocale: 'es'
  },

  vite: {
    plugins: [
      tailwindcss()
    ],
    resolve: {
      alias: {
        '@': '/src',
      }
    },
    css: {
      lightningcss: {
        errorRecovery: true
      },
      preprocessorOptions: {
        scss: {
          quietDeps: true,
          silenceDeprecations: ['import']
        }
      }
    },
    optimizeDeps: {
      exclude: [
        '@astrojs/cloudflare',
        '@astrojs/svelte',
        'svelte',
        'astro',
        'astro/actions',
        'astro:actions',
        'astro/content',
        'astro:content'
      ]
    },
    ssr: {
      optimizeDeps: {
        noDiscovery: true,
        exclude: [
          '@astrojs/cloudflare',
          '@astrojs/svelte',
          'svelte',
          'astro',
          'astro/actions',
          'astro:actions',
          'astro/content',
          'astro:content'
        ]
      }
    }
  },

  image: {
    service: { entrypoint: 'astro/assets/services/sharp' }
  },

  adapter: cloudflare({
    // imageService: 'compile' solucionar el warning cuando arrancamos en local
  }),

  integrations: [svelte()]
});