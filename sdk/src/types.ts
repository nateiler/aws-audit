import type { App, ResourceType } from "./config.js";

export type AnyApp = (typeof App)[keyof typeof App];

export type AnyResourceType = (typeof ResourceType)[keyof typeof ResourceType];
