import { ExecutionContext } from "@nestjs/common";
import { createParamDecorator } from "@nestjs/common";
import { ApiParam } from "@nestjs/swagger";

import type { Webhook } from "@calcom/prisma/client";

export type GetWebhookReturnType = Webhook;

type GetWebhookData = keyof GetWebhookReturnType | (keyof GetWebhookReturnType)[];

const getWebhookParamDecorator = createParamDecorator<GetWebhookData, ExecutionContext>((data, ctx) => {
  const request = ctx.switchToHttp().getRequest();
  const webhook = request.webhook as GetWebhookReturnType;

  if (!webhook) {
    throw new Error("GetWebhook decorator : Webhook not found");
  }

  if (Array.isArray(data)) {
    return data.reduce((prev, curr) => {
      return {
        ...prev,
        [curr]: webhook[curr],
      };
    }, {});
  }

  if (data) {
    return webhook[data];
  }

  return webhook;
});

function getMethodDescriptor(target: object, propertyKey: string | symbol): PropertyDescriptor {
  return (
    Object.getOwnPropertyDescriptor(target, propertyKey) ?? {
      configurable: true,
      enumerable: false,
      writable: true,
      value: (target as Record<PropertyKey, unknown>)[propertyKey],
    }
  );
}

export function GetWebhook(data?: GetWebhookData): ParameterDecorator {
  return (target, propertyKey, parameterIndex) => {
    if (propertyKey) {
      ApiParam({
        name: "webhookId",
        type: String,
        required: true,
        description: "The unique identifier of the webhook",
      })(target, propertyKey, getMethodDescriptor(target, propertyKey));
    }

    getWebhookParamDecorator(data)(target, propertyKey, parameterIndex);
  };
}
