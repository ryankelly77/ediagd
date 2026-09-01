"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.muxConfigured = muxConfigured;
exports.mintPlaybackToken = mintPlaybackToken;
exports.playbackFor = playbackFor;
exports.muxClient = muxClient;
require("server-only");
/* ============================================================================
   EDIAGD — signed playback tokens

   Both assets use Mux's SIGNED playback policy, which means a playback id is
   useless on its own: every view needs a short-lived JWT minted here, on the
   server, after we have decided the person is allowed to watch.

   ---------------------------------------------------------------------------
   WHY SIGNED, AND WHY IT MATTERS THAT IT STAYS THAT WAY
   ---------------------------------------------------------------------------
   A public playback id plays for anybody who has it, forever. Share it once —
   in a screenshot, a support ticket, a browser history — and it is public
   permanently, with no way to revoke it short of deleting the asset.

   A signed id cannot be played without a token, so playback can be gated on the
   same rules as everything else: signed in, entitled, content published. The
   token expires; the leak has a half-life.

   THE FAILURE MODE THIS GUARDS AGAINST. A public id and a signed id are
   indistinguishable by inspection. If signing were skipped by accident, public
   assets would keep playing and nothing would look wrong until a URL escaped.
   So `mux_playback_policy` is recorded per row in 0057, defaults to 'signed',
   and mintPlaybackToken REFUSES to sign a row that claims to be public — a
   public row does not need a token, and being asked for one means somebody's
   assumptions have drifted.

   ---------------------------------------------------------------------------
   TOKEN LIFETIME
   ---------------------------------------------------------------------------
   Two hours. Long enough that a twelve-minute video watched with interruptions
   — a service drive is not a cinema — never dies mid-playback, which would
   present as a broken player rather than an expired credential. Short enough
   that a leaked URL is worthless by the next shift.

   Mux checks expiry at the START of playback and for each segment request, so
   an in-progress view survives; it is the next cold start that needs a fresh
   token. Every page render mints one, so that is free.
   ============================================================================ */
const mux_node_1 = __importDefault(require("@mux/mux-node"));
/** Two hours. See the note above. */
const TOKEN_TTL_SECONDS = 60 * 60 * 2;
let cached = null;
/**
 * The Mux client, built once.
 *
 * Throws rather than returning null when credentials are missing. A video that
 * silently does not play is a bug somebody debugs for an hour; a thrown error
 * naming the missing variable is a bug somebody fixes in a minute.
 */
function muxClient() {
    if (cached)
        return cached;
    const tokenId = process.env.MUX_TOKEN_ID;
    const tokenSecret = process.env.MUX_TOKEN_SECRET;
    const signingKeyId = process.env.MUX_SIGNING_KEY_ID;
    const signingKeyPrivate = process.env.MUX_SIGNING_KEY_PRIVATE;
    const missing = [
        !tokenId && "MUX_TOKEN_ID",
        !tokenSecret && "MUX_TOKEN_SECRET",
        !signingKeyId && "MUX_SIGNING_KEY_ID",
        !signingKeyPrivate && "MUX_SIGNING_KEY_PRIVATE",
    ].filter(Boolean);
    if (missing.length) {
        throw new Error(`Mux is not configured — missing ${missing.join(", ")}. ` +
            `See exports/mux-credentials-setup.md.`);
    }
    cached = new mux_node_1.default({
        tokenId,
        tokenSecret,
        jwtSigningKey: signingKeyId,
        jwtPrivateKey: signingKeyPrivate,
    });
    return cached;
}
/** True when the environment can sign. Lets callers degrade instead of throw. */
function muxConfigured() {
    return Boolean(process.env.MUX_TOKEN_ID &&
        process.env.MUX_TOKEN_SECRET &&
        process.env.MUX_SIGNING_KEY_ID &&
        process.env.MUX_SIGNING_KEY_PRIVATE);
}
/**
 * Mint the three tokens a signed player needs.
 *
 * THREE TOKENS, NOT ONE. Mux scopes a playback token to an audience — `v` for
 * the video, `t` for thumbnails, `s` for the storyboard. A video token will not
 * fetch a poster frame, so a player given only `v` renders a black rectangle
 * until the first frame decodes, which reads as a stall.
 *
 * CALL THIS PER VIEW, NOT PER ASSET. The token is the authorisation. Caching
 * one across users would hand the second user the first user's permission.
 */
async function mintPlaybackToken(playbackId, policy) {
    if (policy === "public") {
        throw new Error(`mintPlaybackToken: ${playbackId} is a PUBLIC playback id. Public ids need ` +
            `no token — being asked to sign one means a row's policy and its id have ` +
            `drifted apart. Fix the row, not this function.`);
    }
    const mux = muxClient();
    const expiration = `${TOKEN_TTL_SECONDS}s`;
    const [token, thumbnailToken, storyboardToken] = await Promise.all([
        mux.jwt.signPlaybackId(playbackId, { type: "video", expiration }),
        mux.jwt.signPlaybackId(playbackId, { type: "thumbnail", expiration }),
        mux.jwt.signPlaybackId(playbackId, { type: "storyboard", expiration }),
    ]);
    return { playbackId, token, thumbnailToken, storyboardToken };
}
/**
 * Everything the player component needs for one content row, or null.
 *
 * NULL RATHER THAN THROWING when the row has no Mux id or Mux is unconfigured:
 * the library is full of rows that have no video yet, and those must keep
 * rendering their honest "not uploaded" state rather than taking a screen down.
 * A row that HAS an id and cannot be signed does throw — that is a real fault.
 */
async function playbackFor(row) {
    if (!row.mux_playback_id)
        return null;
    if (!muxConfigured())
        return null;
    return mintPlaybackToken(row.mux_playback_id, row.mux_playback_policy ?? "signed");
}
