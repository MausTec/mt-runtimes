/** @module Interface wasi:clocks/wall-clock@0.2.2 **/
export interface Datetime {
  seconds: bigint,
  nanoseconds: number,
}
