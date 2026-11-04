import ctypes
import unittest
from unittest.mock import Mock, patch
from python.shortcuts import MacKeyboard, valid_app_action, ShortcutEngine
from python.bridge import Bridge


class TypeTextTests(unittest.TestCase):
    def test_validation_and_recognition(self):
        text = '  Hello “world” 👋\n\tNext line\n' * 500
        action = {'type': 'type-text', 'text': text}
        self.assertTrue(valid_app_action(action))
        for value in ['', None, 42, 'bad\x00text', '\ud800']:
            self.assertFalse(valid_app_action({'type': 'type-text', 'text': value}))
        delivered = []
        engine = ShortcutEngine(delivered.append)
        engine.configure([{'id': 'tap-index', 'enabled': True, 'appAction': action}])
        engine.suspended = False
        engine.trigger('tap-index')
        self.assertEqual(delivered, [{'appAction': action}])
        self.assertTrue(valid_app_action({'type': 'sequence', 'actions': [action, action]}))

    def test_unicode_chunking_and_newlines(self):
        keyboard = MacKeyboard()
        keyboard.cg = Mock()
        keyboard.cg.AXIsProcessTrusted.return_value = True
        keyboard.cg.CGEventCreateKeyboardEvent.side_effect = range(1, 100)
        chunks = []
        keyboard.cg.CGEventKeyboardSetUnicodeString.side_effect = lambda event, count, units: chunks.append(ctypes.string_at(units, count * 2).decode('utf-16-le'))
        text = 'é漢字👋' * 20
        with patch('python.shortcuts.sys.platform', 'darwin'), patch('python.shortcuts.time.sleep'), patch.object(keyboard, '_send') as send:
            keyboard.type_text(text + '\r\n\tDone')
        self.assertEqual(''.join(chunks[::2]), text + 'Done')
        self.assertTrue(all(len(chunk.encode('utf-16-le')) <= 64 for chunk in chunks))
        self.assertEqual([call.args[0]['key'] for call in send.call_args_list], ['Enter', 'Tab'])
        self.assertEqual(keyboard.cg.CFRelease.call_count, len(chunks))

    def test_sequence_delivery_and_failure(self):
        bridge = Bridge()
        bridge.keyboard.type_text = Mock()
        bridge.keyboard.send = Mock()
        bridge.api_slots.acquire()
        with patch('python.bridge.emit'), patch('python.bridge.time.sleep'):
            bridge.deliver_sequence({'actions': [{'type': 'type-text', 'text': 'Hello\n👋'}, {'type': 'shortcut', 'shortcut': {'key': 'A', 'modifiers': []}}]})
        bridge.keyboard.type_text.assert_called_once_with('Hello\n👋')
        bridge.keyboard.send.assert_called_once()
        bridge.keyboard.type_text.side_effect = RuntimeError('private text')
        bridge.api_slots.acquire()
        with patch('python.bridge.emit') as emit:
            bridge.deliver_text({'text': 'private text'})
        self.assertNotIn('private text', str(emit.call_args))
        self.assertTrue(bridge.api_slots.acquire(blocking=False))
