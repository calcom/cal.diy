import type { Dispatch, SetStateAction } from "react";

export type TextEditorProps = {
  getText: () => string;
  setText: (text: string) => void;
  excludedToolbarItems?: string[];
  variables?: string[];
  addVariableButtonTop?: boolean;
  height?: string;
  maxHeight?: string;
  placeholder?: string;
  disableLists?: boolean;
  updateTemplate?: boolean;
  firstRender?: boolean;
  setFirstRender?: Dispatch<SetStateAction<boolean>>;
  editable?: boolean;
  plainText?: boolean;
  label?: string;
  id?: string;
};
