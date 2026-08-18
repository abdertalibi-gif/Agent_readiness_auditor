"""Platform-level roles, account statuses and invitation statuses.

These are the single source of truth for the string values used across the
models, services and routes. Keep them consistent with the DB column lengths
(role 24, status 16).
"""

# Platform roles (User.role). Super admins are platform administrators and the
# only role permitted to use the /admin endpoints.
ROLE_SUPER_ADMIN = "SUPER_ADMIN"
ROLE_OWNER = "OWNER"
ROLE_ADMIN = "ADMIN"
ROLE_MEMBER = "MEMBER"

# Account status (User.status).
STATUS_ACTIVE = "ACTIVE"
STATUS_SUSPENDED = "SUSPENDED"
STATUS_DELETED = "DELETED"

# Invitation statuses (WorkspaceInvitation.status).
STATUS_PENDING = "PENDING"
STATUS_ACCEPTED = "ACCEPTED"
STATUS_REJECTED = "REJECTED"
STATUS_EXPIRED = "EXPIRED"
STATUS_CANCELLED = "CANCELLED"
