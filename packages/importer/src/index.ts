// Pure import logic: symbol parsing (PR B), file parsing + header/row mapping
// (PR C), FIFO matching (PR D). Side effects live in apps/*, never here.

export * from "./headers";
export * from "./map-executions";
export * from "./match";
export * from "./parse-file";
export * from "./symbol";
