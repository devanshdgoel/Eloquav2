def success_response(data: dict) -> dict:
    return {"status": "success", **data}


def error_response(message: str, error_type: str = "error") -> dict:
    return {"status": "error", "error_type": error_type, "message": message}
