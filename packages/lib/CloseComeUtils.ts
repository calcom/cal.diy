import type { CalendarEvent } from "@calcom/types/Calendar";
import type CloseCom from "./CloseCom";
import type {
  CloseComCustomActivityCreate,
  CloseComCustomActivityFieldGet,
  CloseComCustomContactFieldGet,
  CloseComCustomFieldCreateResponse,
  CloseComFieldOptions,
  CloseComLead,
} from "./CloseCom";
import { APP_NAME } from "./constants";

export async function getCloseComContactIds(
  persons: { email: string; name: string | null }[],
  closeCom: CloseCom,
  leadFromCalComId?: string
): Promise<string[]> {
  // Check if persons exist or to see if any should be created
  const closeComContacts = await closeCom.contact.search({
    emails: persons.map((att) => att.email),
  });
  // NOTE: If contact is duplicated in Close.com we will get more results
  //       messing around with the expected number of contacts retrieved
  if (closeComContacts.data.length < persons.length && leadFromCalComId) {
    // Create missing contacts
    const personsEmails = persons.map((att) => att.email);
    // Existing contacts based on persons emails: contacts may have more
    // than one email, we just need the one used by the event.
    const existingContactsEmails = closeComContacts.data.flatMap((cont) =>
      cont.emails.filter((em) => personsEmails.includes(em.email)).map((ems) => ems.email)
    );
    const nonExistingContacts = persons.filter((person) => !existingContactsEmails.includes(person.email));
    const createdContacts = await Promise.all(
      nonExistingContacts.map(
        async (per) =>
          await closeCom.contact.create({
            person: per,
            leadId: leadFromCalComId,
          })
      )
    );
    if (createdContacts.length === nonExistingContacts.length) {
      // All non existent contacts where created
      return Promise.resolve(
        closeComContacts.data.map((cont) => cont.id).concat(createdContacts.map((cont) => cont.id))
      );
    } else {
      return Promise.reject("Some contacts were not possible to create in Close.com");
    }
  } else {
    return Promise.resolve(closeComContacts.data.map((cont) => cont.id));
  }
}

export async function getCustomActivityTypeInstanceData(
  event: CalendarEvent,
  customFields: CloseComFieldOptions,
  closeCom: CloseCom
): Promise<CloseComCustomActivityCreate> {
  // Get Cal.diy generic Lead
  const leadFromCalComId = await getCloseComLeadId(closeCom);
  // Get Contacts ids
  const contactsIds = await getCloseComContactIds(event.attendees, closeCom, leadFromCalComId);
  // Get Custom Activity Type id
  const customActivityTypeAndFieldsIds = await getCloseComCustomActivityTypeFieldsIds(customFields, closeCom);
  // Prepare values for each Custom Activity Fields
  const customActivityFieldsValues = [
    contactsIds.length > 1 ? contactsIds.slice(1) : null, // Attendee
    event.startTime, // Date & Time
    event.attendees[0].timeZone, // Time Zone
    contactsIds[0], // Organizer
    event.additionalNotes ?? null, // Additional Notes
  ];
  // Preparing Custom Activity Instance data for Close.com
  return Object.assign(
    {},
    {
      custom_activity_type_id: customActivityTypeAndFieldsIds.activityType,
      lead_id: leadFromCalComId,
    }, // This is to add each field as `"custom.FIELD_ID": "value"` in the object
    ...customActivityTypeAndFieldsIds.fields.map((fieldId: string, index: number) => {
      return {
        [`custom.${fieldId}`]: customActivityFieldsValues[index],
      };
    })
  );
}

export async function getCustomFieldsIds(
  entity: keyof CloseCom["customField"],
  customFields: CloseComFieldOptions,
  closeCom: CloseCom,
  custom_activity_type_id?: string
): Promise<string[]> {
  // Get Custom Activity Fields
  const allFields: CloseComCustomActivityFieldGet | CloseComCustomContactFieldGet =
    await closeCom.customField[entity].get({
      query: { _fields: ["name", "id"].concat(entity === "activity" ? ["custom_activity_type_id"] : []) },
    });
  let relevantFields: { id: string; name: string }[];
  if (entity === "activity") {
    relevantFields = (allFields as CloseComCustomActivityFieldGet).data.filter(
      (fie) => fie.custom_activity_type_id === custom_activity_type_id
    );
  } else {
    relevantFields = allFields.data as CloseComCustomActivityFieldGet["data"];
  }
  const customFieldsNames = relevantFields.map((fie) => fie.name);
  const customFieldsExist = customFields.map((cusFie) => customFieldsNames.includes(cusFie[0]));
  return await Promise.all(
    customFieldsExist.flatMap(async (exist, idx) => {
      if (!exist && entity !== "shared") {
        const [name, type, required, multiple] = customFields[idx];
        let created: CloseComCustomFieldCreateResponse["data"];
        if (entity === "activity" && custom_activity_type_id) {
          created = await closeCom.customField[entity].create({
            name,
            type,
            required,
            accepts_multiple_values: multiple,
            editable_with_roles: [],
            custom_activity_type_id,
          });
          return created.id;
        } else {
          if (entity === "contact") {
            created = await closeCom.customField[entity].create({
              name,
              type,
              required,
              accepts_multiple_values: multiple,
              editable_with_roles: [],
            });
            return created.id;
          }
        }
      } else {
        const index = customFieldsNames.findIndex((val) => val === customFields[idx][0]);
        if (index >= 0) {
          return relevantFields[index].id;
        } else {
          throw Error("Couldn't find the field index");
        }
      }
      // Return an array with a single undefined value for the case where "exist" is true
      return "";
    })
  ).then((results) => results.filter((id) => id));
}

export async function getCloseComCustomActivityTypeFieldsIds(
  customFields: CloseComFieldOptions,
  closeCom: CloseCom
) {
  // Check if Custom Activity Type exists
  const customActivities = await closeCom.customActivity.type.get();
  const calComCustomActivity = customActivities.data.filter((act) => act.name === `${APP_NAME} Activity`);
  if (calComCustomActivity.length > 0) {
    // Cal.diy Custom Activity type exist
    // Get Custom Activity Type fields ids
    const fields = await getCustomFieldsIds("activity", customFields, closeCom, calComCustomActivity[0].id);
    return {
      activityType: calComCustomActivity[0].id,
      fields,
    };
  } else {
    // Cal.diy Custom Activity type doesn't exist
    // Create Custom Activity Type
    const { id: activityType } = await closeCom.customActivity.type.create({
      name: `${APP_NAME} Activity`,
      description: `Bookings in your ${APP_NAME} account`,
    });
    // Create Custom Activity Fields
    const fields = await Promise.all(
      customFields.map(async ([name, type, required, multiple]) => {
        const creation = await closeCom.customField.activity.create({
          custom_activity_type_id: activityType,
          name,
          type,
          required,
          accepts_multiple_values: multiple,
          editable_with_roles: [],
        });
        return creation.id;
      })
    );
    return {
      activityType,
      fields,
    };
  }
}

export async function getCloseComLeadId(
  closeCom: CloseCom,
  leadInfo: CloseComLead = {
    companyName: `From ${APP_NAME}`,
    description: `Generic Lead for Contacts created by ${APP_NAME}`,
  }
): Promise<string> {
  // TODO: Check for leads against email rather than name
  const closeComLeadNames = await closeCom.lead.list({ query: { _fields: ["name", "id"] } });
  const searchLeadFromCalCom: CloseComLead[] = closeComLeadNames.data.filter(
    (lead) => lead.name === leadInfo.companyName
  );
  if (searchLeadFromCalCom.length === 0) {
    // No Lead exists, create it
    const createdLeadFromCalCom = await closeCom.lead.create(leadInfo);
    return createdLeadFromCalCom.id ?? "";
  } else {
    return searchLeadFromCalCom[0].id ?? "";
  }
}
