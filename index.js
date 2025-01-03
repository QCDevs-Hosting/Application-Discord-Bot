const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const fs = require('fs');
require('dotenv').config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: ['CHANNEL'],
});

const config = JSON.parse(fs.existsSync('./config.json') ? fs.readFileSync('./config.json', 'utf-8') : '{}');
const embedData = JSON.parse(fs.existsSync('./embed.json') ? fs.readFileSync('./embed.json', 'utf-8') : '{}');
const questions = JSON.parse(fs.existsSync('./questions.json') ? fs.readFileSync('./questions.json', 'utf-8') : '{"questions": []}');
let applicationPanelStatus = {};
function saveConfig() {
  fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));
}

function saveEmbedData() {
  fs.writeFileSync('./embed.json', JSON.stringify(embedData, null, 2));
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const commands = [
    {
      name: 'setup',
      description: 'Setup the application system',
      options: [
        {
          name: 'log_channel',
          description: 'The channel where application logs will be sent',
          type: 7,
          required: true,
        },
        {
          name: 'embed_channel',
          description: 'The channel where the application embed will be sent',
          type: 7,
          required: true,
        },
        {
          name: 'role',
          description: 'The role to assign on successful application',
          type: 8,
          required: true,
        },
        {
          name: 'embed_color',
          description: 'The color of the application embed (in hex)',
          type: 3,
          required: true,
        },
        {
          name: 'footer_text',
          description: 'The footer text for the embed',
          type: 3,
          required: true,
        },
        {
          name: 'footer_icon',
          description: 'The URL for the footer icon image',
          type: 3,
          required: false,
        },
        {
          name: 'thumbnail_image',
          description: 'The URL for the thumbnail image',
          type: 3,
          required: false,
        },
        {
          name: 'lower_image',
          description: 'The URL for the lower image',
          type: 3,
          required: false,
        },
      ],
    },
    {
      name: 'togglepanel',
      description: 'Open or close the application panel for submissions',
      options: [
        {
          name: 'status',
          description: 'Set the panel status (open/close)',
          type: 3,
          required: true,
          choices: [
            { name: 'Open', value: 'open' },
            { name: 'Close', value: 'close' },
          ],
        },
      ],
    },
  ];

  try {
    await client.application?.commands.set(commands);
    console.log('Global commands registered successfully.');
  } catch (error) {
    console.error('Error while registering global commands:', error);
  }

  setInterval(async () => {
    for (const guildId in embedData) {
      const { embedChannel, embed, embedId } = embedData[guildId];
      const channel = client.channels.cache.get(embedChannel);
      if (channel && embedId) {
        try {
          const existingMessage = await channel.messages.fetch(embedId).catch(() => null);
          if (existingMessage) {
            await existingMessage.edit({ embeds: [EmbedBuilder.from(embed)] });
          }
        } catch (error) {
          console.error(`Failed to update embed for guild ${guildId}:`, error);
        }
      }
    }
  }, 30 * 1000);

  for (const guildId in embedData) {
    const { embedChannel, embed, embedId } = embedData[guildId];
    const channel = client.channels.cache.get(embedChannel);
    if (channel && embedId) {
      try {
        const existingMessage = await channel.messages.fetch(embedId).catch(() => null);
        if (existingMessage) {
          await existingMessage.edit({ embeds: [EmbedBuilder.from(embed)] });
        }
      } catch (error) {
        console.error(`Failed to update embed on bot start for guild ${guildId}:`, error);
      }
    }
  }
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const { commandName, options, guild, user } = interaction;

    if (commandName === 'setup' && user.id !== process.env.BOT_OWNER_ID) {
      return interaction.reply({
        content: 'You do not have permission to use this command.',
        ephemeral: true,
      });
    }

    if (commandName === 'setup') {
      const logChannel = options.getChannel('log_channel');
      const embedChannel = options.getChannel('embed_channel');
      const role = options.getRole('role');
      const embedColor = options.getString('embed_color');
      const footerText = options.getString('footer_text');
      const footerIcon = options.getString('footer_icon') || '';
      const thumbnailImage = options.getString('thumbnail_image') || ''; 
      const lowerImage = options.getString('lower_image') || ''; 

      if (!logChannel || !embedChannel || !role || !embedColor || !footerText) {
        return interaction.reply({ content: 'Invalid input, please provide all required options.', ephemeral: true });
      }

      config[guild.id] = {
        logChannel: logChannel.id,
        role: role.id,
      };
      saveConfig();

      const applyEmbed = new EmbedBuilder()
        .setTitle('Application Panel')
        .setDescription('Click the button below to start your application.')
        .setColor(embedColor || 'Blue')
        .setFooter({
          text: footerText,
          iconURL: footerIcon || client.user.displayAvatarURL(),
        })
        .setThumbnail(thumbnailImage || client.user.displayAvatarURL())
        .setImage(lowerImage);

      const applyButton = new ButtonBuilder()
        .setCustomId('start_application')
        .setLabel('Apply Now')
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder().addComponents(applyButton);

      try {
        const message = await embedChannel.send({ embeds: [applyEmbed], components: [row] });
        embedData[guild.id] = {
          embedChannel: embedChannel.id,
          embed: applyEmbed.toJSON(),
          embedId: message.id,
        };
        saveEmbedData();

        interaction.reply('Application system set up successfully!');
      } catch (error) {
        interaction.reply({ content: 'Failed to send embed. Please check permissions.', ephemeral: true });
        console.error(error);
      }
    }

    if (commandName === 'togglepanel') {
      const status = options.getString('status');

      if (!['open', 'close'].includes(status)) {
        return interaction.reply({ content: 'Invalid status. Please choose "open" or "close".', ephemeral: true });
      }

      applicationPanelStatus[guild.id] = status;
      interaction.reply(`The application panel has been ${status}.`);

      const embedChannel = config[guild.id]?.embedChannel;
      if (embedChannel) {
        const channel = client.channels.cache.get(embedChannel);
        const message = await channel.messages.fetch(embedData[guild.id]?.embedId);
        if (message) {
          const embed = EmbedBuilder.from(embedData[guild.id]?.embed);
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('start_application')
              .setLabel(status === 'open' ? 'Apply Now' : 'Applications are closed')
              .setStyle(status === 'open' ? ButtonStyle.Primary : ButtonStyle.Danger)
              .setDisabled(status === 'close')
          );
          message.edit({ embeds: [embed], components: [row] });
        }
      }
    }
  }

  if (interaction.isButton()) {
    if (interaction.customId === 'start_application') {
      const guildConfig = config[interaction.guild.id];
      if (!guildConfig || applicationPanelStatus[interaction.guild.id] === 'close') {
        return interaction.reply({ content: 'Applications are closed.', ephemeral: true });
      }

      const user = interaction.user;
      try {
        await user.send('Welcome to the application process! Let’s get started.');
        const applicationData = {};
        const userQuestions = questions.questions;
        let index = 0;

        const askQuestion = async () => {
          if (index >= userQuestions.length) {
            const logChannel = interaction.guild.channels.cache.get(guildConfig.logChannel);
            const embed = new EmbedBuilder()
              .setTitle('New Application')
              .setDescription(
                Object.entries(applicationData)
                  .map(([q, a]) => `**${q}:** ${a}`)
                  .join('\n')
              )
              .setTimestamp();

            logChannel.send({ embeds: [embed] });

            const role = interaction.guild.roles.cache.get(guildConfig.role);
            const member = interaction.guild.members.cache.get(user.id);
            member.roles.add(role);

            await user.send('Your application has been submitted. Thank you!');
            return;
          }

          const question = userQuestions[index++];
          await user.send(question);

          const filter = (m) => m.author.id === user.id;
          const collector = user.dmChannel.createMessageCollector({ filter, max: 1, time: 60000 });

          collector.on('collect', (msg) => {
            applicationData[question] = msg.content;
            askQuestion();
          });

          collector.on('end', (collected, reason) => {
            if (reason === 'time') {
              user.send('You did not respond in time. Please restart your application.');
            }
          });
        };

        askQuestion();
      } catch (err) {
        interaction.reply({ content: 'I cannot DM you at the moment. Please make sure your DMs are open.', ephemeral: true });
      }
    }
  }
});

client.login(process.env.TOKEN);
