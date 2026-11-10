import type { PersistOptions } from "zustand/middleware";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { onboardingIndexedDBStorage } from "./onboarding-storage";

// Avatars above this size (base64 characters) were uploaded before the cropping fix and must be
// cleared, otherwise sending them to the server triggers 429 errors.
const AVATAR_SIZE_THRESHOLD = 500_000;

export interface PersonalDetails {
  name: string;
  username: string;
  timezone: string;
  bio: string;
  avatar: string | null;
}

export interface OnboardingState {
  personalDetails: PersonalDetails;
  setPersonalDetails: (details: Partial<PersonalDetails>) => void;
}

const initialPersonalDetails: PersonalDetails = {
  name: "",
  username: "",
  timezone: "",
  bio: "",
  avatar: null,
};

type PersistedOnboardingState = Pick<OnboardingState, "personalDetails">;

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      personalDetails: initialPersonalDetails,

      setPersonalDetails: (details) =>
        set((state) => ({
          personalDetails: { ...state.personalDetails, ...details },
        })),
    }),
    {
      name: "cal-onboarding-storage",
      // IndexedDB rather than localStorage because avatars can exceed localStorage quotas.
      storage: onboardingIndexedDBStorage,
      // Version 0: avatars could be oversized (pre-cropping fix).
      // Version 1: oversized images cleared; also held team/organization onboarding state.
      // Version 2: team/organization onboarding removed; only personal details are kept.
      version: 2,
      migrate: (persistedState) => {
        const state = (persistedState ?? {}) as Partial<PersistedOnboardingState>;
        const personalDetails = { ...initialPersonalDetails, ...state.personalDetails };

        if (personalDetails.avatar && personalDetails.avatar.length > AVATAR_SIZE_THRESHOLD) {
          personalDetails.avatar = null;
        }

        return { personalDetails };
      },
      partialize: (state) => ({
        personalDetails: state.personalDetails,
      }),
    } as PersistOptions<OnboardingState, PersistedOnboardingState>
  )
);
