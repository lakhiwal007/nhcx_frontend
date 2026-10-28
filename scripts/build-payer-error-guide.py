import json
import re
import sys
from pathlib import Path

DEFAULT_SOURCE = Path.home() / ".claude/plugins/marketplaces/abdm-portal/catalogue/nhcx/errors"
TARGET = Path(__file__).resolve().parent.parent / "src/help/payerErrors.json"
CODE = re.compile(r"^(payr|nhcx)-(\d+)\.md$", re.I)
LINK = re.compile(r"\[([^\]]+)\]\([^)]*\)")
ITEM = re.compile(r"^\s*(?:\d+\.|[-*])\s+(.*)$")


def frontmatter(text):
    if not text.startswith("---"):
        return {}, text
    end = text.index("\n---", 3)
    head, body = text[3:end], text[end + 4:]
    fields = {}
    lines = head.splitlines()
    i = 0
    while i < len(lines):
        match = re.match(r"^([a-z_]+):\s*(.*)$", lines[i])
        i += 1
        if not match:
            continue
        key, value = match.group(1), match.group(2).strip()
        if value in (">-", ">", "|", "|-"):
            parts = []
            while i < len(lines) and lines[i].startswith("  "):
                parts.append(lines[i].strip())
                i += 1
            fields[key] = " ".join(parts)
        elif value[:1] in ("'", '"'):
            quote = value[0]
            while not (len(value) > 1 and value.endswith(quote) and not value.endswith(quote * 2) or value.endswith(quote * 3)) and i < len(lines):
                value += " " + lines[i].strip()
                i += 1
            inner = value[1:-1] if value.endswith(quote) else value[1:]
            fields[key] = inner.replace("''", "'") if quote == "'" else inner
        else:
            fields[key] = value
    return fields, body


def plain(text):
    text = LINK.sub(r"\1", text)
    text = text.replace("`", "")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def section(body, title):
    match = re.search(rf"^## {re.escape(title)}\s*$(.*?)(?=^## |\Z)", body, re.M | re.S)
    return match.group(1).strip() if match else ""


def steps(block):
    items = [plain(m.group(1)) for line in block.splitlines() if (m := ITEM.match(line))]
    if not items:
        paragraphs = [plain(p) for p in re.split(r"\n\s*\n", block) if p.strip() and not p.strip().startswith("```")]
        items = paragraphs[:2]
    cleaned = []
    for item in items:
        item = re.sub(r"\s*See [^.]*\.\s*$", "", item).strip()
        if item and len(item) <= 400:
            cleaned.append(item)
    return cleaned[:4]


def entry(path):
    fields, body = frontmatter(path.read_text(encoding="utf-8"))
    title = fields.get("title", "")
    code_match = CODE.match(path.name)
    code = f"{code_match.group(1).upper()}-{code_match.group(2)}"
    short = title.split(":", 1)[1].strip() if ":" in title else title
    meaning = plain(fields.get("summary", "")) or plain(section(body, "In plain words").split("\n\n")[0])
    return code, {
        "title": short[:1].upper() + short[1:],
        "meaning": meaning,
        "fix": steps(section(body, "When it goes wrong")),
        "source": "nhcx" if code.startswith("NHCX") else "payer",
    }


def main():
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SOURCE
    guide = dict(sorted(entry(p) for p in source.iterdir() if CODE.match(p.name)))
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(json.dumps(guide, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{len(guide)} codes written to {TARGET}")


if __name__ == "__main__":
    main()
