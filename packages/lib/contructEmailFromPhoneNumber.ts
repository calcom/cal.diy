export const contructEmailFromPhoneNumber = (phoneNumber: string): string => {
  const cleanedPhoneNumber = phoneNumber.replace(/\D/g, "");
  return `${cleanedPhoneNumber}@sms.cal.com`;
};

// Also export with correct spelling while maintaining backward compatibility
export const constructEmailFromPhoneNumber: (phoneNumber: string) => string = contructEmailFromPhoneNumber;
