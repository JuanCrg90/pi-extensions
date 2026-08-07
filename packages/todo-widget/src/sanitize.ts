/**
 * Strip terminal escape sequences and control characters from user-supplied
 * markdown text. Used for titles/IDs before rendering, persistence, or ID
 * generation to prevent ANSI/OSC injection.
 */

// ANSI escape sequences: ESC [ ... (final byte 0x40-0x7E)
const ANSI_RE = /\x1b\[[0-?]*[ -/]*[@-~]/g;

// OSC sequences: ESC ] ... BEL or ESC ] ... ESC \
const OSC_RE = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;

// Other ESC-initiated sequences (not covered above)
const OTHER_ESC_RE = /\x1b[^[\]]/g;

// C0 control characters to remove (keep tab and newline for markdown parsing)
const CONTROL_RE = /[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]/g;

export function sanitizeDisplayText(text: string): string {
  return text
    .replace(ANSI_RE, "")
    .replace(OSC_RE, "")
    .replace(OTHER_ESC_RE, "")
    .replace(CONTROL_RE, "")
    .trim();
}
