from .models import AuditLog


def log_audit(action, description, actor=None, target_user=None, metadata=None):
    AuditLog.objects.create(
        action=action,
        description=description,
        actor=actor,
        target_user=target_user,
        metadata=metadata or {},
    )
