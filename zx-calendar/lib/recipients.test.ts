import assert from "node:assert/strict";
import { test } from "node:test";
import { escapeIcs, icsFile } from "./invite.ts";
import { emailFallbackRecipients, inviteRecipients, uniqueEmails } from "./recipients.ts";

test("every booking invites xoe@ and zantavius@ by default", () => {
  assert.deepEqual(inviteRecipients({}), ["xoe@zannyworld.org", "zantavius@zannyworld.org"]);
});

test("env overrides and extras are de-duplicated case-insensitively", () => {
  assert.deepEqual(inviteRecipients({ INVITE_EMAILS: " XOE@zannyworld.org, team@zannyworld.org ,," }), [
    "xoe@zannyworld.org",
    "zantavius@zannyworld.org",
    "team@zannyworld.org",
  ]);
  assert.deepEqual(uniqueEmails(["a@x.io", "A@x.io", "", undefined, "b@x.io"]), ["a@x.io", "b@x.io"]);
});

test("without a Google event everyone plus the booker gets an emailed invite", () => {
  assert.deepEqual(
    emailFallbackRecipients({
      googleEventCreated: false,
      recipients: ["xoe@zannyworld.org", "zantavius@zannyworld.org"],
      bookerEmail: "maya@example.com",
    }),
    ["xoe@zannyworld.org", "zantavius@zannyworld.org", "maya@example.com"]
  );
});

test("with a Google event only the organizer (whom Google never emails) needs one", () => {
  const recipients = ["xoe@zannyworld.org", "zantavius@zannyworld.org"];
  assert.deepEqual(
    emailFallbackRecipients({
      googleEventCreated: true,
      organizerEmail: "XOE@zannyworld.org",
      recipients,
      bookerEmail: "maya@example.com",
    }),
    ["xoe@zannyworld.org"]
  );
  assert.deepEqual(
    emailFallbackRecipients({
      googleEventCreated: true,
      organizerEmail: "other@gmail.com",
      recipients,
      bookerEmail: "m@x.io",
    }),
    []
  );
});

test("ics escaping and invite structure", () => {
  const bs = String.fromCharCode(92);
  assert.equal(escapeIcs("a;b,c" + bs + "d\ne"), `a${bs};b${bs},c${bs}${bs}d${bs}ne`);
  assert.equal(escapeIcs("x\r\ny"), `x${bs}ny`);
  const ics = icsFile({
    uid: "bkg_1",
    title: "Mix feedback; v2",
    start: new Date(Date.UTC(2026, 8, 29, 17, 0)),
    end: new Date(Date.UTC(2026, 8, 29, 17, 30)),
    organizer: { email: "calendar@zannyworld.org", name: "Z × XOE Calendar" },
    attendees: ["xoe@zannyworld.org", "zantavius@zannyworld.org"],
  });
  assert.match(ics, /METHOD:REQUEST/);
  assert.match(ics, /DTSTART:20260929T170000Z/);
  assert.ok(ics.includes(`SUMMARY:Mix feedback${bs}; v2`));
  assert.match(ics, /ATTENDEE;[^\r]*:mailto:xoe@zannyworld\.org/);
  assert.match(ics, /ATTENDEE;[^\r]*:mailto:zantavius@zannyworld\.org/);
  assert.ok(ics.includes("\r\n"));
  assert.match(icsFile({ uid: "x", title: "t", start: new Date(0), end: new Date(1) }), /METHOD:PUBLISH/);
});

test("time zones: defaults to Pacific + Philippines, accepts a list, drops junk", async () => {
  const { parseTimeZones, formatRangeInZones } = await import("./format.ts");
  assert.deepEqual(parseTimeZones(undefined), ["America/Los_Angeles", "Asia/Manila"]);
  assert.deepEqual(parseTimeZones(" Asia/Manila , Not/AZone,America/Los_Angeles"), [
    "Asia/Manila",
    "America/Los_Angeles",
  ]);
  // 2026-09-29 01:00 UTC = Mon 6:00 PM PDT = Tue 9:00 AM PHT
  const lines = formatRangeInZones(
    new Date(Date.UTC(2026, 8, 29, 1, 0)),
    new Date(Date.UTC(2026, 8, 29, 1, 30)),
    ["America/Los_Angeles", "Asia/Manila"]
  );
  assert.equal(lines[0], "Mon, Sep 28, 6:00 PM – 6:30 PM PDT");
  assert.equal(lines[1], "Tue, Sep 29, 9:00 AM – 9:30 AM PHT");
});
