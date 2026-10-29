import { CodeHighlightNode, CodeNode } from "@lexical/code";
import { AutoLinkNode, LinkNode } from "@lexical/link";
import { ListItemNode, ListNode } from "@lexical/list";
import { TRANSFORMERS } from "@lexical/markdown";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import LexicalErrorBoundary from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { TableCellNode, TableNode, TableRowNode } from "@lexical/table";
import { useId } from "react";

import classNames from "@calcom/ui/classNames";

import ExampleTheme from "./ExampleTheme";
import { VariableNode } from "./nodes/VariableNode";
import AddVariablesPlugin from "./plugins/AddVariablesPlugin";
import AutoLinkPlugin from "./plugins/AutoLinkPlugin";
import EditablePlugin from "./plugins/EditablePlugin";
import PlainTextPlugin from "./plugins/PlainTextPlugin";
import ToolbarPlugin from "./plugins/ToolbarPlugin";
import CustomEnterKeyPlugin from "./plugins/customEnterKeyPlugin";
import "./stylesEditor.css";
import type { TextEditorProps } from "./types";

/*
 Default toolbar items:
  - blockType
  - bold
  - italic
  - link
*/

const editorConfig = {
  theme: ExampleTheme,
  onError(error: Error) {
    throw error;
  },
  namespace: "",
  nodes: [
    HeadingNode,
    ListNode,
    ListItemNode,
    QuoteNode,
    CodeNode,
    CodeHighlightNode,
    TableNode,
    TableCellNode,
    TableRowNode,
    AutoLinkNode,
    LinkNode,
    VariableNode,
  ],
};

export const Editor = (props: TextEditorProps) => {
  const editable = props.editable ?? true;
  const plainText = props.plainText ?? false;
  const editorId = props.id ?? useId();
  return (
    <div className="editor rounded-md">
      {props.label && (
        <label
          htmlFor={editorId}
          onClick={() => {
            const el = document.getElementById(editorId);
            el?.focus();
          }}
          className="mb-1 block text-sm font-medium leading-6">
          {props.label}
        </label>
      )}
      <LexicalComposer initialConfig={{ ...editorConfig }}>
        <div className="editor-container rounded-lg! p-0 transition focus-within:shadow-outline-gray-focused focus-within:border-emphasis!">
          <ToolbarPlugin
            getText={props.getText}
            setText={props.setText}
            editable={editable}
            excludedToolbarItems={props.excludedToolbarItems}
            variables={props.variables}
            addVariableButtonTop={props.addVariableButtonTop}
            updateTemplate={props.updateTemplate}
            firstRender={props.firstRender}
            setFirstRender={props.setFirstRender}
          />
          <div
            className={classNames("editor-inner scroll-bar overflow-x-hidden!", !editable && "bg-subtle!")}
            style={{ height: props.height, maxHeight: props.maxHeight }}>
            <RichTextPlugin
              contentEditable={
                <ContentEditable
                  id={editorId}
                  readOnly={!editable}
                  style={{ height: props.height }}
                  className="editor-input focus:outline-none"
                  data-testid="editor-input"
                />
              }
              placeholder={
                props?.placeholder ? (
                  <div className="text-muted -mt-11 p-3 text-sm">{props.placeholder}</div>
                ) : null
              }
              ErrorBoundary={LexicalErrorBoundary}
            />
            <ListPlugin />
            <LinkPlugin />
            <AutoLinkPlugin />
            <CustomEnterKeyPlugin />
            {props?.variables ? <AddVariablesPlugin variables={props.variables} /> : null}
            <HistoryPlugin />
            <MarkdownShortcutPlugin
              transformers={
                props.disableLists
                  ? TRANSFORMERS.filter((value, index) => {
                      if (index !== 3 && index !== 4) return value;
                    })
                  : TRANSFORMERS
              }
            />
          </div>
        </div>
        <EditablePlugin editable={editable} />
        <PlainTextPlugin setText={props.setText} plainText={plainText} />
      </LexicalComposer>
    </div>
  );
};
