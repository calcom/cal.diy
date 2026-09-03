import type { DAVAccount } from "tsdav";

import BaseCalendarService, { CalendarServiceCredentialPayload } from "@calcom/lib/CalendarService";

const YANDEX_CALDAV_URL = "https://calendar.yandex.ru";

export default class YandexCalendarService extends BaseCalendarService {
  constructor(credential: CalendarServiceCredentialPayload) {
    super(credential, "yandex_calendar", YANDEX_CALDAV_URL);
  }

  protected async getAccount(): Promise<DAVAccount> {
    // We know the structure of the Yandex Calendar account, avoid an extract call to createAccount()
    return {
      serverUrl: YANDEX_CALDAV_URL,
      accountType: "caldav",
      credentials: this.credentials,
      rootUrl: "https://caldav.yandex.ru/",
      principalUrl: `https://caldav.yandex.ru/principals/users/${encodeURIComponent(
        this.credentials.username
      )}/`,
      homeUrl: `https://caldav.yandex.ru/calendars/${encodeURIComponent(this.credentials.username)}/`,
    };
  }
}
