require('dotenv').config();
const fetch = require('node-fetch');
const logger = require('../logger');

const sendToDiscord = async (message) => {
  const webhookURL = process.env.DISCORDWEBHOOK
  try {
    const response = await fetch(webhookURL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: message }),
    });

    if (response.ok) {
      logger.debug("Message sent to Discord webhook successfully.");
    } else {
      logger.error("Failed to send message. Status:", response.status);
    }
  } catch (error) {
    logger.error("Error sending message to Discord:", error.message);
  }
};


module.exports =  sendToDiscord