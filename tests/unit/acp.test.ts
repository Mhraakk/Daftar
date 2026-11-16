// متن استخراج‌شده قانون آیین دادرسی مدنی: پوشش کامل مواد، نبود آثار خرابی استخراج، تطبیق دقیق چند ماده با
// صفحه چاپی (رشته‌های انتظار از روی تصویر صفحه‌ها نوشته شده‌اند، نه از خروجی استخراج) و تطبیق قواعد مهلت با متن ماده.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEADLINE_RULES } from "../../prisma/seed-data/deadline-rules";
import { validateExtractedLaw, type ExtractedLaw } from "@/server/law-import";

const law = JSON.parse(readFileSync("prisma/seed-data/acp/articles.json", "utf8")) as ExtractedLaw;
const byNo = new Map(law.articles.map((a) => [String(a.no), a]));
const text = (no: string): string => byNo.get(no)?.text ?? "";
const LAST_ARTICLE = 529;
const REPEALED = ["326", "411", "412", "524"];

describe("ACP extraction coverage", () => {
  it("has every article 1..529 exactly once, in order", () => {
    expect(law.articles.map((a) => a.no)).toEqual(Array.from({ length: LAST_ARTICLE }, (_, i) => i + 1));
    expect(validateExtractedLaw(law)).toEqual([]);
  });

  it("marks the articles printed as repealed, with their repeal dates", () => {
    expect(law.articles.filter((a) => a.status === "REPEALED").map((a) => String(a.no))).toEqual(REPEALED);
    expect(byNo.get("326")?.statusNote).toBe("منسوخه 1381/07/28");
    expect(byNo.get("524")?.statusNote).toBe("منسوخه 1393/07/15");
  });

  it("keeps the heading path of each article", () => {
    expect(byNo.get("48")?.heading).toEqual(["کتاب اول - در امور مدنی", "باب سوم - دادرسی نخستین", "فصل اول - دادخواست", "مبحث اول - تقدیم دادخواست"]);
    expect(byNo.get("336")?.heading.at(-1)).toBe("فصل سوم - مهلت تجدیدنظر");
  });

  it("leaves no extraction damage behind", () => {
    const all = law.articles.map((a) => a.text).join("\n");
    const damaged = ["ابالغ", "اعالم", "اختالف", "صالحیت", "انقالب", "اسالمی", "تار یخ", "ز یر", "هز ینه", "( )", "ˏ", " ،"];
    expect(damaged.filter((d) => all.includes(d))).toEqual([]);
    // A digit glued to a Persian letter: matches "17نخواهد", rejects "17 نخواهد" and "17،".
    // https://regex101.com/?regex=%5Cd%5B%5Cu0621-%5Cu064A%5Cu0671-%5Cu06D3%5D&testString=17%D9%86%D8%AE%D9%88%D8%A7%D9%87%D8%AF&flavor=javascript
    const gluedDigit = /\d[\u0621-\u064A\u0671-\u06D3]/;
    expect(gluedDigit.test(all)).toBe(false);
  });
});

describe("ACP article texts match the printed page", () => {
  it("article 17 (incidental claim)", () => {
    expect(text("17")).toBe("هر دعوایی که در اثنای رسیدگی به دعوای دیگر از طرف خواهان یا خوانده یا شخص ثالث یا از طرف متداعیین اصلی بر ثالث اقامه شود، دعوای طاری نامیده می‌شود. این دعوا اگر با دعوای اصلی مرتبط یا دارای یک منشاء باشد، در دادگاهی اقامه می‌شود که دعوای اصلی در آنجا اقامه شده است.");
  });

  it("article 48 (a petition starts proceedings)", () => {
    expect(text("48")).toBe("شروع رسیدگی در دادگاه مستلزم تقدیم دادخواست می‌باشد. دادخواست به دفتر دادگاه صالح و در نقاطی که دادگاه دارای شعب متعدد است به دفتر شعبه اول تسلیم می‌گردد.");
  });

  it("article 51 (contents of a petition)", () => {
    expect(text("51")).toBe([
      "دادخواست باید به زبان فارسی در روی برگهای چاپی مخصوص نوشته شده و حاوی نکات زیر باشد:",
      "1- نام، نام خانوادگی، نام پدر، سن، اقامتگاه و حتی المکان شغل خواهان.",
      "تبصره - در صورتی که دادخواست توسط وکیل تقدیم شود مشخصات وکیل نیز باید درج گردد.",
      "2- نام، نام خانوادگی، اقامتگاه و شغل خوانده.",
      "3- تعیین خواسته و بهای آن مگر آن که تعیین بهاء ممکن نبوده و یا خواسته، مالی نباشد.",
      "4- تعهدات و جهاتی که به موجب آن خواهان خود را مستحق مطالبه می‌داند به طوری که مقصود واضح و روشن باشد.",
      "5- آنچه که خواهان از دادگاه درخواست دارد.",
      "6- ذکر ادله و وسایلی که خواهان برای اثبات ادعای خود دارد، از اسناد و نوشتجات و اطلاع مطلعین و غیره، ادله مثبته به ترتیب و واضح نوشته می‌شود و اگر دلیل، گواهی گواه باشد، خواهان باید اسامی و مشخصات و محل اقامت آنان را به طور صحیح معین کند.",
      "7- امضای دادخواست دهنده و در صورت عجز از امضاء، اثر انگشت او.",
      "تبصره 1 - اقامتگاه باید با تمام خصوصیات از قبیل شهر و روستا و دهستان و خیابان به نحوی نوشته شود که ابلاغ به سهولت ممکن باشد.",
      "تبصره 2 - چنانچه خواهان یا خوانده شخص حقوقی باشد، در دادخواست نام و اقامتگاه شخص حقوقی، نوشته خواهد شد.",
    ].join("\n"));
  });

  it("article 53 (incomplete petitions)", () => {
    expect(text("53")).toBe([
      "در موارد زیر دادخواست توسط دفتر دادگاه پذیرفته می‌شود لکن برای به جریان افتادن آن باید به شرح مواد آتی تکمیل شود:",
      "1- در صورتی که به دادخواست و پیوستهای آن برابر قانون تمبر الصاق نشده یا هزینه یاد شده تادیه نشده باشد.",
      "2- وقتی که بندهای (2، 3، 4، 5 و 6) ماده (51) این قانون رعایت نشده باشد.",
    ].join("\n"));
  });

  it("article 62 (value of the claim)", () => {
    expect(text("62")).toBe([
      "بهای خواسته به ترتیب زیر تعیین می‌شود:",
      "1- اگر خواسته پول رایج ایران باشد، بهای آن عبارت است از مبلغ مورد مطالبه، و اگر پول خارجی باشد، ارزیابی آن به نرخ رسمی بانک مرکزی جمهوری اسلامی ایران در تاریخ تقدیم دادخواست بهای خواسته محسوب می‌شود.",
      "2- در دعوای چند خواهان که هر یک قسمتی از کل را مطالبه می‌نماید بهای خواسته مساوی است با حاصل جمع تمام قسمتهایی که مطالبه می‌شود.",
      "3- در دعاوی راجع به منافع و حقوقی که باید در مواعد معین استیفا و یا پرداخت شود، بهای خواسته عبارت است از حاصل جمع تمام اقساط و منافعی که خواهان خود را ذی حق در مطالبه آن می‌داند.",
      "در صورتی که حق نامبرده محدود به زمان معین نبوده و یا مادام العمر باشد بهای خواسته مساوی است با حاصل جمع منافع ده سال یا آنچه را که ظرف ده سال باید استیفا کند.",
      "4- در دعاوی راجع به اموال، بهای خواسته مبلغی است که خواهان در دادخواست معین کرده و خوانده تا اولین جلسه دادرسی به آن ایراد و یا اعتراض نکرده مگر این که قانون ترتیب دیگری معین کرده باشد.",
    ].join("\n"));
  });

  it("article 336 (appeal deadline)", () => {
    expect(text("336")).toBe("مهلت درخواست تجدیدنظر اصحاب دعوا، برای اشخاص مقیم ایران بیست روز و برای اشخاص مقیم خارج از کشور دو ماه از تاریخ ابلاغ یا انقضای مدت واخواهی است.");
  });
});

describe("deadline rules agree with the articles they cite", () => {
  const DAY_WORDS: Record<string, string> = { "7": "یک هفته", "10": "ده روز", "20": "بیست روز" };
  const MONTH_WORDS: Record<string, string> = { "1": "یک ماه", "2": "دو ماه" };
  const acpRules = DEADLINE_RULES.filter((r) => r.lawCode === "ACP");

  it("every civil rule points at existing, valid articles", () => {
    expect(acpRules.length).toBeGreaterThan(0);
    acpRules.forEach((r) => r.articleNos.forEach((n) => expect(byNo.get(n)?.status, `${r.key} → ${n}`).toBe("VALID")));
  });

  it.each(acpRules.map((r) => [r.key, r] as const))("%s: duration appears in the cited article text", (_key, r) => {
    const cited = r.articleNos.map(text).join("\n");
    expect(cited).toContain(DAY_WORDS[String(r.days)]);
    if (r.monthsAbroad) expect(cited).toContain(MONTH_WORDS[String(r.monthsAbroad)]);
  });
});
