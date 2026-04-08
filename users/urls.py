from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    AnalyticsView,
    AuditLogListView,
    ChangePasswordView,
    CustomLoginView,
    ForgotPasswordView,
    LogoutView,
    ProfileView,
    RegisterView,
    ResetPasswordView,
    UserDetailManagementView,
    UserDocumentListView,
    UserDocumentUploadView,
    UserManagementView,
    admin_only_view,
    download_document,
    test_api,
)

urlpatterns = [
    path('auth/register/', RegisterView.as_view(), name='register'),
    path('auth/login/', CustomLoginView.as_view(), name='login'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('auth/logout/', LogoutView.as_view(), name='logout'),
    path('auth/forgot-password/', ForgotPasswordView.as_view(), name='forgot_password'),
    path('auth/reset-password/', ResetPasswordView.as_view(), name='reset_password'),
    path('auth/change-password/', ChangePasswordView.as_view(), name='change_password'),
    path('profile/', ProfileView.as_view(), name='profile'),
    path('users/', UserManagementView.as_view(), name='users'),
    path('users/<int:user_id>/', UserDetailManagementView.as_view(), name='user_detail'),
    path('audit-logs/', AuditLogListView.as_view(), name='audit_logs'),
    path('analytics/', AnalyticsView.as_view(), name='analytics'),
    path('documents/upload/', UserDocumentUploadView.as_view(), name='documents_upload'),
    path('documents/', UserDocumentListView.as_view(), name='documents_list'),
    path('documents/<int:document_id>/download/', download_document, name='documents_download'),
    path('test/', test_api, name='test_api'),
    path('admin-only/', admin_only_view, name='admin_only'),
]
