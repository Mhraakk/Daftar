// کارت یک منبع کتابخانه (ماده قانون، رأی، نظریه، …) با وضعیت اعتبار، وضعیت تأیید و میان‌برهای استناد
import Link from "next/link";
import { BadgeCheck, FileText } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { Seal, StatusSeal } from "@/components/ui/seal";
import { cn } from "@/lib/cn";
import { SOURCE_STATUS } from "@/lib/labels";
import { faNum } from "@/lib/text";
import { citationOf } from "@/server/legal-library";
import { CopyButton } from "./copy-button";

export interface SourceCardData {
  id: string; title: string; reference: string | null; articleNo: string | null; lawCode: string | null; text: string;
  status: string; statusNote: string | null; verified: boolean; headingPath: string[]; sourcePages: number[]; editedAt?: Date | null;
}

export function SourceCard({ s, snippet, showHeading = false, anchor = false }: { s: SourceCardData; snippet?: string; showHeading?: boolean; anchor?: boolean }) {
  const repealed = s.status === "REPEALED";
  const citation = citationOf(s);
  return (
    <article id={anchor && s.articleNo ? `a-${s.articleNo}` : undefined} data-testid="source-card"
      className={cn("scroll-mt-24 rounded-lg border border-line bg-surface p-4", repealed && "border-dashed bg-surface-2 opacity-80")}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <Link href={`/research/library/${s.id}`} className="font-bold hover:text-lapis">{s.title}</Link>
        <div className="flex flex-wrap items-center gap-1">
          <StatusSeal map={SOURCE_STATUS} value={s.status} />
          {s.verified ? <Seal tone="success"><BadgeCheck className="size-3" aria-hidden />تأییدشده</Seal> : <Seal tone="neutral">تأییدنشده</Seal>}
          {s.editedAt && <Seal tone="accent">اصلاح دستی</Seal>}
        </div>
      </header>
      {showHeading && s.headingPath.length > 0 && <p className="mt-1 text-xs text-ink-3">{s.headingPath.slice(1).join(" › ")}</p>}
      {s.statusNote && <p className="mt-1 text-xs font-bold text-danger">{s.statusNote}{repealed ? " — برای استناد پیشنهاد نمی‌شود" : ""}</p>}
      <p className="mt-2 whitespace-pre-line text-sm leading-8">{snippet ?? s.text}</p>
      <footer className="no-print mt-2 flex flex-wrap items-center gap-1">
        <CopyButton text={citation} label="کپی استناد" testId="copy-citation" />
        <CopyButton text={`${citation}:\n${s.text}`} label="کپی متن ماده" />
        {s.lawCode && s.sourcePages[0] && (
          <a className={buttonClass("ghost", "sm")} href={`/api/library/laws/${s.lawCode}/source#page=${s.sourcePages[0]}`} target="_blank" rel="noopener">
            <FileText />صفحه {faNum(s.sourcePages[0])} منبع
          </a>
        )}
      </footer>
    </article>
  );
}
