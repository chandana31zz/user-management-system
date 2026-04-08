from datetime import timedelta
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import AuditLog, PasswordResetToken, User, UserDocument


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        user = User.objects.filter(username=attrs.get('username')).first()

        if user and user.lock_until and user.lock_until > timezone.now():
            raise AuthenticationFailed('Account locked. Try again later.')

        try:
            data = super().validate(attrs)
            user.failed_attempts = 0
            user.lock_until = None
            user.save(update_fields=['failed_attempts', 'lock_until'])
            return data
        except AuthenticationFailed:
            if user:
                user.failed_attempts += 1
                if user.failed_attempts >= 3:
                    user.lock_until = timezone.now() + timedelta(minutes=3)
                    user.failed_attempts = 0
                user.save(update_fields=['failed_attempts', 'lock_until'])
            raise AuthenticationFailed('Invalid credentials')

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['username'] = user.username
        token['role'] = user.role
        return token


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ['username', 'email', 'password', 'first_name', 'last_name']

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'password', 'first_name', 'last_name', 'role', 'is_active_account']
        read_only_fields = ['id']

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


class UserListSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'email',
            'first_name',
            'last_name',
            'role',
            'is_active_account',
            'date_joined',
            'last_login',
        ]


class ProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            'username',
            'email',
            'first_name',
            'last_name',
            'theme_preference',
            'language_preference',
            'profile_picture',
            'last_login',
        ]
        read_only_fields = ['username', 'last_login']

    def validate_theme_preference(self, value):
        if value not in ('light', 'dark'):
            raise serializers.ValidationError('Theme must be light or dark.')
        return value


class ForgotPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()


class ResetPasswordSerializer(serializers.Serializer):
    token = serializers.CharField()
    new_password = serializers.CharField(min_length=8)

    def validate_token(self, value):
        reset = PasswordResetToken.objects.filter(token=value).select_related('user').first()
        if not reset or not reset.is_valid:
            raise serializers.ValidationError('Reset token is invalid or expired.')
        self.context['reset_obj'] = reset
        return value


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField()
    new_password = serializers.CharField(min_length=8)


class AuditLogSerializer(serializers.ModelSerializer):
    actor_username = serializers.CharField(source='actor.username', read_only=True)
    target_username = serializers.CharField(source='target_user.username', read_only=True)

    class Meta:
        model = AuditLog
        fields = [
            'id',
            'action',
            'description',
            'metadata',
            'actor_username',
            'target_username',
            'created_at',
        ]


class UserDocumentSerializer(serializers.ModelSerializer):
    owner_username = serializers.CharField(source='owner.username', read_only=True)

    class Meta:
        model = UserDocument
        fields = ['id', 'title', 'file', 'uploaded_at', 'owner', 'owner_username']
        read_only_fields = ['id', 'uploaded_at', 'owner', 'owner_username']

    def validate_file(self, value):
        max_size = 2 * 1024 * 1024
        if value.size > max_size:
            raise serializers.ValidationError('File must be <= 2MB.')

        allowed_types = {
            'image/jpeg',
            'image/png',
            'application/pdf',
        }
        if getattr(value, 'content_type', None) and value.content_type not in allowed_types:
            raise serializers.ValidationError('Only JPG, PNG, and PDF are allowed.')
        return value
