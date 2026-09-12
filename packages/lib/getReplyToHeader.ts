import type { CalendarEvent } from "@calcom/types/Calendar";

import { getReplyToEmail } from "./getReplyToEmail";

export function getReplyToHeader(  
  calEvent: CalendarEvent,  
  additionalEmails?: string | string[],  
  excludeOrganizerEmail?: boolean  
) {  
  const shouldExcludeOrganizer = excludeOrganizerEmail || calEvent.hideOrganizerEmail;  
  const replyToEmail = getReplyToEmail(calEvent, shouldExcludeOrganizer);  
  
  const emailArray: string[] = [];  
  if (additionalEmails) {  
    Array.isArray(additionalEmails) ? emailArray.push(...additionalEmails) : emailArray.push(additionalEmails);  
  }  
  if (replyToEmail) {  
    emailArray.push(replyToEmail);  
  }  
  if (emailArray.length === 0) return {};  
  
  return { replyTo: emailArray.join(", ") };  
}
