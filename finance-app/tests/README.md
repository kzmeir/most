# Тесты

Запуск из папки `finance-app`:

```
bash tests/api_test.sh            # API: права, очередь, счета, выписка, восстановление (~1 мин)
python3 tests/ui_smoke.py         # Playwright: интерфейс офисной версии (~4 мин)
python3 web/build.py && python3 tests/web_look.py   # веб-версия с имитацией claude.ai (~5 мин)
```

Нужны: Node 18+, `python3 -m pip install playwright openpyxl pdfplumber` и `playwright install chromium`
(или укажите свой Chrome: `CHROME=/path/to/chrome`). Данные тестов создаются в `tests/tmp/`.

Файлы в `tests/fixtures/` (в репозитории только синтетическая `statement.xlsx`; остальные содержат данные компании,
положите их сами, они не коммитятся):

- `kaspi-statement.pdf` — выписка Kaspi Business (MOST Architects, 03–09.2026)
- `invoices-register.xlsx` — реестр «к оплате» (ACD Smart, ARTlife, UTA…)
- `invoice.pdf` — типовой счёт на оплату (Eservice № 7)

Известный ложный провал `api_test.sh`: «path traversal blocked» ожидает 403, сервер отдаёт 404 — это тоже безопасно.
