# Facade Pipeline — «harvest & loop»

Конвейер генерации фасадов в стиле современной неоклассики
(**Nano Banana / Gemini 2.5 Flash Image**, опционально Google Flow для видео).

## Быстрый старт

1. Референсы → `00_harvest/`, лучшие эталоны → `01_style-core/`.
2. Открой `02_prompts/master-prompt.md`, выбери пресет, подставь переменные.
3. В Nano Banana: промпт + приложи 2–3 эталона из `01_style-core/`.
4. Правь по одному параметру (петля). Отбирай лучшее в `04_selects/`.
5. Лучшее возвращай в `01_style-core/`. Пиши строку в `02_prompts/log.md`.

Полная петля и правила — в `02_prompts/loop-checklist.md`.

## Структура

```
00_harvest/     входящие референсы
01_style-core/  8–15 эталонов (замок стиля для NB)
02_prompts/     master-prompt.md · loop-checklist.md · log.md
03_output/      генерации по прогонам
04_selects/     отобранное лучшее → назад в 01_style-core
```
