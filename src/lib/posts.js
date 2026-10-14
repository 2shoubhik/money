// Research posts live in src/posts/*.md. The filename is the URL slug.
const modules = import.meta.glob("../posts/*.md", { eager: true });

export const posts = Object.entries(modules)
  .map(([path, mod]) => ({
    slug: path.split("/").pop().replace(/\.md$/, ""),
    ...mod.frontmatter,
    Content: mod.Content,
  }))
  .filter((p) => !p.draft)
  .sort((a, b) => String(b.date).localeCompare(String(a.date)));

export const fmtDate = (d) =>
  new Date(String(d).slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
