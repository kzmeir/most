# Master Prompt — генерация фасадов (Nano Banana / Gemini 2.5 Flash Image)

> **Стиль:** современная неоклассика / «новая классика» — европейская городская
> архитектура премиум-класса (Лондон, Гамбург, Париж, Москва).
>
> **Как работает Nano Banana (главное):**
> 1. Промпт — это **связное описание предложениями**, а не теги через запятую.
> 2. «Замок стиля» = **вложенные картинки** из `01_style-core` (2–3 штуки работают уверенно).
> 3. Правки делаются **по одному параметру** в том же чате — стиль держится сам.
> 4. Формат кадра задаётся словами: `vertical 4:5 framing` / `wide 16:9` / `3:2`.

---

## БАЗОВЫЙ ПРОМПТ (шаблон)

Скопировать, подставить значения в `[...]`, приложить 2–3 эталона из `01_style-core`.

```
Create a photorealistic architectural render of a contemporary neoclassical
[BUILDING_TYPE] facade in the style of the attached reference images.
Warm cream limestone cladding with a matte natural texture. Tripartite
composition: a ground-floor base with [BASE], a main body articulated by
vertical fluted pilasters and deep window reveals, and an elegant setback
attic penthouse on top. Tall French windows with slender bronze frames and
minimal glass balustrades. Restrained classical detailing, timeless European
proportions, calm and monumental. Architectural photography, [VIEW], soft
golden-hour light, clear sky, warm interior glow, a few pedestrians for scale.
[FRAMING].
```

### Переменные

| Переменная | Варианты |
|---|---|
| `BUILDING_TYPE` | residential building · office building · mixed-use building · exhibition pavilion |
| `BASE` | a semicircular stone arcade · floor-to-ceiling retail glazing · a stone colonnade |
| `VIEW` | frontal elevation view · corner three-quarter view · street perspective |
| `FRAMING` | Vertical 4:5 framing · Wide 16:9 framing · 3:2 framing |
| материал | warm cream limestone · travertine · white painted stone · pale grey limestone |

---

## ПРЕСЕТ 1 — Чистая новая классика (жилой камень)

Референсы: изображения 1, 2, 10 (беж-камень, каннелированные пилястры, балконы).

```
Create a photorealistic architectural render of a contemporary neoclassical
residential building facade in the style of the attached reference images.
Warm cream limestone cladding with a matte natural texture. Tripartite
composition: a ground-floor base with floor-to-ceiling retail and lobby
glazing framed in dark metal, a main body of six floors articulated by
vertical fluted stone pilasters and deep window reveals, and an elegant
setback attic penthouse with a rooftop terrace and glass balustrade.
Tall French windows with slender bronze frames and minimal glass railings.
Restrained classical detailing, timeless European proportions, calm and
monumental. Architectural photography, corner three-quarter view, soft
golden-hour light, clear blue sky, warm interior glow, a few pedestrians
and a luxury car for scale. Vertical 4:5 framing.
```

---

## ПРЕСЕТ 2 — Офис / аркада (Portland stone)

Референсы: изображения 5, 9, 13 (аркады, вертикальные простенки, известняк).

```
Create a photorealistic architectural render of a contemporary neoclassical
office building facade in the style of the attached reference images. Pale
Portland limestone cladding, matte and precise. Tripartite composition: a
tall ground-floor base of repeating semicircular stone arches with recessed
bronze-and-glass shopfronts, a main body of large windows separated by
slender vertical stone mullions and fluted piers, and a restrained stone
cornice with a setback top floor. Blue-tinted glazing, elegant rhythm,
monumental civic character. Architectural photography, frontal elevation
view, clear daylight, subtle reflections in the glass, pedestrians for scale.
3:2 framing.
```

---

## ПРЕСЕТ 3 — «Старое + новое» (facade retention)

Референсы: изображения 4, 11, 12, 14 (сохранённый ордерный фасад + современная надстройка).
**Killer-feature NB:** можно приложить РЕАЛЬНОЕ фото исторического фасада участка.

```
Using the attached photo of the existing historic ordered stone facade,
preserve it exactly at the lower floors and design a contemporary addition
on top and set back: a modern glazed volume with a bronze/anthracite frame
grid [or: a crystalline glass rooftop crown / a dark glazed setback box].
Keep the old white classical facade with its cornices, window surrounds and
rustication intact; let the new and the old read as a deliberate dialogue.
Photorealistic architectural render, corner view, soft evening light, warm
interior glow behind the glass, refined European street context. 4:5 framing.
```

---

## ПРЕСЕТ 4 — Белая крашеная классика (бутик / флагман)

Референсы: изображения 3 (BYREDO), 8 (белый ордерный фасад).

```
Create a photorealistic architectural render of a compact corner building
facade in the style of the attached reference images. Crisp white painted
classical stonework with cornices, pilasters and rusticated base. Large
bright display windows on the ground floor with a minimalist boutique
interior visible inside, tall sash-proportioned windows above, a mansard
attic with dormers. Elegant, luminous, understated luxury. Twilight
architectural photography, corner view, glowing interior light, wet dark
street, a street lamp for scale. Vertical 4:5 framing.
```

---

## Быстрые правки в петле (менять по ОДНОМУ параметру)

- `keep everything, change the stone to white painted`
- `same building, corner view instead of frontal`
- `add one more floor, keep the proportions`
- `make the ground floor a semicircular arcade instead of glazing`
- `now blend in the attached historic facade at the lower floors`
- `evening light with warm interior glow instead of daytime`
- `remove the balconies, flush stone facade`
- `warmer travertine tone, softer texture`
