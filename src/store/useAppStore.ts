import { create } from 'zustand';

type AppStore = {
  profileName: string;
  profileLanguage: string;
  profileCity: string;
  selectedActivities: string[];

  setProfileName: (value: string) => void;
  setProfileLanguage: (value: string) => void;
  setProfileCity: (value: string) => void;
  setSelectedActivities: (items: string[]) => void;
  toggleSelectedActivity: (item: string) => void;
};

export const useAppStore = create<AppStore>((set, get) => ({
  profileName: 'Celal',
  profileLanguage: 'Svenska',
  profileCity: 'Stockholm',
  selectedActivities: ['Kafébesök', 'Promenad', 'Pluggsällskap'],

  setProfileName: (value) => set({ profileName: value }),
  setProfileLanguage: (value) => set({ profileLanguage: value }),
  setProfileCity: (value) => set({ profileCity: value }),

  setSelectedActivities: (items) => set({ selectedActivities: items }),

  toggleSelectedActivity: (item) => {
    const current = get().selectedActivities;
    const next = current.includes(item)
      ? current.filter((x) => x !== item)
      : [...current, item];

    set({ selectedActivities: next });
  },
}));