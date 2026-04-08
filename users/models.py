from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone
from datetime import timedelta
import secrets


class User(AbstractUser):

    ROLE_CHOICES = (
        ('ADMIN', 'Admin'),
        ('MANAGER', 'Manager'),
        ('USER', 'User'),
    )

    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='USER')

    is_active_account = models.BooleanField(default=True)

    failed_attempts = models.IntegerField(default=0)

    lock_until = models.DateTimeField(null=True, blank=True)

    profile_picture = models.ImageField(upload_to='profiles/', null=True, blank=True)

    theme_preference = models.CharField(max_length=10, default='light')
    language_preference = models.CharField(max_length=10, default='en')

    def __str__(self):
        return self.username


class AuditLog(models.Model):
    ACTION_CHOICES = (
        ('LOGIN', 'Login'),
        ('LOGOUT', 'Logout'),
        ('PROFILE_UPDATE', 'Profile Update'),
        ('PASSWORD_CHANGE', 'Password Change'),
        ('PASSWORD_RESET_REQUEST', 'Password Reset Request'),
        ('PASSWORD_RESET_COMPLETE', 'Password Reset Complete'),
        ('USER_CREATED', 'User Created'),
        ('ROLE_PERMISSION_CHANGE', 'Role/Permission Change'),
        ('ACCOUNT_STATUS_CHANGE', 'Account Status Change'),
        ('FILE_UPLOAD', 'File Upload'),
        ('FILE_DOWNLOAD', 'File Download'),
    )

    actor = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='performed_audit_logs',
    )
    target_user = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='target_audit_logs',
    )
    action = models.CharField(max_length=40, choices=ACTION_CHOICES)
    description = models.CharField(max_length=255)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ('-created_at',)

    def __str__(self):
        return f'{self.action} - {self.description}'


class PasswordResetToken(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='password_reset_tokens')
    token = models.CharField(max_length=64, unique=True, db_index=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    @classmethod
    def create_for_user(cls, user, ttl_minutes=15):
        return cls.objects.create(
            user=user,
            token=secrets.token_urlsafe(32),
            expires_at=timezone.now() + timedelta(minutes=ttl_minutes),
        )

    @property
    def is_valid(self):
        return self.used_at is None and timezone.now() < self.expires_at

    def mark_used(self):
        self.used_at = timezone.now()
        self.save(update_fields=['used_at'])


class UserDocument(models.Model):
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='documents')
    title = models.CharField(max_length=120)
    file = models.FileField(upload_to='documents/')
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ('-uploaded_at',)

    def __str__(self):
        return f'{self.owner.username} - {self.title}'
