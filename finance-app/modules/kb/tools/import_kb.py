#!/usr/bin/env python3
"""Импорт текстов регламентов из .docx в JSON для базы знаний (без внешних библиотек).

python modules/kb/tools/import_kb.py "\\MostServer\Материалы для проектирования\Регламенты" kb-import.json

Результат загружается в «Знания → База знаний → Импорт» (или POST /api/kb/import {articles}).
Статьи сопоставляются по пути файла (source): повторный импорт обновляет текст, а не плодит копии.
XMind-карты разворачиваются в список. Отредактированные статьи бюро из modules/kb/content/*.md
заменяют сырой текст своих исходных файлов и добавляются к импорту. Всё, что взято с сервера напрямую (не из content/*.md), помечается черновиком — сотрудники увидят после проверки.
PDF/картинки текстом не читаются — прикрепляются ссылками к документу своей папки
(или отдельной статьёй-ссылкой).
"""
import json, os, re, sys, zipfile
try: sys.stdout.reconfigure(encoding='utf-8')
except Exception: pass
import xml.etree.ElementTree as ET

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
LINK_EXT = {'.pdf', '.xmind', '.png', '.jpg', '.xlsx', '.dwg'}


def para_text(p):
    out = []
    for node in p.iter():
        if node.tag == W + 't' and node.text: out.append(node.text)
        elif node.tag == W + 'tab': out.append('\t')
        elif node.tag in (W + 'br', W + 'cr'): out.append('\n')
    return ''.join(out).strip()


def docx_text(path):
    """Абзацы → строки. Заголовки (стиль Heading/Заголовок) → '# ', списки → '- ', таблицы → строки через ' | '."""
    with zipfile.ZipFile(path) as z: root = ET.fromstring(z.read('word/document.xml'))
    body = root.find(W + 'body'); lines = []
    for el in body:
        if el.tag == W + 'p':
            t = para_text(el)
            if not t: continue
            ppr = el.find(W + 'pPr'); style = ''; is_list = False
            if ppr is not None:
                st = ppr.find(W + 'pStyle'); style = (st.get(W + 'val') or '') if st is not None else ''
                is_list = ppr.find(W + 'numPr') is not None
            m = re.match(r'(?i)(heading|заголовок|title)\s*(\d?)', style)
            if m: lines.append('#' * min(3, int(m.group(2) or 1)) + ' ' + t)
            elif is_list: lines.append('- ' + t)
            else: lines.append(t)
        elif el.tag == W + 'tbl':
            for tr in el.iter(W + 'tr'):
                cells = [' '.join(para_text(p) for p in tc.iter(W + 'p')).strip() for tc in tr.findall(W + 'tc')]
                if any(cells): lines.append('| ' + ' | '.join(c.replace('|', '/') for c in cells))
    return '\n'.join(lines)


def title_of(name):
    t = os.path.splitext(name)[0]
    t = re.sub(r'[_ ](R\d+|NEW|\d{2}-\d{2}-\d{4})$', '', t, flags=re.I)
    return t.replace('_', ' ').replace('наимен.', 'наименования').replace('раб.', 'рабочих').strip()


def xmind_text(path):
    """Карта XMind (zip с content.json) → вложенный список '- '. Старый формат (content.xml) не читаем."""
    with zipfile.ZipFile(path) as z:
        if 'content.json' not in z.namelist(): return ''
        sheets = json.loads(z.read('content.json').decode('utf-8'))
    lines = []
    def walk(t, lvl):
        title = (t.get('title') or '').strip().replace(chr(10), ' ')
        if title: lines.append('  ' * lvl + '- ' + title)
        for c in (t.get('children') or {}).get('attached', []): walk(c, lvl + 1)
    for sh in sheets:
        root = sh.get('rootTopic') or {}
        if len(sheets) > 1: lines.append('## ' + (sh.get('title') or root.get('title') or ''))
        for c in (root.get('children') or {}).get('attached', []): walk(c, 0)
    return chr(10).join(lines)


CONTENT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'content')


def read_md(path):
    """Статья бюро в markdown: шапка между '---' (section, title, tags, source, skip, links; строки-продолжения с отступом), дальше текст."""
    NL = chr(10)
    raw = open(path, encoding='utf-8').read().replace(chr(13), '')
    meta, body = {}, raw
    if raw.startswith('---' + NL):
        head, _, body = raw[4:].partition(NL + '---' + NL); key = None
        for line in head.split(NL):
            if line[:1].isspace() and key: meta[key] += NL + line.strip(); continue
            key, _, val = line.partition(':'); key = key.strip(); meta[key] = val.strip()
    lines = [l for l in meta.get('links', '').split(NL) if l.strip()]
    links = []
    for l in lines:
        t, _, u = l.partition('|'); links.append({'title': t.strip(), 'url': (u or t).strip()})
    return {'draft': meta.get('draft', '') == 'true', 'section': meta.get('section', 'Регламенты'), 'title': meta['title'], 'tags': [x.strip() for x in meta.get('tags', '').split(',') if x.strip()],
            'text': body.strip(), 'links': links, 'src': meta.get('source', ''), 'skip': [x.strip() for x in meta.get('skip', '').split(',') if x.strip()]}


def apply_content(arts, content_dir):
    """Отредактированные статьи (content/*.md) заменяют сырой текст файла-источника (по имени файла) и добавляются как новые.
    Ссылки на исходные файлы сохраняются; skip: убирает дубли (их файлы — ссылками к этой статье)."""
    if not os.path.isdir(content_dir): return arts
    base = lambda a: os.path.basename(a.get('source') or '')
    for f in sorted(os.listdir(content_dir)):
        if not f.endswith('.md'): continue
        m = read_md(os.path.join(content_dir, f)); extra_links = []
        for name in m['skip']:
            for a in [x for x in arts if base(x) == name]: extra_links += a['links']; arts.remove(a)
        raw = next((a for a in arts if m['src'] and base(a) == m['src']), None)
        art = {'draft': m['draft'], 'section': m['section'], 'title': m['title'], 'text': m['text'], 'tags': m['tags'], 'links': m['links'] + (raw['links'] if raw else []) + extra_links, 'source': raw['source'] if raw else ''}
        if raw: arts[arts.index(raw)] = art
        else: arts.append(art)
    return arts


def main():
    if len(sys.argv) < 2: print(__doc__); sys.exit(1)
    src = sys.argv[1]; out = sys.argv[2] if len(sys.argv) > 2 else 'kb-import.json'
    arts, by_title = [], {}
    for dirpath, _, files in os.walk(src):
        rel_dir = os.path.relpath(dirpath, src); tag = 'Регламенты' if rel_dir == '.' else rel_dir
        files = sorted(f for f in files if not f.startswith('~$') and f.lower() != 'thumbs.db')
        here, extra = [], []
        for f in files:
            full = os.path.normpath(os.path.join(dirpath, f)); ext = os.path.splitext(f)[1].lower(); text = ''
            try:
                if ext == '.docx': text = docx_text(full)
                elif ext == '.xmind': text = xmind_text(full)
            except Exception as e: print('не прочитан', f, e)
            if not text: extra.append(full); continue
            a = {'draft': True, 'section': 'Регламенты', 'title': title_of(f), 'text': text, 'tags': [tag], 'source': full, 'links': [{'title': f, 'url': full}], 'mtime': os.path.getmtime(full)}
            old = by_title.get(a['title'])  # дубликаты (две версии одной карты) — берём более свежий файл
            if old and old['mtime'] >= a['mtime']: old['links'].append(a['links'][0]); continue
            if old: a['links'] += old['links']; arts.remove(old); here = [x for x in here if x is not old]
            by_title[a['title']] = a; arts.append(a); here.append(a)
        if here and rel_dir != '.':  # PDF/картинки подпапки — ссылками к её первому документу; в корне каждый файл — своя статья
            here[0]['links'] += [{'title': os.path.basename(x), 'url': x} for x in extra]
        else:
            for x in extra:
                same = by_title.get(title_of(os.path.basename(x)))  # PDF-копия документа — ссылкой к его статье
                if same: same['links'].append({'title': os.path.basename(x), 'url': x}); continue
                arts.append({'draft': True, 'section': 'Регламенты', 'title': title_of(os.path.basename(x)), 'text': 'Документ в файле на сервере (текст не импортируется) — откройте по ссылке ниже.', 'tags': [tag], 'source': x, 'links': [{'title': os.path.basename(x), 'url': x}]})
    for a in arts: a.pop('mtime', None)
    arts = apply_content(arts, CONTENT_DIR)
    with open(out, 'w', encoding='utf-8') as fh: json.dump({'articles': arts}, fh, ensure_ascii=False, indent=1)
    print(f'{len(arts)} статей -> {out}')


if __name__ == '__main__': main()
