import React, { createContext, ReactNode, useContext, useMemo, useState } from 'react';

export type AppLanguage = 'sv' | 'en' | 'uk' | 'ar';

type AppLanguageContextValue = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  t: (key: string) => string;
};

const STRINGS: Record<AppLanguage, Record<string, string>> = {
  sv: {
    'common.save': 'Spara',
    'common.cancel': 'Avbryt',
    'common.close': 'Stäng',
    'common.loading': 'Laddar...',
  },
  en: {
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.close': 'Close',
    'common.loading': 'Loading...',
  },
  uk: {
    'common.save': 'Зберегти',
    'common.cancel': 'Скасувати',
    'common.close': 'Закрити',
    'common.loading': 'Завантаження...',
  },
  ar: {
    'common.save': 'حفظ',
    'common.cancel': 'إلغاء',
    'common.close': 'إغلاق',
    'common.loading': 'جار التحميل...',
  },
};

const AppLanguageContext = createContext<AppLanguageContextValue | null>(null);

export function AppLanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<AppLanguage>('sv');

  const value = useMemo<AppLanguageContextValue>(
    () => ({
      language,
      setLanguage,
      t: (key) => STRINGS[language][key] ?? STRINGS.sv[key] ?? key,
    }),
    [language]
  );

  return <AppLanguageContext.Provider value={value}>{children}</AppLanguageContext.Provider>;
}

export function useAppLanguage() {
  const value = useContext(AppLanguageContext);
  if (!value) throw new Error('useAppLanguage must be used inside AppLanguageProvider');
  return value;
}
