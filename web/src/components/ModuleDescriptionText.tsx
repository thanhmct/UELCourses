type ModuleDescriptionTextProps = {
  text: string;
  lang: "vi" | "en";
};

const BULLET_SEPARATOR = /\s*(?:\b\d{1,3}\s+)?[•●▪]\s*/u;

function paragraphs(text: string) {
  return text
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function ModuleDescriptionText({ text, lang }: ModuleDescriptionTextProps) {
  const normalized = text.replace(/\r/g, "").trim();
  const [intro = "", ...rawItems] = normalized.split(BULLET_SEPARATOR);
  const items = rawItems.map((item) => item.trim()).filter(Boolean);

  if (!items.length) {
    return (
      <div lang={lang} className="space-y-2 text-sm leading-7 text-slate-700 dark:text-slate-300">
        {paragraphs(normalized).map((paragraph, index) => <p key={`${index}-${paragraph}`}>{paragraph}</p>)}
      </div>
    );
  }

  return (
    <div lang={lang} className="text-sm text-slate-700 dark:text-slate-300">
      {paragraphs(intro).map((paragraph, index) => (
        <p key={`${index}-${paragraph}`} className="leading-7">{paragraph}</p>
      ))}
      <ul className={intro.trim() ? "mt-3 grid gap-2" : "grid gap-2"}>
        {items.map((item, index) => (
          <li
            key={`${index}-${item}`}
            className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-md border border-slate-200/80 bg-slate-50/80 px-3 py-2.5 dark:border-slate-700/80 dark:bg-slate-800/50"
          >
            <span aria-hidden="true" className="mt-[0.65rem] h-1.5 w-1.5 rounded-full bg-brand-focus" />
            <span className="min-w-0 leading-6">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
