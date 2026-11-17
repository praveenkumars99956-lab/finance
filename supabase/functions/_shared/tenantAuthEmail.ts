export function createTenantAuthEmail(
  contactEmail: string,
  workspaceId: string,
): string {
  const [localPart, domain, extraPart] = contactEmail
    .trim()
    .toLowerCase()
    .split("@");

  if (!localPart || !domain || extraPart) {
    throw new Error("A valid contact email is required.");
  }

  const tenantTag = workspaceId.replace(/-/g, "");
  const suffix = `+${tenantTag}`;
  const tenantLocalPart = `${localPart.slice(0, 64 - suffix.length)}${suffix}`;
  const authEmail = `${tenantLocalPart}@${domain}`;

  if (authEmail.length > 254) {
    throw new Error(
      "This email address is too long to create a tenant-specific login alias.",
    );
  }

  return authEmail;
}
