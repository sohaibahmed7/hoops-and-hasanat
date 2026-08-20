import { randomBytes } from "crypto";

/** Room codes people read aloud or off a phone: no 0/O/1/I/L to mistype. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function roomCode(len = 5) {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export function token() {
  return randomBytes(24).toString("base64url");
}
