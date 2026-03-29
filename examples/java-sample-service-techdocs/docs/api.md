# API Reference

## GET /

Returns a greeting string confirming the service is running.

### Request

```
GET /
```

No parameters required.

### Response

| Status | Body              | Description        |
|--------|-------------------|--------------------|
| `200`  | `Spring is here`  | Service is healthy |

### Example

```bash
curl http://localhost:8080/
# Spring is here
```
