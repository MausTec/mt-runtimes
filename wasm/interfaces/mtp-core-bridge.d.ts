/** @module Interface mtp:core/bridge@0.1.0 **/
export function init(): void;
export function loadPlugin(json: string): number;
export function freePlugin(slot: number): void;
export function setPluginConfig(slot: number, configJson: string): boolean;
export function registerHostFunction(name: string, requiredPermission: string | undefined): void;
export function registerEvent(name: string, requiredPermission: string | undefined): void;
export function fireEvent(slot: number, event: string, arg: ArgValue): ExecutionResult;
export function callFunction(slot: number, name: string, args: Array<ArgValue>): ExecutionResult;
export function setTracing(enabled: boolean): void;
export function getPluginName(slot: number): string | undefined;
export function getConfigFields(slot: number): string | undefined;
export function getConfigValue(slot: number, key: string): ConfigValue | undefined;
export function setConfigValue(slot: number, key: string, value: ConfigValue): boolean;
export function enableDriverScope(slot: number): boolean;
export function disableDriverScope(slot: number): void;
export type ArgValue = import('./mtp-core-types.js').ArgValue;
export type ExecutionResult = import('./mtp-core-types.js').ExecutionResult;
export type ConfigValue = import('./mtp-core-types.js').ConfigValue;
