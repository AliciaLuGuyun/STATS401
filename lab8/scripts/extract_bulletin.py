import csv
import json
import re
from collections import Counter
from pathlib import Path
from statistics import mean, median

import pdfplumber


ROOT = Path(__file__).resolve().parents[1]
PDF_PATH = ROOT / "data" / "bulletin.pdf"
OUT_PATH = ROOT / "data" / "bulletin_passages.csv"
AUDIT_PATH = ROOT / "data" / "extraction_audit.json"


PART_RE = re.compile(r"^Part\s+\d+:\s+(.+)$")
COURSE_SUBJECT_RE = re.compile(r"^Courses with Course Subject:\s+(.+)$")
COURSE_RE = re.compile(r"^[A-Z]{2,}(?:/[A-Z]{2,})?\s+\d{3}[A-Z]?\b.*\((?:\d+(?:\.\d+)?|[A-Za-z ]+)\s+credits?\)$")
PAGE_NUMBER_RE = re.compile(r"^\d{1,3}$")
TOC_DOTS_RE = re.compile(r"\.{4,}")
WORD_RE = re.compile(r"[A-Za-z][A-Za-z'-]+")


def normalize_line(line):
    line = line.replace("\u2019", "'").replace("\u201c", '"').replace("\u201d", '"')
    line = re.sub(r"\s+", " ", line).strip()
    return line


def clean_text(text):
    text = re.sub(r"([A-Za-z])- ([a-z])", r"\1\2", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def looks_like_heading(line):
    if not line or len(line) > 95:
        return False
    if PAGE_NUMBER_RE.match(line) or TOC_DOTS_RE.search(line):
        return False
    if line.startswith(("Prerequisite", "Corequisite", "Instructor:", "Note:", "Recommended prerequisite")):
        return False
    if COURSE_RE.match(line):
        return True
    if line.endswith((".", ",", ";", ":")):
        return False
    words = WORD_RE.findall(line)
    if not words or len(words) > 10:
        return False
    lower_starters = {"and", "or", "of", "for", "to", "in", "with", "the", "a", "an"}
    titled = sum(1 for w in words if w[0].isupper() or w.lower() in lower_starters)
    return titled / len(words) >= 0.72


def should_skip_line(line, page_num):
    if not line:
        return True
    if PAGE_NUMBER_RE.match(line):
        return True
    if page_num <= 9:
        return True
    if TOC_DOTS_RE.search(line):
        return True
    if line in {"Bulletin of", "Duke Kunshan University", "Undergraduate Instruction", "2021-2022"}:
        return True
    return False


def flush_passage(rows, buffer, state, page_num):
    text = clean_text(" ".join(buffer))
    buffer.clear()
    if not text:
        return
    words = WORD_RE.findall(text)
    if len(words) < 8:
        return
    if len(text) < 45 and not COURSE_RE.match(text):
        return
    row = {
        "passage_id": f"p{len(rows) + 1:04d}",
        "chapter": state.get("chapter", ""),
        "section": state.get("section", ""),
        "subsection": state.get("subsection", ""),
        "page": page_num,
        "text": text,
    }
    rows.append(row)


def extract_rows():
    rows = []
    state = {"chapter": "", "section": "", "subsection": "", "course_subject": ""}
    buffer = []

    with pdfplumber.open(PDF_PATH) as pdf:
        for page_index, page in enumerate(pdf.pages, start=1):
            text = page.extract_text(x_tolerance=1.5, y_tolerance=3) or ""
            lines = [normalize_line(line) for line in text.splitlines()]

            for raw_line in lines:
                line = normalize_line(raw_line)
                if should_skip_line(line, page_index):
                    continue

                part = PART_RE.match(line)
                subject = COURSE_SUBJECT_RE.match(line)
                is_course = bool(COURSE_RE.match(line))
                is_heading = looks_like_heading(line)

                if part:
                    flush_passage(rows, buffer, state, page_index)
                    state["chapter"] = part.group(1).strip()
                    state["section"] = state["chapter"]
                    state["subsection"] = ""
                    state["course_subject"] = ""
                    continue

                if subject:
                    flush_passage(rows, buffer, state, page_index)
                    state["course_subject"] = subject.group(1).strip()
                    state["chapter"] = state["chapter"] or "Course Descriptions"
                    state["section"] = state["course_subject"]
                    state["subsection"] = ""
                    continue

                if is_course:
                    flush_passage(rows, buffer, state, page_index)
                    if state.get("course_subject"):
                        state["section"] = state["course_subject"]
                    state["subsection"] = line
                    buffer.append(line)
                    continue

                if is_heading:
                    flush_passage(rows, buffer, state, page_index)
                    if state.get("course_subject"):
                        state["subsection"] = line
                    else:
                        state["section"] = line
                        state["subsection"] = ""
                    continue

                buffer.append(line)

            flush_passage(rows, buffer, state, page_index)

    return rows


def dedupe_rows(rows):
    seen = set()
    cleaned = []
    duplicate_count = 0
    for row in rows:
        key = re.sub(r"\W+", " ", row["text"].lower()).strip()
        if key in seen:
            duplicate_count += 1
            continue
        seen.add(key)
        cleaned.append(row)
    for i, row in enumerate(cleaned, start=1):
        row["passage_id"] = f"p{i:04d}"
    return cleaned, duplicate_count


def audit(raw_rows, rows, duplicate_count):
    lengths = [len(WORD_RE.findall(row["text"])) for row in rows]
    section_counts = Counter(row["section"] for row in rows if row["section"])
    chapter_counts = Counter(row["chapter"] for row in rows if row["chapter"])
    sorted_lengths = sorted(zip(lengths, rows), key=lambda item: item[0])
    bins = Counter()
    for length in lengths:
        if length < 25:
            bins["under_25"] += 1
        elif length < 50:
            bins["25_49"] += 1
        elif length < 100:
            bins["50_99"] += 1
        elif length < 200:
            bins["100_199"] += 1
        else:
            bins["200_plus"] += 1

    report = {
        "source_pdf": str(PDF_PATH),
        "bulletin_title": "Bulletin of Duke Kunshan University Undergraduate Instruction",
        "academic_year": "2021-2022",
        "official_source": "https://dku-web-admissions.s3.cn-north-1.amazonaws.com.cn/dkumain/files/V2021-22_DKU_UG_Bulletin.pdf",
        "date_accessed": "2026-09-27",
        "raw_passages": len(raw_rows),
        "clean_passages": len(rows),
        "removed_passages": len(raw_rows) - len(rows),
        "duplicate_count": duplicate_count,
        "average_passage_words": round(mean(lengths), 2),
        "median_passage_words": median(lengths),
        "length_distribution": dict(bins),
        "formal_sections": len(section_counts),
        "chapters": len(chapter_counts),
        "missing_chapter": sum(1 for row in rows if not row["chapter"]),
        "missing_section": sum(1 for row in rows if not row["section"]),
        "missing_subsection": sum(1 for row in rows if not row["subsection"]),
        "short_examples": [
            {"passage_id": row["passage_id"], "page": row["page"], "words": length, "text": row["text"][:220]}
            for length, row in sorted_lengths[:8]
        ],
        "long_examples": [
            {"passage_id": row["passage_id"], "page": row["page"], "words": length, "text": row["text"][:300]}
            for length, row in sorted_lengths[-8:]
        ],
        "top_sections": section_counts.most_common(20),
        "chapters_list": list(chapter_counts.keys()),
    }
    return report


def main():
    raw_rows = extract_rows()
    rows, duplicate_count = dedupe_rows(raw_rows)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["passage_id", "chapter", "section", "subsection", "page", "text"])
        writer.writeheader()
        writer.writerows(rows)

    report = audit(raw_rows, rows, duplicate_count)
    AUDIT_PATH.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
