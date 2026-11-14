import ipaddress

from django.http import JsonResponse
from django.http import HttpResponse


class LocalOnlyMiddleware:
    """Unauthenticated demo: refuse requests from outside this machine."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        try:
            local = ipaddress.ip_address(request.META.get("REMOTE_ADDR", "")).is_loopback
        except ValueError:
            local = False
        if not local:
            return JsonResponse({"error": {"code": "local_only", "message": "Local demo only"}}, status=403)
        return self.get_response(request)


class LocalDemoCORSMiddleware:
    """Permit the local Next.js dev origin, without opening the API to other sites."""

    origins = {"http://127.0.0.1:3000", "http://localhost:3000"}

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        origin = request.headers.get("Origin")
        if request.method not in ("GET", "HEAD", "OPTIONS") and origin and origin not in self.origins:
            return JsonResponse({"error": {"code": "origin_forbidden", "message": "Local demo origin only"}}, status=403)
        if origin in self.origins and request.method == "OPTIONS":
            response = HttpResponse(status=204)
        else:
            response = self.get_response(request)
        if origin in self.origins:
            response["Access-Control-Allow-Origin"] = origin
            response["Vary"] = "Origin"
            response["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
            response["Access-Control-Allow-Headers"] = "Content-Type"
        return response
