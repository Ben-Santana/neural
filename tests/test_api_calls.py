import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from python.api_calls import execute_api_call, valid_api_action
from python.shortcuts import ShortcutEngine


class ApiCallTests(unittest.TestCase):
    def test_request_delivery_and_gesture_assignment(self):
        received = []
        class Handler(BaseHTTPRequestHandler):
            def do_PATCH(self):
                received.append((self.path, self.headers['Authorization'], self.rfile.read(int(self.headers['Content-Length']))))
                self.send_response(204)
                self.end_headers()
            def log_message(self, *args):
                pass
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            action = {'type': 'api-call', 'method': 'PATCH', 'url': f'http://127.0.0.1:{server.server_port}/action?q=1', 'headers': {'Authorization': 'Bearer test'}, 'body': '{"on":true}', 'timeoutMs': 1000}
            sent = []
            engine = ShortcutEngine(sent.append)
            engine.configure([{'id': 'swipe-left', 'enabled': True, 'shortcut': None, 'appAction': action}])
            engine.suspended = False
            engine.ingest({'type': 'Gesture', 'action': 'left', 'finger': 'index', 'derived_action': 'unknown'})
            self.assertEqual(sent, [{'appAction': action}])
            self.assertEqual(execute_api_call(sent[0]['appAction']), 204)
            self.assertEqual(received, [('/action?q=1', 'Bearer test', b'{"on":true}')])
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

    def test_invalid_configuration(self):
        action = {'type': 'api-call', 'method': 'GET', 'url': 'https://example.com', 'headers': {}, 'body': '', 'timeoutMs': 1000}
        self.assertTrue(valid_api_action(action))
        for change in ({'url': 'file:///tmp/x'}, {'url': 'https://user:secret@example.com'}, {'headers': {'X': 'x\r\nBad: y'}}, {'body': 'GET body'}, {'timeoutMs': 0}, {'method': 'POST\r\n'}):
            self.assertFalse(valid_api_action({**action, **change}))
