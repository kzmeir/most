#!/usr/bin/env python3
"""Facade generator via Gemini API (gemini-2.5-flash-image / Nano Banana).

Требует ВКЛЮЧЁННЫЙ БИЛЛИНГ на проекте ключа (на free-tier лимит изображений = 0).

Ключ берётся из переменной окружения GEMINI_API_KEY (НЕ коммить ключ!):
    export GEMINI_API_KEY=AIza...
    python3 gen.py --prompt-file p.txt --out ../03_output/run01 --n 2 --ref ../01_style-core/ref_01.jpg

Опции:
    --prompt-file  файл с текстом промпта
    --out          папка для PNG (создаётся)
    --n            число вариаций (отдельных запросов)
    --ref          0..3 файла-референса (замок стиля)
    --model        по умолчанию gemini-2.5-flash-image
    --tag          префикс имени файла
"""
import argparse, base64, json, os, sys, time, urllib.request, urllib.error

KEY = os.environ.get("GEMINI_API_KEY", "").strip()
if not KEY:
    sys.exit("Нет ключа. Задай: export GEMINI_API_KEY=AIza...")

def load_img(path):
    with open(path, "rb") as f:
        data = f.read()
    ext = os.path.splitext(path)[1].lower().lstrip(".")
    mime = {"jpg":"image/jpeg","jpeg":"image/jpeg","png":"image/png","webp":"image/webp"}.get(ext, "image/jpeg")
    return {"inlineData": {"mimeType": mime, "data": base64.b64encode(data).decode()}}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--prompt-file", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--n", type=int, default=1)
    ap.add_argument("--ref", nargs="*", default=[])
    ap.add_argument("--model", default="gemini-2.5-flash-image")
    ap.add_argument("--tag", default="facade")
    a = ap.parse_args()

    prompt = open(a.prompt_file).read().strip()
    os.makedirs(a.out, exist_ok=True)
    parts = [{"text": prompt}] + [load_img(r) for r in a.ref]
    body = json.dumps({"contents": [{"role": "user", "parts": parts}]}).encode()
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{a.model}:generateContent?key={KEY}"

    saved = 0
    for i in range(a.n):
        req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                data = json.load(r)
        except urllib.error.HTTPError as e:
            print(f"[{i}] HTTP {e.code}: {e.read().decode()[:400]}", file=sys.stderr); continue
        except Exception as e:
            print(f"[{i}] ERR {e}", file=sys.stderr); continue
        cand = (data.get("candidates") or [{}])[0]
        iparts = (cand.get("content") or {}).get("parts") or []
        img = next((p for p in iparts if p.get("inlineData", {}).get("data")), None)
        if not img:
            reason = cand.get("finishReason") or data.get("promptFeedback", {}).get("blockReason") or "no image returned"
            print(f"[{i}] {reason}", file=sys.stderr); continue
        raw = base64.b64decode(img["inlineData"]["data"])
        fn = os.path.join(a.out, f"{a.tag}_{int(time.time())}_{i}.png")
        with open(fn, "wb") as f:
            f.write(raw)
        saved += 1; print(f"[{i}] saved {fn} ({len(raw)//1024} KB)")
    print(f"DONE {saved}/{a.n}")

if __name__ == "__main__":
    main()
