/** Let keyboard readers scroll wide Markdown/MDX tables without any client script. */
export function focusableTables() {
  return (tree) => {
    const visit = (node) => {
      if (node.type === 'element' && node.tagName === 'table') {
        node.properties ??= {};
        node.properties.tabIndex = 0;
      }
      for (const child of node.children ?? []) visit(child);
    };
    visit(tree);
  };
}
