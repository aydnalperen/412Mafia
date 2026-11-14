from rest_framework.views import exception_handler as drf_exception_handler


def exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response is not None:
        message = response.data.get("detail", response.data) if isinstance(response.data, dict) else response.data
        if isinstance(message, dict):
            message = "; ".join(
                f"{field}: {', '.join(map(str, errors)) if isinstance(errors, list) else errors}"
                for field, errors in message.items()
            )
        elif isinstance(message, list):
            message = "; ".join(map(str, message))
        response.data = {"error": {"code": getattr(exc, "default_code", "invalid"), "message": message}}
    return response
