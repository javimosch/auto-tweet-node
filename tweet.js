
const Twitter = require('twitter');
const readline = require('readline');
require('dotenv').config({})


const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

let twitterOptions={
    consumer_key: process.env.api_key,
    consumer_secret: process.env.api_key_secret,
    access_token_key: process.env.access_token,
    access_token_secret: process.env.access_token_secret
  }
  console.log({
    twitterOptions: twitterOptions
  })
const client = new Twitter(twitterOptions);

rl.question('What do you want to tweet? ', tweet => {
  client.post('statuses/update', {status: tweet}, (error, tweet, response) => {
    if (error) {
      console.log(error);
    } else {
      console.log(`Tweet sent: ${tweet.text}`);
    }
    rl.close();
  });
});