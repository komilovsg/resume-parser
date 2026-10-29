import json
import os
import stat
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer

from resume_parser import ResumeParserError, health, parse_resume
from resume_parser.cli import build_parser, cmd_init, render_compose
from resume_parser.client import build_multipart, build_multipart_files


class Handler(BaseHTTPRequestHandler):
    seen = {}

    def log_message(self, *a):
        pass

    def _send(self, status, obj):
        b = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        self._send(200, {"ok": True})

    def do_POST(self):
        n = int(self.headers["Content-Length"])
        Handler.seen = {"path": self.path, "auth": self.headers.get("Authorization"), "body": self.rfile.read(n)}
        if self.headers.get("Authorization") != "Bearer tok":
            return self._send(401, {"error": {"code": "unauthorized", "message": "no"}})
        if b"bad" in Handler.seen["body"]:
            return self._send(422, {"error": {"code": "empty", "message": "пусто"}})
        self._send(200, {"resume": {"fullName": "A"}, "meta": {}, "profile": {}})


class ClientTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = HTTPServer(("127.0.0.1", 0), Handler)
        cls.url = "http://127.0.0.1:%d" % cls.srv.server_port
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()

    def test_multipart(self):
        body, ct = build_multipart("a.txt", b"DATA", "text/plain", boundary="B")
        self.assertEqual(ct, "multipart/form-data; boundary=B")
        self.assertIn(b'name="file"; filename="a.txt"', body)
        self.assertTrue(body.endswith(b"DATA\r\n--B--\r\n"))

    def test_parse_ok_bytes_and_stream0(self):
        r = parse_resume(b"hello", "a.txt", base_url=self.url, token="tok")
        self.assertEqual(r["resume"]["fullName"], "A")
        self.assertEqual(Handler.seen["path"], "/api/parse?stream=0")
        self.assertEqual(Handler.seen["auth"], "Bearer tok")

    def test_parse_path_and_fileobj(self):
        with tempfile.NamedTemporaryFile(suffix=".txt") as f:
            f.write(b"x")
            f.flush()
            parse_resume(f.name, base_url=self.url, token="tok")
            self.assertIn(os.path.basename(f.name).encode(), Handler.seen["body"])
            f.seek(0)
            parse_resume(f, base_url=self.url, token="tok")

    def test_multi_file(self):
        body, ct = build_multipart_files([("a.jpg", b"AAA", "image/jpeg"), ("b.jpg", b"BBB", "image/jpeg")], boundary="B")
        self.assertEqual(body.count(b'name="file"'), 2)
        self.assertLess(body.index(b'filename="a.jpg"'), body.index(b'filename="b.jpg"'))
        self.assertTrue(body.endswith(b"BBB\r\n--B--\r\n"))
        parse_resume([b"\xff\xd8\xff1", b"\xff\xd8\xff2"], base_url=self.url, token="tok")
        seen = Handler.seen["body"]
        self.assertEqual(seen.count(b'name="file"'), 2)
        self.assertLess(seen.index(b"\xff\xd8\xff1"), seen.index(b"\xff\xd8\xff2"))

    def test_cli_accepts_many_files(self):
        a = build_parser().parse_args(["parse", "a.jpg", "b.jpg"])
        self.assertEqual(a.file, ["a.jpg", "b.jpg"])

    def test_error_mapping(self):
        with self.assertRaises(ResumeParserError) as cm:
            parse_resume(b"bad", "a.txt", base_url=self.url, token="tok")
        self.assertEqual((cm.exception.code, cm.exception.status, cm.exception.message), ("empty", 422, "пусто"))
        with self.assertRaises(ResumeParserError) as cm:
            parse_resume(b"x", "a.txt", base_url=self.url)
        self.assertEqual((cm.exception.code, cm.exception.status), ("unauthorized", 401))

    def test_connection_error(self):
        with self.assertRaises(ResumeParserError) as cm:
            health(base_url="http://127.0.0.1:1", timeout=2)
        self.assertEqual(cm.exception.code, "connection_failed")

    def test_health(self):
        self.assertTrue(health(base_url=self.url)["ok"])


class InitTests(unittest.TestCase):
    def run_init(self, *args):
        a = build_parser().parse_args(["init", *args])
        return cmd_init(a)

    def test_local_noninteractive(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(self.run_init("--provider", "local", "--models", "qwen2.5:7b-instruct", "--dir", d), 0)
            env = open(os.path.join(d, ".env")).read()
            self.assertIn("AI_PROVIDER=local", env)
            self.assertIn("AI_BASE_URL=http://ollama:11434/v1", env)
            self.assertIn("AI_MODELS=qwen2.5:7b-instruct", env)
            self.assertIn("AI_VISION=0", env)
            self.assertRegex(env, r"SERVICE_TOKEN=\S{20,}")
            self.assertEqual(stat.S_IMODE(os.stat(os.path.join(d, ".env")).st_mode), 0o600)
            compose = open(os.path.join(d, "docker-compose.yml")).read()
            self.assertIn("ollama/ollama", compose)
            self.assertIn("env_file: .env", compose)
            self.assertIn("8080:3000", compose)

    def test_gemini_and_no_overwrite(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(self.run_init("--provider", "gemini", "--api-key", "K", "--no-token", "--dir", d), 0)
            env = open(os.path.join(d, ".env")).read()
            self.assertIn("GEMINI_API_KEY=K", env)
            self.assertNotIn("SERVICE_TOKEN", env)
            self.assertEqual(self.run_init("--provider", "gemini", "--api-key", "K2", "--dir", d), 2)
            self.assertIn("GEMINI_API_KEY=K\n", open(os.path.join(d, ".env")).read())
            self.assertEqual(self.run_init("--provider", "gemini", "--api-key", "K2", "--dir", d, "--force"), 0)
            self.assertIn("GEMINI_API_KEY=K2", open(os.path.join(d, ".env")).read())

    def test_local_existing_server_has_host_gateway(self):
        c = {"provider": "local", "port": "9000", "ollama": False}
        self.assertIn("host.docker.internal:host-gateway", render_compose(c))
        self.assertNotIn("ollama/ollama", render_compose(c))

    def test_missing_key(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(self.run_init("--provider", "openai", "--dir", d), 2)


if __name__ == "__main__":
    unittest.main()
