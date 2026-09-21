import process from "node:process";
import logger from "@calcom/lib/logger";
import prisma from "@calcom/prisma";

export type CloseComLead = {
  companyName?: string | null | undefined;
  contactName?: string;
  contactEmail?: string;
  description?: string;
  id?: string | PromiseLike<string>;
};

export type CloseComFieldOptions = [string, string, boolean, boolean][];

type CloseComContactEmail = {
  email: string;
  type: string;
};

export type CloseComLeadCreateResult = {
  status_id: string;
  status_label: string;
  display_name: string;
  addresses: { [key: string]: string }[];
  name: string;
  contacts: {
    id: string;
    emails: CloseComContactEmail[];
  }[];
  [key: CloseComCustomActivityCustomField<string>]: string;
  id: string;
};

export type CloseComStatus = {
  id: string;
  organization_id: string;
  label: string;
};

export type CloseComCustomActivityTypeCreate = {
  name: string;
  description: string;
};

export type CloseComContactSearch = {
  data: {
    __object_type: "contact";
    emails: CloseComContactEmail[];
    id: string;
    lead_id: string;
    name: string;
  }[];
  cursor: null;
};

export type CloseComCustomActivityTypeGet = {
  data: {
    api_create_only: boolean;
    created_by: string;
    date_created: string;
    date_updated: string;
    description: string;
    editable_with_roles: string[];
    fields: CloseComCustomActivityFieldGet["data"][number][];
    id: string;
    name: string;
    organization_id: string;
    updated_by: string;
  }[];
  cursor: null;
};

export type CloseComCustomActivityFieldCreate = CloseComCustomContactFieldCreate & {
  custom_activity_type_id: string;
};

export type CloseComCustomContactFieldGet = {
  data: {
    id: string;
    name: string;
    description: string;
    type: string;
    choices?: string[];
    accepts_multiple_values: boolean;
    editable_with_roles: string[];
    date_created: string;
    date_updated: string;
    created_by: string;
    updated_by: string;
    organization_id: string;
  }[];
};

export type CloseComCustomContactFieldCreate = {
  name: string;
  description?: string;
  type: string;
  required: boolean;
  accepts_multiple_values: boolean;
  editable_with_roles: string[];
  choices?: string[];
};

export type CloseComCustomActivityFieldGet = {
  data: {
    id: string;
    name: string;
    description: string;
    type: string;
    choices?: string[];
    accepts_multiple_values: boolean;
    editable_with_roles: string[];
    date_created: string;
    date_updated: string;
    created_by: string;
    updated_by: string;
    organization_id: string;
    custom_activity_type_id: string;
  }[];
};

export type CloseComCustomActivityCreate = {
  custom_activity_type_id: string;
  lead_id: string;
  [key: CloseComCustomActivityCustomField<string>]: string;
};

export type typeCloseComCustomActivityGet = {
  organization_id: string;
  contact_id: string;
  date_updated: string;
  user_name: string;
  created_by_name: "Bruce Wayne";
  id: string;
  created_by: string;
  status: string;
  user_id: string;
  users: string[];
  lead_id: string;
  _type: string;
  updated_by: string;
  custom_activity_type_id: string;
  date_created: string;
  updated_by_name: string;
  [key: CloseComCustomActivityCustomField<string>]: string;
};

type CloseComCustomActivityCustomField<T extends string> = `custom.${T}`;

type CloseComQuery = {
  negate?: boolean;
  queries?: CloseComQuery[] | CloseComCondition[];
  object_type?: string;
  related_object_type?: string;
  related_query?: CloseComQuery;
  this_object_type?: string;
  type?: "object_type" | "has_related" | "and" | "or";
  _fields?: string[];
};

type CloseComCondition = {
  condition: {
    mode: "full_words";
    type: "text";
    value: string;
  };
  field: {
    field_name: string;
    object_type: string;
    type: "regular_field";
  };
  negate: boolean;
  type: "field_condition";
};

export type CloseComCustomFieldCreateResponse = {
  data: {
    id: string;
    name?: string;
    type?: string;
    required?: boolean;
    accepts_multiple_values: boolean;
    editable_with_roles: string[];
    custom_activity_type_id?: string;
  };
};

/**
 * This class to instance communicating to Close.com APIs requires an API Key (legacy) or OAuth.
 *
 * You can either pass to the constructor an API Key or have one defined as an
 * environment variable in case the communication to Close.com is just for
 * one account only, not configurable by any user at any moment.
 */
export default class CloseCom {
  private apiUrl = "https://api.close.com/api/v1";
  private api_key: string;
  private refresh_token?: string;
  private expires_at?: number;
  private isOAuth: boolean;
  private log: typeof logger;
  private userId?: number;

  constructor(
    apiKey: string,
    options?: {
      refresh_token?: string;
      expires_at?: number;
      isOAuth?: boolean;
      userId?: number;
    }
  ) {
    this.log = logger.getSubLogger({ prefix: [`[[lib] close.com`] });
    this.api_key = apiKey;
    this.refresh_token = options?.refresh_token;
    this.expires_at = options?.expires_at;
    this.isOAuth = options?.isOAuth || false;
    this.userId = options?.userId;
  }

  private async getHeaders() {
    if (this.isOAuth) {
      // Check if token needs refresh
      if (await this.shouldRefreshToken()) {
        await this.refreshAccessToken();
      }
      return {
        Authorization: `Bearer ${this.api_key}`,
        "Content-Type": "application/json",
      };
    }

    // API key auth
    return {
      Authorization: `Basic ${Buffer.from(`${this.api_key}:`).toString("base64")}`,
      "Content-Type": "application/json",
    };
  }

  private async shouldRefreshToken(): Promise<boolean> {
    if (!this.expires_at) return false;

    // Refresh token if it expires in less than 5 minutes
    const fiveMinutesInMs = 5 * 60 * 1000;
    return Date.now() + fiveMinutesInMs >= this.expires_at;
  }

  private async refreshAccessToken() {
    if (!this.refresh_token) throw new Error("No refresh token available");
    if (!this.userId) throw new Error("No userId available for token refresh");

    try {
      const response = await fetch("https://api.close.com/oauth2/token/", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: this.refresh_token,
          client_id: process.env.CLOSECOM_CLIENT_ID ?? "",
          client_secret: process.env.CLOSECOM_CLIENT_SECRET ?? "",
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to refresh token");
      }

      const data = await response.json();

      this.api_key = data.access_token;
      this.refresh_token = data.refresh_token;
      this.expires_at = Date.now() + data.expires_in * 1000;

      try {
        const credential = await prisma.credential.findFirst({
          where: {
            userId: this.userId,
            type: "closecom_crm",
          },
          select: {
            id: true,
          },
        });

        if (!credential?.id) {
          throw new Error("Credential not found");
        }

        await prisma.credential.update({
          where: {
            id: credential.id,
          },
          data: {
            key: {
              access_token: data.access_token,
              refresh_token: data.refresh_token,
              expires_at: this.expires_at,
            },
          },
        });
      } catch (error) {
        this.log.error("Failed to update credentials in database", error);
      }

      return {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: this.expires_at,
      };
    } catch (error) {
      this.log.error("Token refresh process failed", {
        error,
        userId: this.userId,
      });
      throw error;
    }
  }

  public me = async () => {
    return this._get({ urlPath: "/me/" });
  };

  public contact = {
    search: async ({ emails }: { emails: string[] }): Promise<CloseComContactSearch> => {
      return this._post({
        urlPath: "/data/search/",
        data: closeComQueries.contact.search(emails),
      });
    },
    create: async (data: {
      person: { name: string | null; email: string };
      leadId: string;
    }): Promise<CloseComContactSearch["data"][number]> => {
      return this._post({ urlPath: "/contact/", data: closeComQueries.contact.create(data) });
    },
    update: async ({
      contactId,
      ...data
    }: {
      person: { name: string; email: string };
      contactId: string;
      leadId?: string;
    }): Promise<CloseComContactSearch["data"][number]> => {
      return this._put({
        urlPath: `/contact/${contactId}/`,
        data: closeComQueries.contact.update(data),
      });
    },
    delete: async (contactId: string) => {
      return this._delete({
        urlPath: `/contact/${contactId}/`,
      });
    },
  };

  public lead = {
    list: async ({
      query,
    }: {
      query: CloseComQuery;
    }): Promise<{ data: { [key: string]: CloseComQuery }[] }> => {
      return this._get({ urlPath: "/lead", query });
    },
    status: async () => {
      return this._get({ urlPath: `/status/lead/` });
    },
    update: async (leadId: string, data: CloseComLead): Promise<CloseComLeadCreateResult> => {
      return this._put({
        urlPath: `/lead/${leadId}`,
        data,
      });
    },
    create: async (data: CloseComLead): Promise<CloseComLeadCreateResult> => {
      return this._post({
        urlPath: "/lead/",
        data: closeComQueries.lead.create(data),
      });
    },
    delete: async (leadId: string) => {
      return this._delete({ urlPath: `/lead/${leadId}/` });
    },
  };

  public customActivity = {
    type: {
      create: async (
        data: CloseComCustomActivityTypeCreate
      ): Promise<CloseComCustomActivityTypeGet["data"][number]> => {
        return this._post({
          urlPath: "/custom_activity",
          data: closeComQueries.customActivity.type.create(data),
        });
      },
      get: async (): Promise<CloseComCustomActivityTypeGet> => {
        return this._get({ urlPath: "/custom_activity" });
      },
    },
  };

  public customField = {
    activity: {
      create: async (
        data: CloseComCustomActivityFieldCreate
      ): Promise<CloseComCustomActivityFieldGet["data"][number]> => {
        return this._post({ urlPath: "/custom_field/activity/", data });
      },
      get: async ({ query }: { query: CloseComQuery }): Promise<CloseComCustomActivityFieldGet> => {
        return this._get({ urlPath: "/custom_field/activity/", query });
      },
    },
    contact: {
      create: async (
        data: CloseComCustomContactFieldCreate
      ): Promise<CloseComCustomContactFieldGet["data"][number]> => {
        return this._post({ urlPath: "/custom_field/contact/", data });
      },
      get: async ({ query }: { query: CloseComQuery }): Promise<CloseComCustomContactFieldGet> => {
        return this._get({ urlPath: "/custom_field/contact/", query });
      },
    },
    shared: {
      get: async ({ query }: { query: CloseComQuery }): Promise<CloseComCustomContactFieldGet> => {
        return this._get({ urlPath: "/custom_field/shared/", query });
      },
    },
  };

  public activity = {
    custom: {
      create: async (
        data: CloseComCustomActivityCreate
      ): Promise<CloseComCustomActivityTypeGet["data"][number]> => {
        return this._post({ urlPath: "/activity/custom/", data });
      },
      delete: async (uuid: string) => {
        return this._delete({ urlPath: `/activity/custom/${uuid}/` });
      },
      update: async (
        uuid: string,
        data: Partial<CloseComCustomActivityCreate>
      ): Promise<CloseComCustomActivityTypeGet["data"][number]> => {
        return this._put({ urlPath: `/activity/custom/${uuid}/`, data });
      },
    },
  };

  private _get = async ({ urlPath, query }: { urlPath: string; query?: CloseComQuery }) => {
    return await this._request({ urlPath, method: "get", query });
  };
  private _post = async ({ urlPath, data }: { urlPath: string; data: Record<string, unknown> }) => {
    return this._request({ urlPath, method: "post", data });
  };
  private _put = async ({ urlPath, data }: { urlPath: string; data: Record<string, unknown> }) => {
    return this._request({ urlPath, method: "put", data });
  };
  private _delete = async ({ urlPath }: { urlPath: string }) => {
    return this._request({ urlPath, method: "delete" });
  };
  private _request = async ({
    urlPath,
    data,
    method,
    query,
  }: {
    urlPath: string;
    method: string;
    query?: CloseComQuery;
    data?: Record<string, unknown>;
  }) => {
    this.log.debug(method, urlPath, query, data);
    const headers = await this.getHeaders();
    const queryString = query ? `?${new URLSearchParams(String(query)).toString()}` : "";
    return await fetch(`${this.apiUrl}${urlPath}${queryString}`, {
      headers,
      method,
      body: JSON.stringify(data),
    }).then(async (response) => {
      if (!response.ok) {
        const message = `[Close.com app] An error has occurred: ${response.status}`;
        this.log.error(await response.json());
        throw new Error(message);
      }
      return await response.json();
    });
  };
}

export const closeComQueries = {
  contact: {
    search(contactEmails: string[]) {
      return {
        limit: null,
        _fields: {
          contact: ["id", "name", "emails"],
        },
        query: {
          negate: false,
          queries: [
            {
              negate: false,
              object_type: "contact",
              type: "object_type",
            },
            {
              negate: false,
              queries: [
                {
                  negate: false,
                  related_object_type: "contact_email",
                  related_query: {
                    negate: false,
                    queries: contactEmails.map((contactEmail) => ({
                      condition: {
                        mode: "full_words",
                        type: "text",
                        value: contactEmail,
                      },
                      field: {
                        field_name: "email",
                        object_type: "contact_email",
                        type: "regular_field",
                      },
                      negate: false,
                      type: "field_condition",
                    })),
                    type: "or",
                  },
                  this_object_type: "contact",
                  type: "has_related",
                },
              ],
              type: "and",
            },
          ],
          type: "and",
        },
        results_limit: null,
        sort: [],
      };
    },
    create(data: { person: { name: string | null; email: string }; leadId: string }) {
      return {
        lead_id: data.leadId,
        name: data.person.name ?? data.person.email,
        emails: [{ email: data.person.email, type: "office" }],
      };
    },
    update({ person, leadId, ...rest }: { person: { name: string; email: string }; leadId?: string }) {
      return {
        ...(leadId && { lead_id: leadId }),
        name: person.name ?? person.email,
        emails: [{ email: person.email, type: "office" }],
        ...rest,
      };
    },
  },
  lead: {
    create({ companyName, contactEmail, contactName, description }: CloseComLead) {
      return {
        name: companyName,
        ...(description ? { description } : {}),
        ...(contactEmail && contactName
          ? {
              contacts: [
                {
                  name: contactName,
                  email: contactEmail,
                  emails: [
                    {
                      type: "office",
                      email: contactEmail,
                    },
                  ],
                },
              ],
            }
          : {}),
      };
    },
  },
  customActivity: {
    type: {
      create({ name, description }: CloseComCustomActivityTypeCreate) {
        return {
          name: name,
          description: description,
          api_create_only: false,
          editable_with_roles: ["admin"],
        };
      },
    },
  },
  customField: {
    activity: {
      create({
        custom_activity_type_id,
        name,
        type,
        required,
        accepts_multiple_values,
      }: CloseComCustomActivityFieldCreate) {
        return {
          custom_activity_type_id,
          name,
          type,
          required,
          accepts_multiple_values,
          editable_with_roles: [],
        };
      },
    },
  },
};
