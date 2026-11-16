import { db, type Tx } from "./db";
import { currentJalaliYear } from "./jalali";

const PREFIX: Record<string, string> = {
  CLIENT: "M", CASE: "P", DOCUMENT: "S", CORR_IN: "V", CORR_OUT: "KH", CORR_INT: "D", TASK: "T", DRAFT: "L",
};

/** شماره‌گذاری یکتا و بدون تداخل هم‌زمانی: PREFIX-سال شمسی-شماره ردیف */
export async function nextNumber(key: keyof typeof PREFIX, tx?: Tx): Promise<string> {
  const year = currentJalaliYear();
  const rows = await (tx ?? db).$queryRaw<{ value: number }[]>`
    INSERT INTO "Sequence" ("key", "year", "value") VALUES (${key}, ${year}, 1)
    ON CONFLICT ("key", "year") DO UPDATE SET "value" = "Sequence"."value" + 1
    RETURNING "value"`;
  return `${PREFIX[key]}-${year}-${String(rows[0].value).padStart(5, "0")}`;
}
