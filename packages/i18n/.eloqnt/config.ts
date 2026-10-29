import {defineConfig} from '@eloqnt/cli';

export default defineConfig({
  lint: {
    overrides: [
      {
        // `iw` is the legacy code for Hebrew; this repo ships it alongside `he`
        locales: ['iw'],
        rules: {'invalid-locale': 'off'}
      }
    ]
  },
  messages: {
    path: './locales/{locale}/{namespace}',
    locales: 'infer',
    sourceLocale: 'en',
    format: {
      codec: '@eloqnt/format-i18next-json',
      extension: '.json'
    }
  }
});
