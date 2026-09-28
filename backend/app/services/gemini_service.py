from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any, Iterator

from dotenv import load_dotenv


load_dotenv(Path(__file__).resolve().parents[2] / '.env')

logger = logging.getLogger(__name__)


class GeminiService:
    def __init__(self) -> None:
        self.model = os.getenv('GEMINI_MODEL', 'gemini-2.5-flash')
        self.client: Any = None

    @property
    def api_key(self) -> str | None:
        value = os.getenv('GEMINI_API_KEY')
        return value.strip() if value and value.strip() else None

    @property
    def is_configured(self) -> bool:
        return self.api_key is not None

    def _ensure_client(self) -> Any:
        if self.client is not None:
            return self.client
        api_key = self.api_key
        if not api_key:
            raise RuntimeError('GEMINI_NOT_CONFIGURED')
        try:
            from google import genai

            self.client = genai.Client(api_key=api_key)
        except ImportError as exc:
            raise RuntimeError('GEMINI_SDK_NOT_INSTALLED') from exc
        return self.client

    def stream_reply(self, message: str, *, context: dict | None = None) -> Iterator[str]:
        last_error: Exception | None = None
        for attempt in range(2):
            try:
                client = self._ensure_client()
                context_fields = ('route', 'routeInfo', 'job_id', 'model', 'parcel', 'building', 'crs', 'user')
                available_context = {
                    key: str(context[key])
                    for key in context_fields
                    if context and context.get(key) not in (None, '')
                }
                prompt = message
                if available_context:
                    context_text = '\n'.join(f'{key}: {value}' for key, value in available_context.items())
                    prompt = f'Current GeoCadastra application context (use only these supplied values):\n{context_text}\n\nUser request:\n{message}'
                result = client.models.generate_content_stream(
                    model=self.model,
                    contents=prompt,
                    config={
                        'temperature': 0.2,
                        'system_instruction': (
                            'You are the GeoCadastra GeoAI Assistant. Answer clearly and technically. '
                            'Use only the project context supplied in the request; do not invent job, '
                            'parcel, building, model, coordinate-reference, or processing data. '
                            'If the context does not contain a requested value, say it is unavailable.'
                        ),
                    },
                )
                if hasattr(result, '__iter__'):
                    for chunk in result:
                        text = getattr(chunk, 'text', None)
                        if text is not None:
                            yield text
                        elif isinstance(chunk, str):
                            yield chunk
                    return
                if isinstance(result, str):
                    yield result
                    return
                text = getattr(result, 'text', None)
                if text:
                    yield text
                    return
                raise RuntimeError('GEMINI_EMPTY_RESPONSE')
            except Exception as exc:
                if isinstance(exc, RuntimeError) and str(exc).startswith('GEMINI_'):
                    raise
                last_error = exc
                message_upper = str(exc).upper()
                error_text = str(exc)
                if self.api_key:
                    error_text = error_text.replace(self.api_key, '[REDACTED]')
                logger.error(
                    'Gemini SDK request failed (model=%s, exception=%s): %s',
                    self.model,
                    type(exc).__name__,
                    error_text,
                )
                status_code = str(getattr(exc, 'status_code', None) or getattr(exc, 'code', ''))
                if (
                    (
                        status_code == '429'
                        and ('QUOTA' in message_upper or 'RESOURCE_EXHAUSTED' in message_upper)
                    )
                    or 'QUOTA EXCEEDED' in message_upper
                ):
                    raise RuntimeError('GEMINI_QUOTA_EXCEEDED') from exc
                if 'UNAVAILABLE' in message_upper or 'RATE LIMIT' in message_upper or '503' in message_upper:
                    if attempt == 0:
                        continue
                    raise RuntimeError('GEMINI_UNAVAILABLE') from exc
                raise RuntimeError('GEMINI_REQUEST_FAILED') from exc

        if last_error is not None:
            raise RuntimeError('GEMINI_UNAVAILABLE') from last_error


gemini_service = GeminiService()
