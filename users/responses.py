from rest_framework.response import Response


def api_success(data=None, message='Success', status_code=200):
    payload = {
        'success': True,
        'message': message,
        'data': data if data is not None else {},
    }
    return Response(payload, status=status_code)


def api_error(message='Something went wrong', errors=None, status_code=400):
    payload = {
        'success': False,
        'message': message,
        'errors': errors if errors is not None else {},
    }
    return Response(payload, status=status_code)
