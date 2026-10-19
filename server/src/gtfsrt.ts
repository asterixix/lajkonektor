// Minimalny dekoder GTFS-Realtime (protobuf) bez zależności: tylko pola potrzebne do odjazdów, pozycji i komunikatów.
type Kind = "u" | "i" | "f" | "d" | "s" | "m";
type Schema = Record<number, { n: string; k: Kind; sub?: Schema; rep?: boolean }>;

const TIME_RANGE: Schema = { 1: { n: "start", k: "u" }, 2: { n: "end", k: "u" } };
const TRIP: Schema = {
  1: { n: "trip_id", k: "s" }, 2: { n: "start_time", k: "s" }, 3: { n: "start_date", k: "s" },
  4: { n: "schedule_relationship", k: "u" }, 5: { n: "route_id", k: "s" }, 6: { n: "direction_id", k: "u" },
};
const VEHICLE: Schema = { 1: { n: "id", k: "s" }, 2: { n: "label", k: "s" }, 3: { n: "license_plate", k: "s" } };
const EVENT: Schema = { 1: { n: "delay", k: "i" }, 2: { n: "time", k: "i" }, 3: { n: "uncertainty", k: "i" } };
const STOP_UPDATE: Schema = {
  1: { n: "stop_sequence", k: "u" }, 2: { n: "arrival", k: "m", sub: EVENT }, 3: { n: "departure", k: "m", sub: EVENT },
  4: { n: "stop_id", k: "s" }, 5: { n: "schedule_relationship", k: "u" },
};
const TRIP_UPDATE: Schema = {
  1: { n: "trip", k: "m", sub: TRIP }, 2: { n: "stop_time_update", k: "m", sub: STOP_UPDATE, rep: true },
  3: { n: "vehicle", k: "m", sub: VEHICLE }, 4: { n: "timestamp", k: "u" }, 5: { n: "delay", k: "i" },
};
const POSITION: Schema = { 1: { n: "latitude", k: "f" }, 2: { n: "longitude", k: "f" }, 3: { n: "bearing", k: "f" }, 5: { n: "speed", k: "f" } };
const VEHICLE_POSITION: Schema = {
  1: { n: "trip", k: "m", sub: TRIP }, 2: { n: "position", k: "m", sub: POSITION }, 3: { n: "current_stop_sequence", k: "u" },
  4: { n: "current_status", k: "u" }, 5: { n: "timestamp", k: "u" }, 7: { n: "stop_id", k: "s" }, 8: { n: "vehicle", k: "m", sub: VEHICLE },
};
const TRANSLATION: Schema = { 1: { n: "text", k: "s" }, 2: { n: "language", k: "s" } };
const TRANSLATED: Schema = { 1: { n: "translation", k: "m", sub: TRANSLATION, rep: true } };
const SELECTOR: Schema = { 1: { n: "agency_id", k: "s" }, 2: { n: "route_id", k: "s" }, 3: { n: "route_type", k: "i" }, 4: { n: "trip", k: "m", sub: TRIP }, 5: { n: "stop_id", k: "s" } };
const ALERT: Schema = {
  1: { n: "active_period", k: "m", sub: TIME_RANGE, rep: true }, 5: { n: "informed_entity", k: "m", sub: SELECTOR, rep: true },
  6: { n: "cause", k: "u" }, 7: { n: "effect", k: "u" }, 10: { n: "header_text", k: "m", sub: TRANSLATED }, 11: { n: "description_text", k: "m", sub: TRANSLATED },
};
const ENTITY: Schema = {
  1: { n: "id", k: "s" }, 2: { n: "is_deleted", k: "u" }, 3: { n: "trip_update", k: "m", sub: TRIP_UPDATE },
  4: { n: "vehicle", k: "m", sub: VEHICLE_POSITION }, 5: { n: "alert", k: "m", sub: ALERT },
};
const FEED: Schema = {
  1: { n: "header", k: "m", sub: { 3: { n: "timestamp", k: "u" } } },
  2: { n: "entity", k: "m", sub: ENTITY, rep: true },
};

const dec = new TextDecoder();

function decode(buf: Uint8Array, schema: Schema): any {
  const out: any = {};
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let p = 0;
  const varint = (): bigint => {
    let r = 0n, shift = 0n;
    for (;;) {
      const b = buf[p++];
      r |= BigInt(b & 0x7f) << shift;
      if (!(b & 0x80)) return r;
      shift += 7n;
    }
  };
  while (p < buf.length) {
    const tag = Number(varint()), field = tag >> 3, wire = tag & 7;
    const def = schema[field];
    let val: any, skip = false;
    if (wire === 0) { const v = varint(); val = def?.k === "i" ? Number(BigInt.asIntN(64, v)) : Number(v); }
    else if (wire === 1) { val = def?.k === "d" ? dv.getFloat64(p, true) : undefined; p += 8; }
    else if (wire === 5) { val = def?.k === "f" ? dv.getFloat32(p, true) : undefined; p += 4; }
    else if (wire === 2) {
      const len = Number(varint());
      const chunk = buf.subarray(p, p + len);
      p += len;
      val = def?.k === "s" ? dec.decode(chunk) : def?.k === "m" && def.sub ? decode(chunk, def.sub) : undefined;
    } else throw new Error(`GTFS-RT: nieobsługiwany typ pola ${wire}`);
    if (!def || val === undefined) skip = true;
    if (skip) continue;
    if (def.rep) (out[def.n] ??= []).push(val); else out[def.n] = val;
  }
  return out;
}

export interface Feed { header?: { timestamp?: number }; entity?: any[] }
export const decodeFeed = (buf: Uint8Array): Feed => decode(buf, FEED);
