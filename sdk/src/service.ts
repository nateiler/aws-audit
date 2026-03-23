import type { Logger } from "@aws-lambda-powertools/logger";
import { AuditEventBus } from "./events/bus.js";
import {
	AuditRepository,
	type Identifiers,
	type ListItemsOptions,
	type ListTraceItems,
} from "./repository.js";
import type { Audit } from "./schema/audit.js";
import type { Pagination } from "./schema/model.js";
import { type UpsertAuditInput, UpsertAuditSchema } from "./schema/service.js";
import { generateAuditId } from "./utils.js";

/**
 * High-level service for managing audit records.
 *
 * Provides a business logic layer over the AuditRepository for CRUD operations
 * and coordinates with EventBridge for event-driven notifications.
 *
 * Features:
 * - Automatic creation of related resource audit entries
 * - Schema validation on upsert operations
 * - EventBridge integration for audit event notifications
 * - Paginated list queries with filtering
 *
 * @example
 * ```typescript
 * const service = new AuditService(logger);
 *
 * // Upsert an audit with related resources
 * await service.upsertItem({
 *   operation: 'createOrder',
 *   target: { app: 'Orders', type: 'Order', id: '123' },
 *   resources: [
 *     { app: 'Inventory', type: 'Product', id: '456' },
 *   ],
 * });
 *
 * // Retrieve a specific audit
 * const audit = await service.getItem({
 *   id: 'audit-123',
 *   app: 'Orders',
 *   resourceType: 'Order',
 * });
 * ```
 */
export class AuditService {
	/**
	 * Creates a new AuditService instance.
	 *
	 * @param logger - Logger instance for error logging
	 * @param storage - Repository for DynamoDB operations (defaults to new AuditRepository)
	 * @param events - EventBridge bus for audit notifications (defaults to new AuditEventBus, can be null/undefined to disable)
	 */
	constructor(
		private readonly logger: Logger,
		private readonly storage: AuditRepository = new AuditRepository(logger),
		readonly events: null | undefined | AuditEventBus = new AuditEventBus(
			logger,
		),
	) {}

	/**
	 * Retrieves a single audit record by its identifiers.
	 *
	 * @param identifiers - The audit identifiers (id, app, resourceType)
	 * @returns The audit record
	 * @throws Error if the audit record is not found
	 *
	 * @example
	 * ```typescript
	 * const audit = await service.getItem({
	 *   id: 'audit-123',
	 *   app: 'MyApp',
	 *   resourceType: 'User',
	 * });
	 * ```
	 */
	public async getItem(
		identifiers: Omit<Identifiers, "resourceId">,
	): Promise<Audit> {
		const result = await this.storage.getItem(identifiers);

		if (result == null) {
			throw new Error(
				`Unable to find Audit ${Array.from(Object.entries(identifiers))
					.map(([key, value]) => `${key}:${value}`)
					.join(" | ")}`,
			);
		}

		return result;
	}

	/**
	 * Creates or updates an audit record and its related resource entries.
	 *
	 * For each resource in the `resources` array that has an ID:
	 * - Creates a separate audit entry with the resource as the target
	 * - Links it to the parent audit via a generated composite ID
	 * - Sets the original target as the source
	 * - Inherits rerunable status from the parent or event presence
	 *
	 * After storage, publishes an "Upserted" event to EventBridge (if events is configured).
	 *
	 * @param input - The audit data to upsert
	 *
	 * @example
	 * ```typescript
	 * await service.upsertItem({
	 *   operation: 'processPayment',
	 *   target: { app: 'Payments', type: 'Transaction', id: 'txn-123' },
	 *   status: 'success',
	 *   resources: [
	 *     { app: 'Users', type: 'User', id: 'user-456' },
	 *     { app: 'Orders', type: 'Order', id: 'order-789' },
	 *   ],
	 * });
	 * ```
	 */
	public async upsertItem(input: UpsertAuditInput): Promise<void> {
		const item = UpsertAuditSchema.parse(input);

		const batch: Array<UpsertAuditInput> = Array.from(item.resources || [])
			.filter((resource) => !!resource.id)
			.map((resource) => ({
				...item,
				...resource,

				id: `${generateAuditId()}#${item.id}`, // generate a new id based on the original

				// Source
				source: item.target,

				rerunable: item.rerunable !== undefined ? item.rerunable : !!item.event,

				// Remove these (they are only needed on the parent)
				event: undefined,
				result: undefined,
				error: undefined,
			}));

		await this.storage.upsertBatch([item, ...batch]);

		await this.events?.upserted([item]);
	}

	/**
	 * Lists audit records with filtering and pagination.
	 *
	 * Queries audits based on resource type, app, and optional resource ID.
	 * Results are paginated and can be filtered by various criteria.
	 *
	 * @param params - Query parameters for filtering
	 * @param pagination - Optional pagination settings
	 * @returns Paginated collection of audit records
	 * @throws Re-throws any storage errors after logging
	 *
	 * @example
	 * ```typescript
	 * const { items, pagination } = await service.listItems({
	 *   resource: { type: 'Order', id: '123', app: 'Orders' },
	 * });
	 * ```
	 */
	public async listItems(params: ListItemsOptions, pagination?: Pagination) {
		try {
			return await this.storage.listItems(params, pagination);
		} catch (error) {
			this.logger.error("An error occurred while trying to list items", {
				error,
			});

			throw error;
		}
	}

	/**
	 * Lists audit records by trace ID with pagination.
	 *
	 * Retrieves all audits associated with a distributed trace,
	 * ordered by their stage in the processing pipeline.
	 *
	 * @param params - Query parameters including the trace ID
	 * @param pagination - Optional pagination settings
	 * @returns Paginated collection of trace-related audit records
	 * @throws Re-throws any storage errors after logging
	 *
	 * @example
	 * ```typescript
	 * const { items } = await service.listTraceItems({
	 *   trace: 'trace-abc-123',
	 * });
	 * ```
	 */
	public async listTraceItems(params: ListTraceItems, pagination?: Pagination) {
		try {
			return await this.storage.listTraceItems(params, pagination);
		} catch (error) {
			this.logger.error("An error occurred while trying to list trace items", {
				error,
			});

			throw error;
		}
	}
}
