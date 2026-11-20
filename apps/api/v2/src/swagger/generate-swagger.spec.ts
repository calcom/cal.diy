import type { OperationObject, PathsObject } from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";

import { dedupeOperationIds } from "./generate-swagger";

const operation = (operationId: string): OperationObject => ({
  operationId,
  tags: ["Cal Unified Calendars"],
  responses: {},
});

describe("dedupeOperationIds", () => {
  it("keeps the first path's operationId and suffixes the aliases", () => {
    const paths: PathsObject = {
      "/v2/calendars/{calendar}/events/{eventUid}": {
        get: operation("CalUnifiedCalendarsController_getCalendarEventDetails"),
        patch: operation("CalUnifiedCalendarsController_updateCalendarEvent"),
      },
      "/v2/calendars/{calendar}/event/{eventUid}": {
        get: operation("CalUnifiedCalendarsController_getCalendarEventDetails"),
        patch: operation("CalUnifiedCalendarsController_updateCalendarEvent"),
      },
    };

    dedupeOperationIds(paths);

    expect(paths["/v2/calendars/{calendar}/events/{eventUid}"].get?.operationId).toBe(
      "CalUnifiedCalendarsController_getCalendarEventDetails"
    );
    expect(paths["/v2/calendars/{calendar}/events/{eventUid}"].patch?.operationId).toBe(
      "CalUnifiedCalendarsController_updateCalendarEvent"
    );
    expect(paths["/v2/calendars/{calendar}/event/{eventUid}"].get?.operationId).toBe(
      "CalUnifiedCalendarsController_getCalendarEventDetails_2"
    );
    expect(paths["/v2/calendars/{calendar}/event/{eventUid}"].patch?.operationId).toBe(
      "CalUnifiedCalendarsController_updateCalendarEvent_2"
    );
  });

  it("leaves unique operationIds untouched", () => {
    const paths: PathsObject = {
      "/v2/a": { get: operation("Controller_getA"), delete: operation("Controller_deleteA") },
      "/v2/b": { get: operation("Controller_getB") },
    };

    dedupeOperationIds(paths);

    expect(paths["/v2/a"].get?.operationId).toBe("Controller_getA");
    expect(paths["/v2/a"].delete?.operationId).toBe("Controller_deleteA");
    expect(paths["/v2/b"].get?.operationId).toBe("Controller_getB");
  });

  it("numbers every extra alias of the same handler", () => {
    const paths: PathsObject = {
      "/v2/a": { get: operation("Controller_get") },
      "/v2/b": { get: operation("Controller_get") },
      "/v2/c": { get: operation("Controller_get") },
    };

    dedupeOperationIds(paths);

    expect(["/v2/a", "/v2/b", "/v2/c"].map((path) => paths[path].get?.operationId)).toEqual([
      "Controller_get",
      "Controller_get_2",
      "Controller_get_3",
    ]);
  });
});
