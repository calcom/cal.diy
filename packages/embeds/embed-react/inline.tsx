/**
 * @fileoverview This file is an example file and tells how to use the Cal component in a React application. This is also used by playwright e2e
 */
// Because we don't import from @calcom/embed-react, this file isn't able to test if the build is successful or not and thus npm package would work or not correctly.
// There are tests in test/built which verify that the types from built package are correctly generated and exported correctly.
import * as React from "react";
import { useEffect } from "react";
import { useState } from "react";
import ReactDom from "react-dom";

import Cal, { getCalApi, type EmbedEvent } from "./src/index";

const api = getCalApi({
  namespace: "inline",
});

function App() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const callback = (event: any) => {
      console.log(event.detail);
    };
    api.then((api) => {
      api("on", {
        action: "*",
        callback,
      });

      api("ui", {
        cssVarsPerTheme: {
          light: {
            "cal-border-booker": "red",
            "cal-border-booker-width": "20px",
          },
          dark: {
            "cal-border-booker": "red",
            "cal-border-booker-width": "5px",
          },
        },
      });
    });

    return () => {
      api.then((api) => {
        api("off", {
          action: "*",
          callback,
        });

        const bookerReadyCallback = (e: EmbedEvent<"bookerReady">) => {
          const data = e.detail.data;
          console.log("bookerReady", {
            eventId: data.eventId,
            eventSlug: data.eventSlug,
          });

          api("off", {
            action: "bookerReady",
            callback: bookerReadyCallback,
          });
        };

        api("on", {
          action: "bookerReady",
          callback: bookerReadyCallback,
        });

        const bookingSuccessfulV2Callback = (
          e: EmbedEvent<"bookingSuccessfulV2">
        ) => {
          const data = e.detail.data;
          console.log("bookingSuccessfulV2", {
            endTime: data.endTime,
            startTime: data.startTime,
            title: data.title,
          });

          api("off", {
            action: "bookingSuccessfulV2",
            callback: bookingSuccessfulV2Callback,
          });
        };

        api("on", {
          action: "bookingSuccessfulV2",
          callback: bookingSuccessfulV2Callback,
        });
      });
    };
  }, []);

  return (
    <>
      <h1>
        There is <code>Cal</code> component below me
      </h1>
      <button
        type="button"
        data-testid="toggle-theme"
        onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
      >
        {theme}
      </button>
      <Cal
        calOrigin="http://localhost:3000"
        embedJsUrl="//localhost:3000/embed/embed.js"
        namespace="inline"
        style={{ width: "100%", height: "100%", overflow: "scroll" }}
        calLink="pro"
        config={{
          name: "John Doe",
          email: "johndoe@gmail.com",
          notes: "Test Meeting",
          guests: ["janedoe@gmail.com"],
          theme,
          "cal.embed.pageType": "user.event.booking.slots",
          useSlotsViewOnSmallScreen: "true",
        }}
      />
    </>
  );
}
ReactDom.render(<App />, document.getElementById("root"));
