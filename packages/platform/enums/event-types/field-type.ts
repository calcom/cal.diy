export enum BaseFieldEnum {
  name = "name",
  number = "number",
  boolean = "boolean",
  address = "address",
  text = "text",
  textarea = "textarea",
  email = "email",
  phone = "phone",
  multiemail = "multiemail",
  select = "select",
  multiselect = "multiselect",
  checkbox = "checkbox",
  radio = "radio",
  radioInput = "radioInput",
  date = "date",
}

export type BaseFieldType = keyof typeof BaseFieldEnum;
