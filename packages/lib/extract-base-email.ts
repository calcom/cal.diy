// Function to extract base email
export const extractBaseEmail = (email: string): string => {
  const atIndex = email.indexOf("@");
  if (atIndex === -1) return email;
  const localPart = email.substring(0, atIndex);
  const domain = email.substring(atIndex + 1);
  const baseLocalPart = localPart.split("+")[0];
  return `${baseLocalPart}@${domain}`;
};
