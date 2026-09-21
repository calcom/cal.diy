import type { TFunction } from "i18next";
import type React from "react";
import type { FC, ReactElement, ReactNode } from "react";
import { cloneElement, createElement, Fragment, isValidElement } from "react";

type ServerTransProps = {
  i18nKey: string; // Translation key
  components?: ReactElement[] | Record<string, ReactElement>; // Components to inject
  t: TFunction;
  values?: Record<string, string | number>; // Values for interpolation
  children?: ReactNode; // Children as fallback content
  parent?: React.ElementType; // Parent element to wrap content in
};

/**
 * A custom Trans component that doesn't use React Context
 * Handles HTML tags and component interpolation in translations
 */
const ServerTrans: FC<ServerTransProps> = ({
  i18nKey,
  components = [],
  t,
  values = {},
  children,
  parent,
}) => {
  const translationOptions = { ...values, interpolation: { escapeValue: false } };
  // Get translated content
  const content = t(i18nKey, translationOptions);

  // If no content at all, use children as fallback
  if (!content && children) {
    return <>{children}</>;
  }

  // If no content, return empty fragment
  if (!content) {
    return <></>;
  }

  let result: ReactNode[];

  // Process array-based components like <0>content</0>
  if (Array.isArray(components) && components.length > 0) {
    result = parseArrayComponents(content, components);
  }
  // Process object-based components like <tag>content</tag> or {{tag}}
  else if (isObject(components) && Object.keys(components).length > 0) {
    result = parseObjectComponents(content, components as Record<string, ReactElement>);
  }
  // Process just HTML tags
  else {
    result = parseHtmlTags(content);
  }

  // Wrap in parent element if specified
  if (parent) {
    const Parent = parent;
    return <Parent>{result}</Parent>;
  }

  return <>{result}</>;
};

// Utility function to check if object
const isObject = (obj: any): obj is Record<string, unknown> =>
  obj !== null && typeof obj === "object" && !Array.isArray(obj);

// Parse array-based components like <0>content</0>
const parseArrayComponents = (content: string, components: ReactElement[]): ReactNode[] => {
  const parts: ReactNode[] = [];
  let currentText = "";

  // Simple state machine parser to handle nested tags
  const parseContent = (text: string) => {
    for (let i = 0; i < text.length; i++) {
      // Look for opening tag
      if (text[i] === "<" && /\d/.test(text[i + 1])) {
        // Found potential component tag
        let tagIndex = "";
        let j = i + 1;

        // Read the tag index
        while (j < text.length && /\d/.test(text[j])) {
          tagIndex += text[j];
          j++;
        }

        // Check if it's a valid tag
        if (j < text.length && text[j] === ">") {
          // It's an opening tag, save text before it
          if (currentText) {
            // Process any HTML in the text
            parts.push(...parseHtmlTags(currentText));
            currentText = "";
          }

          // Get the content inside the tag
          const closingTag = `</${tagIndex}>`;
          const tagContent = getTextBetweenTags(text.substring(j + 1), tagIndex);

          if (tagContent !== null) {
            // We found the content, now add the component
            const componentIndex = parseInt(tagIndex, 10);

            if (componentIndex < components.length) {
              const component = components[componentIndex];

              if (isValidElement(component)) {
                // Add the component with its content
                parts.push(
                  cloneElement(
                    component,
                    {
                      ...(component.props || {}),
                      key: component.key || `comp-${componentIndex}`,
                    },
                    // Process any HTML in the inner content
                    ...parseHtmlTags(tagContent)
                  )
                );
              } else {
                // If not a valid element, just add the content
                parts.push(...parseHtmlTags(tagContent));
              }
            } else {
              // Component index out of bounds, just add the content
              parts.push(...parseHtmlTags(tagContent));
            }

            // Skip to after the closing tag
            i = j + tagContent.length + closingTag.length;
            continue;
          }
        }
      }

      // Regular character, add to current text
      currentText += text[i];
    }

    // Add any remaining text
    if (currentText) {
      parts.push(...parseHtmlTags(currentText));
    }
  };

  // Helper to find matching content between tags
  const getTextBetweenTags = (text: string, tagIndex: string): string | null => {
    let depth = 1;
    let content = "";

    for (let i = 0; i < text.length; i++) {
      // Check for nested opening tag
      if (
        text[i] === "<" &&
        text.substring(i + 1, i + 1 + tagIndex.length) === tagIndex &&
        text[i + 1 + tagIndex.length] === ">"
      ) {
        depth++;
        content += text.substring(i, i + 2 + tagIndex.length);
        i += 1 + tagIndex.length;
        continue;
      }

      // Check for closing tag
      if (
        text[i] === "<" &&
        text.substring(i + 1, i + 2 + tagIndex.length) === `/${tagIndex}` &&
        text[i + 2 + tagIndex.length] === ">"
      ) {
        depth--;

        if (depth === 0) {
          // Found the matching closing tag
          return content;
        }

        content += text.substring(i, i + 3 + tagIndex.length);
        i += 2 + tagIndex.length;
        continue;
      }

      content += text[i];
    }

    return null; // No matching closing tag found
  };

  // Parse the content
  parseContent(content);

  return parts.length > 0 ? parts : [content];
};

// Parse object-based components like <tag>content</tag> or {{tag}}
const parseObjectComponents = (content: string, components: Record<string, ReactElement>): ReactNode[] => {
  let processedContent = content;
  const placeholders: Record<string, ReactNode> = {};

  // First handle {{tag}} interpolation
  Object.keys(components).forEach((tag) => {
    const interpolationRegex = new RegExp(`{{\\s*${tag}\\s*}}`, "g");
    processedContent = processedContent.replace(interpolationRegex, (match) => {
      const placeholder = `__INTERP_${tag}_${Math.random().toString(36).substring(2)}__`;

      if (isValidElement(components[tag])) {
        placeholders[placeholder] = cloneElement(components[tag], {
          ...(components[tag].props || {}),
          key: components[tag].key || `interp-${tag}`,
        });
      }

      return placeholder;
    });
  });

  // Then handle <tag>content</tag>
  Object.keys(components).forEach((tag) => {
    const tagRegex = new RegExp(`<${tag}>(.*?)<\\/${tag}>`, "gs");

    processedContent = processedContent.replace(tagRegex, (match, content) => {
      const placeholder = `__TAG_${tag}_${Math.random().toString(36).substring(2)}__`;

      if (isValidElement(components[tag])) {
        // Process any HTML in the content
        const parsedContent = parseHtmlTags(content);

        placeholders[placeholder] = cloneElement(
          components[tag],
          {
            ...(components[tag].props || {}),
            key: components[tag].key || `tag-${tag}`,
          },
          ...(parsedContent.length > 1 ? parsedContent : [content])
        );
      }

      return placeholder;
    });
  });

  // Replace placeholders with components and split text parts
  const parts: ReactNode[] = [];
  let lastIndex = 0;

  // Find all placeholders in order
  const placeholderRegex = /__(?:INTERP|TAG)_[^_]+_[a-z0-9]+__/g;
  let match: RegExpExecArray | null;

  while ((match = placeholderRegex.exec(processedContent)) !== null) {
    const [placeholder] = match;
    const index = match.index;

    // Add text before placeholder
    if (index > lastIndex) {
      const textBefore = processedContent.substring(lastIndex, index);
      parts.push(...parseHtmlTags(textBefore));
    }

    // Add the component
    if (placeholders[placeholder]) {
      parts.push(placeholders[placeholder]);
    }

    lastIndex = index + placeholder.length;
  }

  // Add any remaining text
  if (lastIndex < processedContent.length) {
    const textAfter = processedContent.substring(lastIndex);
    parts.push(...parseHtmlTags(textAfter));
  }

  return parts.length > 0 ? parts : [processedContent];
};

// Parse HTML tags like <strong>content</strong>
const parseHtmlTags = (content: string): ReactNode[] => {
  if (!content || typeof content !== "string") {
    return [content].filter(Boolean);
  }

  // Check if there are any HTML tags
  if (!/<[a-z][\s\S]*>/i.test(content)) {
    return [content];
  }

  // HTML tags to process
  const htmlTags = [
    { tag: "strong", component: "strong" },
    { tag: "b", component: "b" },
    { tag: "i", component: "i" },
    { tag: "em", component: "em" },
    { tag: "p", component: "p" },
    { tag: "br", component: "br", selfClosing: true },
    { tag: "div", component: "div" },
    { tag: "span", component: "span" },
    { tag: "ul", component: "ul" },
    { tag: "ol", component: "ol" },
    { tag: "li", component: "li" },
  ];

  let processedContent = content;
  const placeholders: Record<string, ReactNode> = {};

  // Process each HTML tag
  htmlTags.forEach(({ tag, component, selfClosing }) => {
    if (selfClosing) {
      // Handle self-closing tags like <br/>
      const selfClosingRegex = new RegExp(`<${tag}\\s*\\/>`, "g");

      processedContent = processedContent.replace(selfClosingRegex, (match) => {
        const placeholder = `__HTML_${tag}_${Math.random().toString(36).substring(2)}__`;
        placeholders[placeholder] = createElement(component, { key: placeholder });
        return placeholder;
      });
    } else {
      // Handle regular tags like <strong>content</strong>
      const tagRegex = new RegExp(`<${tag}>(.*?)<\\/${tag}>`, "gs");

      processedContent = processedContent.replace(tagRegex, (match, content) => {
        const placeholder = `__HTML_${tag}_${Math.random().toString(36).substring(2)}__`;

        // Process nested tags recursively
        const innerContent = parseHtmlTags(content);

        placeholders[placeholder] = createElement(
          component,
          { key: placeholder },
          ...(innerContent.length > 1 ? innerContent : [content])
        );

        return placeholder;
      });
    }
  });

  // If no tags were processed, return the original content
  if (Object.keys(placeholders).length === 0) {
    return [processedContent];
  }

  // Replace placeholders with components and split text parts
  const parts: ReactNode[] = [];
  let lastIndex = 0;

  // Find all placeholders in order
  const placeholderRegex = /__HTML_[^_]+_[a-z0-9]+__/g;
  let match2: RegExpExecArray | null;

  while ((match2 = placeholderRegex.exec(processedContent)) !== null) {
    const [placeholder] = match2;
    const index = match2.index;

    // Add text before placeholder
    if (index > lastIndex) {
      parts.push(processedContent.substring(lastIndex, index));
    }

    // Add the component
    if (placeholders[placeholder]) {
      parts.push(placeholders[placeholder]);
    }

    lastIndex = index + placeholder.length;
  }

  // Add any remaining text
  if (lastIndex < processedContent.length) {
    parts.push(processedContent.substring(lastIndex));
  }

  return parts.length > 0 ? parts : [processedContent];
};

export default ServerTrans;
