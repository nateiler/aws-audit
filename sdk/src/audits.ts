import { Console } from "node:console";
import type { GenericLogger } from "@aws-lambda-powertools/commons/types";
import {
	getBooleanFromEnv,
	getXRayTraceIdFromEnv,
	isDevMode,
} from "@aws-lambda-powertools/commons/utils/env";
import { AUDIT_LOG_IDENTIFIER } from "./constants.js";
import { type LogAuditInput, LogAuditSchema } from "./schema/log.js";

/**
 * Maximum number of audit entries that can be buffered before automatic flush.
 * When this limit is reached, audits are automatically published to prevent memory issues.
 */
const MAX_AUDITS_SIZE = 20;

/**
 * Configuration options for the Audits class.
 */
export type AuditsOptions = {
	/**
	 * Custom logger for debug, warning, and error messages.
	 * If not provided, a Console instance is used.
	 * Note: Audit logs are always written to stdout regardless of this setting.
	 */
	logger?: GenericLogger;
};

/**
 * Manages audit log collection and emission for AWS Lambda functions.
 *
 * Buffers audit entries and emits them as structured JSON logs to stdout,
 * which can be captured by CloudWatch Logs and processed by subscription filters.
 *
 * Features:
 * - Automatic buffering with configurable flush threshold
 * - X-Ray trace ID injection for distributed tracing
 * - Environment-based enable/disable control
 * - Schema validation via Zod before emission
 *
 * @example
 * ```typescript
 * const audits = new Audits();
 *
 * audits.addAudit({
 *   operation: 'createUser',
 *   target: { app: 'MyApp', type: 'User', id: '123' },
 *   status: Status.SUCCESS,
 * });
 *
 * // Flush at end of Lambda execution
 * audits.publishStoredAudits();
 * ```
 */
export class Audits {
	/**
	 * Console instance for emitting audit logs to stdout.
	 * Uses a dedicated Console instance in Lambda for isolation from custom loggers.
	 * @internal
	 */
	private console!: Console;

	/**
	 * Logger for debug, warning, and error messages (not audit logs).
	 */
	readonly logger: GenericLogger;

	/**
	 * Whether audit emission is disabled.
	 * @internal
	 */
	private disabled = false;

	/**
	 * Cached environment configuration values.
	 * @internal
	 */
	readonly #envConfig = {
		disabled: false,
		devMode: false,
	};

	/**
	 * X-Ray trace ID from the Lambda environment, if available.
	 * Automatically injected into audit entries that don't have a trace ID.
	 */
	readonly traceId: string | undefined;

	/**
	 * Buffer of audit entries waiting to be published.
	 * @internal
	 */
	private storedAudits: Array<LogAuditInput> = [];

	/**
	 * Creates a new Audits instance.
	 *
	 * Initializes the console, reads environment configuration, and captures
	 * the X-Ray trace ID from the Lambda environment.
	 *
	 * @param options - Configuration options
	 */
	public constructor(options: AuditsOptions = {}) {
		this.setEnvConfig();
		this.setConsole();
		this.setDisabled();
		this.logger = options.logger || this.console;

		this.traceId = getXRayTraceIdFromEnv();
	}

	/**
	 * Checks whether audit emission is currently disabled.
	 *
	 * @returns True if audits are disabled, false otherwise
	 */
	protected isDisabled(): boolean {
		return this.disabled;
	}

	/**
	 * Clears all buffered audit entries without publishing them.
	 */
	protected clearAudits(): void {
		this.storedAudits = [];
	}

	/**
	 * Adds an audit entry to the buffer.
	 *
	 * If the buffer reaches MAX_AUDITS_SIZE, automatically triggers
	 * a flush to prevent unbounded memory growth.
	 *
	 * @param item - The audit entry to buffer
	 */
	public addAudit(item: LogAuditInput): void {
		if (Object.keys(this.storedAudits).length >= MAX_AUDITS_SIZE) {
			this.publishStoredAudits();
		}

		this.storedAudits.push(item);
	}

	/**
	 * Publishes all buffered audit entries to stdout and clears the buffer.
	 *
	 * Each audit entry is:
	 * 1. Injected with the X-Ray trace ID if not already set
	 * 2. Validated and transformed through LogAuditSchema
	 * 3. Emitted as JSON with the AUDIT_LOG_IDENTIFIER wrapper
	 *
	 * If audits are disabled, the buffer is cleared without emission.
	 *
	 * @example
	 * ```typescript
	 * // Manual flush at end of handler
	 * audits.publishStoredAudits();
	 * ```
	 */
	public publishStoredAudits(): void {
		if (!this.disabled) {
			this.storedAudits.forEach((item) => {
				if (!item.trace) {
					item.trace = this.traceId;
				}

				this.console.log(
					JSON.stringify({
						[AUDIT_LOG_IDENTIFIER]: {
							...LogAuditSchema.parse(item),
						},
					}),
				);
			});
		}

		this.clearAudits();
	}

	/**
	 * Initializes the console instance based on environment mode.
	 *
	 * In production (non-dev mode), creates a dedicated Console instance
	 * writing to process.stdout/stderr. In dev mode, uses the global console
	 * for better local debugging experience.
	 *
	 * @internal
	 */
	private setConsole(): void {
		if (!this.#envConfig.devMode) {
			this.console = new Console({
				stdout: process.stdout,
				stderr: process.stderr,
			});
		} else {
			this.console = console;
		}
	}

	/**
	 * Reads and caches environment configuration values.
	 *
	 * Checks POWERTOOLS_AUDITS_DISABLED and POWERTOOLS_DEV environment
	 * variables using AWS Lambda Powertools utilities.
	 *
	 * @internal
	 */
	private setEnvConfig(): void {
		this.#envConfig.disabled = getBooleanFromEnv({
			key: "POWERTOOLS_AUDITS_DISABLED",
			defaultValue: false,
			extendedParsing: true,
		});
		this.#envConfig.devMode = isDevMode();
	}

	/**
	 * Determines whether audits should be disabled based on environment.
	 *
	 * Priority:
	 * 1. POWERTOOLS_AUDITS_DISABLED takes precedence if explicitly set
	 * 2. Otherwise, audits are disabled in dev mode (POWERTOOLS_DEV=true)
	 *
	 * @internal
	 */
	private setDisabled(): void {
		if (
			"POWERTOOLS_AUDITS_DISABLED" in process.env &&
			process.env.POWERTOOLS_AUDITS_DISABLED !== undefined
		) {
			this.disabled = this.#envConfig.disabled;
			return;
		}
		this.disabled = this.#envConfig.devMode;
	}
}
