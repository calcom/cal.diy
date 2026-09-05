"use client";

import { createContext, type ReactNode, useContext, useEffect, useRef } from "react";
import type { StoreApi } from "zustand";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { type BookerStore, createBookerStore, type StoreInitializeType } from "./store";

export const BookerStoreContext = createContext<StoreApi<BookerStore> | null>(null);

export interface BookerStoreProviderProps {
  children: ReactNode;
}

export const BookerStoreProvider = ({ children }: BookerStoreProviderProps) => {
  const storeRef = useRef<StoreApi<BookerStore>>();
  if (!storeRef.current) {
    storeRef.current = createBookerStore();
  }

  return <BookerStoreContext.Provider value={storeRef.current}>{children}</BookerStoreContext.Provider>;
};

export const useBookerStoreContext = <T,>(
  selector: (store: BookerStore) => T,
  equalityFn?: (a: T, b: T) => boolean
): T => {
  const bookerStoreContext = useContext(BookerStoreContext);

  if (!bookerStoreContext) {
    throw new Error("useBookerStoreContext must be used within BookerStoreProvider");
  }

  return useStoreWithEqualityFn(bookerStoreContext, selector, equalityFn);
};

export const useInitializeBookerStoreContext = ({
  username,
  eventSlug,
  month,
  eventId,
  rescheduleUid = null,
  rescheduledBy = null,
  bookingData = null,
  verifiedEmail = null,
  layout,
  isTeamEvent,
  durationConfig,
  org,
  timezone = null,
  teamMemberEmail,
  crmOwnerRecordType,
  crmAppSlug,
  crmRecordId,
  isPlatform = false,
  allowUpdatingUrlParams = true,
}: StoreInitializeType) => {
  const bookerStoreContext = useContext(BookerStoreContext);

  if (!bookerStoreContext) {
    throw new Error("useInitializeBookerStoreContext must be used within BookerStoreProvider");
  }

  const initializeStore = useStoreWithEqualityFn(bookerStoreContext, (state) => state.initialize);

  useEffect(() => {
    initializeStore({
      username,
      eventSlug,
      month,
      eventId,
      rescheduleUid,
      rescheduledBy,
      bookingData,
      layout,
      isTeamEvent,
      org,
      verifiedEmail,
      durationConfig,
      timezone,
      teamMemberEmail,
      crmOwnerRecordType,
      crmAppSlug,
      crmRecordId,
      isPlatform,
      allowUpdatingUrlParams,
    });
  }, [
    initializeStore,
    org,
    username,
    eventSlug,
    month,
    eventId,
    rescheduleUid,
    rescheduledBy,
    bookingData,
    layout,
    isTeamEvent,
    verifiedEmail,
    durationConfig,
    timezone,
    teamMemberEmail,
    crmOwnerRecordType,
    crmAppSlug,
    crmRecordId,
    isPlatform,
    allowUpdatingUrlParams,
  ]);
};
