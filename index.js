const { Client, GatewayIntentBits, EmbedBuilder, ChannelType } = require("discord.js");
const { emojis, prefix } = require("./config");
require("./keep_alive");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent
    ]
});

// --- Whitelist ---
const ALLOWED_GUILDS = ["1426789471776542803"]; // your server ID

client.on("guildCreate", async guild => {
    if (!ALLOWED_GUILDS.includes(guild.id)) {
        console.log(`❌ Left unauthorized guild: ${guild.name} (${guild.id})`);
        await guild.leave();
    }
});

client.once("ready", async () => {
    console.log(`${client.user.tag} is online!`);
    client.guilds.cache.forEach(async guild => {
        if (!ALLOWED_GUILDS.includes(guild.id)) {
            console.log(`❌ Leaving unauthorized guild on startup: ${guild.name} (${guild.id})`);
            await guild.leave();
        } else {
            // --- Ensure Categories and Base Channels Exist ---
            const publicCat = guild.channels.cache.find(c => c.name === "Public VC" && c.type === ChannelType.GuildCategory);
            const privateCat = guild.channels.cache.find(c => c.name === "Private VC" && c.type === ChannelType.GuildCategory);

            if (!publicCat) await guild.channels.create({ name: "Public VC", type: ChannelType.GuildCategory });
            if (!privateCat) await guild.channels.create({ name: "Private VC", type: ChannelType.GuildCategory });

            const basePublicVC = guild.channels.cache.find(c => c.name === "Join to Create" && c.parentId === (publicCat?.id));
            if (!basePublicVC) await guild.channels.create({ name: "Join to Create", type: ChannelType.GuildVoice, parent: publicCat?.id });

            const baseRandomVC = guild.channels.cache.find(c => c.name === "Join a Random VC" && c.parentId === (publicCat?.id));
            if (!baseRandomVC) await guild.channels.create({ name: "Join a Random VC", type: ChannelType.GuildVoice, parent: publicCat?.id });
        }
    });
});

// --- Embed Helper ---
async function sendEmbed(channel, type, description) {
    const embed = new EmbedBuilder()
        .setTitle(type === "success" ? `${emojis.success} Success!` : `${emojis.fail} Error!`)
        .setDescription(description)
        .setColor(type === "success" ? "Green" : "Red")
        .setTimestamp();
    await channel.send({ embeds: [embed] });
}

// --- Voice State Handling ---
client.on("voiceStateUpdate", async (oldState, newState) => {
    const guild = newState.guild;
    if (!guild || !ALLOWED_GUILDS.includes(guild.id)) return;

    const publicCat = guild.channels.cache.find(c => c.name === "Public VC" && c.type === ChannelType.GuildCategory);
    const privateCat = guild.channels.cache.find(c => c.name === "Private VC" && c.type === ChannelType.GuildCategory);

    const channelName = newState.channel?.name;

    // --- Temp VC Creation ---
    if (channelName && channelName.toLowerCase().includes("join to create")) {
        if (!publicCat) return;
        const tempVC = await guild.channels.create({
            name: `${newState.member.user.username}'s VC`,
            type: ChannelType.GuildVoice,
            parent: publicCat.id,
            permissionOverwrites: [
                { id: guild.id, allow: ["Connect", "ViewChannel"] },
                { id: newState.member.id, allow: ["ManageChannels", "MuteMembers", "MoveMembers"] }
            ]
        });
        await newState.setChannel(tempVC);
    }

    // --- Join Random VC ---
    if (channelName && channelName.toLowerCase().includes("join a random vc")) {
        if (!publicCat) return;
        const publicVCs = publicCat.children.cache.filter(c => c.type === ChannelType.GuildVoice && !["Join to Create","Join a Random VC"].includes(c.name) && c.members.size < (c.userLimit || Infinity));
        if (!publicVCs.size) return;
        const randomVC = publicVCs.random();
        await newState.setChannel(randomVC);
    }

    // --- Auto-Rename VC if Owner Changes Nickname ---
    if (oldState.member && oldState.member.id === oldState.channel?.members.firstKey() && oldState.member.nickname !== null) {
        const ownerId = oldState.member.id;
        const vc = oldState.channel;
        if (vc && vc.members.has(ownerId)) {
            await vc.setName(`${oldState.member.user.username}'s VC`).catch(() => {});
        }
    }

    // --- Delete empty temp VCs ---
    [publicCat, privateCat].forEach(cat => {
        if (!cat || !cat.children) return;
        cat.children.cache.forEach(ch => {
            if (!["Join to Create","Join a Random VC"].includes(ch.name) && ch.members.size === 0) ch.delete().catch(() => {});
        });
    });
});

// --- Command Handling ---
client.on("messageCreate", async message => {
    if (!message.guild || message.author.bot) return;
    if (!ALLOWED_GUILDS.includes(message.guild.id)) return;
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();
    const member = message.member;
    const vc = member.voice.channel;

    // -------------------- VC Commands --------------------
    if (cmd === "vc") {
        const sub = args[0]?.toLowerCase();
        if (!sub) return await sendEmbed(message.channel, "fail", "Specify a subcommand.");
        if (!vc && !["unmute","hide","unhide"].includes(sub)) return await sendEmbed(message.channel, "fail", "You must be in a VC.");

        const ownerId = vc?.members.firstKey();
        const target = message.mentions.members.first();

        switch (sub) {
            case "lock":
                if (member.id !== ownerId) return await sendEmbed(message.channel, "fail", "Only VC owner can lock.");
                await vc.permissionOverwrites.edit(message.guild.id, { Connect: false, ViewChannel: false });
                if (privateCat) await vc.setParent(privateCat.id);
                await sendEmbed(message.channel, "success", "VC has been locked and moved to Private VC!");
                break;

            case "unlock":
                if (member.id !== ownerId) return await sendEmbed(message.channel, "fail", "Only VC owner can unlock.");
                await vc.permissionOverwrites.edit(message.guild.id, { Connect: true, ViewChannel: true });
                if (publicCat) await vc.setParent(publicCat.id);
                await sendEmbed(message.channel, "success", "VC has been unlocked and moved to Public VC!");
                break;

            case "hide":
                if (member.id !== ownerId) return await sendEmbed(message.channel, "fail", "Only VC owner can hide.");
                await vc.permissionOverwrites.edit(message.guild.id, { ViewChannel: false });
                await sendEmbed(message.channel, "success", "Your VC is now hidden!");
                break;

            case "unhide":
                if (member.id !== ownerId) return await sendEmbed(message.channel, "fail", "Only VC owner can unhide.");
                await vc.permissionOverwrites.edit(message.guild.id, { ViewChannel: true });
                await sendEmbed(message.channel, "success", "Your VC is now visible!");
                break;

            // --- Original VC commands ---
            case "kick": if (member.id !== ownerId) return await sendEmbed(message.channel,"fail","Only VC owner can kick users."); if (!target) return await sendEmbed(message.channel,"fail","Mention a user to kick."); if (!vc.members.has(target.id)) return await sendEmbed(message.channel,"fail","User is not in your VC."); await target.voice.disconnect(); await sendEmbed(message.channel,"success",`${target.user.tag} has been kicked from your VC.`); break;
            case "ban": if (member.id !== ownerId) return await sendEmbed(message.channel,"fail","Only VC owner can ban users."); if (!target) return await sendEmbed(message.channel,"fail","Mention a user to ban."); await vc.permissionOverwrites.edit(target.id, { Connect: false }); await sendEmbed(message.channel,"success",`${target.user.tag} has been banned from your VC.`); break;
            case "permit": if (member.id !== ownerId) return await sendEmbed(message.channel,"fail","Only VC owner can permit users."); if (!target) return await sendEmbed(message.channel,"fail","Mention a user to permit."); await vc.permissionOverwrites.edit(target.id, { Connect: true }); await sendEmbed(message.channel,"success",`${target.user.tag} is now allowed in your VC.`); break;
            case "limit": const limit = parseInt(args[1]); if (isNaN(limit)) return await sendEmbed(message.channel,"fail","Provide a number as limit."); await vc.setUserLimit(limit); await sendEmbed(message.channel,"success",`VC user limit set to ${limit}.`); break;
            case "rename": const newName = args.slice(1).join(" "); if (!newName) return await sendEmbed(message.channel,"fail","Provide a new name."); await vc.setName(newName); await sendEmbed(message.channel,"success",`VC renamed to ${newName}.`); break;
            case "transfer": if (!target) return await sendEmbed(message.channel,"fail","Mention a user to transfer VC ownership."); await vc.permissionOverwrites.edit(ownerId, { Connect: false, ManageChannels: false }); await vc.permissionOverwrites.edit(target.id, { Connect: true, ManageChannels: true }); await sendEmbed(message.channel,"success",`VC ownership transferred to ${target.user.tag}.`); break;
            case "info": const infoEmbed = new EmbedBuilder().setTitle(`${emojis.success} VC Info`).setDescription(`Name: ${vc.name}\nOwner: <@${ownerId}>\nMembers: ${vc.members.size}\nUser Limit: ${vc.userLimit || "None"}`).setColor("Blue").setTimestamp(); await message.channel.send({ embeds: [infoEmbed] }); break;
            case "unmute": await member.voice.setMute(false); await sendEmbed(message.channel,"success","You are now unmuted!"); break;
        }
    }

    // -------------------- VM Setup / Reset --------------------
    if (cmd === "vmsetup" || cmd === "vmreset") {
        if (!member.permissions.has("ManageChannels")) return await sendEmbed(message.channel,"fail","You need Manage Channels permission.");
        await sendEmbed(message.channel,"success", cmd === "vmsetup" ? "Voice Master setup complete!" : "Voice Master has been reset!");
    }
});

// --- Error Handling ---
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

// --- Login ---
client.login(process.env.TOKEN);
