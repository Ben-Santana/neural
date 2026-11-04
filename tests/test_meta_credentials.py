import importlib.util
import json
import pathlib
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('credentials', pathlib.Path(__file__).parents[1] / 'python/meta_credentials.py')
credentials = importlib.util.module_from_spec(spec)
spec.loader.exec_module(credentials)


class CredentialsTests(unittest.TestCase):
    def test_save_and_load_use_separate_keychain_service(self):
        from meta_neural_py.identity.keychain import KeychainIdentityStore
        records = {}
        def write(store, account, data):
            records[store.service, account] = data
        def read(store, account):
            return records.get((store.service, account))
        with patch.object(KeychainIdentityStore, '_write', write), patch.object(KeychainIdentityStore, '_read', read):
            self.assertEqual(credentials.operate({'action': 'status'}), {'saved': False})
            credentials.operate({'action': 'save', 'username': ' fake@example.invalid ', 'password': 'test-only'})
            self.assertEqual(credentials.operate({'action': 'status'}), {'saved': True})
            self.assertEqual(credentials.operate({'action': 'load'}), {'username': 'fake@example.invalid', 'password': 'test-only'})
            self.assertEqual(set(records), {(credentials.SERVICE, 'credentials')})

    def test_blank_credentials_are_rejected_before_write(self):
        from meta_neural_py.identity.keychain import KeychainIdentityStore
        with patch.object(KeychainIdentityStore, '_write') as write:
            for username, password in [('', 'x'), ('x', ''), (' ', 'x'), (None, 'x')]:
                with self.assertRaises(ValueError):
                    credentials.operate({'action': 'save', 'username': username, 'password': password})
            write.assert_not_called()
