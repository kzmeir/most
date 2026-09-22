"""Сборка веб-версии (одна HTML-страница для публикации как артефакт claude.ai).
Данные в страницу НЕ встраиваются: они лежат в базе артефакта и загружаются по правам.
Запуск: python3 web/build.py [выходной_файл]
"""
import re, sys, pathlib
APP = pathlib.Path(__file__).resolve().parent.parent
css = (APP / 'public/styles.css').read_text()
m = re.search(r'@media\(prefers-color-scheme:dark\)\{:root\{(.*?)\}\}', css)
dark = m.group(1)
css = css.replace(m.group(0), '@media(prefers-color-scheme:dark){:root:not([data-theme="light"]){%s}}\n:root[data-theme="dark"]{%s}' % (dark, dark))
app = (APP / 'public/app.js').read_text()
domain = (APP / 'lib/domain.js').read_text()
statement = (APP / 'lib/statement.js').read_text()
server = (APP / 'web/db-server.js').read_text()
html = f'''<title>MOST Финансы</title>
<style>{css}</style>
<div id="app"><div class="boot">Загрузка…</div></div>
<div id="modal" class="modal" hidden><div class="modal-card"><div class="modal-head"><h3 id="modal-title"></h3><button class="icon-btn" id="modal-close" aria-label="Закрыть">✕</button></div><div id="modal-body"></div></div></div>
<div id="toast" class="toast" hidden></div>
<script>window.__PDFJS_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';</script>
<script>{domain}</script>
<script>{statement}</script>
<script>{server}</script>
<script>{app}</script>
'''
out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else APP / 'web/dist/most-finance.html'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(html)
print(out, len(html) // 1024, 'KB')
