"""`resume-parser` command: init / parse / health."""
import argparse
import getpass
import json
import os
import secrets
import sys
from pathlib import Path

from .client import ResumeParserError, health, parse_resume

REPO_BUILD = "https://github.com/komilovsg/resume-parser.git#feat/resume-parser"
HEALTH_CMD = "node -e \"fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))\""
PROVIDERS = {"1": "gemini", "2": "openai", "3": "local"}


class SetupError(Exception):
    pass


# ---------- rendering ----------

def render_env(c):
    lines = ["AI_PROVIDER=%s" % c["provider"]]
    if c["provider"] == "gemini":
        lines.append("GEMINI_API_KEY=%s" % c["api_key"])
        if c.get("models"):
            lines.append("AI_MODELS=%s" % c["models"])
    else:
        if c["provider"] == "openai":
            lines.append("AI_API_KEY=%s" % c["api_key"])
        elif c.get("api_key"):
            lines.append("AI_API_KEY=%s" % c["api_key"])
        lines.append("AI_BASE_URL=%s" % c["base_url"])
        lines.append("AI_MODELS=%s" % c["models"])
        lines.append("AI_VISION=%s" % ("1" if c.get("vision") else "0"))
    if c.get("token"):
        lines.append("SERVICE_TOKEN=%s" % c["token"])
    lines.append("RATE_LIMIT=0")
    return "\n".join(lines) + "\n"


def render_compose(c):
    image = os.environ.get("RESUME_PARSER_IMAGE")
    src = ("    image: %s\n" % image) if image else ("    build: %s\n" % REPO_BUILD)
    ollama = c["provider"] == "local" and c.get("ollama")
    out = "services:\n  resume-parser:\n" + src
    out += (
        "    ports:\n"
        '      - "%s:3000"\n'
        "    env_file: .env\n"
        "    restart: unless-stopped\n"
        "    healthcheck:\n"
        "      test: [\"CMD\", \"node\", \"-e\", \"fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))\"]\n"
        "      interval: 30s\n"
        "      timeout: 5s\n"
        "      retries: 3\n"
    ) % c["port"]
    if c["provider"] == "local" and not ollama:
        out += '    extra_hosts:\n      - "host.docker.internal:host-gateway"\n'
    if ollama:
        out += (
            "    depends_on:\n      ollama:\n        condition: service_healthy\n"
            "  ollama:\n"
            "    image: ollama/ollama\n"
            "    volumes:\n      - ollama:/root/.ollama\n"
            "    restart: unless-stopped\n"
            "    healthcheck:\n"
            '      test: ["CMD", "ollama", "list"]\n'
            "      interval: 10s\n"
            "      timeout: 5s\n"
            "      retries: 10\n"
            "volumes:\n  ollama:\n"
        )
    return out


def write_files(directory, c, force=False, confirm=None):
    """Write .env and docker-compose.yml. Never overwrites without force/confirm."""
    d = Path(directory)
    d.mkdir(parents=True, exist_ok=True)
    written = []
    for name, content, mode in ((".env", render_env(c), 0o600), ("docker-compose.yml", render_compose(c), 0o644)):
        p = d / name
        if p.exists() and not force:
            if not (confirm and confirm("Файл %s уже есть. Перезаписать?" % p)):
                raise SetupError("%s уже существует (используйте --force)" % p)
        fd = os.open(str(p), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, mode)
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(content)
        os.chmod(str(p), mode)
        written.append(p)
    return written


# ---------- init ----------

def _ask(prompt, default=None):
    s = input("%s%s: " % (prompt, " [%s]" % default if default else "")).strip()
    return s or default


def _yes(prompt, default=True):
    s = input("%s [%s]: " % (prompt, "Y/n" if default else "y/N")).strip().lower()
    return default if not s else s in ("y", "yes", "д", "да")


def collect_interactive(a):
    c = {}
    print("Какую модель использовать для разбора резюме?")
    print("  1) Gemini (Google)")
    print("  2) OpenAI-совместимый облачный API (OpenAI, DeepSeek, Qwen/DashScope ...)")
    print("  3) Локальная модель (Ollama, LM Studio, vLLM, llama.cpp), без ключа")
    c["provider"] = PROVIDERS.get(_ask("Выбор", "1"))
    if not c["provider"]:
        raise SetupError("Нужно выбрать 1, 2 или 3")
    if c["provider"] == "gemini":
        c["api_key"] = a.api_key or getpass.getpass("GEMINI_API_KEY: ").strip()
        c["models"] = a.models
    elif c["provider"] == "openai":
        print("Примеры:\n  OpenAI    https://api.openai.com/v1  gpt-4o-mini\n"
              "  DeepSeek  https://api.deepseek.com/v1  deepseek-chat\n"
              "  Qwen      https://dashscope-intl.aliyuncs.com/compatible-mode/v1  qwen-plus")
        c["base_url"] = a.base_url or _ask("Base URL", "https://api.openai.com/v1")
        c["models"] = a.models or _ask("Модель (через запятую)", "gpt-4o-mini")
        c["api_key"] = a.api_key or getpass.getpass("API-ключ: ").strip()
    else:
        print("Рекомендуем: qwen2.5:7b-instruct (только текст) или qwen2.5vl:7b (с картинками, тогда AI_VISION=1).\n"
              "7B-модели нужно около 8 ГБ ОЗУ; на CPU разбор резюме занимает десятки секунд.")
        c["ollama"] = _yes("Запустить модель в Docker через Ollama?", True)
        if c["ollama"]:
            c["base_url"] = "http://ollama:11434/v1"
        else:
            c["base_url"] = a.base_url or _ask("URL локального сервера (из Docker: http://host.docker.internal:11434/v1)",
                                               "http://host.docker.internal:11434/v1")
        c["models"] = a.models or _ask("Модель", "qwen2.5:7b-instruct")
        c["api_key"] = a.api_key
        c["vision"] = a.vision or _yes("Модель понимает изображения (vision)?", False)
    c["port"] = a.port or _ask("Порт на хосте", "8080")
    c["token"] = None if a.no_token else (a.token or secrets.token_urlsafe(32))
    return c


def collect_flags(a):
    c = {"provider": a.provider, "models": a.models, "api_key": a.api_key, "port": a.port or "8080",
         "token": None if a.no_token else (a.token or secrets.token_urlsafe(32))}
    if a.provider in ("gemini", "openai") and not a.api_key:
        raise SetupError("Нужен --api-key для провайдера %s" % a.provider)
    if a.provider == "openai":
        c["base_url"] = a.base_url or "https://api.openai.com/v1"
        c["models"] = a.models or "gpt-4o-mini"
    if a.provider == "local":
        if not a.models:
            raise SetupError("Для local нужен --models")
        c["ollama"] = not a.base_url
        c["base_url"] = a.base_url or "http://ollama:11434/v1"
        c["vision"] = a.vision
    return c


def cmd_init(a):
    try:
        c = collect_flags(a) if a.provider else collect_interactive(a)
        files = write_files(a.dir, c, a.force, None if a.provider else lambda q: _yes(q, False))
    except SetupError as e:
        print("Ошибка: %s" % e, file=sys.stderr)
        return 2
    except (EOFError, KeyboardInterrupt):
        print("\nПрервано", file=sys.stderr)
        return 130
    print("\nГотово: " + ", ".join(str(f) for f in files))
    print("\nЗапуск:\n  cd %s && docker compose up -d --build" % a.dir)
    if c["provider"] == "local" and c.get("ollama"):
        print("  docker compose exec ollama ollama pull %s   # один раз, скачивает модель" % c["models"].split(",")[0])
    print("\nДля клиента:\n  export RESUME_PARSER_URL=http://localhost:%s" % c["port"])
    if c.get("token"):
        print("  export RESUME_PARSER_TOKEN=<значение SERVICE_TOKEN из .env>")
    return 0


# ---------- parse / health ----------

def cmd_parse(a):
    try:
        res = parse_resume(a.file if len(a.file) > 1 else a.file[0], base_url=a.url, token=a.token, timeout=a.timeout)
    except (ResumeParserError, OSError) as e:
        print("Ошибка: %s" % e, file=sys.stderr)
        return 1
    json.dump(res, sys.stdout, ensure_ascii=False, indent=2)
    print()
    return 0


def cmd_health(a):
    try:
        print(json.dumps(health(base_url=a.url), ensure_ascii=False))
    except ResumeParserError as e:
        print("Ошибка: %s" % e, file=sys.stderr)
        return 1
    return 0


def build_parser():
    p = argparse.ArgumentParser(prog="resume-parser")
    sub = p.add_subparsers(dest="cmd", required=True)
    i = sub.add_parser("init", help="создать docker-compose.yml и .env")
    i.add_argument("--provider", choices=["gemini", "openai", "local"])
    i.add_argument("--api-key")
    i.add_argument("--base-url")
    i.add_argument("--models")
    i.add_argument("--port")
    i.add_argument("--token", help="свой SERVICE_TOKEN (по умолчанию случайный)")
    i.add_argument("--no-token", action="store_true", help="без авторизации")
    i.add_argument("--vision", action="store_true", help="local: модель понимает картинки (AI_VISION=1)")
    i.add_argument("--dir", default=".")
    i.add_argument("--force", action="store_true", help="перезаписать существующие файлы")
    i.set_defaults(fn=cmd_init)
    r = sub.add_parser("parse", help="разобрать файл (или несколько фото одного резюме), вывести JSON")
    r.add_argument("file", nargs="+", help="файл или до 6 фото по порядку страниц")
    r.add_argument("--url")
    r.add_argument("--token")
    r.add_argument("--timeout", type=int, default=200)
    r.set_defaults(fn=cmd_parse)
    h = sub.add_parser("health", help="проверить сервис")
    h.add_argument("--url")
    h.set_defaults(fn=cmd_health)
    return p


def main(argv=None):
    a = build_parser().parse_args(argv)
    sys.exit(a.fn(a))


if __name__ == "__main__":
    main()
