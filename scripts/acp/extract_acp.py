#!/usr/bin/env python3
"""Extract the Civil Procedure Code (ق.آ.د.م) from the publisher PDF into structured article data.

Dev-time tool; the running app never calls it. It writes:
  articles.json            every article with its heading path, text, notes, status and pages
  corrections-report.json  every change made to the PDF text layer, with the evidence for it

Sources of truth, in order:
  1. The PDF text layer (pdftotext), after stripping bidi controls and NFKC normalisation.
  2. OCR of the rendered page (tesseract, fas). An OCR word replaces a text-layer word only for the
     known extraction defects of this PDF and only when the OCR word on the same line agrees:
       A. the «لا» ligature comes out as «ال» or as a bare «ل» (ابالغ → ابلاغ, لزم → لازم)
       B. a word is split before «ی» (تار یخ → تاریخ)
  3. A reviewed word table for the madda: the PDF itself prints «ان» for «آن» (the glyph is missing on
     the rendered page too, so OCR cannot help). Only words listed in MADDA_WORDS are restored.
Bidi damage around numbers and parentheses ("ماده ( )51" → "ماده (51)") is repaired by fixed rules.

Status comes from the PDF's colour legend (page 3): black = valid, green = amended/added,
red = repealed or suspended, orange = interpretation; «منسوخه» in an article heading also marks it.

Requirements: poppler-utils (pdftotext, pdftoppm), tesseract-ocr + fas model, PyMuPDF.
Usage:
  python3 scripts/acp/extract_acp.py --pdf FILE.pdf --out prisma/seed-data/acp --work /tmp/acp-work
"""
from __future__ import annotations

import argparse
import csv
import difflib
import hashlib
import html
import itertools
import json
import os
import re
import subprocess
import sys
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone

LAST_ARTICLE = 529
FIRST_LAW_PAGE = 3
OCR_DPI = 300
PX_TO_PT = 72 / OCR_DPI
LINE_TOLERANCE_PT = 3.0
PARAGRAPH_END_GAP_PT = 25.0
MAX_LIGATURE_EDITS = 3
PROPAGATE_RATIO = 3

BIDI_CONTROLS = {0x200E, 0x200F, 0x202A, 0x202B, 0x202C, 0x202D, 0x202E, 0x2066, 0x2067, 0x2068, 0x2069}
RUNNING_HEADER = "قانون آیین دادرسی مدنی"

COLOR_STATUS = {
    "#000000": "VALID",
    "#538135": "AMENDED",
    "#385623": "AMENDED",
    "#ff0000": "REPEALED",
    "#ed7d31": "INTERPRETATION",
}

# Words the publisher PDF renders without madda (the glyph is missing on the page itself). Each entry
# was reviewed: the form without madda is not a Persian word in these positions.
MADDA_WORDS = {
    "ان": "آن", "انان": "آنان", "انها": "آنها", "انرا": "آنرا", "انچه": "آنچه", "انجا": "آنجا",
    "انکه": "آنکه", "انهم": "آنهم", "ارای": "آرای", "اراء": "آراء", "اخر": "آخر", "اخرین": "آخرین",
    "ایین": "آیین", "ائین": "آئین", "اگهی": "آگهی", "اتی": "آتی", "امد": "آمد", "امده": "آمده",
    "اماده": "آماده", "اید": "آید", "اثار": "آثار", "اوری": "آوری", "اورده": "آورده", "اورند": "آورند",
    "اورد": "آورد", "اوردن": "آوردن", "اذوقه": "آذوقه", "اینده": "آینده", "ادرس": "آدرس",
    "ازاد": "آزاد", "ازادی": "آزادی", "امره": "آمره", "درامد": "درآمد", "درامدهای": "درآمدهای",
    "میاید": "می‌آید", "میاورند": "می‌آورند",
}

# Ligature and split-word defects that OCR misread or could not align, reviewed against the rendered page.
REVIEWED_WORDS = {
    "بال": "بالا", "کال": "کالا", "وال": "والا", "بالبر": "بالابر", "اسالم": "اسلام", "سالنه": "سالانه",
    "سوالتی": "سوالاتی", "بالتر": "بالاتر", "بالترین": "بالاترین", "کثیرالنتشار": "کثیرالانتشار",
    "التباع": "الاتباع", "الجرا": "الاجرا", "الجراء": "الاجراء", "الجاره": "الاجاره",
    # Missing word spaces in the source (the words run together on the printed page as well).
    "راعنوان": "را عنوان", "کردهاست": "کرده است", "یاسند": "یا سند", "بهدعاوی": "به دعاوی",
    "مورداستناد": "مورد استناد", "بهاطلاع": "به اطلاع", "ازاثبات": "از اثبات", "اعساردر": "اعسار در",
    "درمهلت": "در مهلت", "درمواردی": "در مواردی", "درصورتی": "در صورتی", "درجریان": "در جریان",
    "بنابه": "بنا به", "غیراین": "غیر این",
}
REVIEWED_PHRASES = {"ر یال": "ریال", "و ا ّل": "و الّا", "وا ّل": "والّا", "می‌نمایداگر": "می‌نماید اگر"}

# A word that starts with «ی» after a space is usually a word of its own; never glue these to the word before.
STANDALONE_YE_WORDS = {"یا", "یک", "یکی", "یکدیگر", "یاد", "یعنی", "یکصد", "یکهزار", "یکسال", "یکسان", "یکجا"}

HEADING_LEVELS = (("کتاب", "BOOK"), ("باب", "PART"), ("فصل", "CHAPTER"), ("مبحث", "SECTION"))
STANDALONE_HEADINGS = {"کلیات": "GENERAL", "سایر مقررات:": "OTHER"}

# Regex examples are given beside each pattern; test them at https://regex101.com (flavour: Python).
RE_ARTICLE = re.compile(r"^ماده\s+[-–]\s*(\d+)\s*(.*)$")  # "ماده  - 51دادخواست ..." / "ماده  – 89در مورد"
RE_ARTICLE_REPEALED = re.compile(  # "ماده ( 326منسوخه  -)1381ˏ07ˏ28ارای ..."
    r"^ماده\s*\(\s*(\d+)\s*منسوخه\s*[-–]\s*\)\s*(\d{4})[ˏ/](\d{1,2})[ˏ/](\d{1,2})\s*(.*)$")
RE_NOTE = re.compile(r"^تبصره\s*[-–]\s*(\d+)?\s*(.*)$")  # "تبصره  - 1در مورد ..." / "تبصره  -چنانچه ..."
RE_CLAUSE_REPEALED = re.compile(  # "الف (منسوخه  -)1393ˏ07ˏ15مسکن ..."
    r"^([آ-ی]{1,3})\s*\(\s*منسوخه\s*[-–]\s*\)\s*(\d{4})[ˏ/](\d{1,2})[ˏ/](\d{1,2})\s*(.*)$")
RE_LETTER_CLAUSE = re.compile(r"^([آ-ی]{1,3})\s+[-–]\s*(.*)$")  # "الف  -در دعاوی مالی ..."
RE_NUMBER_CLAUSE = re.compile(r"^[-–]\s*(\d+)\s*(.*)$")  # "-2وقتی که ..."
RE_HEADING = re.compile(r"^(کتاب|باب|فصل|مبحث)\s+(\S+(?:\s+\S+)?)\s+[-–]\s*(.+)$")  # "فصل اول  -دادخواست"


@dataclass
class Line:
    page: int
    text: str
    y0: float
    y1: float
    x0: float
    x1: float
    color: str = "#000000"
    tokens: list[str] = field(default_factory=list)


@dataclass
class Correction:
    kind: str
    page: int
    before: str
    after: str
    evidence: str
    context: str


def run(cmd: list[str]) -> str:
    return subprocess.run(cmd, check=True, capture_output=True, text=True).stdout


def clean(text: str) -> str:
    return unicodedata.normalize("NFKC", "".join(c for c in text if ord(c) not in BIDI_CONTROLS))


DIACRITICS = {chr(c) for c in range(0x064B, 0x0660)} | {"ٰ", "ـ", "‌", "‍"}
CHAR_MAP = str.maketrans({"ي": "ی", "ى": "ی", "ك": "ک", "ۀ": "ه", "ة": "ه", **{chr(0x06F0 + i): str(i) for i in range(10)},
                          **{chr(0x0660 + i): str(i) for i in range(10)}})


def norm(token: str) -> str:
    """Comparison form: no diacritics/ZWNJ, unified ی/ک, ASCII digits, letters and digits only."""
    t = "".join(c for c in token if c not in DIACRITICS).translate(CHAR_MAP)
    return "".join(c for c in t if c.isalnum())


# ───────────── PDF text with geometry and colour ─────────────

def page_lines(pdf: str, page: int) -> list[Line]:
    text = clean(run(["pdftotext", "-f", str(page), "-l", str(page), pdf, "-"]))
    logical = [l for l in text.split("\n") if l.strip() and l.strip() != "\f"]
    bbox = run(["pdftotext", "-f", str(page), "-l", str(page), "-bbox-layout", pdf, "-"])
    boxes = []
    for m in re.finditer(r'<line xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</line>', bbox, re.S):
        words = "".join(clean(html.unescape(w)) for w in re.findall(r"<word[^>]*>(.*?)</word>", m.group(5)))
        boxes.append((float(m.group(1)), float(m.group(2)), float(m.group(3)), float(m.group(4)), words))
    if len(boxes) != len(logical):
        raise SystemExit(f"page {page}: {len(logical)} text lines but {len(boxes)} bbox lines")
    lines = []
    for raw, (x0, y0, x1, y1, words) in zip(logical, boxes):
        if Counter(raw.replace(" ", "")) != Counter(words.replace(" ", "")):
            raise SystemExit(f"page {page}: text/bbox line mismatch: {raw!r}")
        lines.append(Line(page, raw.strip(), y0, y1, x0, x1))
    return lines


def merge_fragments(lines: list[Line]) -> tuple[list[Line], list[str]]:
    """Join pieces of one printed line that pdftotext emitted as separate lines (right-to-left order).

    A piece made only of a combining mark (a stray shadda) is dropped and reported.
    """
    merged: list[Line] = []
    dropped: list[str] = []
    for line in lines:
        if line.text and all(unicodedata.combining(c) for c in line.text.replace(" ", "")):
            dropped.append(f"page {line.page} y={line.y0:.1f}: {line.text!r}")
            continue
        prev = merged[-1] if merged else None
        overlap = prev and min(prev.y1, line.y1) - max(prev.y0, line.y0)
        if prev and overlap and overlap > 0.5 * min(prev.y1 - prev.y0, line.y1 - line.y0):
            parts = sorted([prev, line], key=lambda l: -l.x1)
            prev.text = " ".join(p.text for p in parts)
            prev.x0, prev.x1 = min(prev.x0, line.x0), max(prev.x1, line.x1)
            prev.y0, prev.y1 = min(prev.y0, line.y0), max(prev.y1, line.y1)
            continue
        merged.append(line)
    return merged, dropped


def assign_colours(pdf: str, pages: dict[int, list[Line]]) -> None:
    import pymupdf  # noqa: PLC0415 — only this step needs PyMuPDF

    doc = pymupdf.open(pdf)
    for page, lines in pages.items():
        spans = []
        for block in doc[page - 1].get_text("dict")["blocks"]:
            for line in block.get("lines", []):
                for span in line["spans"]:
                    n = len(span["text"].strip())
                    if n:
                        spans.append((span["bbox"][1], span["bbox"][3], "#%06x" % span["color"], n))
        for line in lines:
            mid = (line.y0 + line.y1) / 2
            votes = Counter()
            for y0, y1, colour, n in spans:
                if y0 - LINE_TOLERANCE_PT <= mid <= y1 + LINE_TOLERANCE_PT and colour != "#ffffff":
                    votes[colour] += n
            if votes:
                line.color = votes.most_common(1)[0][0]


# ───────────── OCR ─────────────

def ocr_lines(pdf: str, page: int, work: str) -> list[tuple[float, float, float, list[str]]]:
    """OCR lines of a page as (y0, y1, right edge, words in reading order), in PDF points."""
    base = os.path.join(work, f"p-{page:02d}")
    tsv = base + ".tsv"
    if not os.path.exists(tsv):
        run(["pdftoppm", "-f", str(page), "-l", str(page), "-r", str(OCR_DPI), "-gray", "-png", "-singlefile", pdf, base])
        env = dict(os.environ, OMP_THREAD_LIMIT="1")
        subprocess.run(["tesseract", base + ".png", base, "-l", "fas", "--psm", "6", "tsv"], check=True, capture_output=True, env=env)
    groups: dict[tuple[str, str, str], list[dict[str, str]]] = defaultdict(list)
    with open(tsv, encoding="utf-8") as fh:
        for row in csv.DictReader(fh, delimiter="\t", quoting=csv.QUOTE_NONE):
            if row["level"] == "5" and row["text"].strip():
                groups[(row["block_num"], row["par_num"], row["line_num"])].append(row)
    out = []
    for words in groups.values():
        y0 = min(int(w["top"]) for w in words) * PX_TO_PT
        y1 = max(int(w["top"]) + int(w["height"]) for w in words) * PX_TO_PT
        right = max(int(w["left"]) + int(w["width"]) for w in words) * PX_TO_PT
        out.append((y0, y1, right, [w["text"] for w in words]))
    return out


def ocr_for_line(line: Line, ocr: list[tuple[float, float, float, list[str]]]) -> list[str]:
    mid_in = [o for o in ocr if line.y0 - LINE_TOLERANCE_PT <= (o[0] + o[1]) / 2 <= line.y1 + LINE_TOLERANCE_PT]
    return [w for o in sorted(mid_in, key=lambda o: -o[2]) for w in o[3]]


# ───────────── defect candidates ─────────────

def ligature_variants(token: str) -> list[str]:
    """Spellings the token could have had if «لا» ligatures were extracted as «ال» or «ل»."""
    spots = [(i, "ال") for i in range(len(token) - 1) if token[i:i + 2] == "ال"]
    taken = {i + 1 for i, _ in spots}
    spots += [(i, "ل") for i, c in enumerate(token) if c == "ل" and i not in taken and token[i + 1:i + 2] != "ا"]
    if not spots or len(spots) > 2 * MAX_LIGATURE_EDITS:
        return []
    variants = []
    for size in range(1, min(MAX_LIGATURE_EDITS, len(spots)) + 1):
        for combo in itertools.combinations(sorted(spots, reverse=True), size):
            t = token
            for i, kind in combo:
                t = t[:i] + "لا" + t[i + len(kind):]
            variants.append(t)
    return variants


def candidates(tokens: list[str], i: int) -> list[tuple[str, int, str]]:
    """(replacement, tokens consumed, defect kind) for tokens[i]."""
    out = [(v, 1, "ligature") for v in ligature_variants(tokens[i])]
    if i + 1 < len(tokens) and tokens[i + 1].startswith("ی") and norm(tokens[i + 1]) not in STANDALONE_YE_WORDS:
        merged = tokens[i] + tokens[i + 1]
        out.append((merged, 2, "split-ye"))
        out += [(v, 2, "split-ye+ligature") for v in ligature_variants(merged)]
    return out


def pre_split(lines: list[Line], corrections: list[Correction]) -> None:
    """Separate digits glued to words ("-5تار" → "-5 تار") and drop stray combining marks ("که ُ مثبت")."""
    for line in lines:
        tokens = []
        for tok in RE_DIGIT_LETTER.sub(r"\1 ", line.text).split():
            if all(unicodedata.combining(c) for c in tok):
                corrections.append(Correction("stray-mark", line.page, tok, "", "combining mark without a letter", line.text))
                continue
            tokens.append(tok)
        line.tokens = tokens


def correct_with_ocr(lines: list[Line], ocr_by_page: dict, stats: dict, corrections: list[Correction]) -> None:
    for line in lines:
        tokens = line.tokens
        ocr_tokens = [n for n in (norm(w) for w in ocr_for_line(line, ocr_by_page[line.page])) if n]
        normed = [norm(t) for t in tokens]
        matcher = difflib.SequenceMatcher(None, normed, ocr_tokens, autojunk=False)
        replace: dict[int, tuple[str, int, str]] = {}
        for tag, i1, i2, j1, j2 in matcher.get_opcodes():
            if tag == "equal":
                for k in range(i1, i2):
                    stats["seen"][tokens[k]] += 1
                continue
            if tag != "replace":
                continue
            window = set(ocr_tokens[j1:j2])
            for k in range(i1, i2):
                for new, used, kind in candidates(tokens, k):
                    if norm(new) in window:
                        replace[k] = (new, used, kind)
                        break
        out, k = [], 0
        while k < len(tokens):
            if k in replace:
                new, used, kind = replace[k]
                before = " ".join(tokens[k:k + used])
                stats["confirmed"][before][new] += 1
                corrections.append(Correction(kind, line.page, before, new, "ocr-same-line", line.text))
                out.append(new)
                k += used
            else:
                out.append(tokens[k])
                k += 1
        line.tokens = out


def propagate(lines: list[Line], stats: dict, corrections: list[Correction]) -> None:
    """Apply OCR-confirmed corrections where OCR missed or misread the word, when evidence is one-sided."""
    rules: dict[str, str] = {}
    for before, outcomes in stats["confirmed"].items():
        after, hits = outcomes.most_common(1)[0]
        seen = stats["seen"][before] if " " not in before else 0
        if hits >= PROPAGATE_RATIO * seen and len(outcomes) == 1:
            rules[before] = after
    for line in lines:
        out, k, tokens = [], 0, line.tokens
        while k < len(tokens):
            pair = " ".join(tokens[k:k + 2])
            if k + 1 < len(tokens) and pair in rules:
                corrections.append(Correction("split-ye", line.page, pair, rules[pair], f"propagated ({stats['confirmed'][pair][rules[pair]]} OCR confirmations)", line.text))
                out.append(rules[pair])
                k += 2
            elif tokens[k] in rules:
                corrections.append(Correction("ligature", line.page, tokens[k], rules[tokens[k]], f"propagated ({stats['confirmed'][tokens[k]][rules[tokens[k]]]} OCR confirmations, {stats['seen'][tokens[k]]} OCR readings as printed)", line.text))
                out.append(rules[tokens[k]])
                k += 1
            else:
                out.append(tokens[k])
                k += 1
        line.tokens = out


def apply_reviewed(lines: list[Line], corrections: list[Correction]) -> None:
    for line in lines:
        text = " ".join(line.tokens)
        for before, after in REVIEWED_PHRASES.items():
            if before in text:
                corrections.append(Correction("reviewed", line.page, before, after, "reviewed-word-table", line.text))
                text = text.replace(before, after)
        out = []
        for tok in text.split():
            core = tok.strip("،.:؛()«»-–")
            if core in REVIEWED_WORDS:
                new = tok.replace(core, REVIEWED_WORDS[core], 1)
                corrections.append(Correction("reviewed", line.page, tok, new, "reviewed-word-table", line.text))
                tok = new
            out.append(tok)
        line.tokens = out


def restore_madda(lines: list[Line], corrections: list[Correction]) -> None:
    for line in lines:
        out = []
        for tok in line.tokens:
            core = tok.strip("،.:؛()«»-–")
            if core in MADDA_WORDS:
                new = tok.replace(core, MADDA_WORDS[core], 1)
                corrections.append(Correction("madda", line.page, tok, new, "reviewed-word-table", line.text))
                tok = new
            out.append(tok)
        line.tokens = out


# ───────────── bidi repair for numbers, punctuation and markers ─────────────

RE_NUM = r"\d+(?:\s*/\s*\d+)*"
RE_PAREN_RUN = re.compile(rf"(?:\(\s*،?\s*\)\s*{RE_NUM}\s*){{2,}}")  # "( )24( ، )23( ، )21(، )19( ،)18"
RE_PAREN_ITEM = re.compile(rf"\(\s*(،?)\s*\)\s*({RE_NUM})")  # "( )17" / "( ،)68" / "()306"
RE_PAREN_LIST = re.compile(r"\(\s*((?:\d+\s*،\s*)+\d+)\s*و\s*\)\s*(\d+)")  # "( 5 ،4 ،3 ،2و  )6"
RE_PAREN_LETTER = re.compile(r"\(\s*([آ-ی]{1,3})\s*\)")  # "(ب )"
RE_DATE = re.compile(r"(\d{4})\s*/\s*(\d{1,2})\s*/\s*(\d{1,2})")  # "1379/ 1/ 28"
RE_SLASH_DATE = re.compile(r"(\d{4})ˏ(\d{1,2})ˏ(\d{1,2})")  # "1381ˏ07ˏ28"
RE_DIGIT_LETTER = re.compile("(\\d|\\))(?=[\u0621-\u064A\u0671-\u06D3])")  # "(17)نخواهد"; letters only, never «،»
RE_PUNCT = re.compile(r"\s+([،؛:.!؟])(?=\S)")  # "کرده ،حکم"
RE_PUNCT_END = re.compile(r"\s+([،؛:.!؟])$")  # "نقض می گردد :"
RE_SPACES = re.compile(r"\s{2,}")
RE_MI_PREFIX = re.compile("(?<![\u0621-\u064A\u0671-\u06D3])(ن?می) (?=[\u0621-\u064A\u0671-\u06D3])")  # "می شود" → "می‌شود"


def compact_number(num: str) -> str:
    return re.sub(r"\s+", "", num)


def fix_bidi(text: str) -> str:
    def run_items(m: re.Match[str]) -> str:
        nums = [compact_number(n) for n in re.findall(RE_NUM, m.group(0))]
        return "، ".join(f"({n})" for n in reversed(nums)) + " "

    def paren_list(m: re.Match[str]) -> str:
        nums = [n.strip() for n in m.group(1).split("،")]
        return "(" + "، ".join(reversed(nums)) + f" و {m.group(2)})"

    t = RE_PAREN_RUN.sub(run_items, text)
    t = RE_PAREN_LIST.sub(paren_list, t)
    t = RE_PAREN_ITEM.sub(lambda m: f"({compact_number(m.group(2))}){m.group(1)}", t)
    t = RE_PAREN_LETTER.sub(r"(\1)", t)
    t = RE_SLASH_DATE.sub(r"\1/\2/\3", t)
    t = RE_DATE.sub(r"\1/\2/\3", t)
    t = RE_DIGIT_LETTER.sub(r"\1 ", t)
    t = RE_PUNCT.sub(r"\1 ", t)
    t = RE_PUNCT_END.sub(r"\1", t)
    t = RE_MI_PREFIX.sub("\\1\u200c", t)
    return RE_SPACES.sub(" ", t).strip()


def marker_line(text: str) -> str:
    """Rewrite clause markers into reading order: "-2وقتی" → "2- وقتی", "الف  -در" → "الف - در"."""
    m = RE_NUMBER_CLAUSE.match(text)
    if m:
        return f"{m.group(1)}- {m.group(2)}"
    m = RE_CLAUSE_REPEALED.match(text)
    if m:
        return f"{m.group(1)} - (منسوخه {m.group(2)}/{m.group(3)}/{m.group(4)}) {m.group(5)}"
    m = RE_LETTER_CLAUSE.match(text)
    if m and m.group(1) in {"الف", "ب", "ج", "د", "ه", "و", "ز", "ح", "ط", "ی", "ک"}:
        return f"{m.group(1)} - {m.group(2)}"
    return text


# ───────────── structure ─────────────

@dataclass
class Article:
    no: int
    heading: list[str]
    status: str
    status_note: str | None
    paragraphs: list[str] = field(default_factory=list)
    notes: int = 0
    pages: set[int] = field(default_factory=set)
    colours: Counter = field(default_factory=Counter)


def is_noise(line: Line) -> bool:
    t = line.text.strip()
    return t == RUNNING_HEADER or t.isdigit()


def parse(lines: list[Line]) -> tuple[list[Article], list[dict], str]:
    articles: list[Article] = []
    headings: list[dict] = []
    path: dict[str, str] = {}
    closing: list[str] = []
    current: Article | None = None
    new_paragraph = True
    started = False

    def heading_path() -> list[str]:
        return [path[k] for k in ("BOOK", "GENERAL", "PART", "CHAPTER", "SECTION", "OTHER") if k in path]

    for line in lines:
        if is_noise(line):
            continue
        raw = line.text
        text = " ".join(line.tokens)
        if not started:
            if raw.startswith("کتاب اول"):
                started = True
            else:
                continue
        hm = RE_HEADING.match(raw)
        if hm and not raw.startswith("ماده"):
            level = dict(HEADING_LEVELS)[hm.group(1)]
            title = fix_bidi(f"{hm.group(1)} {hm.group(2)} - " + " ".join(text.split()[len(hm.group(1).split()) + len(hm.group(2).split()):]).lstrip("-– "))
            order = [lv for _, lv in HEADING_LEVELS]
            for lv in order[order.index(level):]:
                path.pop(lv, None)
            path.pop("GENERAL", None)
            path.pop("OTHER", None)
            path[level] = title
            headings.append({"level": level, "title": title, "page": line.page, "firstArticle": None})
            current, new_paragraph = None, True
            continue
        if raw.strip() in STANDALONE_HEADINGS:
            level = STANDALONE_HEADINGS[raw.strip()]
            path[level] = raw.strip().rstrip(":")
            headings.append({"level": level, "title": path[level], "page": line.page, "firstArticle": None})
            current, new_paragraph = None, True
            continue
        am, rm = RE_ARTICLE.match(raw), RE_ARTICLE_REPEALED.match(raw)
        if am or rm:
            no = int((am or rm).group(1))
            body_tokens = text.split()
            body = " ".join(body_tokens)
            if am:
                body = re.sub(r"^ماده\s+[-–]\s*\d+\s*", "", body)
                status, note = "VALID", None
            else:
                body = re.sub(r"^ماده\s*\(\s*\d+\s*منسوخه\s*[-–]\s*\)\s*\d{4}[ˏ/]\d{1,2}[ˏ/]\d{1,2}\s*", "", body)
                status, note = "REPEALED", f"منسوخه {rm.group(2)}/{rm.group(3)}/{rm.group(4)}"
            current = Article(no, heading_path(), status, note, [body])
            current.pages.add(line.page)
            current.colours[line.color] += len(raw)
            articles.append(current)
            for h in headings:
                if h["firstArticle"] is None:
                    h["firstArticle"] = no
            new_paragraph = ends_paragraph(line)
            continue
        if current is None:
            continue
        if closing or (current.no == LAST_ARTICLE and raw.startswith("قانون فوق")):
            closing.append(text)
            continue
        nm = RE_NOTE.match(raw)
        piece = text
        if nm:
            label = f"تبصره {nm.group(1)}" if nm.group(1) else "تبصره"
            piece = re.sub(r"^تبصره\s*[-–]\s*(\d+)?\s*", "", piece)
            piece = f"{label} - {piece}"
            current.notes += 1
            current.paragraphs.append(piece)
        elif new_paragraph or RE_NUMBER_CLAUSE.match(raw) or RE_CLAUSE_REPEALED.match(raw) or (RE_LETTER_CLAUSE.match(raw) and raw.split()[0] in {"الف", "ب", "ج", "د", "ه", "و"}):
            current.paragraphs.append(marker_line(piece))
        else:
            current.paragraphs[-1] = current.paragraphs[-1] + " " + piece
        current.pages.add(line.page)
        current.colours[line.color] += len(raw)
        new_paragraph = ends_paragraph(line)
    return articles, headings, " ".join(closing)


_LEFT_EDGE: list[float] = []


def ends_paragraph(line: Line) -> bool:
    """A wrapped line reaches the left margin; the last line of a paragraph stops short of it."""
    return bool(_LEFT_EDGE) and line.x0 > _LEFT_EDGE[0] + PARAGRAPH_END_GAP_PT


def finalize_status(article: Article) -> None:
    coloured = Counter({c: n for c, n in article.colours.items() if c in COLOR_STATUS})
    total = sum(coloured.values()) or 1
    red = coloured.get("#ff0000", 0) / total
    green = (coloured.get("#538135", 0) + coloured.get("#385623", 0)) / total
    if article.status == "REPEALED":
        return
    if red > 0.9:
        article.status = "REPEALED"
    elif red > 0:
        article.status = "PARTLY_REPEALED"
    elif green > 0.9:
        article.status = "AMENDED"
    elif green > 0:
        article.status = "PARTLY_AMENDED"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pdf", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--work", required=True, help="cache folder for page images and OCR")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    os.makedirs(args.work, exist_ok=True)

    page_count = int(re.search(r"Pages:\s+(\d+)", run(["pdfinfo", args.pdf])).group(1))
    pages = {p: page_lines(args.pdf, p) for p in range(FIRST_LAW_PAGE, page_count + 1)}
    assign_colours(args.pdf, pages)
    dropped: list[str] = []
    for p in pages:
        pages[p], gone = merge_fragments(pages[p])
        dropped += gone
    ocr_by_page = {p: ocr_lines(args.pdf, p, args.work) for p in pages}
    lines = [l for p in sorted(pages) for l in pages[p]]
    body_lines = [l for l in lines if not is_noise(l) and len(l.text) > 60]
    _LEFT_EDGE.append(sorted(l.x0 for l in body_lines)[len(body_lines) // 10])

    corrections: list[Correction] = []
    stats = {"seen": Counter(), "confirmed": defaultdict(Counter)}
    pre_split(lines, corrections)
    correct_with_ocr(lines, ocr_by_page, stats, corrections)
    propagate(lines, stats, corrections)
    for line in lines:
        line.tokens = fix_bidi(" ".join(line.tokens)).split()
    apply_reviewed(lines, corrections)
    restore_madda(lines, corrections)

    articles, headings, closing = parse(lines)
    for a in articles:
        finalize_status(a)

    numbers = [a.no for a in articles]
    dupes = sorted(n for n, c in Counter(numbers).items() if c > 1)
    missing = sorted(set(range(1, LAST_ARTICLE + 1)) - set(numbers))
    order_breaks = [(a.no, b.no) for a, b in zip(articles, articles[1:]) if b.no != a.no + 1]

    sha = hashlib.sha256(open(args.pdf, "rb").read()).hexdigest()
    data = {
        "source": {
            "title": "قانون آیین دادرسی دادگاه‌های عمومی و انقلاب (در امور مدنی)",
            "shortTitle": "ق.آ.د.م",
            "approvedAt": "1379/01/21",
            "file": os.path.basename(args.pdf),
            "sha256": sha,
            "pages": page_count,
            "extractedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "tool": "scripts/acp/extract_acp.py",
            "note": "متن از PDF ارائه‌شده دفتر (ناشر خصوصی) استخراج شده است و تا تطبیق با متن رسمی تأییدنشده است.",
        },
        "headings": headings,
        "articles": [
            {
                "no": a.no,
                "heading": a.heading,
                "status": a.status,
                "statusNote": a.status_note,
                "text": "\n".join(fix_bidi(p) for p in a.paragraphs).strip(),
                "notes": a.notes,
                "pages": sorted(a.pages),
            }
            for a in articles
        ],
        "closing": fix_bidi(closing),
    }
    with open(os.path.join(args.out, "articles.json"), "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=1)

    by_kind = Counter(c.kind for c in corrections)
    distinct = Counter((c.kind, c.before, c.after, c.evidence.split(" (")[0]) for c in corrections)
    report = {
        "sourceSha256": sha,
        "coverage": {"expected": LAST_ARTICLE, "found": len(set(numbers)), "missing": missing, "duplicates": dupes, "orderBreaks": order_breaks},
        "statusCounts": Counter(a.status for a in articles),
        "corrections": {"total": len(corrections), "byKind": by_kind},
        "distinctCorrections": [
            {"kind": k, "before": b, "after": a, "evidence": e, "count": n} for (k, b, a, e), n in distinct.most_common()
        ],
        "unconfirmedLigatureSuspects": sorted(
            {t for l in lines for t in l.tokens if ("ال" in t[1:] or "لزم" in t) and t not in stats["confirmed"]}
        )[:400],
        "droppedFragments": dropped,
        "notes": [
            "Hamza is printed without hamza in the source (رای، تامین، مامور); kept as printed.",
            "Madda is missing on the rendered page itself; only words in MADDA_WORDS were restored.",
        ],
    }
    with open(os.path.join(args.out, "corrections-report.json"), "w", encoding="utf-8") as fh:
        json.dump(report, fh, ensure_ascii=False, indent=1, default=dict)

    print(f"articles: {len(articles)} (distinct {len(set(numbers))}); missing {missing}; duplicates {dupes}")
    print(f"order breaks: {order_breaks[:10]}")
    print(f"corrections: {dict(by_kind)}; statuses: {dict(report['statusCounts'])}")
    return 0 if not missing and not dupes else 1


if __name__ == "__main__":
    sys.exit(main())
