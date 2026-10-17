import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';
import { Bot } from './yapper.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

// --- Yapper Config ---
const YAPPER_TOKEN = '';
const YAPPER_CHANNEL_ID = '';

// --- Discord Config ---
const DISCORD_BOT_TOKEN = '';
const DISCORD_CHANNEL_ID = '';

// ============================================================================
// INITIALIZATION
// ============================================================================

// Initialize Yapper Bot
const yapperBot = new Bot(YAPPER_TOKEN);

// Initialize Discord Client
const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Cache user profiles to avoid spamming Yapper's API
const userAvatarCache = new Map();

// Helper function to resolve Yapper avatars using avatar_path and Cloudflare R2
async function getYapperAvatarUrl(msg) {
  const userId = msg.author_id || (typeof msg.author === 'object' ? msg.author?.id : undefined);
  if (!userId) return undefined;

  if (userAvatarCache.has(userId)) {
    return userAvatarCache.get(userId);
  }

  try {
    // Fetch public profile via Yapper SDK
    const userProfile = await yapperBot.user(userId);
    
    // Yapper returns avatar_path, e.g. "uuid/timestamp-filename.jpg"
    const avatarPath = userProfile?.avatar_path;

    if (avatarPath) {
      const resolved = `https://pub-f2aa8df0443d41d3882353e43988c5bb.r2.dev/avatars/${avatarPath}`;
      userAvatarCache.set(userId, resolved);
      return resolved;
    }
  } catch (err) {
    console.error(`[Yapper Profile Error] Could not fetch profile for user ${userId}:`, err.message);
  }

  userAvatarCache.set(userId, undefined);
  return undefined;
}

// ============================================================================
// YAPPER -> DISCORD
// ============================================================================

yapperBot.on('ready', (me) => {
  console.log(`[Yapper] Online as ${me.username}`);
});

yapperBot.on('message', async (msg) => {
  if (msg.channel_id !== YAPPER_CHANNEL_ID) return;
  if (!msg.content && !msg.attachment) return;

  const rawAuthorName = typeof msg.author === 'string' 
    ? msg.author 
    : (msg.author?.display_name || msg.author?.username || 'User');

  const authorAvatar = await getYapperAvatarUrl(msg);

  let content = msg.content || '';
  if (msg.attachment) {
    content += content ? `\n${msg.attachment}` : msg.attachment;
  }

  const displayTitle = `${rawAuthorName} [Yapper]`;

  try {
    const targetChannel = await discordClient.channels.fetch(DISCORD_CHANNEL_ID);
    if (!targetChannel || !targetChannel.isTextBased()) return;

    const embed = new EmbedBuilder()
      .setAuthor({
        name: displayTitle,
        iconURL: authorAvatar,
      })
      .setDescription(content || null)
      .setColor(0x5865F2);

    await targetChannel.send({ embeds: [embed] });
  } catch (error) {
    console.error('[Bridge Error] Failed to relay Yapper message to Discord:', error);
  }
});

yapperBot.on('error', (err) => {
  console.error('[Yapper Error]', err);
});

// ============================================================================
// DISCORD -> YAPPER
// ============================================================================

discordClient.once('clientReady', () => {
  console.log(`[Discord] Online as ${discordClient.user.tag}`);
});

discordClient.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (message.channelId !== DISCORD_CHANNEL_ID) return;

  const authorName = message.member?.displayName || message.author.username;
  const authorAvatar = message.author.displayAvatarURL({ extension: 'png', size: 256 });

  let content = message.content || '';
  if (message.attachments.size > 0) {
    const attachmentUrls = message.attachments.map(a => a.url).join('\n');
    content = content ? `${content}\n${attachmentUrls}` : attachmentUrls;
  }

  if (!content.trim()) return;

  try {
    const yapperEmbed = {
      author: {
        name: `${authorName} [Discord]`,
        icon_url: authorAvatar
      },
      description: content
    };

    await yapperBot.send(YAPPER_CHANNEL_ID, '', { embeds: [yapperEmbed] });
  } catch (error) {
    console.error('[Bridge Error] Failed to relay Discord message to Yapper:', error);
  }
});

// ============================================================================
// START BOTS
// ============================================================================

async function startBridge() {
  console.log('Starting bridge...');
  yapperBot.start();
  await discordClient.login(DISCORD_BOT_TOKEN);
}

startBridge().catch((err) => {
  console.error('Fatal error starting bridge:', err);
});