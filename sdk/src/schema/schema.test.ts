import { describe, expect, it } from "vitest";
import * as z from "zod/v4";
import { App, ResourceType } from "../config.js";
import {
	AuditListItemPayloadSchema,
	AuditPayloadSchema,
	AuditSchema,
} from "./audit.js";
import { BaseSchema, Tier } from "./common.js";
import { LogAuditSchema, Status } from "./log.js";
import {
	CollectionSchema,
	EventBridgeEventSchema,
	PaginationCollectionSchema,
	PaginationSchema,
} from "./model.js";
import { UpsertAuditSchema } from "./service.js";
import { AuditStorageSchema } from "./storage.js";

describe("schema", () => {
	const createValidTarget = () => ({
		app: App.App1,
		type: ResourceType.UNKNOWN,
		id: "resource-123",
	});

	describe("EventBridgeEventSchema", () => {
		it("should accept valid event with all fields", () => {
			const result = EventBridgeEventSchema.parse({
				source: "test.service",
				"detail-type": "TestEvent",
				detail: "some detail",
			});

			expect(result.source).toBe("test.service");
			expect(result["detail-type"]).toBe("TestEvent");
			expect(result.detail).toBe("some detail");
		});

		it("should accept event with object detail and stringify it", () => {
			const result = EventBridgeEventSchema.parse({
				source: "test.service",
				"detail-type": "TestEvent",
				detail: { key: "value", nested: { data: 123 } },
			});

			expect(result.detail).toBe('{"key":"value","nested":{"data":123}}');
		});

		it("should accept event with all optional fields", () => {
			const result = EventBridgeEventSchema.parse({});

			expect(result.source).toBeUndefined();
			expect(result["detail-type"]).toBeUndefined();
			expect(result.detail).toBeUndefined();
		});

		it("should preserve string detail as-is", () => {
			const result = EventBridgeEventSchema.parse({
				detail: "already a string",
			});

			expect(result.detail).toBe("already a string");
		});
	});

	describe("PaginationSchema", () => {
		it("should accept pageSize as number", () => {
			const result = PaginationSchema.parse({ pageSize: 25 });

			expect(result.pageSize).toBe(25);
		});

		it("should accept pageSize as string", () => {
			const result = PaginationSchema.parse({ pageSize: "50" });

			expect(result.pageSize).toBe("50");
		});

		it("should accept nextToken", () => {
			const result = PaginationSchema.parse({ nextToken: "abc123" });

			expect(result.nextToken).toBe("abc123");
		});

		it("should accept null values", () => {
			const result = PaginationSchema.parse({
				pageSize: null,
				nextToken: null,
			});

			expect(result.pageSize).toBeNull();
			expect(result.nextToken).toBeNull();
		});

		it("should accept empty object", () => {
			const result = PaginationSchema.parse({});

			expect(result.pageSize).toBeUndefined();
			expect(result.nextToken).toBeUndefined();
		});
	});

	describe("CollectionSchema", () => {
		it("should validate array of items", () => {
			const StringCollection = CollectionSchema(z.string());
			const result = StringCollection.parse({ items: ["a", "b", "c"] });

			expect(result.items).toEqual(["a", "b", "c"]);
		});

		it("should accept empty array", () => {
			const StringCollection = CollectionSchema(z.string());
			const result = StringCollection.parse({ items: [] });

			expect(result.items).toEqual([]);
		});
	});

	describe("PaginationCollectionSchema", () => {
		it("should validate items with pagination", () => {
			const StringPaginatedCollection = PaginationCollectionSchema(z.string());
			const result = StringPaginatedCollection.parse({
				items: ["a", "b"],
				pagination: { nextToken: "xyz" },
			});

			expect(result.items).toEqual(["a", "b"]);
			expect(result.pagination?.nextToken).toBe("xyz");
		});

		it("should accept items without pagination", () => {
			const StringPaginatedCollection = PaginationCollectionSchema(z.string());
			const result = StringPaginatedCollection.parse({
				items: ["a"],
			});

			expect(result.items).toEqual(["a"]);
			expect(result.pagination).toBeUndefined();
		});
	});

	describe("Status", () => {
		it("should have correct status values", () => {
			expect(Status.SUCCESS).toBe("success");
			expect(Status.WARN).toBe("warn");
			expect(Status.FAIL).toBe("fail");
			expect(Status.SKIP).toBe("skip");
		});
	});

	describe("Tier", () => {
		it("should have correct tier values", () => {
			expect(Tier.INTERNAL).toBe(1);
			expect(Tier.INFO).toBe(2);
			expect(Tier.PUBLIC).toBe(3);
		});
	});

	describe("LogAuditSchema", () => {
		it("should validate minimal audit", () => {
			const result = LogAuditSchema.parse({
				operation: "testOp",
				target: createValidTarget(),
			});

			expect(result.operation).toBe("testOp");
			expect(result.tier).toBe(2); // default
			expect(result.status).toBe("success"); // default
		});

		it("should accept tenantId for multi-tenancy", () => {
			const result = LogAuditSchema.parse({
				operation: "testOp",
				tenantId: "tnt-123",
				target: createValidTarget(),
			});

			expect(result.tenantId).toBe("tnt-123");
		});

		it("should allow tenantId to be undefined", () => {
			const result = LogAuditSchema.parse({
				operation: "testOp",
				target: createValidTarget(),
			});

			expect(result.tenantId).toBeUndefined();
		});

		it("should accept all fields", () => {
			const result = LogAuditSchema.parse({
				operation: "testOp",
				tenantId: "tenant-456",
				tier: 3,
				status: "fail",
				target: createValidTarget(),
				source: createValidTarget(),
				context: { key: "value" },
				message: "Test message",
				trace: "trace-123",
				event: { source: "test" },
			});

			expect(result.tenantId).toBe("tenant-456");
			expect(result.tier).toBe(3);
			expect(result.status).toBe("fail");
			expect(result.source).toBeDefined();
			expect(result.context).toEqual({ key: "value" });
		});

		it("should transform Error to JSON string", () => {
			const error = new Error("Test error");
			const result = LogAuditSchema.parse({
				operation: "testOp",
				target: createValidTarget(),
				error,
			});

			expect(typeof result.error).toBe("string");
			expect(result.error).toContain("Test error");
		});

		it("should keep string error as-is", () => {
			const result = LogAuditSchema.parse({
				operation: "testOp",
				target: createValidTarget(),
				error: "String error",
			});

			expect(result.error).toBe("String error");
		});

		it("should convert Set to Array for resources", () => {
			const resources = new Set([
				{ app: App.App1, type: ResourceType.UNKNOWN, id: "res-1" },
				{ app: App.App1, type: ResourceType.UNKNOWN, id: "res-2" },
			]);

			const result = LogAuditSchema.parse({
				operation: "testOp",
				target: createValidTarget(),
				resources,
			});

			expect(Array.isArray(result.resources)).toBe(true);
			expect(result.resources).toHaveLength(2);
		});

		it("should accept Array for resources", () => {
			const result = LogAuditSchema.parse({
				operation: "testOp",
				target: createValidTarget(),
				resources: [{ app: App.App1, type: ResourceType.UNKNOWN, id: "res-1" }],
			});

			expect(result.resources).toHaveLength(1);
		});

		it("should validate nested context values", () => {
			const result = LogAuditSchema.parse({
				operation: "testOp",
				target: createValidTarget(),
				context: {
					string: "value",
					number: 123,
					boolean: true,
					nested: {
						deep: {
							value: "works",
						},
					},
				},
			});

			expect(result.context?.nested).toEqual({ deep: { value: "works" } });
		});

		it("should reject invalid tier", () => {
			expect(() =>
				LogAuditSchema.parse({
					operation: "testOp",
					target: createValidTarget(),
					tier: 5,
				}),
			).toThrow();
		});

		it("should reject invalid status", () => {
			expect(() =>
				LogAuditSchema.parse({
					operation: "testOp",
					target: createValidTarget(),
					status: "invalid",
				}),
			).toThrow();
		});
	});

	describe("BaseSchema", () => {
		it("should validate audit with all base fields", () => {
			const result = BaseSchema.parse({
				id: "audit-123",
				operation: "testOp",
				status: "success",
				tier: 2,
				target: createValidTarget(),
			});

			expect(result.id).toBe("audit-123");
			expect(result.operation).toBe("testOp");
		});

		it("should accept tenantId for multi-tenancy", () => {
			const result = BaseSchema.parse({
				id: "audit-123",
				tenantId: "tenant-abc",
				operation: "testOp",
				status: "success",
				tier: 2,
				target: createValidTarget(),
			});

			expect(result.tenantId).toBe("tenant-abc");
		});

		it("should allow tenantId to be undefined", () => {
			const result = BaseSchema.parse({
				id: "audit-123",
				operation: "testOp",
				status: "success",
				tier: 2,
				target: createValidTarget(),
			});

			expect(result.tenantId).toBeUndefined();
		});

		it("should transform string error by parsing JSON", () => {
			const result = BaseSchema.parse({
				id: "audit-123",
				operation: "testOp",
				status: "success",
				tier: 2,
				target: createValidTarget(),
				error: '{"message":"parsed error"}',
			});

			expect(result.error).toEqual({ message: "parsed error" });
		});

		it("should keep non-JSON string error as-is", () => {
			const result = BaseSchema.parse({
				id: "audit-123",
				operation: "testOp",
				status: "success",
				tier: 2,
				target: createValidTarget(),
				error: "plain string error",
			});

			expect(result.error).toBe("plain string error");
		});

		it("should transform Error instance", () => {
			const error = new Error("Test error");
			const result = BaseSchema.parse({
				id: "audit-123",
				operation: "testOp",
				status: "success",
				tier: 2,
				target: createValidTarget(),
				error,
			});

			expect(result.error).toHaveProperty("message", "Test error");
		});

		it("should accept record error", () => {
			const result = BaseSchema.parse({
				id: "audit-123",
				operation: "testOp",
				status: "success",
				tier: 2,
				target: createValidTarget(),
				error: { code: "ERR_001", details: "Something went wrong" },
			});

			expect(result.error).toEqual({
				code: "ERR_001",
				details: "Something went wrong",
			});
		});
	});

	describe("AuditSchema", () => {
		it("should transform ISO timestamps to Date objects", () => {
			const result = AuditSchema.parse({
				id: "audit-123",
				operation: "testOp",
				status: "success",
				tier: 2,
				target: createValidTarget(),
				updatedAt: "2024-01-15T10:30:00.000Z",
				createdAt: "2024-01-15T10:30:00.000Z",
			});

			expect(result.updatedAt).toBeInstanceOf(Date);
			expect(result.createdAt).toBeInstanceOf(Date);
		});

		it("should handle missing timestamps", () => {
			const result = AuditSchema.parse({
				id: "audit-123",
				operation: "testOp",
				status: "success",
				tier: 2,
				target: createValidTarget(),
			});

			expect(result.updatedAt).toBeUndefined();
			expect(result.createdAt).toBeUndefined();
		});
	});

	describe("AuditPayloadSchema", () => {
		it("should be same as BaseSchema", () => {
			expect(AuditPayloadSchema).toBe(BaseSchema);
		});
	});

	describe("AuditListItemPayloadSchema", () => {
		it("should be same as BaseSchema", () => {
			expect(AuditListItemPayloadSchema).toBe(BaseSchema);
		});
	});

	describe("AuditStorageSchema", () => {
		it("should auto-generate id if not provided", () => {
			const result = AuditStorageSchema.parse({
				operation: "testOp",
				status: "success",
				tier: 2,
				target: createValidTarget(),
			});

			expect(result.id).toBeDefined();
			expect(typeof result.id).toBe("string");
		});

		it("should use provided id", () => {
			const result = AuditStorageSchema.parse({
				id: "custom-id",
				operation: "testOp",
				status: "success",
				tier: 2,
				target: createValidTarget(),
			});

			expect(result.id).toBe("custom-id");
		});

		it("should default timestamps to current time", () => {
			const result = AuditStorageSchema.parse({
				operation: "testOp",
				status: "success",
				tier: 2,
				target: createValidTarget(),
			});

			expect(result.updatedAt).toBeDefined();
			expect(result.createdAt).toBeDefined();

			// Verify timestamps are valid ISO strings that can be parsed as dates
			const updatedAt = new Date(result.updatedAt);
			const createdAt = new Date(result.createdAt);
			expect(updatedAt.getTime()).not.toBeNaN();
			expect(createdAt.getTime()).not.toBeNaN();

			// Verify timestamps are recent (within last second)
			const now = Date.now();
			expect(now - updatedAt.getTime()).toBeLessThan(1000);
			expect(now - createdAt.getTime()).toBeLessThan(1000);
		});

		it("should convert Date to ISO string", () => {
			const date = new Date("2024-01-15T10:30:00.000Z");
			const result = AuditStorageSchema.parse({
				operation: "testOp",
				status: "success",
				tier: 2,
				target: createValidTarget(),
				updatedAt: date,
				createdAt: date,
			});

			expect(result.updatedAt).toBe("2024-01-15T10:30:00.000Z");
			expect(result.createdAt).toBe("2024-01-15T10:30:00.000Z");
		});

		it("should keep ISO string as-is", () => {
			const result = AuditStorageSchema.parse({
				operation: "testOp",
				status: "success",
				tier: 2,
				target: createValidTarget(),
				updatedAt: "2024-01-15T10:30:00.000Z",
				createdAt: "2024-01-15T10:30:00.000Z",
			});

			expect(result.updatedAt).toBe("2024-01-15T10:30:00.000Z");
			expect(result.createdAt).toBe("2024-01-15T10:30:00.000Z");
		});
	});

	describe("UpsertAuditSchema", () => {
		it("should extend LogAuditSchema with id and rerunable", () => {
			const result = UpsertAuditSchema.parse({
				id: "audit-123",
				operation: "testOp",
				target: createValidTarget(),
				rerunable: true,
			});

			expect(result.id).toBe("audit-123");
			expect(result.rerunable).toBe(true);
		});

		it("should allow optional id", () => {
			const result = UpsertAuditSchema.parse({
				operation: "testOp",
				target: createValidTarget(),
			});

			expect(result.id).toBeUndefined();
		});

		it("should allow optional rerunable", () => {
			const result = UpsertAuditSchema.parse({
				operation: "testOp",
				target: createValidTarget(),
			});

			expect(result.rerunable).toBeUndefined();
		});

		it("should inherit all LogAuditSchema fields", () => {
			const result = UpsertAuditSchema.parse({
				operation: "testOp",
				tier: 3,
				status: "warn",
				target: createValidTarget(),
				source: createValidTarget(),
				message: "Test",
				trace: "trace-123",
			});

			expect(result.tier).toBe(3);
			expect(result.status).toBe("warn");
			expect(result.message).toBe("Test");
		});
	});

	describe("schema/index.ts exports", () => {
		it("should export all audit schemas", async () => {
			const index = await import("./index.js");

			expect(index.AuditSchema).toBeDefined();
			expect(index.AuditPayloadSchema).toBeDefined();
			expect(index.AuditListItemPayloadSchema).toBeDefined();
		});

		it("should export common types and Tier", async () => {
			const index = await import("./index.js");

			expect(index.Tier).toBeDefined();
			expect(index.Tier.INTERNAL).toBe(1);
			expect(index.Tier.INFO).toBe(2);
			expect(index.Tier.PUBLIC).toBe(3);
		});

		it("should export log schemas and Status", async () => {
			const index = await import("./index.js");

			expect(index.LogAuditSchema).toBeDefined();
			expect(index.Status).toBeDefined();
			expect(index.Status.SUCCESS).toBe("success");
			expect(index.Status.FAIL).toBe("fail");
		});

		it("should export model schemas", async () => {
			const index = await import("./index.js");

			expect(index.EventBridgeEventSchema).toBeDefined();
			expect(index.PaginationSchema).toBeDefined();
			expect(index.CollectionSchema).toBeDefined();
			expect(index.PaginationCollectionSchema).toBeDefined();
		});

		it("should export service schemas", async () => {
			const index = await import("./index.js");

			expect(index.UpsertAuditSchema).toBeDefined();
		});

		it("should export storage schemas", async () => {
			const index = await import("./index.js");

			expect(index.AuditStorageSchema).toBeDefined();
		});

		it("should have functional schemas from index exports", async () => {
			const index = await import("./index.js");

			// Verify schemas work when imported from index
			const result = index.LogAuditSchema.parse({
				operation: "testOp",
				target: createValidTarget(),
			});

			expect(result.operation).toBe("testOp");
			expect(result.status).toBe("success");
		});
	});
});
