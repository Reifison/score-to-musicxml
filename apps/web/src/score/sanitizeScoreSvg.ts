import DOMPurify from "dompurify";

const blockedTags = ["script", "foreignObject", "iframe", "object", "embed", "image", "a"];

export function sanitizeScoreSvg(svg: string, scoreName: string): string {
  const sanitized = DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ["use"],
    ADD_ATTR: ["href", "xlink:href"],
    FORBID_TAGS: blockedTags,
    RETURN_DOM_FRAGMENT: true
  });

  const root = sanitized.firstElementChild;
  if (!root || root.localName !== "svg" || sanitized.childElementCount !== 1) {
    throw new Error("Não foi possível preparar a visualização desta partitura.");
  }

  for (const element of root.querySelectorAll("*")) {
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.localName === "href" && !attribute.value.trim().startsWith("#")) {
        element.removeAttributeNode(attribute);
      }
    }
  }

  root.removeAttribute("width");
  root.removeAttribute("height");
  root.setAttribute("role", "img");
  root.setAttribute("aria-label", `Partitura digital: ${scoreName}`);
  root.setAttribute("preserveAspectRatio", "xMidYMin meet");
  return root.outerHTML;
}
