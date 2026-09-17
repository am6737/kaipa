import itertools
import unittest
from unittest.mock import MagicMock, mock_open, patch

import session


class SessionTests(unittest.TestCase):
    def test_health_checks_all_services(self):
        with patch.object(session.urllib.request, "urlopen") as request, \
                patch.object(session.socket, "create_connection") as connect:
            request.return_value.__enter__.return_value.status = 200
            connect.return_value.__enter__.return_value.recv.return_value = b"RFB 003.008\n"
            session.health()
            self.assertEqual(request.call_count, 3)
            connect.assert_called_once_with(("127.0.0.1", 5900), timeout=2)

    def test_health_rejects_invalid_vnc_protocol(self):
        with patch.object(session.urllib.request, "urlopen") as request, \
                patch.object(session.socket, "create_connection") as connect:
            request.return_value.__enter__.return_value.status = 200
            connect.return_value.__enter__.return_value.recv.return_value = b"HTTP/1.1"
            with self.assertRaisesRegex(RuntimeError, "VNC protocol"):
                session.health()

    def run_mock_session(self, *, failed_process=False, unhealthy=False):
        children = [MagicMock(pid=200 + index) for index in range(6)]
        for child in children:
            child.poll.return_value = None
        if failed_process:
            children[0].poll.return_value = 1
        with patch.object(session.os, "umask"), \
                patch.object(session.signal, "signal"), \
                patch.object(session.Path, "read_text", return_value="A1b2C3d4\n"), \
                patch.object(session.Path, "open", mock_open()), \
                patch.object(session.Path, "exists", return_value=True), \
                patch.object(session.subprocess, "run") as password_command, \
                patch.object(session.subprocess, "Popen", side_effect=children) as launch, \
                patch.object(session.threading, "Event") as event, \
                patch.object(session, "health") as health, \
                patch.object(session.time, "monotonic", side_effect=itertools.count()), \
                patch.object(session.os, "killpg") as kill, \
                patch.dict(session.os.environ, {"SESSION_TTL_SECONDS": "1" if not failed_process else "100"}):
            event.return_value.wait.return_value = False
            if unhealthy:
                health.side_effect = RuntimeError("not ready")
            if unhealthy or failed_process:
                with self.assertRaises(RuntimeError):
                    session.run()
            else:
                session.run()
            return children, launch, kill, password_command

    def test_time_limit_stops_every_service_and_preserves_local_ports(self):
        children, launch, kill, password_command = self.run_mock_session()
        commands = [call.args[0] for call in launch.call_args_list]
        self.assertEqual(len(commands), 6)
        vnc = next(command for command in commands if command[0] == "x11vnc")
        self.assertEqual(vnc[vnc.index("-listen") + 1], "127.0.0.1")
        self.assertIn("-no6", vnc)
        self.assertEqual(vnc[vnc.index("-rfbportv6") + 1], "-1")
        self.assertIn("-rfbauth", vnc)
        chrome = next(command for command in commands if command[0] == "/opt/chrome/chrome")
        self.assertIn("--remote-debugging-address=127.0.0.1", chrome)
        self.assertEqual(chrome[-1], "about:blank")
        self.assertFalse(any(arg.startswith("--headless") for arg in chrome))
        self.assertNotIn("A1b2C3d4", password_command.call_args.args[0])
        self.assertEqual(kill.call_count, 6)
        self.assertTrue(all(child.wait.called for child in children))

    def test_failed_service_stops_remaining_services(self):
        children, _, kill, _ = self.run_mock_session(failed_process=True)
        self.assertEqual(kill.call_count, 5)
        self.assertTrue(all(child.wait.called for child in children))

    def test_startup_failure_cleans_up(self):
        children, _, kill, _ = self.run_mock_session(unhealthy=True)
        self.assertEqual(kill.call_count, 6)
        self.assertTrue(all(child.wait.called for child in children))

    def test_invalid_password_does_not_start_services(self):
        with patch.object(session.os, "umask"), \
                patch.object(session.signal, "signal"), \
                patch.object(session.Path, "read_text", return_value="too-long-password"), \
                patch.object(session.subprocess, "Popen") as launch:
            with self.assertRaises(ValueError):
                session.run()
            launch.assert_not_called()


if __name__ == "__main__":
    unittest.main()
