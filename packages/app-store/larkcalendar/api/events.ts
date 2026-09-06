import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

import { timingSafeEqualStrings } from "@calcom/lib/crypto";
import logger from "@calcom/lib/logger";
import { defaultHandler } from "@calcom/lib/server/defaultHandler";
import { defaultResponder } from "@calcom/lib/server/defaultResponder";
import prisma from "@calcom/prisma";

import { getAppKeys } from "../common";
import { sendPostMsg } from "../lib/BotService";

const log = logger.getSubLogger({ prefix: [`[lark/api/events]`] });

const larkKeysSchema = z.object({
  open_verification_token: z.string(),
});

const appTicketEventsReqSchema = z.object({
  body: z.object({
    event: z.object({
      app_ticket: z.string().min(1),
    }),
  }),
});

const imMessageReceivedEventsReqSchema = z.object({
  body: z.object({
    header: z.object({
      tenant_key: z.string().min(1),
    }),
    event: z.object({
      sender: z.object({
        sender_id: z.object({
          open_id: z.string().min(1),
        }),
      }),
    }),
  }),
});

const p2pChatCreateEventsReqSchema = z.object({
  body: z.object({
    tenant_key: z.string().min(1),
    event: z.object({
      user: z.object({
        open_id: z.string().min(1),
      }),
    }),
  }),
});

async function postHandler(req: NextApiRequest, res: NextApiResponse) {
  log.debug("receive events", req.body);
  const appKeys = await getAppKeys();
  const { open_verification_token } = larkKeysSchema.parse(appKeys);

  // used for events handler binding in lark open platform, see
  // https://open.larksuite.com/document/ukTMukTMukTM/uUTNz4SN1MjL1UzM?lang=en-US
  if (
    req.body.type === "url_verification" &&
    timingSafeEqualStrings(req.body.token, open_verification_token)
  ) {
    log.debug("update token", req.body);
    return res.status(200).json({ challenge: req.body.challenge });
  }

  // used for receiving app_ticket, see
  // https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/application-v6/event/app_ticket-events
  if (
    req.body.event?.type === "app_ticket" &&
    timingSafeEqualStrings(open_verification_token, req.body.token)
  ) {
    const {
      body: {
        event: { app_ticket: appTicket },
      },
    } = appTicketEventsReqSchema.parse(req);

    await prisma.app.update({
      where: { slug: "lark-calendar" },
      data: {
        keys: {
          ...appKeys,
          app_ticket: appTicket,
        },
      },
    });
    return res.status(200).json({ code: 0, msg: "success" });
  }

  // used for handle user at bot in lark chat with cal.com connector bot, see
  // https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/message/events/receive
  if (req.body.header?.event_type === "im.message.receive_v1") {
    const {
      body: {
        header: { tenant_key: tenantKey },
        event: {
          sender: {
            sender_id: { open_id: senderOpenId },
          },
        },
      },
    } = imMessageReceivedEventsReqSchema.parse(req);

    sendPostMsg(tenantKey, senderOpenId);

    return res.status(200).json({ code: 0, msg: "success" });
  }

  // used for handle user first talk with cal.com connector bot, see
  // https://open.larksuite.com/document/ukTMukTMukTM/uYDNxYjL2QTM24iN0EjN/bot-events
  if (req.body.event?.type === "p2p_chat_create") {
    const {
      body: {
        tenant_key: tenantKey,
        event: {
          user: { open_id: senderOpenId },
        },
      },
    } = p2pChatCreateEventsReqSchema.parse(req);

    sendPostMsg(tenantKey, senderOpenId);

    return res.status(200).json({ code: 0, msg: "success" });
  }
}

export default defaultHandler({
  POST: Promise.resolve({ default: defaultResponder(postHandler) }),
});
