"""Zero-dependency client for the resume-parser service."""
import json
import mimetypes
import os
import urllib.error
import urllib.request
import uuid
from pathlib import Path

DEFAULT_URL = "http://localhost:8080"


class ResumeParserError(Exception):
    def __init__(self, code, message, status=None):
        super().__init__("%s: %s" % (code, message))
        self.code = code
        self.message = message
        self.status = status


def _base(base_url):
    return (base_url or os.environ.get("RESUME_PARSER_URL") or DEFAULT_URL).rstrip("/")


def _headers(token, extra=None):
    h = {"Accept": "application/json"}
    token = token or os.environ.get("RESUME_PARSER_TOKEN")
    if token:
        h["Authorization"] = "Bearer " + token
    h.update(extra or {})
    return h


def build_multipart_files(parts, boundary=None):
    """Return (body, content_type_header) for repeated `file` fields.

    parts: list of (filename, data, content_type), sent in this order.
    """
    boundary = boundary or uuid.uuid4().hex
    body = b""
    for filename, data, content_type in parts:
        safe = filename.replace('"', "_").replace("\r", "_").replace("\n", "_")
        body += (
            '--%s\r\nContent-Disposition: form-data; name="file"; filename="%s"\r\n'
            "Content-Type: %s\r\n\r\n" % (boundary, safe, content_type)
        ).encode("utf-8") + data + b"\r\n"
    body += ("--%s--\r\n" % boundary).encode("ascii")
    return body, "multipart/form-data; boundary=" + boundary


def build_multipart(filename, data, content_type, boundary=None):
    """Return (body, content_type_header) for a single `file` field."""
    return build_multipart_files([(filename, data, content_type)], boundary)


def _request(method, url, headers, body=None, timeout=200):
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
    except urllib.error.HTTPError as e:
        raise _http_error(e.code, e.read()) from None
    except (urllib.error.URLError, OSError) as e:
        raise ResumeParserError("connection_failed", str(getattr(e, "reason", e))) from None
    try:
        return json.loads(raw.decode("utf-8"))
    except ValueError:
        raise ResumeParserError("bad_response", "Service returned non-JSON", None) from None


def _http_error(status, raw):
    code, message = "http_%d" % status, "HTTP %d" % status
    try:
        err = json.loads(raw.decode("utf-8"))["error"]
        code, message = err["code"], err["message"]
    except (ValueError, KeyError, TypeError):
        pass
    return ResumeParserError(code, message, status)


def _read(file, filename):
    if isinstance(file, (bytes, bytearray)):
        return bytes(file), filename or "resume"
    if isinstance(file, (str, Path)):
        p = Path(file)
        return p.read_bytes(), filename or p.name
    return file.read(), filename or os.path.basename(getattr(file, "name", "") or "") or "resume"


def parse_resume(file, filename=None, *, base_url=None, token=None, timeout=200):
    """Parse a resume. Returns {"resume": ..., "meta": ..., "profile": ...}.

    `file` is a path, bytes or file object. Pass a list/tuple of them (up to 6
    photos, page order) to parse several photos as one resume; `filename` is
    then ignored.
    """
    items = [_read(f, None) for f in file] if isinstance(file, (list, tuple)) else [_read(file, filename)]
    parts = [(name, data, mimetypes.guess_type(name)[0] or "application/octet-stream") for data, name in items]
    body, ct = build_multipart_files(parts)
    return _request(
        "POST", _base(base_url) + "/api/parse?stream=0", _headers(token, {"Content-Type": ct}), body, timeout
    )


def to_profile(resume, *, base_url=None, token=None, timeout=60):
    """Recompute profile dictionary matching for an (edited) resume dict."""
    body = json.dumps({"resume": resume}).encode("utf-8")
    return _request(
        "POST", _base(base_url) + "/api/profile", _headers(token, {"Content-Type": "application/json"}), body, timeout
    )


def health(*, base_url=None, timeout=10):
    return _request("GET", _base(base_url) + "/api/health", _headers(None), None, timeout)
