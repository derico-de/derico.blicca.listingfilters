import { createInstance } from 'i18next';
import type { ReactNode } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';

import { locales } from '../src/locales';

/** What the editor does with a bundle's `locales` export. */
export function editorIn(language: string) {
  const i18n = createInstance();
  void i18n.use(initReactI18next).init({
    lng: language,
    fallbackLng: 'en',
    defaultNS: 'common',
    resources: Object.fromEntries(
      Object.entries(locales).map(([name, catalog]) => [name, { common: catalog }]),
    ),
    interpolation: { escapeValue: false },
  });
  return i18n;
}

export function InEditorLanguage({ language, children }: { language: string; children: ReactNode }) {
  return <I18nextProvider i18n={editorIn(language)}>{children}</I18nextProvider>;
}
