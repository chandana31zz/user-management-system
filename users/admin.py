from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import AuditLog, PasswordResetToken, User, UserDocument


@admin.register(User)
class CustomUserAdmin(UserAdmin):

    fieldsets = UserAdmin.fieldsets + (
        ('Additional Info', {
            'fields': (
                'role',
                'is_active_account',
                'failed_attempts',
                'lock_until',
                'profile_picture',
                'theme_preference',
            )
        }),
    )

    list_display = (
        'username',
        'email',
        'role',
        'is_active',
        'is_active_account',
    )

    list_filter = ('role', 'is_active_account')


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ('created_at', 'action', 'actor', 'target_user', 'description')
    list_filter = ('action', 'created_at')
    search_fields = ('description', 'actor__username', 'target_user__username')


@admin.register(PasswordResetToken)
class PasswordResetTokenAdmin(admin.ModelAdmin):
    list_display = ('user', 'token', 'expires_at', 'used_at', 'created_at')
    search_fields = ('user__username', 'user__email', 'token')


@admin.register(UserDocument)
class UserDocumentAdmin(admin.ModelAdmin):
    list_display = ('id', 'title', 'owner', 'uploaded_at')
    search_fields = ('title', 'owner__username')
