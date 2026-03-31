import { defineAuditConfig } from "@flipboxlabs/aws-audit-sdk";

/**
 * Shared audit configuration for the CDK.
 *
 * Defines the valid apps and resource types used across all handlers and schemas.
 * This config provides:
 * - Type-safe app and resourceType values
 * - Zod schemas for validation via `auditConfig.schemas`
 *
 * @example
 * ```typescript
 * import { auditConfig } from '../../audit-config.js';
 *
 * // Use in handlers
 * const service = new AuditService(logger, auditConfig);
 *
 * // Use schemas for validation
 * const PathSchema = z.object({
 *   app: auditConfig.schemas.app,
 *   object: auditConfig.schemas.resourceType,
 * });
 * ```
 */
export const auditConfig = defineAuditConfig({
	apps: [] as const,
	resourceTypes: [] as const,
});

/**
 * Type alias for the App union type from the audit config.
 */
export type App = (typeof auditConfig)["_types"]["App"];

/**
 * Type alias for the ResourceType union type from the audit config.
 */
export type ResourceType = (typeof auditConfig)["_types"]["ResourceType"];
