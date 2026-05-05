/** @module Interface mtp:core/types@0.1.0 **/
export type ArgValue = ArgValueIntVal | ArgValueFloatVal | ArgValueStrVal | ArgValueNullVal;
export interface ArgValueIntVal {
  tag: 'int-val',
  val: number,
}
export interface ArgValueFloatVal {
  tag: 'float-val',
  val: number,
}
export interface ArgValueStrVal {
  tag: 'str-val',
  val: string,
}
export interface ArgValueNullVal {
  tag: 'null-val',
}
/**
 * # Variants
 * 
 * ## `"action-enter"`
 * 
 * ## `"action-exit"`
 * 
 * ## `"event-enter"`
 * 
 * ## `"event-exit"`
 * 
 * ## `"fn-enter"`
 * 
 * ## `"fn-exit"`
 * 
 * ## `"cond-eval"`
 * 
 * ## `"loop-iter"`
 * 
 * ## `"note"`
 * 
 * ## `"error"`
 */
export type TraceKind = 'action-enter' | 'action-exit' | 'event-enter' | 'event-exit' | 'fn-enter' | 'fn-exit' | 'cond-eval' | 'loop-iter' | 'note' | 'error';
export interface ExecutionResult {
  value: ArgValue,
  error: number,
}
export type ConfigValue = ConfigValueBoolVal | ConfigValueIntVal | ConfigValueStrVal;
export interface ConfigValueBoolVal {
  tag: 'bool-val',
  val: boolean,
}
export interface ConfigValueIntVal {
  tag: 'int-val',
  val: number,
}
export interface ConfigValueStrVal {
  tag: 'str-val',
  val: string,
}
