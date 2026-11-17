import logger from "@calcom/lib/logger";
import type { SendgridFieldOptions, SendgridNewContact } from "../../Sendgrid";
import Sendgrid from "../../Sendgrid";
import type ISyncService from "../ISyncService";
import type { ConsoleUserInfoType, WebUserInfoType } from "../ISyncService";
import SyncServiceCore from "../ISyncService";

// Cal.diy Custom Contact Fields
const calComCustomContactFields: SendgridFieldOptions = [
  // Field name, field type
  ["username", "Text"],
  ["plan", "Text"],
  ["last_booking", "Date"], // Sendgrid custom fields only allow alphanumeric characters (letters A-Z, numbers 0-9) and underscores.
  ["createdAt", "Date"],
];

const serviceName = "sendgrid_service";

export default class SendgridService extends SyncServiceCore implements ISyncService {
  protected declare service: Sendgrid;
  constructor() {
    super(serviceName, Sendgrid, logger.getSubLogger({ prefix: [`[[sync] ${serviceName}`] }));
  }

  upsert = async (user: WebUserInfoType | ConsoleUserInfoType) => {
    this.log.debug("sync:sendgrid:user", user);
    // Get Custom Contact fields ids
    const customFieldsIds = await this.service.getSendgridCustomFieldsIds(calComCustomContactFields);
    this.log.debug("sync:sendgrid:user:customFieldsIds", customFieldsIds);
    const lastBooking = "email" in user ? await this.getUserLastBooking(user) : null;
    this.log.debug("sync:sendgrid:user:lastBooking", lastBooking);
    const username = "username" in user ? user.username : null;
    // Prepare values for each Custom Contact Fields
    const customContactFieldsValues = [
      username, // Username
      user.plan, // Plan
      lastBooking && lastBooking.booking
        ? new Date(lastBooking.booking.createdAt).toLocaleDateString("en-US")
        : null, // Last Booking
      user.createdDate,
    ];
    this.log.debug("sync:sendgrid:contact:customContactFieldsValues", customContactFieldsValues);
    // Preparing Custom Activity Instance data for Sendgrid
    const contactData = {
      first_name: user.name,
      email: user.email,
      custom_fields: Object.assign(
        {},
        ...customFieldsIds.map((fieldId: string, index: number) => {
          if (customContactFieldsValues[index] !== null) {
            return {
              [fieldId]: customContactFieldsValues[index],
            };
          }
        })
      ),
    };
    this.log.debug("sync:sendgrid:contact:contactData", contactData);
    const newContact = await this.service.sendgridRequest<SendgridNewContact>({
      url: `/v3/marketing/contacts`,
      method: "PUT",
      body: {
        contacts: [contactData],
      },
    });
    // Create contact
    this.log.debug("sync:sendgrid:contact:newContact", newContact);
    return newContact;
  };

  public console = {
    user: {
      upsert: async (consoleUser: ConsoleUserInfoType) => {
        return this.upsert(consoleUser);
      },
    },
  };

  public web = {
    user: {
      upsert: async (webUser: WebUserInfoType) => {
        return this.upsert(webUser);
      },
      delete: async (webUser: WebUserInfoType) => {
        const [contactId] = await this.service.getSendgridContactId(webUser.email);
        if (contactId) {
          return this.service.sendgridRequest({
            url: `/v3/marketing/contacts`,
            method: "DELETE",
            qs: {
              ids: contactId.id,
            },
          });
        } else {
          throw Error("Web user not found in service");
        }
      },
    },
  };
}
