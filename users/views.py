from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.cache import cache
from django.core.mail import send_mail
from django.db.models import Count
from django.db.models.functions import TruncDate
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from .audit import log_audit
from .models import AuditLog, PasswordResetToken, UserDocument
from .permissions import IsAdmin, IsAdminOrManager
from .responses import api_error, api_success
from .serializers import (
    AuditLogSerializer,
    ChangePasswordSerializer,
    CustomTokenObtainPairSerializer,
    ForgotPasswordSerializer,
    ProfileSerializer,
    RegisterSerializer,
    ResetPasswordSerializer,
    UserCreateSerializer,
    UserDocumentSerializer,
    UserListSerializer,
)

User = get_user_model()


class CustomLoginView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            username = request.data.get('username')
            user = User.objects.filter(username=username).first()
            if user:
                log_audit('LOGIN', 'User logged in', actor=user, target_user=user)
            response.data = {
                'success': True,
                'message': 'Login successful',
                'data': response.data,
            }
        return response


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        log_audit('USER_CREATED', 'Self registration', actor=user, target_user=user)
        return api_success(UserListSerializer(user).data, 'User registered', status_code=201)


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        log_audit('LOGOUT', 'User logged out', actor=request.user, target_user=request.user)
        return api_success(message='Logout recorded. Clear token on client side.')


class ForgotPasswordView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = ForgotPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email']

        rate_key = f'forgot-password:{email}'
        count = cache.get(rate_key, 0)
        if count >= 5:
            return api_error('Too many reset attempts. Try again later.', status_code=429)
        cache.set(rate_key, count + 1, timeout=60 * 60)

        user = User.objects.filter(email=email).first()
        if user:
            reset = PasswordResetToken.create_for_user(user)
            reset_url = f'http://localhost:3000/reset-password?token={reset.token}'
            send_mail(
                subject='Password Reset Request',
                message=f'Use this link to reset your password: {reset_url}',
                from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@example.com'),
                recipient_list=[email],
                fail_silently=True,
            )
            log_audit(
                'PASSWORD_RESET_REQUEST',
                'Password reset requested',
                actor=user,
                target_user=user,
            )

        return api_success(message='If the email exists, a reset link has been sent.')


class ResetPasswordView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = ResetPasswordSerializer(data=request.data, context={})
        serializer.is_valid(raise_exception=True)

        reset_obj = serializer.context['reset_obj']
        new_password = serializer.validated_data['new_password']
        validate_password(new_password, user=reset_obj.user)

        reset_obj.user.set_password(new_password)
        reset_obj.user.save(update_fields=['password'])
        reset_obj.mark_used()

        log_audit(
            'PASSWORD_RESET_COMPLETE',
            'Password reset completed',
            actor=reset_obj.user,
            target_user=reset_obj.user,
        )
        return api_success(message='Password reset successful')


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if not request.user.check_password(serializer.validated_data['old_password']):
            return api_error('Old password is incorrect', status_code=400)

        validate_password(serializer.validated_data['new_password'], user=request.user)
        request.user.set_password(serializer.validated_data['new_password'])
        request.user.save(update_fields=['password'])
        log_audit('PASSWORD_CHANGE', 'Password changed', actor=request.user, target_user=request.user)
        return api_success(message='Password changed')


class ProfileView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request):
        data = ProfileSerializer(request.user).data
        return api_success(data=data, message='Profile fetched')

    def patch(self, request):
        serializer = ProfileSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        log_audit('PROFILE_UPDATE', 'Profile updated', actor=request.user, target_user=request.user)
        return api_success(ProfileSerializer(request.user).data, message='Profile updated')


class UserManagementView(APIView):
    permission_classes = [IsAdminOrManager]

    def get(self, request):
        queryset = User.objects.all().order_by('-date_joined')
        return api_success(UserListSerializer(queryset, many=True).data, message='Users fetched')

    def post(self, request):
        role_to_create = request.data.get('role')

        if request.user.role == 'MANAGER' and role_to_create != 'USER':
            return api_error('Managers can only create users', status_code=403)

        serializer = UserCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        created = serializer.save()
        log_audit(
            'USER_CREATED',
            f'User {created.username} created',
            actor=request.user,
            target_user=created,
            metadata={'role': created.role},
        )
        return api_success(UserListSerializer(created).data, 'User created', status_code=201)


class UserDetailManagementView(APIView):
    permission_classes = [IsAdminOrManager]

    def patch(self, request, user_id):
        target = get_object_or_404(User, id=user_id)
        if request.user.role == 'MANAGER':
            if target.role in ('ADMIN', 'MANAGER'):
                return api_error('Managers cannot modify admin/manager accounts', status_code=403)
            if 'role' in request.data and request.data.get('role') != 'USER':
                return api_error('Managers can only assign USER role', status_code=403)

        old_role = target.role
        old_active = target.is_active_account
        serializer = UserCreateSerializer(target, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        if target.role != old_role:
            log_audit(
                'ROLE_PERMISSION_CHANGE',
                f'Role changed from {old_role} to {target.role}',
                actor=request.user,
                target_user=target,
            )
        if target.is_active_account != old_active:
            log_audit(
                'ACCOUNT_STATUS_CHANGE',
                f'Account status changed to {target.is_active_account}',
                actor=request.user,
                target_user=target,
            )

        return api_success(UserListSerializer(target).data, message='User updated')

    def delete(self, request, user_id):
        target = get_object_or_404(User, id=user_id)
        if request.user.role == 'MANAGER' and target.role in ('ADMIN', 'MANAGER'):
            return api_error('Managers cannot delete admin/manager accounts', status_code=403)
        if request.user.id == target.id:
            return api_error('You cannot delete your own account', status_code=400)

        username = target.username
        target.delete()
        log_audit(
            'ACCOUNT_STATUS_CHANGE',
            f'User {username} deleted',
            actor=request.user,
            metadata={'user_id': user_id},
        )
        return api_success(message='User deleted')


class AuditLogListView(generics.ListAPIView):
    serializer_class = AuditLogSerializer
    permission_classes = [IsAdmin]
    queryset = AuditLog.objects.select_related('actor', 'target_user').all()

    def get_queryset(self):
        queryset = super().get_queryset()
        action = self.request.query_params.get('action')
        user_id = self.request.query_params.get('user_id')
        from_date = self.request.query_params.get('from')
        to_date = self.request.query_params.get('to')

        if action:
            queryset = queryset.filter(action=action)
        if user_id:
            queryset = queryset.filter(target_user_id=user_id)
        if from_date:
            queryset = queryset.filter(created_at__date__gte=from_date)
        if to_date:
            queryset = queryset.filter(created_at__date__lte=to_date)
        return queryset

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        return api_success(response.data, message='Audit logs fetched')


class AnalyticsView(APIView):
    permission_classes = [IsAdminOrManager]

    def get(self, request):
        total = User.objects.count()
        active = User.objects.filter(is_active_account=True).count()
        inactive = total - active
        role_distribution = list(User.objects.values('role').annotate(count=Count('id')).order_by('role'))

        since = timezone.now() - timedelta(days=14)
        registrations = (
            User.objects.filter(date_joined__gte=since)
            .annotate(day=TruncDate('date_joined'))
            .values('day')
            .annotate(count=Count('id'))
            .order_by('day')
        )
        registrations_over_time = [{'date': str(item['day']), 'count': item['count']} for item in registrations]

        data = {
            'total_users': total,
            'active_users': active,
            'inactive_users': inactive,
            'role_distribution': role_distribution,
            'registrations_over_time': registrations_over_time,
        }
        return api_success(data, message='Analytics fetched')


class UserDocumentUploadView(generics.CreateAPIView):
    serializer_class = UserDocumentSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def perform_create(self, serializer):
        document = serializer.save(owner=self.request.user)
        log_audit(
            'FILE_UPLOAD',
            f'Document uploaded: {document.title}',
            actor=self.request.user,
            target_user=self.request.user,
            metadata={'document_id': document.id},
        )

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        return api_success(response.data, message='Document uploaded', status_code=201)


class UserDocumentListView(generics.ListAPIView):
    serializer_class = UserDocumentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        if self.request.user.role in ('ADMIN', 'MANAGER'):
            return UserDocument.objects.all()
        return UserDocument.objects.filter(owner=self.request.user)

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        return api_success(response.data, message='Documents fetched')


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def download_document(request, document_id):
    doc = get_object_or_404(UserDocument, id=document_id)

    if request.user.role not in ('ADMIN', 'MANAGER') and doc.owner_id != request.user.id:
        return api_error('Access denied', status_code=403)

    if not doc.file:
        raise Http404

    log_audit(
        'FILE_DOWNLOAD',
        f'Document downloaded: {doc.title}',
        actor=request.user,
        target_user=doc.owner,
        metadata={'document_id': doc.id},
    )
    return FileResponse(doc.file.open('rb'), as_attachment=False, filename=doc.file.name.split('/')[-1])


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def test_api(request):
    return api_success({'user': request.user.username, 'role': request.user.role}, message='API working')


@api_view(['GET'])
@permission_classes([IsAdmin])
def admin_only_view(request):
    return api_success(message='Welcome Admin')
