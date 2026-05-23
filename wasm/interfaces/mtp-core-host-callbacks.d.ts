/** @module Interface mtp:core/host-callbacks@0.2.0 **/
export function hostDispatch(slot: number, fnName: string, args: Array<ArgValue>): HostResult;
export function configSave(slot: number): boolean;
export function traceEvent(slot: number, kind: TraceKind, fnName: string, retCode: number): void;
export function errorReport(slot: number, fnName: string, errorCode: number): void;
export type ArgValue = import('./mtp-core-types.js').ArgValue;
export type HostResult = import('./mtp-core-types.js').HostResult;
export type TraceKind = import('./mtp-core-types.js').TraceKind;
