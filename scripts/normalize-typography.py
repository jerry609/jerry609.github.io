#!/usr/bin/env python3
"""
Typographic normalization for blog posts (prose only; never code, math, links, HTML/JSX or frontmatter).

  1. Remove manual "## 目录" sections (the template's rail / contents toggle replaces them)
  2. Remove the in-text series navigation in the Attention posts (SeriesNav replaces it)
  3. ASCII "…" next to Chinese → “…”; posts mixing “” and 「」 are unified to their dominant style
  4. Half-width , ; ? ! : and (…) inside Chinese sentences → full-width

Usage: normalize.py [--apply] [files…]   (dry run by default)
"""
import re
import sys
import glob
import collections

CJK = r'一-鿿㐀-䶿'
CJK_RE = re.compile(f'[{CJK}]')
CJKP = f'[{CJK}，。；：？！、）」』”]'  # CJK or CJK punctuation

# Inline spans to protect inside a text line
PROTECT = re.compile(
    r'(`+)(?:(?!\1).)+?\1'          # inline code
    r'|\$[^$\n]+\$'                 # inline math
    r'|<[^>\n]+>'                   # html tags / jsx
    r'|\]\([^)\n]*\)'               # link targets
    r'|https?://[^\s)\]>]+'         # bare urls
    r'|\{[^{}\n]*\}'                # mdx expressions
)


def transform_text(seg, stats, target='curly'):
    """Apply quote and punctuation rules to an unprotected text segment."""
    # 3. straight double quotes → curly, pairwise, only around Chinese
    idx = [m.start() for m in re.finditer('"', seg)]
    if idx and len(idx) % 2 == 0:
        chars = list(seg)
        for a, b in zip(idx[0::2], idx[1::2]):
            inner = seg[a + 1:b]
            before = seg[a - 1] if a > 0 else ''
            after = seg[b + 1] if b + 1 < len(seg) else ''
            if CJK_RE.search(inner) or re.match(CJKP, before or ' ') or re.match(CJKP, after or ' '):
                chars[a], chars[b] = ('「', '」') if target == 'corner' else ('“', '”')
                stats['quotes'] += 1
        seg = ''.join(chars)
    # 3b. unify the other quote style to the post's dominant one (prose only)
    if target == 'corner' and '“' in seg:
        n = seg.count('“')
        seg = seg.replace('“', '「').replace('”', '」')
        stats['unified'] += n
    elif target == 'curly' and '「' in seg:
        n = seg.count('「')
        seg = seg.replace('「', '“').replace('」', '”')
        stats['unified'] += n
    # 4. half-width punctuation between Chinese
    def sub(pattern, repl, s, key):
        new, n = re.subn(pattern, repl, s)
        stats[key] += n
        return new
    seg = sub(rf'(?<=[{CJK}]),\s*(?=[{CJK}])', '，', seg, 'comma')
    seg = sub(rf'(?<=[{CJK}]);\s*(?=[{CJK}])', '；', seg, 'semicolon')
    seg = sub(rf'(?<=[{CJK}]):\s*(?=[{CJK}])', '：', seg, 'colon')
    seg = sub(rf'(?<=[{CJK}])\?(?=\s|$|[{CJK}])', '？', seg, 'question')
    seg = sub(rf'(?<=[{CJK}])!(?=\s|$|[{CJK}])', '！', seg, 'exclaim')
    seg = sub(rf'(?<=[{CJK}])\(([^()\n]*[{CJK}][^()\n]*)\)', r'（\1）', seg, 'parens')
    return seg


def transform_line(line, stats, target='curly'):
    out, last = [], 0
    for m in PROTECT.finditer(line):
        out.append(transform_text(line[last:m.start()], stats, target))
        out.append(m.group(0))
        last = m.end()
    out.append(transform_text(line[last:], stats, target))
    return ''.join(out)


def process(path, stats):
    src = open(path, encoding='utf-8').read()
    end = src.index('\n---', 3) + 4
    front, body = src[:end], src[end:]
    lines = body.split('\n')

    # 1. drop "## 目录" sections
    out, skipping = [], False
    for ln in lines:
        if re.match(r'^##\s+目录\s*$', ln):
            skipping = True
            stats['toc'] += 1
            continue
        if skipping and re.match(r'^#{1,2}\s', ln):
            skipping = False
        if skipping:
            continue
        out.append(ln)
    lines = out

    # 2. drop in-text series navigation (link line + "01 > [02] > …" progress line)
    out, just_removed = [], False
    for ln in lines:
        if re.match(r'^\[返回专题总目录\]\(', ln) or re.match(r'^`[\[\]0-9 >|]+`\s*$', ln):
            stats['seriesnav'] += 1
            just_removed = True
            continue
        if just_removed and ln.strip() == '' and out and out[-1].strip() == '':
            continue  # don't leave a double blank line where a nav line was
        just_removed = False
        out.append(ln)
    lines = out

    # 3/4. prose-only transforms; quote style = the post's dominant one (default “”)
    prose = '\n'.join(l for l in lines if not l.lstrip().startswith(('```', '<', 'import ', 'export ')))
    target = 'corner' if prose.count('「') > prose.count('“') else 'curly'
    in_fence = in_math = in_block = False
    res = []
    for ln in lines:
        s = ln.strip()
        if s.startswith('```') or s.startswith('~~~'):
            in_fence = not in_fence
            res.append(ln)
            continue
        if in_fence:
            res.append(ln)
            continue
        if s == '$$' or (s.startswith('$$') and not (s.endswith('$$') and len(s) > 2)):
            in_math = not in_math
            res.append(ln)
            continue
        if in_math or (s.startswith('$$') and s.endswith('$$')):
            res.append(ln)
            continue
        if re.match(r'^<(style|script|svg|div|figure|Figure|details|iframe|table)\b', s) and not re.search(r'</\w+>\s*$', s):
            in_block = True
        if in_block:
            res.append(ln)
            if re.search(r'</(style|script|svg|div|figure|Figure|details|iframe|table)>\s*$|^\S*/>\s*$|`\}</style>', s):
                in_block = False
            continue
        if s.startswith(('import ', 'export ', '<')):
            res.append(ln)
            continue
        res.append(transform_line(ln, stats, target))
    body = '\n'.join(res)

    return front + body, src


def main():
    apply = '--apply' in sys.argv
    files = [a for a in sys.argv[1:] if not a.startswith('--')] or sorted(
        glob.glob('src/content/blog/*/index.md*'))
    total = collections.Counter()
    changed = 0
    for f in files:
        st = collections.Counter()
        new, old = process(f, st)
        if new != old:
            changed += 1
            total.update(st)
            if apply:
                open(f, 'w', encoding='utf-8').write(new)
            print(f'{f.split("/")[-2]:50s} ' + ' '.join(f'{k}={v}' for k, v in sorted(st.items()) if v))
    print(f'\n{"applied to" if apply else "would change"} {changed} files:', dict(total))


if __name__ == '__main__':
    main()
