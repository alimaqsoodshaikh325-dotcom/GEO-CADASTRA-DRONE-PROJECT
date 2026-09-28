from __future__ import annotations

from fastapi.testclient import TestClient

from backend.app.main import app

client = TestClient(app)


def test_assistant_missing_gemini_config(monkeypatch):
    monkeypatch.delenv('GEMINI_API_KEY', raising=False)
    monkeypatch.setenv('GEMINI_MODEL', 'gemini-2.5-flash')
    response = client.get('/api/assistant/status')
    assert response.status_code == 200
    payload = response.json()
    assert payload['status'] == 'not_configured'
    assert payload['code'] == 'GEMINI_NOT_CONFIGURED'


def test_assistant_status_reports_model(monkeypatch):
    from backend.app.services.gemini_service import gemini_service

    monkeypatch.setenv('GEMINI_API_KEY', 'test-key')
    monkeypatch.setattr(gemini_service, 'model', 'gemini-test-model')
    response = client.get('/api/assistant/status')
    assert response.status_code == 200
    assert response.json() == {
        'status': 'configured',
        'code': 'GEMINI_CONFIGURED',
        'model': 'gemini-test-model',
    }


def test_assistant_chat_reports_missing_gemini_config(monkeypatch):
    monkeypatch.delenv('GEMINI_API_KEY', raising=False)
    response = client.post('/api/assistant/chat', json={'message': 'hello'})
    assert response.status_code == 503
    assert response.json()['detail'] == 'Gemini is not configured.'


def test_assistant_chat_requires_message(monkeypatch):
    monkeypatch.setenv('GEMINI_API_KEY', 'test-key')
    monkeypatch.setenv('GEMINI_MODEL', 'gemini-2.5-flash')
    response = client.post('/api/assistant/chat', json={'message': ''})
    assert response.status_code == 400
    payload = response.json()
    assert 'message' in payload['detail']


def test_assistant_creates_conversation(monkeypatch):
    monkeypatch.setenv('GEMINI_API_KEY', 'test-key')
    monkeypatch.setenv('GEMINI_MODEL', 'gemini-2.5-flash')
    response = client.post('/api/assistant/conversations', json={})
    assert response.status_code == 200
    payload = response.json()
    assert 'conversation_id' in payload
    assert payload['title']


def test_assistant_chat_handles_gemini_error(monkeypatch):
    monkeypatch.setenv('GEMINI_API_KEY', 'test-key')
    monkeypatch.setenv('GEMINI_MODEL', 'gemini-2.5-flash')

    from backend.app.api import assistant as assistant_api

    def fake_generate(*args, **kwargs):
        raise RuntimeError('rate limited')

    monkeypatch.setattr(assistant_api, 'generate_gemini_reply', fake_generate)
    response = client.post('/api/assistant/chat', json={'message': 'hello', 'conversation_id': 'conv_123'})
    assert response.status_code == 200
    payload = response.text
    assert 'Gemini is temporarily unavailable' in payload or 'GEMINI_RATE_LIMIT' in payload


def test_assistant_chat_reports_exhausted_gemini_quota(monkeypatch):
    from backend.app.services.gemini_service import gemini_service

    def fail_with_quota(*args, **kwargs):
        raise RuntimeError('GEMINI_QUOTA_EXCEEDED')

    monkeypatch.setattr(gemini_service, 'stream_reply', fail_with_quota)
    response = client.post('/api/assistant/chat', json={'message': 'hello'})
    assert response.status_code == 429
    assert 'quota is exhausted' in response.json()['detail']


def test_gemini_service_classifies_quota_exhaustion(monkeypatch):
    from backend.app.services.gemini_service import gemini_service

    class QuotaError(RuntimeError):
        code = 429

    class FakeModels:
        def generate_content_stream(self, **kwargs):
            raise QuotaError('429 RESOURCE_EXHAUSTED: Quota exceeded for free tier requests.')

    class FakeClient:
        models = FakeModels()

    monkeypatch.setenv('GEMINI_API_KEY', 'test-key')
    monkeypatch.setattr(gemini_service, 'client', FakeClient())
    try:
        list(gemini_service.stream_reply('hello'))
    except RuntimeError as exc:
        assert str(exc) == 'GEMINI_QUOTA_EXCEEDED'
    else:
        raise AssertionError('Expected exhausted quota to be classified.')


def test_assistant_retries_transient_gemini_unavailable(monkeypatch):
    from backend.app.services.gemini_service import gemini_service

    attempts = {'count': 0}

    class FakeModels:
        def generate_content_stream(self, **kwargs):
            attempts['count'] += 1
            if attempts['count'] == 1:
                error = RuntimeError('503 UNAVAILABLE. This model is currently experiencing high demand.')
                error.status_code = 503
                raise error
            return iter(['Recovered reply'])

    class FakeClient:
        def __init__(self):
            self.models = FakeModels()

    monkeypatch.setenv('GEMINI_API_KEY', 'test-key')
    monkeypatch.setattr(gemini_service, 'model', 'gemini-3.6-flash')
    monkeypatch.setattr(gemini_service, 'client', None)
    monkeypatch.setattr(gemini_service, '_ensure_client', lambda: FakeClient())

    result = list(gemini_service.stream_reply('hello'))
    assert result == ['Recovered reply']
    assert attempts['count'] == 2
