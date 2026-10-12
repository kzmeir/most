#!/usr/bin/env python3
"""MOST ERP из командной строки по ключу ИИ (Настройки -> «Ключи для ИИ»).

Ключ лежит в хранилище паролей (gopass / pass), запись most/erp/token. В чат, файлы и аргументы команд не попадает:
  python erp.py login                       - ключ спрашивается скрытым вводом и кладётся в хранилище (делает директор)
  python erp.py logout                      - убрать ключ из хранилища
  python erp.py ping                        - кто я и какие модули включены
  python erp.py GET /pm/projects?track=ep   - чтение (сайт ERP, порт 3001)
  python erp.py --fin GET /balances         - сайт «Финансы» (порт 3000)
  python erp.py POST /pm/projects/<id>/log @body.json   - тело запроса из файла (кириллица) или строкой JSON
Удалять, менять пользователей, настройки и копии базы ключ не может - это проверяет сервер.
"""
import sys, os, json, getpass, shutil, subprocess, urllib.request, urllib.error

HOST = os.environ.get("MOST_ERP_HOST", "192.168.50.51")
ENTRY = "most/erp/token"


def _tool():
    for name in ("gopass", "pass"):
        p = shutil.which(name)
        if p:
            return p, name
    p = os.path.join(os.environ.get("LOCALAPPDATA", ""), "gopass", "gopass.exe")
    if os.path.exists(p):
        return p, "gopass"
    sys.exit("Нет хранилища паролей (gopass / pass). Установите: winget install --id gopass.gopass --exact")


def _run(cmd, text=None):
    return subprocess.run(cmd, input=text, stdin=None if text is not None else subprocess.DEVNULL, capture_output=True, encoding="utf-8")


def token_read():
    tool, kind = _tool()
    out = _run([tool, "--nofuzzysearch", "show", "-n", "-f", ENTRY] if kind == "gopass" else [tool, "show", ENTRY])
    if out.returncode != 0 or not out.stdout.strip():
        sys.exit("Ключа ИИ в хранилище нет. Директор: Настройки -> «Ключи для ИИ» -> создать, затем в своём терминале: python \"%s\" login" % os.path.abspath(__file__))
    return out.stdout.splitlines()[0].strip()


def request(method, path, body=None, fin=False):
    url = "http://%s:%d/api%s" % (HOST, 3000 if fin else 3001, path if path.startswith("/") else "/" + path)
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method.upper(), headers={"Authorization": "Bearer " + token_read(), "Content-Type": "application/json", "X-Requested-With": "fetch"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except urllib.error.URLError as e:
        sys.exit("ERP не отвечает (%s): %s" % (url, e.reason))


def main():
    for s in (sys.stdout, sys.stderr):
        if hasattr(s, "reconfigure"):
            s.reconfigure(encoding="utf-8")
    args = sys.argv[1:]
    fin = "--fin" in args
    args = [a for a in args if a != "--fin"]
    if not args:
        sys.exit(__doc__)
    cmd = args[0]
    if cmd == "login":
        t = getpass.getpass("Ключ ИИ (ввод скрыт): ").strip()
        if not t.startswith("most_") or len(t) != 69:
            sys.exit("Это не ключ ИИ: он начинается с most_ и состоит из 69 символов.")
        tool, _ = _tool()
        out = _run([tool, "insert", "-f", "-m", ENTRY], text=t + "\n")
        if out.returncode != 0:
            sys.exit("Не удалось записать ключ в хранилище: " + (out.stderr or "").strip())
        st, txt = request("GET", "/me")
        print("Ключ сохранён. Проверка: %s %s" % (st, txt[:120]))
        return
    if cmd == "logout":
        tool, _ = _tool()
        _run([tool, "rm", "-f", ENTRY])
        print("Ключ убран из хранилища. Отозвать его совсем - в ERP: Настройки -> «Ключи для ИИ».")
        return
    if cmd == "ping":
        st, txt = request("GET", "/me")
        print(st, txt[:200])
        st, txt = request("GET", "/status")
        try:
            print("модули:", ", ".join(m["id"] for m in json.loads(txt).get("modules", []) if m.get("on")))
        except Exception:
            print(st, txt[:200])
        return
    if len(args) < 2:
        sys.exit(__doc__)
    body = None
    if len(args) > 2:
        raw = open(args[2][1:], encoding="utf-8").read() if args[2].startswith("@") else args[2]
        body = json.loads(raw)
    st, txt = request(cmd, args[1], body, fin)
    try:
        print(json.dumps(json.loads(txt), ensure_ascii=False, indent=1))
    except Exception:
        print(txt)
    if st >= 400:
        sys.exit("HTTP %d" % st)


if __name__ == "__main__":
    main()
