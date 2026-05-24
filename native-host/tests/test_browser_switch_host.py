"""
Tests for native-host/browser_switch_host.py

Run with: pytest native-host/tests/ -v
"""

import importlib.util
import io
import json
import struct
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, call, patch

# ── Load the module without executing main() ──────────────────────────────────

HOST_PATH = Path(__file__).parent.parent / "browser_switch_host.py"
spec = importlib.util.spec_from_file_location("browser_switch_host", HOST_PATH)
host = importlib.util.module_from_spec(spec)
spec.loader.exec_module(host)

# ── Helpers ───────────────────────────────────────────────────────────────────


def encode_message(msg: dict) -> bytes:
    """Encode a message the same way the extension would."""
    payload = json.dumps(msg).encode("utf-8")
    return struct.pack("<I", len(payload)) + payload


def make_stdin(*messages: dict) -> io.BytesIO:
    """Create a fake stdin stream with the given messages (plus EOF)."""
    data = b"".join(encode_message(m) for m in messages)
    return io.BytesIO(data)


def capture_stdout() -> io.BytesIO:
    return io.BytesIO()


def decode_response(buf: io.BytesIO) -> dict:
    buf.seek(0)
    raw_len = buf.read(4)
    if len(raw_len) < 4:
        return {}
    length = struct.unpack("<I", raw_len)[0]
    return json.loads(buf.read(length).decode("utf-8"))


# ── read_message / send_message ───────────────────────────────────────────────


class TestMessageProtocol(unittest.TestCase):

    def test_read_message_parses_correctly(self):
        payload = {"url": "https://example.com", "browser": "firefox"}
        buf = make_stdin(payload)
        with patch.object(sys, "stdin", buffer=buf):
            result = host.read_message()
        self.assertEqual(result, payload)

    def test_read_message_returns_none_on_eof(self):
        buf = io.BytesIO(b"")  # no data
        with patch.object(sys, "stdin", buffer=buf):
            result = host.read_message()
        self.assertIsNone(result)

    def test_read_message_returns_none_on_short_header(self):
        buf = io.BytesIO(b"\x00\x00")  # only 2 bytes instead of 4
        with patch.object(sys, "stdin", buffer=buf):
            result = host.read_message()
        self.assertIsNone(result)

    def test_send_message_encodes_correctly(self):
        msg = {"success": True}
        out = io.BytesIO()
        with patch.object(sys, "stdout", buffer=out):
            host.send_message(msg)
        out.seek(0)
        raw_len = out.read(4)
        length = struct.unpack("<I", raw_len)[0]
        decoded = json.loads(out.read(length).decode("utf-8"))
        self.assertEqual(decoded, msg)

    def test_round_trip(self):
        """send_message output can be parsed by read_message."""
        original = {"success": False, "error": "something went wrong"}
        out = io.BytesIO()
        with patch.object(sys, "stdout", buffer=out):
            host.send_message(original)
        out.seek(0)
        with patch.object(sys, "stdin", buffer=out):
            result = host.read_message()
        self.assertEqual(result, original)


# ── resolve_command ───────────────────────────────────────────────────────────


class TestResolveCommand(unittest.TestCase):

    def test_custom_path_overrides_default(self):
        result = host.resolve_command("firefox", "/opt/my-firefox/firefox")
        self.assertEqual(result, ["/opt/my-firefox/firefox"])

    def test_returns_default_for_known_browser_on_linux(self):
        with patch.object(host, "SYSTEM", "Linux"):
            result = host.resolve_command("firefox", None)
        self.assertIn("firefox", result)

    def test_returns_default_for_chrome_on_linux(self):
        with patch.object(host, "SYSTEM", "Linux"):
            result = host.resolve_command("chrome", None)
        self.assertIn("google-chrome", result)

    def test_raises_for_safari_on_linux(self):
        """Safari has no Linux entry in BROWSER_DEFAULTS."""
        with patch.object(host, "SYSTEM", "Linux"):
            with self.assertRaises(ValueError) as ctx:
                host.resolve_command("safari", None)
        self.assertIn("safari", str(ctx.exception).lower())

    def test_raises_for_unknown_browser(self):
        with patch.object(host, "SYSTEM", "Linux"):
            with self.assertRaises(ValueError):
                host.resolve_command("nonexistent_browser_xyz", None)

    def test_darwin_firefox_uses_open(self):
        with patch.object(host, "SYSTEM", "Darwin"):
            result = host.resolve_command("firefox", None)
        self.assertEqual(result[0], "open")
        self.assertIn("Firefox", result)

    def test_windows_firefox_path(self):
        with patch.object(host, "SYSTEM", "Windows"):
            result = host.resolve_command("firefox", None)
        self.assertTrue(any("firefox" in p.lower() for p in result))

    def test_all_known_browsers_have_linux_entries(self):
        """Every browser except safari should work on Linux."""
        linux_only = [b for b in host.BROWSER_DEFAULTS if b != "safari"]
        with patch.object(host, "SYSTEM", "Linux"):
            for browser_id in linux_only:
                result = host.resolve_command(browser_id, None)
                self.assertIsInstance(result, list)
                self.assertTrue(len(result) > 0, f"{browser_id} returned empty list")


# ── main() message loop ───────────────────────────────────────────────────────


class TestMainLoop(unittest.TestCase):

    def _run_main_with(self, *messages):
        """Run main() with the given messages, return the captured stdout bytes."""
        stdin_buf  = make_stdin(*messages)
        stdout_buf = io.BytesIO()

        with (
            patch.object(sys, "stdin",  buffer=stdin_buf),
            patch.object(sys, "stdout", buffer=stdout_buf),
        ):
            host.main()

        return stdout_buf

    def _read_all_responses(self, buf: io.BytesIO) -> list[dict]:
        buf.seek(0)
        responses = []
        while True:
            raw_len = buf.read(4)
            if len(raw_len) < 4:
                break
            length = struct.unpack("<I", raw_len)[0]
            responses.append(json.loads(buf.read(length)))
        return responses

    def test_ping_returns_pong(self):
        buf = self._run_main_with({"url": "about:blank", "browser": "ping"})
        responses = self._read_all_responses(buf)
        self.assertEqual(len(responses), 1)
        self.assertTrue(responses[0]["success"])
        self.assertTrue(responses[0].get("pong"))

    def test_successful_browser_open(self):
        with patch("subprocess.Popen") as mock_popen:
            mock_popen.return_value = MagicMock()
            with patch.object(host, "SYSTEM", "Linux"):
                buf = self._run_main_with(
                    {"url": "https://example.com", "browser": "firefox"}
                )
        responses = self._read_all_responses(buf)
        self.assertEqual(len(responses), 1)
        self.assertTrue(responses[0]["success"])
        mock_popen.assert_called_once()
        args = mock_popen.call_args[0][0]
        self.assertIn("https://example.com", args)

    def test_error_response_on_unknown_browser(self):
        with patch.object(host, "SYSTEM", "Linux"):
            buf = self._run_main_with(
                {"url": "https://example.com", "browser": "does_not_exist"}
            )
        responses = self._read_all_responses(buf)
        self.assertEqual(len(responses), 1)
        self.assertFalse(responses[0]["success"])
        self.assertIn("error", responses[0])
        self.assertIsInstance(responses[0]["error"], str)

    def test_multiple_messages_handled_in_sequence(self):
        with patch("subprocess.Popen") as mock_popen:
            mock_popen.return_value = MagicMock()
            with patch.object(host, "SYSTEM", "Linux"):
                buf = self._run_main_with(
                    {"url": "about:blank",        "browser": "ping"},
                    {"url": "https://one.com",    "browser": "firefox"},
                    {"url": "https://two.com",    "browser": "chrome"},
                )
        responses = self._read_all_responses(buf)
        self.assertEqual(len(responses), 3)
        self.assertTrue(responses[0]["success"])   # ping
        self.assertTrue(responses[1]["success"])   # firefox
        self.assertTrue(responses[2]["success"])   # chrome
        self.assertEqual(mock_popen.call_count, 2)

    def test_custom_path_is_used_when_provided(self):
        custom = "/opt/myfox/firefox"
        with patch("subprocess.Popen") as mock_popen:
            mock_popen.return_value = MagicMock()
            with patch.object(host, "SYSTEM", "Linux"):
                buf = self._run_main_with(
                    {"url": "https://example.com", "browser": "firefox", "path": custom}
                )
        args = mock_popen.call_args[0][0]
        self.assertEqual(args[0], custom)

    def test_loop_exits_cleanly_on_eof(self):
        """main() should return (not raise) when stdin is empty."""
        buf = io.BytesIO(b"")
        out = io.BytesIO()
        with (
            patch.object(sys, "stdin",  buffer=buf),
            patch.object(sys, "stdout", buffer=out),
        ):
            host.main()  # should not raise


# ── BROWSER_DEFAULTS structure ────────────────────────────────────────────────


class TestBrowserDefaults(unittest.TestCase):

    def test_all_entries_are_non_empty_lists(self):
        for browser_id, platforms in host.BROWSER_DEFAULTS.items():
            for platform_name, cmds in platforms.items():
                self.assertIsInstance(cmds, list, f"{browser_id}/{platform_name} is not a list")
                self.assertTrue(len(cmds) > 0, f"{browser_id}/{platform_name} is empty")

    def test_known_browsers_present(self):
        expected = {"firefox", "chrome", "chromium", "edge", "brave"}
        self.assertTrue(expected.issubset(host.BROWSER_DEFAULTS.keys()))


if __name__ == "__main__":
    unittest.main()
