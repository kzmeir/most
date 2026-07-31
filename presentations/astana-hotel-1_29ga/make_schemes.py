#!/usr/bin/env python3
"""Генератор схем посадки для участка 1,29 га (Астана, ул. Новый Аэропорт).

Контур участка и охранные зоны сняты с подосновы исходной посадки
(синяя линия зем. отвода и розовые окружности) и откалиброваны по
площади 1,29 га. Все ТЭП считаются с нарисованной геометрии — цифры
в презентации и картинка не расходятся по построению.

Локальная система координат: метры, начало — северо-западный угол
участка, x на восток, y на юг.
"""
import json
import math
import os

SITE = [(0.0, 0.0), (145.2, -3.3), (147.9, 52.0), (112.9, 90.3), (1.6, 92.4)]

# охранные зоны, снятые с подосновы (центр на южной границе, у газового объекта)
ZONE_C = (98.0, 90.1)
ZONE_R_IN = 27.4
ZONE_R_OUT = 102.5

DEPTH = 18.0          # корпус двухкоридорный: 7,5 + 3 + 7,5
ROOM = 29.0           # средняя площадь номера, м² (по исходным вариантам)
NF_SHARE = 0.84       # доля номерного фонда в надземной площади (по исходным вариантам)
PARK_UNDER_M2 = 32.0  # м² на машиноместо в подземном паркинге, с проездами
PARK_OPEN_M2 = 25.0   # м² на машиноместо на наземной стоянке, с проездами


def area(poly):
    s = 0.0
    for i in range(len(poly)):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % len(poly)]
        s += x1 * y2 - x2 * y1
    return abs(s) / 2


def rect(x1, y1, x2, y2):
    return [(x1, y1), (x2, y1), (x2, y2), (x1, y2)]


def clears_zone(poly, r=ZONE_R_IN):
    """Ближайшее расстояние от полигона до центра зоны (по вершинам и рёбрам)."""
    cx, cy = ZONE_C
    best = 1e9
    for i in range(len(poly)):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % len(poly)]
        dx, dy = x2 - x1, y2 - y1
        L2 = dx * dx + dy * dy or 1.0
        t = max(0.0, min(1.0, ((cx - x1) * dx + (cy - y1) * dy) / L2))
        best = min(best, math.hypot(cx - (x1 + t * dx), cy - (y1 + t * dy)))
    return best


SITE_AREA = area(SITE)

# ---------------------------------------------------------------- схемы
SCHEMES = [
    {
        "key": "a",
        "title": "Г-образный по улице",
        "idea": "Корпус держит фронт вдоль ул. Новый Аэропорт и северную границу. "
                "Двор раскрыт на юго-восток, подъезд и лобби — с улицы.",
        "volumes": [
            {"poly": rect(6, 8, 24, 74), "floors": 7, "kind": "rooms", "label": "7 эт."},
            {"poly": rect(24, 8, 73, 26), "floors": 7, "kind": "rooms", "label": "7 эт."},
        ],
        "yards": [rect(24, 26, 72, 74)],
        "green": [rect(74, 58, 116, 86)],
        "parking_under": rect(6, 8, 73, 74),
        "parking_open": rect(80, 8, 130, 40),
        "entry": [(-4, 40, 5, 40)],
        "under_label": (49, 50),
        "pros": [
            "66 м фасада на улицу — у отеля появляется адрес и видимость",
            "Максимальная длина коридора 66 м, два компактных ядра",
            "Двор раскрыт на юго-восток, солнце во второй половине дня",
            "Юго-восток в охранной зоне отдан озеленению, а не корпусу",
        ],
        "cons": [
            "Северное крыло смотрит на север — худшая часть фонда",
            "Без подземного уровня паркинг съест двор",
            "7 этажей — отклонение от эскиза застройки такое же, как у В1/В2",
        ],
    },
    {
        "key": "b",
        "title": "Две пластины на стилобате",
        "idea": "Двухэтажный стилобат вдоль улицы берёт лобби, ресторан, конференц "
                "и СПА. Две жилые пластины уходят вглубь участка.",
        "volumes": [
            {"poly": rect(8, 6, 32, 76), "floors": 2, "kind": "public", "label": "Стилобат 2 эт."},
            {"poly": rect(32, 8, 94, 26), "floors": 6, "kind": "rooms", "label": "6 эт."},
            {"poly": rect(32, 50, 80, 68), "floors": 6, "kind": "rooms", "label": "6 эт."},
        ],
        "yards": [rect(32, 26, 80, 50)],
        "green": [rect(82, 62, 118, 86)],
        "parking_under": rect(8, 6, 88, 62),
        "parking_open": rect(98, 8, 132, 44),
        "entry": [(-4, 44, 7, 44)],
        "under_label": (56, 37),
        "pros": [
            "Общественные функции выделены явно — их видно в ТЭП, а не «где-то внутри»",
            "Один вход, одна стойка, вся логистика через стилобат",
            "Подземный паркинг под стилобатом и двором, наземных проездов минимум",
            "Наибольший выход площадей из трёх схем",
        ],
        "cons": [
            "8 этажей — самое сильное отклонение от эскиза застройки",
            "Двор между пластинами 24 м при высоте ~27 м — проверять инсоляцию",
            "Самое большое пятно застройки, меньше свободной земли",
        ],
    },
    {
        "key": "c",
        "title": "Гребёнка",
        "idea": "Спина вдоль улицы и три коротких крыла на восток. Все номера "
                "смотрят в раскрытые дворы, этажность падает до четырёх.",
        "volumes": [
            {"poly": rect(8, 6, 26, 84), "floors": 4, "kind": "rooms", "label": "4 эт."},
            {"poly": rect(26, 8, 62, 26), "floors": 4, "kind": "rooms", "label": "4 эт."},
            {"poly": rect(26, 40, 62, 58), "floors": 4, "kind": "rooms", "label": "4 эт."},
            {"poly": rect(26, 66, 62, 84), "floors": 4, "kind": "rooms", "label": "4 эт."},
        ],
        "yards": [rect(26, 26, 62, 40), rect(26, 58, 62, 66)],
        "green": [rect(72, 64, 118, 86)],
        "parking_under": rect(8, 6, 62, 84),
        "parking_open": rect(70, 10, 124, 60),
        "entry": [(-4, 44, 7, 44)],
        "under_label": (44, 33),
        "pros": [
            "Всего 4 этажа при том же объёме — минимальное отклонение от эскиза",
            "Крылья по 36 м: коридоры короткие, обслуживание дешёвое",
            "Ни один номер не смотрит в колодец, дворы раскрыты на восток",
            "Восточная треть участка свободна: паркинг, парк, вторая очередь",
        ],
        "cons": [
            "Больше периметра фасада — дороже оболочка на квадратный метр",
            "Четыре крыла — больше лестнично-лифтовых узлов",
            "Наземный паркинг занимает восток, если не уходить под землю",
        ],
    },
    {
        "key": "zones",
        "title": "Ограничения по подоснове",
        "idea": "Контур зем. отвода и охранные зоны, снятые с подосновы исходной посадки.",
        "volumes": [],
        "yards": [],
        "green": [],
        "parking_under": None,
        "parking_open": None,
        "entry": [],
        "under_label": (0, 0),
        "pros": [],
        "cons": [],
    },
]


def compute(s):
    if not s["volumes"]:
        return {"footprint": 0, "build_pct": 0, "gfa": 0, "room_gfa": 0, "public_gfa": 0,
                "nf": 0, "rooms": 0, "floors": 0, "corridor": 0, "park_under": 0,
                "park_open": 0, "park_total": 0, "free_land": round(SITE_AREA), "zone_clear": 0}
    foot = sum(area(v["poly"]) for v in s["volumes"])
    gfa = sum(area(v["poly"]) * v["floors"] for v in s["volumes"])
    room_gfa = sum(area(v["poly"]) * v["floors"] for v in s["volumes"] if v["kind"] == "rooms")
    nf = room_gfa * NF_SHARE
    floors = 8 if s["key"] == "b" else max(v["floors"] for v in s["volumes"])
    p_under = int(area(s["parking_under"]) / PARK_UNDER_M2 / 5) * 5
    p_open = int(area(s["parking_open"]) / PARK_OPEN_M2 / 5) * 5
    # длина самого длинного коридора = длинная сторона самого длинного объёма
    corr = 0
    for v in s["volumes"]:
        if v["kind"] != "rooms":
            continue
        xs = [p[0] for p in v["poly"]]
        ys = [p[1] for p in v["poly"]]
        corr = max(corr, max(max(xs) - min(xs), max(ys) - min(ys)))
    return {
        "footprint": round(foot),
        "build_pct": round(foot / SITE_AREA * 100, 1),
        "gfa": round(gfa),
        "room_gfa": round(room_gfa),
        "public_gfa": round(gfa - room_gfa),
        "nf": round(nf),
        "rooms": int(round(nf / ROOM / 5) * 5),
        "floors": floors,
        "corridor": round(corr),
        "park_under": p_under,
        "park_open": p_open,
        "park_total": p_under + p_open,
        "free_land": round(SITE_AREA - foot),
        "zone_clear": round(min(clears_zone(v["poly"]) for v in s["volumes"]), 1),
    }


# ---------------------------------------------------------------- отрисовка
PX = 5.4
X0, X1 = -28.0, 154.0
Y0, Y1 = -16.0, 118.0
W, H = (X1 - X0) * PX, (Y1 - Y0) * PX

BG = "#0f0f13"
ORANGE = "#FF4D23"
BRICK = "#9c6350"
GREY = "#8b8c91"
BLUE = "#5b9bd5"
GREEN = "#3c5c38"


def tx(x):
    return round((x - X0) * PX, 1)


def ty(y):
    return round((y - Y0) * PX, 1)


def path(poly):
    return "M " + " L ".join(f"{tx(x)},{ty(y)}" for x, y in poly) + " Z"


def centroid(poly):
    return (sum(p[0] for p in poly) / len(poly), sum(p[1] for p in poly) / len(poly))


def svg(s, t):
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W:.0f}" height="{H:.0f}" '
         f'viewBox="0 0 {W:.0f} {H:.0f}" font-family="Liberation Sans, Arial, sans-serif">',
         f'<rect width="{W:.0f}" height="{H:.0f}" fill="{BG}"/>',
         '<defs><marker id="ah" markerWidth="8" markerHeight="8" refX="6.5" refY="4" orient="auto">'
         '<path d="M0,0 L8,4 L0,8 z" fill="#fff"/></marker>'
         f'<clipPath id="site"><path d="{path(SITE)}"/></clipPath></defs>']

    # улица и красная линия
    o.append(f'<rect x="0" y="0" width="{tx(-14):.0f}" height="{ty(96):.0f}" fill="#191920"/>')
    o.append(f'<line x1="{tx(-16)}" y1="0" x2="{tx(-16)}" y2="{ty(96)}" stroke="#c0392b" '
             f'stroke-width="1.8" stroke-dasharray="13 8"/>')
    o.append(f'<text x="{tx(-22)}" y="{ty(46)}" fill="{GREY}" font-size="12.5" letter-spacing="2.4" '
             f'text-anchor="middle" transform="rotate(-90 {tx(-22)} {ty(46)})">УЛ. НОВЫЙ АЭРОПОРТ</text>')

    # соседняя застройка
    for bx, by, bw, bh in [(124, 62, 15, 11), (124, 77, 18, 9), (60, 100, 30, 9), (100, 98, 22, 9)]:
        o.append(f'<rect x="{tx(bx)}" y="{ty(by)}" width="{bw * PX:.1f}" height="{bh * PX:.1f}" fill="#25252b"/>')

    # охранные зоны
    zx, zy = tx(ZONE_C[0]), ty(ZONE_C[1])
    o.append(f'<circle cx="{zx}" cy="{zy}" r="{ZONE_R_OUT * PX:.1f}" fill="none" stroke="#b05aa8" '
             f'stroke-width="1.3" stroke-dasharray="10 9" opacity=".55"/>')
    o.append(f'<circle cx="{zx}" cy="{zy}" r="{ZONE_R_IN * PX:.1f}" fill="#b05aa8" opacity=".13"/>')
    o.append(f'<circle cx="{zx}" cy="{zy}" r="{ZONE_R_IN * PX:.1f}" fill="none" stroke="#b05aa8" '
             f'stroke-width="1.8" stroke-dasharray="7 6"/>')
    o.append(f'<text x="{tx(112)}" y="{ty(96)}" fill="#c274ba" font-size="11" letter-spacing="1.3">'
             f'ЗОНА R 27 М</text>')
    o.append(f'<text x="{tx(2)}" y="{ty(114)}" fill="#8d5c88" font-size="11" letter-spacing="1.3">'
             f'ПУНКТИР ПО ДУГЕ — ВНЕШНИЙ КОНТУР ЗОНЫ R 103 М, РЕЖИМ УТОЧНЯЕТСЯ</text>')

    # участок
    o.append(f'<path d="{path(SITE)}" fill="#16161b" stroke="#fff" stroke-width="1.9" '
             f'stroke-dasharray="16 5 3 5" opacity=".9"/>')

    # озеленение и дворы
    for g in s.get("green", []):
        o.append(f'<path d="{path(g)}" fill="{GREEN}" opacity=".6" clip-path="url(#site)"/>')
    for y in s.get("yards", []):
        o.append(f'<path d="{path(y)}" fill="{GREEN}" opacity=".38"/>')

    # паркинги
    po = s.get("parking_open")
    if po is None:
        po = pu = None
    if po is not None:
        o.append(f'<path d="{path(po)}" fill="#212127" stroke="#37373f" stroke-width="1.1" clip-path="url(#site)"/>')
        cx, cy = centroid(po)
        o.append(f'<text x="{tx(cx)}" y="{ty(cy)}" fill="{GREY}" font-size="12" text-anchor="middle" '
                 f'letter-spacing="1.5">НАЗЕМНЫЙ ПАРКИНГ</text>')
        o.append(f'<text x="{tx(cx)}" y="{ty(cy) + 17}" fill="#c9cacd" font-size="14" text-anchor="middle" '
                 f'font-weight="bold">{t["park_open"]} м/м</text>')
        pu = s["parking_under"]
        o.append(f'<path d="{path(pu)}" fill="none" stroke="{BLUE}" stroke-width="1.6" stroke-dasharray="9 6"/>')
        lx, ly = s["under_label"]
        o.append(f'<text x="{tx(lx)}" y="{ty(ly)}" fill="{BLUE}" font-size="12" text-anchor="middle" '
                 f'letter-spacing="1.4">ПОДЗЕМНЫЙ ПАРКИНГ</text>')
        o.append(f'<text x="{tx(lx)}" y="{ty(ly) + 17}" fill="#cfe0f0" font-size="14" text-anchor="middle" '
                 f'font-weight="bold">{t["park_under"]} м/м</text>')

    # объёмы
    for v in s["volumes"]:
        fill = ORANGE if v["kind"] == "rooms" else BRICK
        o.append(f'<path d="{path(v["poly"])}" fill="{fill}" stroke="{BG}" stroke-width="1.6"/>')
        cx, cy = centroid(v["poly"])
        o.append(f'<text x="{tx(cx)}" y="{ty(cy) + 6}" fill="#14140f" font-size="16" font-weight="bold" '
                 f'text-anchor="middle" letter-spacing=".5">{v["label"]}</text>')

    # вход
    for x1, y1, x2, y2 in s["entry"]:
        o.append(f'<line x1="{tx(x1)}" y1="{ty(y1)}" x2="{tx(x2)}" y2="{ty(y2)}" stroke="#fff" '
                 f'stroke-width="2.2" marker-end="url(#ah)"/>')

    # север, размеры, масштаб
    nx, ny = tx(139), ty(10)
    o.append(f'<g transform="translate({nx},{ny})"><path d="M0,-19 L5.5,9 L0,3.5 L-5.5,9 Z" fill="#fff"/>'
             f'<text x="0" y="24" fill="{GREY}" font-size="11.5" text-anchor="middle">С</text></g>')
    o.append(f'<text x="{tx(70)}" y="{ty(-8)}" fill="{GREY}" font-size="11.5" text-anchor="middle" '
             f'letter-spacing="1.6">145 м</text>')
    o.append(f'<text x="{tx(-6)}" y="{ty(46)}" fill="{GREY}" font-size="11.5" text-anchor="middle" '
             f'letter-spacing="1.6" transform="rotate(-90 {tx(-6)} {ty(46)})">92 м</text>')
    sx, sy = tx(6), ty(97)
    o.append(f'<line x1="{sx}" y1="{sy}" x2="{sx + 50 * PX}" y2="{sy}" stroke="#fff" stroke-width="1.8"/>')
    for dxm in (0, 25, 50):
        o.append(f'<line x1="{sx + dxm * PX}" y1="{sy - 4}" x2="{sx + dxm * PX}" y2="{sy + 4}" '
                 f'stroke="#fff" stroke-width="1.8"/>')
    o.append(f'<text x="{sx + 50 * PX + 10}" y="{sy + 4}" fill="#fff" font-size="11.5" letter-spacing="1.4">50 м</text>')

    # легенда
    keys = [] if not s["volumes"] else [(ORANGE, "номерной фонд"), (BRICK, "общественные функции"),
            (GREEN, "двор и озеленение"), ("#2b2b33", "наземный паркинг")]
    lx = tx(2)
    for col, lab in keys:
        o.append(f'<rect x="{lx}" y="{ty(105)}" width="13" height="13" fill="{col}"/>')
        o.append(f'<text x="{lx + 19}" y="{ty(105) + 11}" fill="{GREY}" font-size="11.5">{lab}</text>')
        lx += 24 + len(lab) * 6.4
    if keys:
        o.append(f'<line x1="{lx + 2}" y1="{ty(105) + 7}" x2="{lx + 20}" y2="{ty(105) + 7}" stroke="{BLUE}" '
                 f'stroke-width="1.6" stroke-dasharray="6 4"/>')
        o.append(f'<text x="{lx + 26}" y="{ty(105) + 11}" fill="{GREY}" font-size="11.5">контур подземного паркинга</text>')

    o.append("</svg>")
    return "\n".join(o)


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    out = {"site_area": round(SITE_AREA), "zone": {"c": ZONE_C, "r_in": ZONE_R_IN, "r_out": ZONE_R_OUT},
           "schemes": {}}
    for s in SCHEMES:
        t = compute(s)
        out["schemes"][s["key"]] = dict(t, title=s["title"], idea=s["idea"],
                                        pros=s["pros"], cons=s["cons"])
        with open(os.path.join(here, "img", f"scheme_{s['key']}.svg"), "w") as f:
            f.write(svg(s, t))
        flag = "OK " if t["zone_clear"] >= ZONE_R_IN else "!! "
        print(f"{flag}{s['key'].upper()} {s['title']:<27} пятно {t['footprint']:>5} м² ({t['build_pct']:>4}%) "
              f" надземн. {t['gfa']:>6} м²  номеров {t['rooms']:>4}  эт. {t['floors']}  "
              f"коридор {t['corridor']:>3} м  паркинг {t['park_total']:>3} м/м  "
              f"до зоны {t['zone_clear']} м")
    with open(os.path.join(here, "schemes.json"), "w") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"участок {out['site_area']} м², охранная зона R{ZONE_R_IN} м в точке {ZONE_C}")
