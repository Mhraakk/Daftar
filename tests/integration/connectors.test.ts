/* eslint-disable ts-patterns/no-magic-numbers -- assertions compare against literal expected values */
// اتصال‌های بیرونی با Bot API و وب ساختگی (fetch تزریقی): رمزنگاری توکن، پیام آزمایشی، ارسال صف اعلان و بازگشت پس از خطا،
// اتصال حساب با کد یک‌بارمصرف، اعتبارسنجی شناسه گفت‌وگو، و فهرست سفید منابع حقوقی وب.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SessionUser } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import {
  confirmMessengerLink, getConnector, importFromUrl, pushNotifications, saveLegalWeb, saveMessenger, setOwnChatId, startMessengerLink, testMessenger,
} from "@/server/connectors";
import { asUser, prisma, tag } from "./helpers";

const T = tag();
const TOKEN = `123456:SECRET-${T}`;
const BASE = "https://tapi.bale.ai";
let manager: SessionUser, employee: SessionUser;

interface Call { url: string; body: Record<string, unknown> | null }
/** Bot API ساختگی: پاسخ هر متد از نقشه، و ثبت همه فراخوانی‌ها */
function fakeBot(results: Record<string, unknown>, fail?: string): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const impl = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null });
    const method = url.split("/").pop()?.split("?")[0] ?? "";
    if (fail) return new Response(JSON.stringify({ ok: false, description: fail }), { status: 403 });
    return new Response(JSON.stringify({ ok: true, result: results[method] ?? true }), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { fetch: impl as typeof fetch, calls };
}

const reset = () => db.connector.updateMany({ where: { key: { in: ["messenger_bot", "legal_web"] } }, data: { enabled: false, config: {}, secretEnc: null, status: "NOT_CONFIGURED", lastError: null, lastSyncAt: null } });

beforeAll(async () => {
  [manager, employee] = await Promise.all(["t.manager", "t.employee"].map(asUser));
  await Promise.all([getConnector("messenger_bot"), getConnector("legal_web")]);
  await reset();
});

afterAll(async () => {
  await reset();
  await prisma.user.updateMany({ where: { id: { in: [manager.id, employee.id] } }, data: { messengerChatId: null, messengerLinkCode: null, messengerLinkUntil: null } });
  await prisma.notification.deleteMany({ where: { title: { contains: T } } });
  await prisma.legalSource.deleteMany({ where: { tags: { has: "ورود از وب" }, sourceName: "law.example.ir", title: { contains: T } } });
  await prisma.$disconnect();
});

describe("messenger bot", () => {
  it("stores the bot token encrypted, never in plain text, and requires one to enable", async () => {
    await expect(saveMessenger({ enabled: true, baseUrl: BASE, token: null, minimal: true, types: ["deadline.reminder"] }, manager)).rejects.toThrow("توکن");
    await saveMessenger({ enabled: true, baseUrl: BASE, token: TOKEN, minimal: true, types: ["deadline.reminder"] }, manager);
    const c = await prisma.connector.findUniqueOrThrow({ where: { key: "messenger_bot" } });
    expect(c.secretEnc).toBeTruthy();
    expect(c.secretEnc).not.toContain("SECRET");
    expect(JSON.stringify(c.config)).not.toContain("SECRET");
    // ذخیره بدون توکن، توکن قبلی را نگه می‌دارد
    await saveMessenger({ enabled: true, baseUrl: BASE, token: "", minimal: true, types: ["deadline.reminder"] }, manager);
    expect((await prisma.connector.findUniqueOrThrow({ where: { key: "messenger_bot" } })).secretEnc).toBe(c.secretEnc);
  });

  it("sends a test message to the admin's own chat and records the connector status", async () => {
    await expect(testMessenger(manager, fakeBot({}).fetch)).rejects.toThrow("حساب کاربری");
    await setOwnChatId(manager, "۵۵۵۰۰۰۱۱۱");
    const bot = fakeBot({ sendMessage: {} });
    await testMessenger(manager, bot.fetch);
    expect(bot.calls[0].url).toBe(`${BASE}/bot${TOKEN}/sendMessage`);
    expect(bot.calls[0].body?.chat_id).toBe("555000111");
    expect((await prisma.connector.findUniqueOrThrow({ where: { key: "messenger_bot" } })).status).toBe("OK");
  });

  it("pushes queued notifications once with a minimal text, and re-queues them when the bot fails", async () => {
    const n = await prisma.notification.create({ data: { userId: manager.id, type: "deadline.reminder", title: `یادآوری مهلت ${T} پرونده محرمانه`, body: "جزئیات" } });
    const failing = fakeBot({}, "Forbidden: bot was blocked");
    expect(await pushNotifications(failing.fetch)).toBe(0);
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: n.id } })).pushedAt).toBeNull();
    const c = await prisma.connector.findUniqueOrThrow({ where: { key: "messenger_bot" } });
    expect(c).toMatchObject({ status: "ERROR", lastError: "Forbidden: bot was blocked" });

    const ok = fakeBot({ sendMessage: {} });
    expect(await pushNotifications(ok.fetch)).toBe(1);
    expect(String(ok.calls[0].body?.text)).not.toContain("محرمانه"); // پیام حداقلی بدون عنوان
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: n.id } })).pushedAt).not.toBeNull();
    expect(await pushNotifications(fakeBot({ sendMessage: {} }).fetch)).toBe(0); // دوباره فرستاده نمی‌شود
  });

  it("links a user's chat with a one-time code sent to the bot", async () => {
    const start = await startMessengerLink(employee, fakeBot({ getMe: { username: "daftar_bot" } }).fetch);
    // Link code: matches "DFT-004215", rejects "DFT-42" and "dft-004215".
    // https://regex101.com/?regex=%5EDFT-%5Cd%7B6%7D%24&testString=DFT-004215&flavor=javascript
    expect(start.code).toMatch(/^DFT-\d{6}$/);
    expect(start.bot).toBe("daftar_bot");
    await expect(confirmMessengerLink(employee, fakeBot({ getUpdates: [{ message: { chat: { id: 1 }, text: "سلام" } }] }).fetch)).rejects.toThrow("نرسیده");
    const updates = [{ message: { chat: { id: 111 }, text: "DFT-000000" } }, { message: { chat: { id: 987654321 }, text: `/start ${start.code}` } }];
    const bot = fakeBot({ getUpdates: updates, sendMessage: {} });
    expect(await confirmMessengerLink(employee, bot.fetch)).toEqual({ chat: "…4321" });
    const row = await prisma.user.findUniqueOrThrow({ where: { id: employee.id } });
    expect(row).toMatchObject({ messengerChatId: "987654321", messengerLinkCode: null });
    expect(bot.calls.at(-1)?.body?.chat_id).toBe("987654321"); // پیام تأیید
    await expect(confirmMessengerLink(employee, bot.fetch)).rejects.toThrow("منقضی");
  });

  it("refuses an expired code and validates manual chat ids", async () => {
    await startMessengerLink(employee, fakeBot({}).fetch, new Date(Date.now() - 16 * 60_000));
    await expect(confirmMessengerLink(employee, fakeBot({ getUpdates: [] }).fetch)).rejects.toThrow("منقضی");
    await expect(setOwnChatId(employee, "abc")).rejects.toThrow("عدد");
    await setOwnChatId(employee, "-100123456");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: employee.id } })).messengerChatId).toBe("-100123456");
    await setOwnChatId(employee, "");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: employee.id } })).messengerChatId).toBeNull();
    const log = await prisma.activityLog.findFirstOrThrow({ where: { entityId: employee.id, action: "user.messenger_unlinked" }, orderBy: { createdAt: "desc" } });
    expect(log.actorId).toBe(employee.id);
  });
});

describe("official legal web sources", () => {
  const page = `<html><head><title>قانون آزمون ${T}</title></head><body><nav>منو</nav><main><h1>ماده ۱</h1><p>متن ماده نخست قانون آزمون برای ورود به کتابخانه.</p></main></body></html>`;
  const web = (async () => new Response(page, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } })) as unknown as typeof fetch;

  it("accepts only public domains in the allowlist", async () => {
    await expect(saveLegalWeb({ enabled: true, domains: ["localhost"] }, manager)).rejects.toThrow("نامعتبر");
    await expect(saveLegalWeb({ enabled: true, domains: ["192.168.1.5"] }, manager)).rejects.toThrow("نامعتبر");
    await expect(saveLegalWeb({ enabled: true, domains: ["law.example.ir/path"] }, manager)).rejects.toThrow("نامعتبر");
    await saveLegalWeb({ enabled: true, domains: ["law.example.ir"] }, manager);
  });

  it("imports an allowed page as an unverified library source and refuses other hosts", async () => {
    await expect(importFromUrl("https://evil.example.com/x", manager, web)).rejects.toThrow("مجاز");
    const { id } = await importFromUrl("https://www.law.example.ir/laws/1", manager, web);
    const s = await prisma.legalSource.findUniqueOrThrow({ where: { id } });
    expect(s).toMatchObject({ verified: false, sourceName: "www.law.example.ir", title: `قانون آزمون ${T}` });
    expect(s.text).toContain("متن ماده نخست");
    expect(s.text).not.toContain("منو");
    expect(s.retrievedAt).not.toBeNull();
  });
});
