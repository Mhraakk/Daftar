"use client";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, Heading1, Heading2, Heading3, Italic, List, ListOrdered, Minus, Pilcrow, Quote, Redo2, Table as TableIcon, Trash2, Underline, Undo2 } from "lucide-react";
import { useEffect } from "react";
import { cn } from "@/lib/cn";

/** برجسته‌سازی فیلدهای تکمیل‌نشده «{{…}}» در متن */
const FieldTokens = Extension.create({
  name: "fieldTokens",
  addProseMirrorPlugins() {
    return [new Plugin({
      key: new PluginKey("fieldTokens"),
      props: {
        decorations(state) {
          const decos: Decoration[] = [];
          state.doc.descendants((node, pos) => {
            if (!node.isText || !node.text) return;
            for (const m of node.text.matchAll(/\{\{[^{}]+\}\}/g)) decos.push(Decoration.inline(pos + m.index!, pos + m.index! + m[0].length, { class: "field-token", title: "فیلد تکمیل‌نشده" }));
          });
          return DecorationSet.create(state.doc, decos);
        },
      },
    })];
  },
});

function Btn({ on, active, label, children, disabled }: { on: () => void; active?: boolean; label: string; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={on} disabled={disabled} title={label} aria-label={label} aria-pressed={active}
      className={cn("flex size-8 items-center justify-center rounded text-ink-2 transition-colors hover:bg-ink/10 disabled:opacity-35 [&_svg]:size-4", active && "bg-night text-on-night hover:bg-night")}>{children}</button>
  );
}
const Sep = () => <span className="mx-1 h-5 w-px bg-line-strong" aria-hidden />;

function Toolbar({ e }: { e: Editor }) {
  const inTable = e.isActive("table");
  return (
    <div className="sticky top-14 z-10 flex flex-wrap items-center gap-0.5 rounded-t-lg border-b border-line bg-surface-2 px-2 py-1.5" role="toolbar" aria-label="ابزار ویرایش">
      <Btn label="بازگردانی (Ctrl+Z)" on={() => e.chain().focus().undo().run()} disabled={!e.can().undo()}><Undo2 /></Btn>
      <Btn label="انجام دوباره" on={() => e.chain().focus().redo().run()} disabled={!e.can().redo()}><Redo2 /></Btn><Sep />
      <Btn label="متن عادی" on={() => e.chain().focus().setParagraph().run()} active={e.isActive("paragraph")}><Pilcrow /></Btn>
      <Btn label="عنوان اصلی" on={() => e.chain().focus().toggleHeading({ level: 1 }).run()} active={e.isActive("heading", { level: 1 })}><Heading1 /></Btn>
      <Btn label="عنوان بخش" on={() => e.chain().focus().toggleHeading({ level: 2 }).run()} active={e.isActive("heading", { level: 2 })}><Heading2 /></Btn>
      <Btn label="زیرعنوان" on={() => e.chain().focus().toggleHeading({ level: 3 }).run()} active={e.isActive("heading", { level: 3 })}><Heading3 /></Btn><Sep />
      <Btn label="پررنگ (Ctrl+B)" on={() => e.chain().focus().toggleBold().run()} active={e.isActive("bold")}><Bold /></Btn>
      <Btn label="مورب (Ctrl+I)" on={() => e.chain().focus().toggleItalic().run()} active={e.isActive("italic")}><Italic /></Btn>
      <Btn label="زیرخط (Ctrl+U)" on={() => e.chain().focus().toggleUnderline().run()} active={e.isActive("underline")}><Underline /></Btn><Sep />
      <Btn label="راست‌چین" on={() => e.chain().focus().setTextAlign("right").run()} active={e.isActive({ textAlign: "right" })}><AlignRight /></Btn>
      <Btn label="وسط‌چین" on={() => e.chain().focus().setTextAlign("center").run()} active={e.isActive({ textAlign: "center" })}><AlignCenter /></Btn>
      <Btn label="چپ‌چین" on={() => e.chain().focus().setTextAlign("left").run()} active={e.isActive({ textAlign: "left" })}><AlignLeft /></Btn>
      <Btn label="تراز دوطرفه" on={() => e.chain().focus().setTextAlign("justify").run()} active={e.isActive({ textAlign: "justify" })}><AlignJustify /></Btn><Sep />
      <Btn label="فهرست شماره‌دار" on={() => e.chain().focus().toggleOrderedList().run()} active={e.isActive("orderedList")}><ListOrdered /></Btn>
      <Btn label="فهرست نشانه‌دار" on={() => e.chain().focus().toggleBulletList().run()} active={e.isActive("bulletList")}><List /></Btn>
      <Btn label="نقل قول / تورفتگی" on={() => e.chain().focus().toggleBlockquote().run()} active={e.isActive("blockquote")}><Quote /></Btn>
      <Btn label="خط جداکننده" on={() => e.chain().focus().setHorizontalRule().run()}><Minus /></Btn><Sep />
      <Btn label="درج جدول" on={() => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} disabled={inTable}><TableIcon /></Btn>
      {inTable && <>
        <button type="button" className="rounded px-2 py-1 text-xs hover:bg-ink/10" onClick={() => e.chain().focus().addRowAfter().run()}>+ سطر</button>
        <button type="button" className="rounded px-2 py-1 text-xs hover:bg-ink/10" onClick={() => e.chain().focus().addColumnAfter().run()}>+ ستون</button>
        <button type="button" className="rounded px-2 py-1 text-xs hover:bg-ink/10" onClick={() => e.chain().focus().deleteRow().run()}>− سطر</button>
        <button type="button" className="rounded px-2 py-1 text-xs hover:bg-ink/10" onClick={() => e.chain().focus().deleteColumn().run()}>− ستون</button>
        <Btn label="حذف جدول" on={() => e.chain().focus().deleteTable().run()}><Trash2 /></Btn>
      </>}
    </div>
  );
}

export function RichEditor({ value, onChange, editable = true, onSaveShortcut, externalValue, onReady }: { value: string; onChange: (html: string) => void; editable?: boolean; onSaveShortcut?: () => void; externalValue?: { html: string; nonce: number }; onReady?: (e: Editor) => void }) {
  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false, code: false, codeBlock: false }),
      TextAlign.configure({ types: ["heading", "paragraph"], alignments: ["right", "center", "left", "justify"] }),
      Table.configure({ resizable: false }), TableRow, TableHeader, TableCell, FieldTokens,
    ],
    content: value,
    editorProps: {
      attributes: { class: "legal-doc min-h-[60vh] px-4 py-6 outline-none sm:px-10 sm:py-8", dir: "rtl", "aria-label": "متن سند", role: "textbox", "aria-multiline": "true" },
      handleKeyDown(_v, ev) { if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "s") { ev.preventDefault(); onSaveShortcut?.(); return true; } return false; },
    },
    onUpdate: ({ editor: ed }) => onChange(ed.getHTML()),
  });
  useEffect(() => { editor?.setEditable(editable); }, [editor, editable]);
  useEffect(() => { if (editor) onReady?.(editor); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [editor]);
  // جایگزینی متن از بیرون (بازگردانی نسخه یا درج پیش‌نویس هوش مصنوعی)
  useEffect(() => { if (editor && externalValue) { editor.commands.setContent(externalValue.html, { emitUpdate: true }); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [externalValue?.nonce]);
  if (!editor) return <div className="min-h-[60vh] animate-pulse rounded-lg bg-line/40" aria-label="در حال بارگذاری ویرایشگر" />;
  return (
    <div className="rounded-lg border border-line-strong bg-surface shadow-raised">
      {editable && <Toolbar e={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}
