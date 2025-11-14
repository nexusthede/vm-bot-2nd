const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
require("./keep_alive"); // keep-alive for Render/BetterStack

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

    // Purple streaming activity with no visible text
    client.user.setActivity("\u200B", { type: "STREAMING", url: "https://twitch.tv/fake" });

    // Leave any unauthorized servers on startup
    client.guilds.cache.forEach(async guild => {
        if (guild.id !== ALLOWED_GUILD) await guild.leave();
    });
});

// ------------------- TEMP VC HANDLER -------------------
client.on("voiceStateUpdate", async (oldState, newState) => {
    const guild = newState.guild;
    if (!guild || guild.id !== ALLOWED_GUILD) return;

    const masterCat = guild.channels.cache.find(c => c.name === "voice master" && c.type === 4);
    const publicCat = guild.channels.cache.find(c => c.name === "public vcs" && c.type === 4);
    const privateCat = guild.channels.cache.find(c => c.name === "private vcs" && c.type === 4);

    const channelName = newState.channel?.name.toLowerCase();

    // --- Join to create ---
    if (channelName === "join to create") {
        if (!publicCat) return;
        const tempVC = await guild.channels.create({
            name: `${newState.member.user.username}'s channel`,
            type: 2,
            parent: publicCat.id,
            permissionOverwrites: [
                { id: guild.id, allow: ["Connect", "ViewChannel"] },
                { id: newState.member.id, allow: ["ManageChannels", "MuteMembers"] }
            ]
        });
        await newState.setChannel(tempVC);
    }

    // --- Join a random VC ---
    if (channelName === "join a random vc") {
        if (!publicCat) return;
        const availableVCs = publicCat.children.cache.filter(c => c.type === 2 && c.members.size < (c.userLimit || Infinity));
        if (!availableVCs.size) return;
        const randomVC = availableVCs.random();
        await newState.setChannel(randomVC);
    }

    // --- Delete empty temp VCs ---
    [publicCat, privateCat].forEach(cat => {
        if (!cat) return;
        cat.children.cache.forEach(ch => {
            if (ch.members.size === 0 && !["join to create", "join a random vc"].includes(ch.name.toLowerCase())) {
                ch.delete().catch(() => {});
            }
        });
    });
});

// ------------------- MESSAGE HANDLER -------------------
client.on("messageCreate", async message => {
    if (!message.guild || message.author.bot) return;
    if (message.guild.id !== ALLOWED_GUILD) return;
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();
    const member = message.member;
    const vc = member.voice.channel;

    // -------------------- VC COMMANDS --------------------
    if (cmd === "vc") {
        const sub = args[0]?.toLowerCase();
        if (!sub) return sendVCEmbed(message.channel, "Specify a subcommand.");
        if (!vc && !["unmute"].includes(sub)) return sendVCEmbed(message.channel, "You must be in a voice channel.");

        const ownerId = vc?.members.firstKey();
        const target = message.mentions.members.first();

        switch (sub) {
            case "lock":
                if (member.id !== ownerId) return sendVCEmbed(message.channel, "Only VC owner can lock.");
                if (!vc.parent || vc.parent.name !== "private vcs") await vc.setParent(message.guild.channels.cache.find(c => c.name === "private vcs" && c.type === 4));
                await vc.permissionOverwrites.edit(message.guild.id, { Connect: false });
                sendVCEmbed(message.channel, `**${member.user.username}** has locked your voice channel.`);
                break;

            case "unlock":
                if (member.id !== ownerId) return sendVCEmbed(message.channel, "Only VC owner can unlock.");
                if (!vc.parent || vc.parent.name !== "public vcs") await vc.setParent(message.guild.channels.cache.find(c => c.name === "public vcs" && c.type === 4));
                await vc.permissionOverwrites.edit(message.guild.id, { Connect: true });
                sendVCEmbed(message.channel, `**${member.user.username}** has unlocked your voice channel.`);
                break;

            case "hide":
                if (member.id !== ownerId) return sendVCEmbed(message.channel, "Only VC owner can hide.");
                if (!vc.parent || vc.parent.name !== "private vcs") await vc.setParent(message.guild.channels.cache.find(c => c.name === "private vcs" && c.type === 4));
                await vc.permissionOverwrites.edit(message.guild.id, { ViewChannel: false, Connect: false });
                sendVCEmbed(message.channel, `**${member.user.username}** has hidden your voice channel.`);
                break;

            case "unhide":
                if (member.id !== ownerId) return sendVCEmbed(message.channel, "Only VC owner can unhide.");
                if (!vc.parent || vc.parent.name !== "public vcs") await vc.setParent(message.guild.channels.cache.find(c => c.name === "public vcs" && c.type === 4));
                await vc.permissionOverwrites.edit(message.guild.id, { ViewChannel: true, Connect: true });
                sendVCEmbed(message.channel, `**${member.user.username}** has unhid your voice channel.`);
                break;

            case "kick":
                if (member.id !== ownerId) return sendVCEmbed(message.channel, "Only VC owner can kick users.");
                if (!target) return sendVCEmbed(message.channel, "Mention a user to kick.");
                if (!vc.members.has(target.id)) return sendVCEmbed(message.channel, "User is not in your voice channel.");
                await target.voice.disconnect();
                sendVCEmbed(message.channel, `**${target.user.username}** has been kicked from your voice channel.`);
                break;

            case "ban":
                if (member.id !== ownerId) return sendVCEmbed(message.channel, "Only VC owner can ban users.");
                if (!target) return sendVCEmbed(message.channel, "Mention a user to ban.");
                await vc.permissionOverwrites.edit(target.id, { Connect: false });
                sendVCEmbed(message.channel, `**${target.user.username}** has been banned from your voice channel.`);
                break;

            case "permit":
                if (member.id !== ownerId) return sendVCEmbed(message.channel, "Only VC owner can permit users.");
                if (!target) return sendVCEmbed(message.channel, "Mention a user to permit.");
                await vc.permissionOverwrites.edit(target.id, { Connect: true });
                sendVCEmbed(message.channel, `**${target.user.username}** is now allowed in your voice channel.`);
                break;

            case "limit":
                const limit = parseInt(args[1]);
                if (isNaN(limit)) return sendVCEmbed(message.channel, "Provide a number as limit.");
                await vc.setUserLimit(limit);
                sendVCEmbed(message.channel, `Voice channel user limit set to ${limit}.`);
                break;

            case "rename":
                const newName = args.slice(1).join(" ");
                if (!newName) return sendVCEmbed(message.channel, "Provide a new name.");
                await vc.setName(newName);
                sendVCEmbed(message.channel, `Voice channel renamed to ${newName}.`);
                break;

            case "transfer":
                if (!target) return sendVCEmbed(message.channel, "Mention a user to transfer VC ownership.");
                await vc.permissionOverwrites.edit(ownerId, { Connect: true, ManageChannels: false });
                await vc.permissionOverwrites.edit(target.id, { Connect: true, ManageChannels: true });
                sendVCEmbed(message.channel, `Voice channel ownership transferred to **${target.user.username}**.`);
                break;

            case "info":
                sendVCEmbed(message.channel, `Name: ${vc.name}\nOwner: <@${ownerId}>\nMembers: ${vc.members.size}\nUser Limit: ${vc.userLimit || "None"}`);
                break;

            case "unmute":
                await member.voice.setMute(false);
                sendVCEmbed(message.channel, "You are now unmuted!");
                break;
        }
    }

    // -------------------- VM SETUP --------------------
    if (cmd === "vmsetup") {
        if (!member.permissions.has("ManageChannels")) return sendVCEmbed(message.channel, "You need Manage Channels permission.");
        const categories = ["voice master", "public vcs", "private vcs"];
        for (const name of categories) {
            if (!message.guild.channels.cache.find(c => c.name === name && c.type === 4)) {
                await message.guild.channels.create({ name, type: 4 });
            }
        }

        const masterCat = message.guild.channels.cache.find(c => c.name === "voice master" && c.type === 4);
        const masterVCs = ["join to create", "join a random vc"];
        for (const vcName of masterVCs) {
            if (!message.guild.channels.cache.find(c => c.name === vcName && c.parentId === masterCat.id)) {
                await message.guild.channels.create({ name: vcName, type: 2, parent: masterCat.id });
            }
        }

        sendVCEmbed(message.channel, "Voice Master setup complete!");
    }

    // -------------------- VM RESET --------------------
    if (cmd === "vmreset") {
        if (!member.permissions.has("ManageChannels")) return sendVCEmbed(message.channel, "You need Manage Channels permission.");
        const categories = ["voice master", "public vcs", "private vcs"];
        for (const name of categories) {
            const cat = message.guild.channels.cache.find(c => c.name === name && c.type === 4);
            if (cat) {
                cat.children.cache.forEach(async ch => {
                    if (!["join to create", "join a random vc"].includes(ch.name.toLowerCase())) await ch.delete().catch(() => {});
                });
                await cat.delete().catch(() => {});
            }
        }
        sendVCEmbed(message.channel, "Voice Master has been reset!");
    }
});

// ------------------- ERROR HANDLING -------------------
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

// ------------------- LOGIN -------------------
client.login(process.env.TOKEN);
