// متن قالب شرح خواسته با جاهای خالی برجسته؛ هر سطر یک بند است
import { templateParts } from "@/server/petitions/render";

export function TemplateText({ text, className }: { text: string; className?: string }) {
  return (
    <div className={className}>
      {text.split("\n").map((line, i) => (
        <p key={`${i}-${line.length}`} className="min-h-[1.5em] leading-8">
          {templateParts(line).map((p, j) => p.blank
            ? <mark key={j} className="mx-0.5 rounded-md bg-zafaran-50 px-1.5 py-0.5 text-sm font-medium text-zafaran ring-1 ring-zafaran/25">{p.text}</mark>
            : <span key={j}>{p.text}</span>)}
        </p>
      ))}
    </div>
  );
}
