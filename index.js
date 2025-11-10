const { Client, GatewayIntentBits, EmbedBuilder, ChannelType, PermissionsBitField } = require("discord.js");
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

const ALLOWED_GUILDS = ["1426789471776542803"];

// --- Embed Helper ---
async function sendEmbed(channel, type, description) {
    const embed = new EmbedBuilder()
        .setTitle(type === "success" ? `${emojis.success} success!` : `${emojis.fail} error!`)
        .setDescription(description)
        .setColor(type === "success" ? "Green" : "Red")
        .setTimestamp();
    await channel.send({ embeds: [embed] });
}

// --- Voice State Handling ---
client.on("voiceStateUpdate", async (oldState, newState) => {
    const guild = newState.guild;
    if (!guild || !ALLOWED_GUILDS.includes(guild.id)) return;

    let publicCat = guild.channels.cache.find(c => c.name.toLowerCase() === "public vcs" && c.type === ChannelType.GuildCategory);
    let privateCat = guild.channels.cache.find(c => c.name.toLowerCase() === "private vcs" && c.type === ChannelType.GuildCategory);

    if (!publicCat) publicCat = await guild.channels.create({ name: "public vcs", type: ChannelType.GuildCategory });
    if (!privateCat) privateCat = await guild.channels.create({ name: "private vcs", type: ChannelType.GuildCategory });

    const joinCreate = guild.channels.cache.find(c => c.name.toLowerCase() === "join to create" && c.parentId === publicCat.id);
    const joinRandom = guild.channels.cache.find(c => c.name.toLowerCase() === "join a random vc" && c.parentId === publicCat.id);

    const channelId = newState.channel?.id;

    // --- Create temp VC ---
    if (channelId === joinCreate?.id) {
        const tempVC = await guild.channels.create({
            name: `${newState.member.user.username}'s vc`,
            type: ChannelType.GuildVoice,
            parent: publicCat.id,
            permissionOverwrites: [
                { id: guild.id, allow: ["Connect", "ViewChannel"] },
                { id: newState.member.id, allow: ["Connect", "ViewChannel", "ManageChannels", "MuteMembers", "MoveMembers"] }
            ]
        });
        await newState.setChannel(tempVC);
    }

    // --- Join random VC ---
    if (channelId === joinRandom?.id) {
        const availableVCs = publicCat.children.cache.filter(
            c => c.type === ChannelType.GuildVoice && ![joinCreate?.id, joinRandom?.id].includes(c.id) && c.members.size < (c.userLimit || Infinity)
        );
        if (availableVCs.size) {
            const randomVC = availableVCs.random();
            await newState.setChannel(randomVC);
        }
    }

    // --- Delete empty temp VCs (only in public) ---
    publicCat.children.cache.forEach(ch => {
        if (![joinCreate?.id, joinRandom?.id].includes(ch.id) && ch.members.size === 0) {
            ch.delete().catch(() => {});
        }
    });

    // --- Move locked VCs to private ---
    if (oldState.channel && oldState.channel.permissionOverwrites.cache.get(guild.id)?.deny.has(PermissionsBitField.Flags.Connect) && oldState.channel.parentId !== privateCat.id) {
        await oldState.channel.setParent(privateCat.id).catch(() => {});
    }
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

    if (cmd === "vc") {
        const sub = args[0]?.toLowerCase();
        if (!sub) return await sendEmbed(message.channel, "fail", "specify a subcommand.");
        if (!vc && !["unmute","hide","unhide"].includes(sub)) return await sendEmbed(message.channel, "fail", "you must be in a vc.");

        const ownerId = vc?.members.firstKey();
        const target = message.mentions.members.first();

        switch(sub) {
            case "lock":
                if (member.id !== ownerId) return await sendEmbed(message.channel,"fail","only vc owner can lock.");
                await vc.permissionOverwrites.edit(message.guild.id, { Connect: false, ViewChannel: false });
                const privateCat = vc.guild.channels.cache.find(c => c.name.toLowerCase() === "private vcs" && c.type === ChannelType.GuildCategory);
                if (privateCat) await vc.setParent(privateCat.id);
                await sendEmbed(message.channel,"success","vc locked and moved to private vcs!");
                break;
            case "unlock":
                if (member.id !== ownerId) return await sendEmbed(message.channel,"fail","only vc owner can unlock.");
                await vc.permissionOverwrites.edit(message.guild.id, { Connect: true, ViewChannel: true });
                const publicCat = vc.guild.channels.cache.find(c => c.name.toLowerCase() === "public vcs" && c.type === ChannelType.GuildCategory);
                if (publicCat) await vc.setParent(publicCat.id);
                await sendEmbed(message.channel,"success","vc unlocked and moved to public vcs!");
                break;
            case "hide":
                if (member.id !== ownerId) return await sendEmbed(message.channel,"fail","only vc owner can hide.");
                await vc.permissionOverwrites.edit(message.guild.id, { ViewChannel: false });
                await sendEmbed(message.channel,"success","vc hidden!");
                break;
            case "unhide":
                if (member.id !== ownerId) return await sendEmbed(message.channel,"fail","only vc owner can unhide.");
                await vc.permissionOverwrites.edit(message.guild.id, { ViewChannel: true });
                await sendEmbed(message.channel,"success","vc visible!");
                break;
            case "kick":
                if (member.id !== ownerId) return await sendEmbed(message.channel,"fail","only vc owner can kick.");
                if (!target) return await sendEmbed(message.channel,"fail","mention a user to kick.");
                if (!vc.members.has(target.id)) return await sendEmbed(message.channel,"fail","user is not in your vc.");
                await target.voice.disconnect();
                await sendEmbed(message.channel,"success",`${target.user.tag} kicked from vc.`);
                break;
            case "ban":
                if (member.id !== ownerId) return await sendEmbed(message.channel,"fail","only vc owner can ban.");
                if (!target) return await sendEmbed(message.channel,"fail","mention a user to ban.");
                await vc.permissionOverwrites.edit(target.id,{ Connect: false });
                await sendEmbed(message.channel,"success",`${target.user.tag} banned from vc.`);
                break;
            case "permit":
                if (member.id !== ownerId) return await sendEmbed(message.channel,"fail","only vc owner can permit.");
                if (!target) return await sendEmbed(message.channel,"fail","mention a user to permit.");
                await vc.permissionOverwrites.edit(target.id,{ Connect: true });
                await sendEmbed(message.channel,"success",`${target.user.tag} permitted in vc.`);
                break;
            case "limit":
                const limit = parseInt(args[1]);
                if (isNaN(limit)) return await sendEmbed(message.channel,"fail","provide a number as limit.");
                await vc.setUserLimit(limit);
                await sendEmbed(message.channel,"success",`vc user limit set to ${limit}.`);
                break;
            case "rename":
                const newName = args.slice(1).join(" ");
                if (!newName) return await sendEmbed(message.channel,"fail","provide a new name.");
                await vc.setName(newName);
                await sendEmbed(message.channel,"success",`vc renamed to ${newName}.`);
                break;
            case "transfer":
                if (!target) return await sendEmbed(message.channel,"fail","mention a user to transfer ownership.");
                await vc.permissionOverwrites.edit(ownerId, { Connect: false, ManageChannels: false });
                await vc.permissionOverwrites.edit(target.id, { Connect: true, ManageChannels: true });
                await sendEmbed(message.channel,"success",`ownership transferred to ${target.user.tag}.`);
                break;
            case "info":
                const infoEmbed = new EmbedBuilder()
                    .setTitle(`${emojis.success} vc info`)
                    .setDescription(`name: ${vc.name}\nowners: <@${ownerId}>\nmembers: ${vc.members.size}\nuser limit: ${vc.userLimit || "none"}`)
                    .setColor("Blue")
                    .setTimestamp();
                await message.channel.send({ embeds: [infoEmbed] });
                break;
            case "unmute":
                await member.voice.setMute(false);
                await sendEmbed(message.channel,"success","you are now unmuted!");
                break;
        }
    }

    // --- VM Setup ---
    if (cmd === "vmsetup") {
        if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return await sendEmbed(message.channel,"fail","you need manage channels permission.");
        const guild = message.guild;

        let publicCat = guild.channels.cache.find(c => c.name.toLowerCase() === "public vcs" && c.type === ChannelType.GuildCategory);
        let privateCat = guild.channels.cache.find(c => c.name.toLowerCase() === "private vcs" && c.type === ChannelType.GuildCategory);

        if (!publicCat) publicCat = await guild.channels.create({ name:"public vcs", type:ChannelType.GuildCategory });
        if (!privateCat) privateCat = await guild.channels.create({ name:"private vcs", type:ChannelType.GuildCategory });

        if (!guild.channels.cache.some(c => c.name.toLowerCase() === "join to create" && c.parentId === publicCat.id))
            await guild.channels.create({ name:"join to create", type:ChannelType.GuildVoice, parent:publicCat.id });

        if (!guild.channels.cache.some(c => c.name.toLowerCase() === "join a random vc" && c.parentId === publicCat.id))
            await guild.channels.create({ name:"join a random vc", type:ChannelType.GuildVoice, parent:publicCat.id });

        await sendEmbed(message.channel,"success","voice master setup complete!");
    }

    // --- VM Reset ---
    if (cmd === "vmreset") {
        if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return await sendEmbed(message.channel,"fail","you need manage channels permission.");
        const guild = message.guild;

        ["public vcs","private vcs"].forEach(catName => {
            const cat = guild.channels.cache.find(c => c.name.toLowerCase() === catName && c.type === ChannelType.GuildCategory);
            if (!cat) return;
            cat.children.cache.forEach(ch => {
                if (!["join to create","join a random vc"].includes(ch.name.toLowerCase())) ch.delete().catch(()=>{});
            });
        });

        await sendEmbed(message.channel,"success","voice master has been reset!");
    }
});

// --- Error Handling ---
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

// --- Login ---
client.login(process.env.TOKEN);
