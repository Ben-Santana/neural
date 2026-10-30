"""HTTP actions delivered outside the gesture recognition thread."""
import re
import urllib.parse
import urllib.request


def valid_api_action(action):
    if not isinstance(action, dict) or action.get('type') != 'api-call':
        return False
    try:
        url = urllib.parse.urlsplit(action.get('url', ''))
        headers = action.get('headers')
        method = action.get('method', '')
        return (url.scheme in ('http', 'https') and bool(url.hostname)
                and not url.username and not url.password
                and isinstance(method, str) and re.fullmatch(r'[A-Z]+', method) is not None
                and isinstance(headers, dict)
                and all(isinstance(k, str) and re.fullmatch(r"[!#$%&'*+.^_`|~0-9A-Za-z-]+", k)
                        and isinstance(v, str) and '\r' not in v and '\n' not in v
                        for k, v in headers.items())
                and isinstance(action.get('body'), str)
                and (method not in ('GET', 'HEAD') or not action['body'])
                and type(action.get('timeoutMs')) is int and 1000 <= action['timeoutMs'] <= 120000)
    except (ValueError, TypeError, AttributeError):
        return False


class NoRedirect(urllib.request.HTTPRedirectHandler):
    # Avoid replaying authorization headers or a request body to another endpoint.
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def execute_api_call(action):
    if not valid_api_action(action):
        raise ValueError('Invalid API call configuration')
    data = action['body'].encode('utf-8') if action['method'] not in ('GET', 'HEAD') else None
    request = urllib.request.Request(action['url'], data=data, headers=action['headers'], method=action['method'])
    with urllib.request.build_opener(NoRedirect).open(request, timeout=action['timeoutMs'] / 1000) as response:
        return response.status
