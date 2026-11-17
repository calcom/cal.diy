import TurndownService from "turndown";

const turndownService = new TurndownService();

function turndown(html: string | TurndownService.Node): string {
  let result = turndownService.turndown(html);
  result = result.replaceAll("[<p><br></p>]", "");

  if (result === "<p><br></p>") {
    result = "";
  }

  return result;
}

turndownService.addRule("shiftEnter", {
  filter: (node) => node.nodeName === "BR" && !!isShiftEnter(node),
  replacement: () => "<br>",
});

turndownService.addRule("enter", {
  filter: (node) => node.nodeName === "BR" && !isShiftEnter(node),
  replacement: () => "<p><br></p>",
});

turndownService.addRule("ignoreEmphasized", {
  filter: "em",
  replacement: (content) => content,
});

function isShiftEnter(node: HTMLElement) {
  let currentNode: HTMLElement | null | ParentNode = node;

  while (currentNode != null && currentNode.nodeType !== 1) {
    currentNode = currentNode.parentElement || currentNode.parentNode;
  }

  return (
    currentNode &&
    currentNode.nodeType === 1 &&
    currentNode.parentElement &&
    currentNode.parentElement.childNodes.length !== 1 // normal enter is <p><br><p> (p has exactly one childNode)
  );
}

export default turndown;
