import { createCn } from "cn/config";

// Class merging (clsx and tailwind-merge in one). The type scale of docs/design-system.md adds
// font sizes of its own (`text-small`, `text-subheading`, `text-heading`, `text-figure`,
// `text-title`): named here, so a size and a colour never replace each other ("text-small
// text-destructive" keeps both).
export const cn = createCn({
  extend: {
    classGroups: {
      "font-size": [{ text: ["small", "subheading", "heading", "figure", "title"] }],
    },
  },
});
