// Official Agora AccessToken2 implementation, pinned as agora-token@2.0.7 (ISC).
// https://github.com/AgoraIO/Tools/tree/master/DynamicKey/AgoraDynamicKey/nodejs
// This file is server-only. Never import it from a public/browser module.
import agoraTokens from 'agora-token';

const {RtcTokenBuilder, RtcRole,RtmTokenBuilder} = agoraTokens;
const HEX_ID = /^[0-9a-f]{32}$/i;
const CHANNEL = /^[a-z0-9_-]{1,63}$/i;
const MAX_TOKEN_SECONDS = 3600;

function configuration(env) {
  const appId = typeof env?.AGORA_APP_ID === 'string' ? env.AGORA_APP_ID.trim() : '';
  const certificate = typeof env?.AGORA_APP_CERTIFICATE === 'string' ? env.AGORA_APP_CERTIFICATE.trim() : '';
  return {appId, certificate, valid: HEX_ID.test(appId) && HEX_ID.test(certificate)};
}

function voiceError(code, status) {
  return Object.assign(new Error(code), {code, status});
}

/** Public configuration reveals readiness only, never project secrets. */
export function voiceConfig(env) {
  return {voiceConfigured: configuration(env).valid};
}

/** The caller must first authenticate this member against the stored room. */
export function generateVoiceCredentials(env, room, player) {
  const {appId, certificate, valid} = configuration(env);
  if (!valid) throw voiceError('voice_unconfigured', 503);
  if (player?.left) throw voiceError('voice_not_member', 403);
  if (!Number.isInteger(player?.uid) || player.uid <= 0 || player.uid > 0xffffffff
      || typeof room?.channel !== 'string' || !CHANNEL.test(room.channel)) {
    throw voiceError('invalid_voice_identity', 400);
  }

  const now = Date.now();
  // The official builder samples its own integer-second issue time. The one-second
  // margin keeps the token inside the room lease even across a clock-second boundary.
  const roomSeconds = Math.floor((room.expiresAt - now) / 1000) - 1;
  if (!Number.isFinite(roomSeconds) || roomSeconds < 1) throw voiceError('room_expired', 410);
  const lifetime = Math.min(MAX_TOKEN_SECONDS, roomSeconds);

  let token;
  try {
    token = RtcTokenBuilder.buildTokenWithUid(
      appId, certificate, room.channel, player.uid, RtcRole.PUBLISHER,
      lifetime, lifetime,
    );
  } catch {
    throw voiceError('voice_unavailable', 503);
  }
  if (typeof token !== 'string' || !token.startsWith('007')) throw voiceError('voice_unavailable', 503);

  return {
    appId,
    channel: room.channel,
    uid: player.uid,
    token,
    // Conservative by at most one second if the builder crossed a second boundary.
    expiresAt: Math.floor(now / 1000) * 1000 + lifetime * 1000,
  };
}

/** Authenticated RTM identity matches the member's RTC UID. Messages contain only refresh hints. */
export function generateSignalCredentials(env,room,player){
  const {appId,certificate,valid}=configuration(env);
  if(!valid)throw voiceError('voice_unconfigured',503);
  if(player?.left)throw voiceError('voice_not_member',403);
  if(!Number.isInteger(player?.uid)||player.uid<=0||player.uid>0xffffffff||typeof room?.channel!=='string'||!CHANNEL.test(room.channel))throw voiceError('invalid_voice_identity',400);
  const now=Date.now(),seconds=Math.floor((room.expiresAt-now)/1000)-1;
  if(!Number.isFinite(seconds)||seconds<1)throw voiceError('room_expired',410);
  const lifetime=Math.min(MAX_TOKEN_SECONDS,seconds),userId=String(player.uid);let token;
  try{token=RtmTokenBuilder.buildToken(appId,certificate,userId,lifetime);}catch{throw voiceError('voice_unavailable',503);}
  if(typeof token!=='string'||!token.startsWith('007'))throw voiceError('voice_unavailable',503);
  return{appId,channel:room.channel,userId,token,expiresAt:Math.floor(now/1000)*1000+lifetime*1000};
}
