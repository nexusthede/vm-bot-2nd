const { Client, GatewayIntentBits, EmbedBuilder, ActivityType } = require("discord.js");
require("./keep_alive"); // optional keep-alive
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent
    ]
});

// ------------------- CONFIG -------------------
const prefix = ",";
const ALLOWED_GUILD = "1426789471776542803"; // your server only

// ------------------- EMBED HELPER -------------------
async function sendVCEmbed(channel, description) {
    const embed = new EmbedBuilder()
        .setDescription(description)
        .setColor("#ADD8E6") // light blue
        .setTimestamp();
    await channel.send({ embeds: [embed] });
}

// ------------------- GUILD WHITELIST -------------------
client.on("guildCreate", async guild => {
    if (guild.id !== ALLOWED_GUILD) {
        await guild.leave();
        console.log(`Left unauthorized guild: ${guild.name} (${guild.id})`);
    }
});

client.once("ready", async () => {
    console.log(`${client.user.tag} is online!`);
    client.user.setActivity("Being cute? M-Me?", { type: ActivityType.Streaming });
    client.guilds.cache.forEach(async guild => {
        if (guild.id !== ALLOWED_GUILD) await guild.leave();
    });
});

// ------------------- VC COMMANDS -------------------
client.on("messageCreate", async message => {
    if (!message.guild || message.author.bot) return;
    if (message.guild.id !== ALLOWED_GUILD) return;
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();
    const member = message.member;
    const vc = member.voice.channel;

    // ------------------- VM SETUP -------------------
    if (cmd === "vmsetup") {
        if (!member.permissions.has("ManageChannels")) return sendVCEmbed(message.channel, "you need manage channels permission.");
        const categories = { master: "voice master", public: "public vcs", private: "private vcs" };
        const createdCats = {};

        for (const [key, name] of Object.entries(categories)) {
            let cat = message.guild.channels.cache.find(c => c.name === name && c.type === 4);
            if (!cat) cat = await message.guild.channels.create({ name, type: 4 });
            createdCats[key] = cat;
        }

        const masterVCs = ["join to create", "join a random vc"];
        for (const vcName of masterVCs) {
            if (!message.guild.channels.cache.find(c => c.name === vcName && c.parentId === createdCats.master.id)) {
                await message.guild.channels.create({ name: vcName, type: 2, parent: createdCats.master.id });
            }
        }

        return sendVCEmbed(message.channel, "voice master setup complete!");
    }

    // ------------------- VM RESET -------------------
    if (cmd === "vmreset") {
        if (!member.permissions.has("ManageChannels")) return sendVCEmbed(message.channel, "you need manage channels permission.");
        const categoriesToDelete = ["voice master", "public vcs", "private vcs"];
        for (const catName of categoriesToDelete) {
            const cat = message.guild.channels.cache.find(c => c.name === catName && c.type === 4);
            if (cat) {
                cat.children.cache.forEach(async ch => await ch.delete().catch(() => {}));
                await cat.delete().catch(() => {});
            }
        }
        return sendVCEmbed(message.channel, "voice master has been reset!");
    }

    // ------------------- VC COMMANDS -------------------
    if (cmd !== "vc") return;
    const sub = args[0]?.toLowerCase();
    if (!sub) return sendVCEmbed(message.channel, "specify a subcommand.");
    if (!vc && sub !== "unmute") return sendVCEmbed(message.channel, "you must be in a voice channel.");

    const ownerId = vc?.members.firstKey();
    const target = message.mentions.members.first();

    switch(sub) {
        case "lock":
            await vc.permissionOverwrites.edit(message.guild.id, { Connect: false });
            await sendVCEmbed(message.channel, "your voice channel is now locked.");
            break;

        case "unlock":
            await vc.permissionOverwrites.edit(message.guild.id, { Connect: true });
            await sendVCEmbed(message.channel, "your voice channel is now unlocked.");
            break;

        case "kick":
            if (!target) return sendVCEmbed(message.channel, "mention a user to kick.");
            if (!vc.members.has(target.id)) return sendVCEmbed(message.channel, "user is not in your voice channel.");
            await target.voice.disconnect();
            await sendVCEmbed(message.channel, `**${target.user.tag}** has been removed from your voice channel.`);
            break;

        case "ban":
            if (!target) return sendVCEmbed(message.channel, "mention a user to ban.");
            await vc.permissionOverwrites.edit(target.id, { Connect: false });
            await sendVCEmbed(message.channel, `**${target.user.tag}** has been banned from your voice channel.`);
            break;

        case "permit":
            if (!target) return sendVCEmbed(message.channel, "mention a user to permit.");
            await vc.permissionOverwrites.edit(target.id, { Connect: true });
            await sendVCEmbed(message.channel, `**${target.user.tag}** can now join your voice channel.`);
            break;

        case "limit":
            const limit = parseInt(args[1]);
            if (isNaN(limit)) return sendVCEmbed(message.channel, "provide a number as limit.");
            await vc.setUserLimit(limit);
            await sendVCEmbed(message.channel, `your voice channel limit set to ${limit}.`);
            break;

        case "info":
            const infoEmbed = new EmbedBuilder()
                .setTitle("voice channel info")
                .setDescription(`Name: ${vc.name}\nOwner: <@${ownerId}>\nMembers: ${vc.members.size}\nUser Limit: ${vc.userLimit || "None"}`)
                .setColor("#ADD8E6")
                .setTimestamp();
            await message.channel.send({ embeds: [infoEmbed] });
            break;

        case "rename":
            const newName = args.slice(1).join(" ");
            if (!newName) return sendVCEmbed(message.channel, "provide a new name.");
            await vc.setName(newName);
            await sendVCEmbed(message.channel, "your voice channel name updated.");
            break;

        case "transfer":
            if (!target) return sendVCEmbed(message.channel, "mention a user to transfer ownership.");
            await vc.permissionOverwrites.edit(ownerId, { Connect: false, ManageChannels: false });
            await vc.permissionOverwrites.edit(target.id, { Connect: true, ManageChannels: true });
            await sendVCEmbed(message.channel, `ownership of your voice channel has been transferred to **${target.user.tag}**.`);
            break;

        case "unmute":
            await member.voice.setMute(false);
            await sendVCEmbed(message.channel, "you are now unmuted in your voice channel.");
            break;

        case "hide":
            await vc.permissionOverwrites.edit(message.guild.id, { ViewChannel: false });
            await sendVCEmbed(message.channel, "your voice channel is now hidden.");
            break;

        case "unhide":
            await vc.permissionOverwrites.edit(message.guild.id, { ViewChannel: true });
            await sendVCEmbed(message.channel, "your voice channel is now visible.");
            break;

        default:
            sendVCEmbed(message.channel, "unknown subcommand.");
            break;
    }
});

// ------------------- ERROR HANDLING -------------------
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

// ------------------- LOGIN -------------------
client.login(process.env.TOKEN);
