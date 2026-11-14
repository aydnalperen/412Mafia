from rest_framework.views import exception_handler as drf_exception_handler


def exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response is not None:
        message = response.data.get("detail", response.data) if isinstance(response.data, dict) else response.data
        response.data = {"error": {"code": getattr(exc, "default_code", "invalid"), "message": message}}
    return response
