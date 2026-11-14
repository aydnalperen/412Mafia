from django.test import TestCase


class CourseAPITests(TestCase):
    def test_create_list_and_detail(self):
        created = self.client.post(
            "/api/courses/", {"name": "Signals", "description": "A local course"},
            content_type="application/json", HTTP_ORIGIN="http://localhost:3000",
        )
        self.assertEqual(created.status_code, 201)
        course_id = created.json()["id"]
        self.assertEqual(self.client.get("/api/courses/").json()[0]["id"], course_id)
        self.assertEqual(self.client.get(f"/api/courses/{course_id}/").json()["name"], "Signals")

    def test_rejects_nonlocal_requests_and_foreign_browser_origins(self):
        remote = self.client.get("/api/courses/", REMOTE_ADDR="192.0.2.10")
        self.assertEqual(remote.status_code, 403)
        denied = self.client.post(
            "/api/courses/", {"name": "Unexpected"}, content_type="application/json",
            HTTP_ORIGIN="https://example.com",
        )
        self.assertEqual(denied.status_code, 403)

    def test_validation_error_has_predictable_shape(self):
        result = self.client.post("/api/courses/", {"name": ""}, content_type="application/json")
        self.assertEqual(result.status_code, 400)
        self.assertIn("message", result.json()["error"])

    def test_course_cannot_be_deleted_via_api(self):
        created = self.client.post("/api/courses/", {"name": "Keep"}, content_type="application/json")
        self.assertEqual(self.client.delete(f"/api/courses/{created.json()['id']}/").status_code, 405)
