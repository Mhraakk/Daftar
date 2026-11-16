import { z } from "zod";
import { audit } from "@/lib/audit";
import { can, type SessionUser } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { AppError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { notify } from "@/lib/notify";

export const messageSchema = z.object({
  subject: z.string().trim().min(2, "موضوع الزامی است.").max(200),
  body: z.string().trim().min(1, "متن پیام الزامی است.").max(10000),
  recipientIds: z.array(z.string()).default([]),
  important: z.boolean().default(false),
  audience: z.enum(["users", "department", "all"]).default("users"),
  parentId: z.string().optional().transform((v) => v || null),
});

export async function sendMessage(input: z.infer<typeof messageSchema>, user: SessionUser) {
  const isAnnouncement = input.audience !== "users";
  if (isAnnouncement && !can(user, "announcement.send")) throw new ForbiddenError("ارسال اطلاعیه نیازمند مجوز است.");
  let recipientIds: string[];
  if (input.audience === "all") recipientIds = (await db.user.findMany({ where: { isActive: true }, select: { id: true } })).map((u) => u.id);
  else if (input.audience === "department") {
    if (!user.departmentId) throw new AppError("شما به واحدی متصل نیستید.");
    recipientIds = (await db.user.findMany({ where: { isActive: true, departmentId: user.departmentId }, select: { id: true } })).map((u) => u.id);
  } else {
    recipientIds = (await db.user.findMany({ where: { id: { in: input.recipientIds }, isActive: true }, select: { id: true } })).map((u) => u.id);
  }
  recipientIds = [...new Set(recipientIds)].filter((id) => id !== user.id);
  if (!recipientIds.length) throw new AppError("دست‌کم یک گیرنده فعال انتخاب کنید.", "VALIDATION", 400, { recipientIds: "الزامی است." });
  if (input.parentId) {
    const parent = await db.message.findFirst({ where: { id: input.parentId, OR: [{ senderId: user.id }, { recipients: { some: { userId: user.id } } }] } });
    if (!parent) throw new NotFoundError();
  }
  const m = await db.$transaction(async (tx) => {
    const msg = await tx.message.create({
      data: {
        senderId: user.id, subject: input.subject, body: input.body, important: input.important, isAnnouncement,
        departmentId: input.audience === "department" ? user.departmentId : null, parentId: input.parentId,
        recipients: { create: recipientIds.map((userId) => ({ userId })) },
      },
    });
    await audit({ actorId: user.id, action: isAnnouncement ? "announcement.sent" : "message.sent", entityType: "Message", entityId: msg.id, entityLabel: msg.subject, meta: { recipients: recipientIds.length } }, tx);
    await notify(recipientIds.map((userId) => ({ userId, type: isAnnouncement ? "announcement" : "message", title: isAnnouncement ? `اطلاعیه: ${msg.subject}` : `پیام جدید از ${user.fullName}`, body: isAnnouncement ? msg.body.slice(0, 140) : msg.subject, link: `/messages/${msg.id}`, entityType: "Message", entityId: msg.id, important: input.important })), tx);
    return msg;
  });
  return { id: m.id };
}

export async function readMessage(id: string, user: SessionUser) {
  const m = await db.message.findFirst({
    where: { id, OR: [{ senderId: user.id }, { recipients: { some: { userId: user.id } } }] },
    include: { recipients: { include: { user: { select: { id: true, fullName: true } } } }, attachments: { where: { deletedAt: null }, select: { id: true, title: true, code: true } }, replies: { orderBy: { createdAt: "asc" } } },
  });
  if (!m) throw new NotFoundError();
  await db.messageRecipient.updateMany({ where: { messageId: id, userId: user.id, readAt: null }, data: { readAt: new Date() } });
  await db.notification.updateMany({ where: { userId: user.id, entityType: "Message", entityId: id, readAt: null }, data: { readAt: new Date() } });
  return m;
}
