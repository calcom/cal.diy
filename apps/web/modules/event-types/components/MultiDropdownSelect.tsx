import type { CSSObjectWithLabel, GroupBase, Props, ValueContainerProps } from "react-select";
import { components } from "react-select";

import { Icon } from "@calcom/ui/components/icon";
import { Select } from "@calcom/ui/components/form";
import React from 'react';

// Helper to merge react-select styles with type safety
const mergeStyles = (base: CSSObjectWithLabel, overrides: Record<string, unknown>): CSSObjectWithLabel => {
  return { ...base, ...overrides } as CSSObjectWithLabel;
};

const LimitedChipsContainer = <Option, IsMulti extends boolean, Group extends GroupBase<Option>>({
  children,
  ...props
}: ValueContainerProps<Option, IsMulti, Group>) => {
  if (!props.hasValue) {
    return <components.ValueContainer {...props}>{children as React.ReactNode[]}</components.ValueContainer>;
  }
  const CHIPS_LIMIT = 2;
  const [chips, other] = children as React.ReactNode[];
  const displayChips = chips.slice(overflowCounter, overflowCounter + CHIPS_LIMIT);

  return (
    <components.ValueContainer {...props}>
      {displayChips}
      {overflowCounter > 0 && (
        <span className="bg-subtle text-default flex items-center justify-center rounded-md px-2 py-[5px] text-[14px] font-medium leading-4">
          <>
            <Icon name="plus" className="mr-1 inline h-3 w-3 stroke-[3px]" />{" "}
            <span>{overflowCounter} more</span>
          </>
        </span>
      )}
      {other}
    </components.ValueContainer>
  );
};

export const MultiDropdownSelect = ({ options = [], value = [], ...props }: Props) => {
  // const { t } = useLocale();

  return (
    <Select
      styles={{
        multiValue: (base) =>
          mergeStyles(base, {
            backgroundColor: "#F3F4F6",
            color: "#374151",
            borderRadius: "6px",
            padding: "5px 8px",
            gap: "8px",
            fontSize: "14px",
            fontWeight: "500",
            margin: "0px",
            lineHeight: "16px",
          }),
        multiValueLabel: (base) =>
          mergeStyles(base, {
            paddingLeft: "0px",
            fontSize: "14px",
            padding: "0",
          }),
        multiValueRemove: (base) =>
          mergeStyles(base, {
            color: "#4B5563",
            padding: "0",
            ":hover": {
              background: "transparent",
            },
            "> svg": {
              width: "16px",
              height: "17px",
            },
          }),
        control: (base) =>
          mergeStyles(base, {
            // Brute force to remove focus outline of input
            "& .cal-multiselect__input": {
              borderWidth: 0,
              boxShadow: "none",
              caretColor: "transparent",
            },
          }),
        valueContainer: (base) =>
          mergeStyles(base, {
            display: "flex",
            gap: "4px",
            paddingLeft: "5px",
            padding: "0px",
            height: "36px",
          }),
      }}
      className="cal-multiselect"
      classNamePrefix="cal-multiselect"
      placeholder="Select"
      defaultValue={value}
      options={options}
      hideSelectedOptions={false}
      isMulti
      components={{ ValueContainer: LimitedChipsContainer }}
      {...props}
    />
  );
};

export default MultiDropdownSelect;
