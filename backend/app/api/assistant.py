from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, status

from backend.app.services.gemini_service import gemini_service

router = APIRouter(prefix='/api/assistant')


def generate_gemini_reply(message: str, *, conversation_id: str | None = None, context: dict[str, Any] | None = None) -> str:
    if not message or not str(message).strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Message is required.')

    try:
        reply = ''.join(gemini_service.stream_reply(message, context=context or {}))
        if not reply:
            raise RuntimeError('Gemini returned no content.')
        return reply
    except RuntimeError as exc:
        message_text = str(exc)
        if 'GEMINI_NOT_CONFIGURED' in message_text.upper():
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail='Gemini is not configured.')
        if 'GEMINI_UNAVAILABLE' in message_text.upper():
            return 'Gemini is temporarily unavailable. Please try again in a moment.'
        if 'GEMINI_QUOTA_EXCEEDED' in message_text.upper():
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail='Gemini API quota is exhausted for the configured model. Check Google AI Studio quota/billing or configure a model with available quota.',
            )
        if 'GEMINI_SDK_NOT_INSTALLED' in message_text.upper():
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail='Gemini service dependency is not installed.')
        if 'GEMINI_EMPTY_RESPONSE' in message_text.upper():
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail='Gemini returned no response content.')
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail='Gemini request failed.')
    except Exception:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail='Gemini request failed.')


@router.get('/status')
def assistant_status():
    if not gemini_service.is_configured:
        return {'status': 'not_configured', 'code': 'GEMINI_NOT_CONFIGURED', 'model': gemini_service.model}
    return {'status': 'configured', 'code': 'GEMINI_CONFIGURED', 'model': gemini_service.model}


@router.post('/conversations')
def create_conversation(payload: dict | None = None):
    title = (payload or {}).get('title') or 'New conversation'
    return {'conversation_id': 'conv_demo_1', 'title': title}


@router.post('/chat')
def assistant_chat(payload: dict | None = None):
    if not payload:
        payload = {}
    message = str(payload.get('message', '')).strip()
    if not message:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={'message': 'Message is required.'})

    try:
        reply = generate_gemini_reply(message, conversation_id=payload.get('conversation_id'), context=payload.get('context'))
    except HTTPException:
        raise
    except RuntimeError as exc:
        message_text = str(exc).upper()
        if 'UNAVAILABLE' in message_text or 'RATE LIMIT' in message_text or '503' in message_text:
            return {
                'conversation_id': payload.get('conversation_id') or 'conv_demo_1',
                'response': 'Gemini is temporarily unavailable. Please try again in a moment.',
                'status': 'retry_later',
            }
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail='Gemini request failed.')
    except Exception:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail='Gemini request failed.')

    return {'conversation_id': payload.get('conversation_id') or 'conv_demo_1', 'response': reply, 'status': 'ok'}
