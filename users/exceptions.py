from rest_framework.views import exception_handler


def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)

    if response is None:
        return response

    data = response.data
    message = 'Request failed'

    if isinstance(data, dict):
        if 'detail' in data:
            message = str(data.get('detail'))
        elif 'non_field_errors' in data:
            message = str(data.get('non_field_errors')[0])

    response.data = {
        'success': False,
        'message': message,
        'errors': data,
    }
    return response
